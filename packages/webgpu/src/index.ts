/**
 * WebGPU Lennard-Jones kernel.
 *
 * This is a real compute-shader implementation of the same switched
 * Lennard-Jones model as `packages/core/src/kernels/lj.ts`, not a badge:
 *
 *   * one invocation per atom; each invocation sums its own force over all
 *     other atoms, so no floating-point atomics are needed and the result is
 *     deterministic;
 *   * the energy is accumulated with a ½ factor because every pair is visited
 *     from both ends;
 *   * the pair count uses an integer atomic, which WebGPU guarantees;
 *   * f32 throughout. The tolerance against the f64 CPU kernel is therefore
 *     documented and tested, not assumed.
 *
 * The kernel is asynchronous, so it is used for single-point evaluations. MD
 * and relaxation need a synchronous kernel per step and keep the WASM/CPU
 * path; that limitation is reported by the caller, never hidden.
 */

import {
  maxCutoffForCell,
  resolvePair,
  SWITCH_ON_FRACTION,
  type EnergyForces,
  type LJEvaluationOptions,
  type LJModel,
  type Structure,
} from "@hcs-materials/core";

export type WebGpuErrorCode =
  | "unavailable"
  | "no_adapter"
  | "no_device"
  | "shader"
  | "buffer"
  | "readback"
  | "unsupported_model"
  | "disposed";

export class WebGpuKernelError extends Error {
  readonly code: WebGpuErrorCode;
  constructor(code: WebGpuErrorCode, message: string) {
    super(message);
    this.name = "WebGpuKernelError";
    this.code = code;
  }
}

export interface WebGpuProbe {
  available: boolean;
  reason: string;
  vendor?: string;
  architecture?: string;
}

