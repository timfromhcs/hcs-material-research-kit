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
  /** Size of the .wasm artifact that was instantiated (0 when a Module was passed). */
  readonly moduleBytes: number;
  /** Initial linear-memory size of the instance. */
  readonly memoryBytes: number;
  /** Atom capacity of the reusable buffer arena (0 before the first call or after `dispose`). */
  readonly arenaCapacityAtoms: number;
  /** How many times the arena has been allocated or grown. */
  readonly arenaAllocations: number;
  /** Evaluates energy and forces exactly like `computeEnergyForces`. */
  energyForces(structure: Structure, model: LJModel, options?: { cutoff?: number }): EnergyForces;
  /** Releases the arena buffers. The kernel cannot be used afterwards. */
  dispose(): void;
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

  if (
    typeof exports.hcs_lj_energy_forces !== "function" ||
    !(exports.memory instanceof WebAssembly.Memory)
  ) {
    throw new WasmKernelError("WASM module does not export the HCS kernel", "abi");
  }
  const abi = exports.hcs_abi_version();
  if (abi !== WASM_ABI_VERSION) {
    throw new WasmKernelError(
      `WASM ABI version ${abi} does not match the loader (${WASM_ABI_VERSION}); rebuild with npm run build:wasm`,
      "abi",
    );
  }

  const moduleBytes = source instanceof WebAssembly.Module ? 0 : source.byteLength;
  const memoryBytes = exports.memory.buffer.byteLength;

  // A growable arena: allocations change the size of linear memory, which
  // invalidates every ArrayBuffer view, so views are re-created on each call
  // after the arena is guaranteed to be large enough.
  interface Arena {
    capacity: number;
    latticePtr: number;
    pbcPtr: number;
    fracPtr: number;
    epsPtr: number;
    sigmaPtr: number;
    forcesPtr: number;
    scalarsPtr: number;
  }

  const LATTICE_BYTES = 9 * 8;
  const PBC_BYTES = 3;
  const SCALARS_BYTES = 5 * 8;

  const fracBytes = (capacity: number): number => 3 * capacity * 8;
  const paramBytes = (capacity: number): number => capacity * 8;
  const forceBytes = (capacity: number): number => 3 * capacity * 8;

  let arena: Arena | undefined;
  let arenaAllocations = 0;
  let disposed = false;

  const freeArena = (target: Arena): void => {
    exports.hcs_free(target.latticePtr, LATTICE_BYTES);
    exports.hcs_free(target.pbcPtr, PBC_BYTES);
    exports.hcs_free(target.fracPtr, fracBytes(target.capacity));
    exports.hcs_free(target.epsPtr, paramBytes(target.capacity));
    exports.hcs_free(target.sigmaPtr, paramBytes(target.capacity));
    exports.hcs_free(target.forcesPtr, forceBytes(target.capacity));
    exports.hcs_free(target.scalarsPtr, SCALARS_BYTES);
  };

  const ensureArena = (n: number): Arena => {
    if (disposed) throw new WasmKernelError("WASM kernel has been disposed", "argument");
    if (arena && arena.capacity >= n) return arena;

    const capacity = arena ? Math.max(n, arena.capacity * 2) : n;
    const next: Arena = {
      capacity,
      latticePtr: exports.hcs_alloc(LATTICE_BYTES),
      pbcPtr: exports.hcs_alloc(PBC_BYTES),
      fracPtr: exports.hcs_alloc(fracBytes(capacity)),
      epsPtr: exports.hcs_alloc(paramBytes(capacity)),
      sigmaPtr: exports.hcs_alloc(paramBytes(capacity)),
      forcesPtr: exports.hcs_alloc(forceBytes(capacity)),
      scalarsPtr: exports.hcs_alloc(SCALARS_BYTES),
    };
    const pointers: Array<[number, number]> = [
      [next.latticePtr, LATTICE_BYTES],
      [next.pbcPtr, PBC_BYTES],
      [next.fracPtr, fracBytes(capacity)],
      [next.epsPtr, paramBytes(capacity)],
      [next.sigmaPtr, paramBytes(capacity)],
      [next.forcesPtr, forceBytes(capacity)],
      [next.scalarsPtr, SCALARS_BYTES],
    ];
    if (pointers.some(([pointer]) => pointer === 0)) {
      for (const [pointer, length] of pointers) {
        if (pointer !== 0) exports.hcs_free(pointer, length);
      }
      throw new WasmKernelError("WASM allocation failed", "argument");
    }

    if (arena) freeArena(arena);
    arena = next;
    arenaAllocations += 1;
    return next;
  };

  const energyForces: WasmKernel["energyForces"] = (structure, model, options = {}) => {
    assertAngstrom(structure);
    const n = structure.sites.length;
    if (n === 0) throw new WasmKernelError("Cannot evaluate an empty structure", "argument");
    if (n > 200_000)
      throw new WasmKernelError("Structure exceeds the 200000-atom WASM limit", "argument");

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

    // Any hcs_alloc may grow linear memory, so the arena is ensured first and
    // every typed-array view is created afterwards.
    const buffer = ensureArena(n);
    const memory = exports.memory;
    const lattice = new Float64Array(memory.buffer, buffer.latticePtr, 9);
    const flat = structure.lattice.vectors.flat();
    for (let i = 0; i < 9; i++) lattice[i] = flat[i]!;

    const pbc = new Uint8Array(memory.buffer, buffer.pbcPtr, 3);
    for (let i = 0; i < 3; i++) pbc[i] = structure.pbc[i] ? 1 : 0;

    const frac = new Float64Array(memory.buffer, buffer.fracPtr, buffer.capacity * 3);
    for (let i = 0; i < n; i++) {
      const position = structure.sites[i]!.fractional_position;
      frac[i * 3] = position[0];
      frac[i * 3 + 1] = position[1];
      frac[i * 3 + 2] = position[2];
    }
    new Float64Array(memory.buffer, buffer.epsPtr, buffer.capacity).set(epsilon);
    new Float64Array(memory.buffer, buffer.sigmaPtr, buffer.capacity).set(sigma);

    const status = exports.hcs_lj_energy_forces(
      n,
      buffer.latticePtr,
      buffer.pbcPtr,
      buffer.fracPtr,
      buffer.epsPtr,
      buffer.sigmaPtr,
      requested,
      buffer.forcesPtr,
      buffer.scalarsPtr,
    );
    if (status !== 0) {
      throw new WasmKernelError(
        status === 1
          ? "WASM kernel rejected its arguments"
          : "WASM kernel rejected the cell or parameters (cutoff, cell size or pair parameters)",
        "kernel",
      );
    }

    const scalars = new Float64Array(memory.buffer, buffer.scalarsPtr, 5);
    const forceValues = new Float64Array(memory.buffer, buffer.forcesPtr, n * 3);
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
  };

  const kernel: WasmKernel = {
    abiVersion: abi,
    moduleBytes,
    memoryBytes,
    get arenaCapacityAtoms() {
      return arena?.capacity ?? 0;
    },
    get arenaAllocations() {
      return arenaAllocations;
    },
    energyForces,
    dispose() {
      if (disposed) return;
      if (arena) freeArena(arena);
      arena = undefined;
      disposed = true;
    },
  };

  return kernel;
}
