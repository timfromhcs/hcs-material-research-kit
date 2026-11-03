/**
 * Loader and ABI wrapper for the HCS WebAssembly kernel.
 *
 * The WASM module is the same Rust CPU kernel that is parity-tested against the
 * TypeScript reference (`crates/compute-core`). It has no imports and no
 * wasm-bindgen glue: nine buffers are written into linear memory, one call is
 * made, and the outputs are read back. Every call validates its inputs and
 * reports the kernel's own cutoff, so a caller can record what was actually
 * computed.
 */

import {
  assertAngstrom,
  baseSymbol,
  maxCutoffForCell,
  type EnergyForces,
  type LJModel,
  type Structure,
  type Vec3,
} from "@hcs-materials/core";

export const WASM_ABI_VERSION = 1;

export interface WasmManifest {
  crate: string;
  profile: string;
  target: string;
  rustc: string;
  sha256: string;
  bytes: number;
  abi_version: number;
  source: string;
  rebuild: string;
}

export interface WasmKernel {
  readonly abiVersion: number;
  readonly bytes: number;
  /** Evaluates energy and forces exactly like `computeEnergyForces`. */
  energyForces(structure: Structure, model: LJModel, options?: { cutoff?: number }): EnergyForces;
}

interface WasmExports {
  memory: WebAssembly.Memory;
  hcs_abi_version: () => number;
  hcs_alloc: (len: number) => number;
  hcs_free: (pointer: number, len: number) => void;
  hcs_lj_energy_forces: (
    n: number,
    lattice: number,
    pbc: number,
    frac: number,
    eps: number,
    sigma: number,
    cutoff: number,
    outForces: number,
    outScalars: number,
  ) => number;
}

export class WasmKernelError extends Error {
  constructor(
    message: string,
    readonly code: "abi" | "argument" | "kernel" | "element",
  ) {
    super(message);
    this.name = "WasmKernelError";
  }
}

export async function instantiateWasmKernel(
  source: BufferSource | WebAssembly.Module,
): Promise<WasmKernel> {
  let instance: WebAssembly.Instance;
  if (source instanceof WebAssembly.Module) {
    instance = await WebAssembly.instantiate(source, {});
  } else {
    instance = (await WebAssembly.instantiate(source, {})).instance;
  }
  const exports = instance.exports as unknown as WasmExports;

  if (typeof exports.hcs_lj_energy_forces !== "function" || !(exports.memory instanceof WebAssembly.Memory)) {
    throw new WasmKernelError("WASM module does not export the HCS kernel", "abi");
  }
  const abi = exports.hcs_abi_version();
  if (abi !== WASM_ABI_VERSION) {
    throw new WasmKernelError(
      `WASM ABI version ${abi} does not match the loader (${WASM_ABI_VERSION}); rebuild with npm run build:wasm`,
      "abi",
    );
  }

  const bytes = exports.memory.buffer.byteLength;

  const energyForces: WasmKernel["energyForces"] = (structure, model, options = {}) => {
    assertAngstrom(structure);
    const n = structure.sites.length;
    if (n === 0) throw new WasmKernelError("Cannot evaluate an empty structure", "argument");
    if (n > 200_000) throw new WasmKernelError("Structure exceeds the 200000-atom WASM limit", "argument");

    const requested = options.cutoff ?? model.cutoff;
    if (!(requested > 0)) throw new WasmKernelError("Cutoff must be positive", "argument");
    const maxValid = maxCutoffForCell(structure);
    if (!(maxValid > 1e-6)) {
      throw new WasmKernelError("Cell has no valid minimum-image radius", "kernel");
    }

    const epsilon = new Float64Array(n);
    const sigma = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const symbol = baseSymbol(structure.sites[i]!.species);
      const params = model.species[symbol];
      if (!params) {
        throw new WasmKernelError(
          `Model '${model.id}' has no Lennard-Jones parameters for '${symbol}'. ` +
            `Supported: ${Object.keys(model.species).join(", ")}.`,
          "element",
        );
      }
      epsilon[i] = params.epsilon;
      sigma[i] = params.sigma;
    }

    // Allocate every buffer first: any allocation may grow linear memory and
    // invalidate existing typed-array views.
    const f64 = 8;
    const latticePtr = exports.hcs_alloc(9 * f64);
    const pbcPtr = exports.hcs_alloc(3);
    const fracPtr = exports.hcs_alloc(3 * n * f64);
    const epsPtr = exports.hcs_alloc(n * f64);
    const sigmaPtr = exports.hcs_alloc(n * f64);
    const forcesPtr = exports.hcs_alloc(3 * n * f64);
    const scalarsPtr = exports.hcs_alloc(5 * f64);
    const pointers: Array<[number, number]> = [
      [latticePtr, 9 * f64],
      [pbcPtr, 3],
      [fracPtr, 3 * n * f64],
      [epsPtr, n * f64],
      [sigmaPtr, n * f64],
      [forcesPtr, 3 * n * f64],
      [scalarsPtr, 5 * f64],
    ];
    if (pointers.some(([pointer]) => pointer === 0)) {
      for (const [pointer, length] of pointers) {
        if (pointer !== 0) exports.hcs_free(pointer, length);
      }
      throw new WasmKernelError("WASM allocation failed", "argument");
    }

    try {
      const memory = exports.memory;
      const lattice = new Float64Array(memory.buffer, latticePtr, 9);
      const flat = structure.lattice.vectors.flat();
      for (let i = 0; i < 9; i++) lattice[i] = flat[i]!;

      const pbc = new Uint8Array(memory.buffer, pbcPtr, 3);
      for (let i = 0; i < 3; i++) pbc[i] = structure.pbc[i] ? 1 : 0;

      const frac = new Float64Array(memory.buffer, fracPtr, 3 * n);
      for (let i = 0; i < n; i++) {
        const position = structure.sites[i]!.fractional_position;
        frac[i * 3] = position[0];
        frac[i * 3 + 1] = position[1];
        frac[i * 3 + 2] = position[2];
      }
      new Float64Array(memory.buffer, epsPtr, n).set(epsilon);
      new Float64Array(memory.buffer, sigmaPtr, n).set(sigma);

      const status = exports.hcs_lj_energy_forces(
        n,
        latticePtr,
        pbcPtr,
        fracPtr,
        epsPtr,
        sigmaPtr,
        requested,
        forcesPtr,
        scalarsPtr,
      );
      if (status !== 0) {
        throw new WasmKernelError(
          status === 1
            ? "WASM kernel rejected its arguments"
            : "WASM kernel rejected the cell or parameters (cutoff, cell size or pair parameters)",
          "kernel",
        );
      }

      const scalars = new Float64Array(memory.buffer, scalarsPtr, 5);
      const forceValues = new Float64Array(memory.buffer, forcesPtr, 3 * n);
      const forces: Vec3[] = Array.from({ length: n }, (_, index) => [
        forceValues[index * 3]!,
        forceValues[index * 3 + 1]!,
        forceValues[index * 3 + 2]!,
      ]);
      const cutoff = scalars[3]!;

      return {
        energy: scalars[0]!,
        energyPerAtom: scalars[1]!,
        forces,
        maxForce: scalars[2]!,
        pairCount: scalars[4]!,
        cutoff,
        cutoffReduced: cutoff < requested - 1e-9,
        modelId: model.id,
        backend: "wasm",
      };
    } finally {
      for (const [pointer, length] of pointers) exports.hcs_free(pointer, length);
    }
  };

  return { abiVersion: abi, bytes, energyForces };
}