export async function probeWebGpu(): Promise<WebGpuProbe> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) {
    return { available: false, reason: "navigator.gpu is not exposed by this browser" };
  }
  try {
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      return { available: false, reason: "navigator.gpu exists but returned no adapter" };
    }
    const info = adapter.info;
    return {
      available: true,
      reason: "Adapter acquired",
      ...(info?.vendor ? { vendor: info.vendor } : {}),
      ...(info?.architecture ? { architecture: info.architecture } : {}),
    };
  } catch (error) {
    return {
      available: false,
      reason: `WebGPU probe threw: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

const SHADER = /* wgsl */ `
struct Uniforms {
  n: f32,
  pbcX: f32,
  pbcY: f32,
  pbcZ: f32,
  cutoff2: f32,
  ron2: f32,
  rc2: f32,
  switchDenom: f32,
  m00: f32, m01: f32, m02: f32, m10: f32,
  m11: f32, m12: f32, m20: f32, m21: f32,
  m22: f32, pad0: f32, pad1: f32, pad2: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> species: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> forces: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> energies: array<f32>;
@group(0) @binding(5) var<storage, read_write> pairCount: atomic<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let n = u32(u.n);
  if (i >= n) { return; }

  let fi = positions[i].xyz;
  let pi = species[i];
  var force = vec3<f32>(0.0);
  var energy = 0.0;

  for (var j: u32 = 0u; j < n; j = j + 1u) {
    if (j == i) { continue; }
    let fj = positions[j].xyz;
    var d = fj - fi;
    if (u.pbcX > 0.5) { d.x = d.x - round(d.x); }
    if (u.pbcY > 0.5) { d.y = d.y - round(d.y); }
    if (u.pbcZ > 0.5) { d.z = d.z - round(d.z); }

    let r = vec3<f32>(
      d.x * u.m00 + d.y * u.m10 + d.z * u.m20,
      d.x * u.m01 + d.y * u.m11 + d.z * u.m21,
      d.x * u.m02 + d.y * u.m12 + d.z * u.m22
    );
    let r2 = dot(r, r);
    if (r2 > u.cutoff2 || r2 <= 0.0) { continue; }
    if (j > i) { atomicAdd(&pairCount, 1u); }

    let pj = species[j];
    let sigma = 0.5 * (pi.y + pj.y);
    let epsilon = sqrt(pi.x * pj.x);
    let invR2 = 1.0 / r2;
    let s2 = sigma * sigma * invR2;
    let s6 = s2 * s2 * s2;
    let s12 = s6 * s6;
    let unswitched = 4.0 * epsilon * (s12 - s6);
    let fscalar = 24.0 * epsilon * (s6 - 2.0 * s12) * invR2;

    var switchValue = 1.0;
    var factor = fscalar;
    if (r2 > u.ron2) {
      let a = u.rc2 - r2;
      let b = u.rc2 + 2.0 * r2 - 3.0 * u.ron2;
      switchValue = (a * a * b) / u.switchDenom;
      let dsOverR = 12.0 * a * (u.ron2 - r2) / u.switchDenom;
      factor = fscalar * switchValue + unswitched * dsOverR;
    }
    energy = energy + 0.5 * unswitched * switchValue;
    force = force + factor * r;
  }

  forces[i] = vec4<f32>(force, 0.0);
  energies[i] = energy;
}
`;

/** Exposed for the shader-integrity test; not part of the runtime contract. */
export const LJ_WGSL_SHADER = SHADER;

function resolveCutoff(structure: Structure, model: LJModel, options: LJEvaluationOptions): number {
  const requested = options.cutoff ?? model.cutoff;
  if (!(requested > 0)) throw new WebGpuKernelError("buffer", "Cutoff must be positive");
  const maxValid = maxCutoffForCell(structure);
  if (!(maxValid > 1e-6)) {
    throw new WebGpuKernelError("buffer", "Cell has no valid minimum-image radius");
  }
  const cutoff = Math.min(requested, maxValid);
  if (cutoff < 0.9) {
    throw new WebGpuKernelError(
      "buffer",
      `Effective cutoff is only ${cutoff.toFixed(3)} Å because the cell is too small.`,
    );
  }
  return cutoff;
}

export interface WebGpuKernel {
  readonly backend: "webgpu";
  readonly precision: "float32";
  energyForces(
    structure: Structure,
    model: LJModel,
    options?: LJEvaluationOptions,
  ): Promise<EnergyForces>;
  dispose(): void;
}

export async function createWebGpuKernel(): Promise<WebGpuKernel> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) throw new WebGpuKernelError("unavailable", "WebGPU is not exposed by this browser");
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new WebGpuKernelError("no_adapter", "No WebGPU adapter was returned");
  const device = await adapter.requestDevice();
  if (!device) throw new WebGpuKernelError("no_device", "No WebGPU device was returned");

  let disposed = false;
  let module: GPUShaderModule;
  try {
    module = device.createShaderModule({ code: SHADER });
  } catch (error) {
    throw new WebGpuKernelError(
      "shader",
      `WebGPU shader could not be created: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const energyForces = async (
    structure: Structure,
    model: LJModel,
    options: LJEvaluationOptions = {},
  ): Promise<EnergyForces> => {
    if (disposed) throw new WebGpuKernelError("disposed", "This WebGPU kernel was disposed");
    if (model.kind !== "lj") {
      throw new WebGpuKernelError(
        "unsupported_model",
        `The WebGPU kernel implements Lennard-Jones only; '${model.id}' cannot run on it.`,
      );
    }
    const n = structure.sites.length;
    if (n === 0) throw new WebGpuKernelError("buffer", "Cannot evaluate an empty structure");
    if (n > 20_000) {
      throw new WebGpuKernelError("buffer", `WebGPU path refuses ${n} atoms (limit 20000)`);
    }
    const cutoff = resolveCutoff(structure, model, options);
    const cutoff2 = cutoff * cutoff;
    const ron2 = (SWITCH_ON_FRACTION * cutoff) ** 2;
    const switchDenom = (cutoff2 - ron2) ** 3;
    const m = structure.lattice.vectors;

    const positions = new Float32Array(n * 4);
    const species = new Float32Array(n * 4);
    for (let index = 0; index < n; index++) {
      const site = structure.sites[index]!;
      const pair = resolvePair(model, site.species, site.species);
      positions[index * 4] = site.fractional_position[0];
      positions[index * 4 + 1] = site.fractional_position[1];
      positions[index * 4 + 2] = site.fractional_position[2];
      positions[index * 4 + 3] = site.occupancy ?? 1;
      species[index * 4] = pair.epsilon;
      species[index * 4 + 1] = pair.sigma;
    }

    const uniforms = new Float32Array([
      n,
      structure.pbc[0] ? 1 : 0,
      structure.pbc[1] ? 1 : 0,
      structure.pbc[2] ? 1 : 0,
      cutoff2,
      ron2,
      cutoff2,
      switchDenom,
      m[0][0],
      m[0][1],
      m[0][2],
      m[1][0],
      m[1][1],
      m[1][2],
      m[2][0],
      m[2][1],
      m[2][2],
      0,
      0,
      0,
    ]);

    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    const positionBuffer = device.createBuffer({
      size: positions.byteLength,
      usage,
      mappedAtCreation: true,
    });
    new Float32Array(positionBuffer.getMappedRange()).set(positions);
    positionBuffer.unmap();
    const speciesBuffer = device.createBuffer({
      size: species.byteLength,
      usage,
      mappedAtCreation: true,
    });
    new Float32Array(speciesBuffer.getMappedRange()).set(species);
    speciesBuffer.unmap();
    const uniformBuffer = device.createBuffer({
      size: uniforms.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(uniformBuffer.getMappedRange()).set(uniforms);
    uniformBuffer.unmap();

    const forceBytes = n * 4 * 4;
    const energyBytes = n * 4;
    const forceBuffer = device.createBuffer({
      size: forceBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const energyBuffer = device.createBuffer({
      size: energyBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const pairBuffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(pairBuffer, 0, new Uint32Array([0]));

    const forceStaging = device.createBuffer({
      size: forceBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const energyStaging = device.createBuffer({
      size: energyBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const pairStaging = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: positionBuffer } },
        { binding: 2, resource: { buffer: speciesBuffer } },
        { binding: 3, resource: { buffer: forceBuffer } },
        { binding: 4, resource: { buffer: energyBuffer } },
        { binding: 5, resource: { buffer: pairBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(n / 64));
    pass.end();
    encoder.copyBufferToBuffer(forceBuffer, 0, forceStaging, 0, forceBytes);
    encoder.copyBufferToBuffer(energyBuffer, 0, energyStaging, 0, energyBytes);
    encoder.copyBufferToBuffer(pairBuffer, 0, pairStaging, 0, 4);
    device.queue.submit([encoder.finish()]);

    try {
      await Promise.all([
        forceStaging.mapAsync(GPUMapMode.READ),
        energyStaging.mapAsync(GPUMapMode.READ),
        pairStaging.mapAsync(GPUMapMode.READ),
      ]);
    } catch (error) {
      throw new WebGpuKernelError(
        "readback",
        `WebGPU readback failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const flatForces = new Float32Array(forceStaging.getMappedRange());
    const flatEnergy = new Float32Array(energyStaging.getMappedRange());
    const pairCount = new Uint32Array(pairStaging.getMappedRange())[0] ?? 0;

    const forces: [number, number, number][] = [];
    let maxForce = 0;
    for (let index = 0; index < n; index++) {
      const fx = flatForces[index * 4]!;
      const fy = flatForces[index * 4 + 1]!;
      const fz = flatForces[index * 4 + 2]!;
      forces.push([fx, fy, fz]);
      const magnitude = Math.hypot(fx, fy, fz);
      if (magnitude > maxForce) maxForce = magnitude;
    }
    let energy = 0;
    for (let index = 0; index < n; index++) energy += flatEnergy[index]!;

    forceStaging.unmap();
    energyStaging.unmap();
    pairStaging.unmap();
    for (const buffer of [
      positionBuffer,
      speciesBuffer,
      uniformBuffer,
      forceBuffer,
      energyBuffer,
      pairBuffer,
      forceStaging,
      energyStaging,
      pairStaging,
    ]) {
      buffer.destroy();
    }

    return {
      energy,
      energyPerAtom: energy / n,
      forces,
      maxForce,
      pairCount,
      cutoff,
      cutoffReduced: cutoff < (options.cutoff ?? model.cutoff) - 1e-9,
      modelId: model.id,
      backend: "webgpu",
    };
  };

  return {
    backend: "webgpu",
    precision: "float32",
    energyForces,
    dispose() {
      disposed = true;
      device.destroy();
    },
  };
}
