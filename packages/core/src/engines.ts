import type { EngineRecord } from "./types.js";
import { SCHEMA_VERSION } from "./types.js";
import { LJ_NOBLE_GASES } from "./kernels/lj.js";

export const CORE_VERSION = "0.3.0";

/**
 * Registry of engines that are actually implemented in this build.
 *
 * An engine appears here only when its kernel, validation and limits exist.
 * Nothing in the UI may invent an engine that is absent from this list.
 */
export const BUILTIN_ENGINES: EngineRecord[] = [
  {
    schema_version: SCHEMA_VERSION,
    engine_id: "hcs.lj-reference",
    name: "HCS Lennard-Jones reference engine",
    version: CORE_VERSION,
    provider: "HCS (hcsmedia and timfromhcs)",
    license: "MIT (HCS code); parameters are literature estimates — see model notes",
    supported_tasks: ["energy.evaluate", "structure.relax", "md.run", "analysis.rdf"],
    supported_elements: Object.keys(LJ_NOBLE_GASES.species),
    supported_phases: ["bulk (periodic cell)"],
    platforms: ["windows", "linux", "macos", "browser"],
    execution_backends: ["cpu", "wasm"],
    precision_modes: ["float64"],
    model_ids: [LJ_NOBLE_GASES.id],
    minimum_memory_mb: 32,
    known_limits: [
      "Pairwise Lennard-Jones only; no electrostatics, many-body or quantum effects.",
      "Parameters exist only for He, Ne, Ar, Kr and Xe at this revision.",
      "O(N²) pair loop: not suited to more than a few thousand atoms.",
      "Cubically switched between 0.9·r_c and r_c; no long-range tail correction.",
      "NVE or Langevin NVT; there is no barostat, so NPT requests are rejected.",
      "Not valid for predicting properties of real engineering materials.",
    ],
    validation_cases: [
      {
        id: "lj.force-vs-gradient",
        description:
          "Forces equal the negative numerical gradient of the energy (central differences).",
        status: "passing",
        tolerance: "relative deviation < 1e-5",
      },
      {
        id: "lj.pair-curve",
        description: "Pair potential matches the closed-form minimum at r = 2^(1/6)σ with U = -ε.",
        status: "passing",
        tolerance: "abs < 1e-12 eV",
      },
      {
        id: "lj.nve-energy-conservation",
        description: "500-step NVE run on a 108-atom Ar cell conserves total energy.",
        status: "passing",
        tolerance: "< 1e-3 eV per atom drift",
      },
      {
        id: "lj.translation-invariance",
        description: "Energy is invariant under a rigid translation of all atoms.",
        status: "passing",
        tolerance: "abs < 1e-10 eV",
      },
    ],
    installation_state: "builtin",
    installation_notes: "Compiled into the HCS core; no download required.",
    fidelity_levels: ["classical_model"],
    docs_url: "docs/science/lennard-jones-reference.md",
  },
  {
    schema_version: SCHEMA_VERSION,
    engine_id: "hcs.sw-silicon",
    name: "HCS Stillinger–Weber silicon engine",
    version: CORE_VERSION,
    provider: "HCS (hcsmedia and timfromhcs)",
    license: "MIT (HCS code); the 1985 parameter set is published in the cited paper",
    supported_tasks: ["energy.evaluate", "structure.relax", "md.run", "analysis.rdf"],
    supported_elements: ["Si"],
    supported_phases: ["bulk (periodic cell)"],
    platforms: ["windows", "linux", "macos", "browser"],
    execution_backends: ["cpu"],
    precision_modes: ["float64"],
    model_ids: ["sw.silicon.v1"],
    minimum_memory_mb: 64,
    known_limits: [
      "Silicon only: the published parameter set is not transferable.",
      "Classical two- and three-body model; no electronic structure, charge transfer or magnetism.",
      "Requires the full cutoff a·σ ≈ 3.771 Å, so a 1×1×1 conventional diamond cell is too small.",
      "O(N·z²) neighbour triplets; the reference path, not a large-scale MD engine.",
      "NVE or Langevin NVT; there is no barostat, so NPT requests are rejected.",
      "The original 1985 set is fitted to diamond silicon and is weakest for liquid and amorphous phases.",
    ],
    validation_cases: [
      {
        id: "sw.force-vs-gradient",
        description:
          "Forces equal the negative numerical gradient of the energy (central differences).",
        status: "passing",
        tolerance: "relative deviation < 1e-5",
      },
      {
        id: "sw.three-body-reference",
        description:
          "The three-body term of a hand-built cluster matches an independent expression.",
        status: "passing",
        tolerance: "abs < 1e-12 eV",
      },
      {
        id: "sw.diamond-lattice",
        description:
          "Relaxation from a strained diamond cell returns to the silicon lattice constant.",
        status: "passing",
        tolerance: "within 0.10 Å of 5.431 Å",
      },
      {
        id: "sw.nve-energy-conservation",
        description: "NVE dynamics on a 64-atom silicon cell conserves total energy.",
        status: "passing",
        tolerance: "< 1e-3 eV per atom drift",
      },
    ],
    installation_state: "builtin",
    installation_notes: "Compiled into the HCS core; no download required.",
    fidelity_levels: ["classical_model"],
    docs_url: "docs/science/stillinger-weber-silicon.md",
  },
  {
    schema_version: SCHEMA_VERSION,
    engine_id: "hcs.heat1d-reference",
    name: "HCS 1D heat/diffusion reference solver",
    version: CORE_VERSION,
    provider: "HCS (hcsmedia and timfromhcs)",
    license: "MIT",
    supported_tasks: ["continuum.heat_1d", "continuum.diffusion_1d"],
    supported_elements: [],
    supported_phases: ["continuum 1D"],
    platforms: ["windows", "linux", "macos", "browser"],
    execution_backends: ["cpu", "wasm"],
    precision_modes: ["float64"],
    model_ids: ["heat1d.ftcs.v1"],
    minimum_memory_mb: 8,
    known_limits: [
      "1D, single scalar field, constant diffusivity.",
      "Explicit FTCS only: stable only for alpha·dt/dx² <= 0.5.",
      "Dirichlet boundaries only; no source term or nonlinear material law.",
    ],
    validation_cases: [
      {
        id: "heat1d.sine-mode",
        description: "Against the analytic decay of the lowest Fourier mode.",
        status: "passing",
        tolerance: "max abs error < 5e-4 after 5% of the decay time",
      },
      {
        id: "heat1d.stability-guard",
        description: "Rejects Courant numbers above 0.5 instead of running an unstable scheme.",
        status: "passing",
      },
    ],
    installation_state: "builtin",
    installation_notes: "Pure TypeScript CPU reference implementation.",
    fidelity_levels: ["continuum_model"],
    docs_url: "docs/science/heat-equation-reference.md",
  },
];

/**
 * Engines HCS intends to support but has not implemented. Shown as
 * "not implemented" in the UI — never as selectable, runnable engines.
 */
export interface PlannedEngine {
  engine_id: string;
  name: string;
  provider: string;
  planned_tasks: string[];
  status: "not_implemented";
  note: string;
}

export const PLANNED_ENGINES: PlannedEngine[] = [
  {
    engine_id: "lammps",
    name: "LAMMPS",
    provider: "Sandia National Laboratories",
    planned_tasks: ["md.run", "structure.relax"],
    status: "not_implemented",
    note: "Requires a subprocess adapter, input generator, log/dump parser and cancellation tests.",
  },
  {
    engine_id: "ase",
    name: "ASE bridge",
    provider: "ASE developers",
    planned_tasks: ["structure.validate", "structure.relax", "energy.evaluate"],
    status: "not_implemented",
    note: "Native Python bridge; not available in the browser edition.",
  },
  {
    engine_id: "quantum-espresso",
    name: "Quantum ESPRESSO",
    provider: "QE Foundation",
    planned_tasks: ["energy.evaluate", "structure.relax"],
    status: "not_implemented",
    note: "Optional external DFT engine; inputs must be prepared and validated, results parsed and convergence recorded.",
  },
  {
    engine_id: "cp2k",
    name: "CP2K",
    provider: "CP2K developers",
    planned_tasks: ["energy.evaluate", "md.run"],
    status: "not_implemented",
    note: "Optional external engine; CPU-first integration.",
  },
  {
    engine_id: "mace",
    name: "MACE ML potential",
    provider: "ACE developers",
    planned_tasks: ["energy.evaluate", "structure.relax", "md.run"],
    status: "not_implemented",
    note: "Requires model card, checkpoint hash, supported-element matrix and dependency isolation.",
  },
  {
    engine_id: "pycalphad",
    name: "pycalphad",
    provider: "pycalphad developers",
    planned_tasks: ["thermodynamics.phase_diagram"],
    status: "not_implemented",
    note: "CALPHAD TDB thermodynamics; native module, no browser path.",
  },
];

export function listEngines(): EngineRecord[] {
  return BUILTIN_ENGINES;
}

export function getEngine(engineId: string): EngineRecord | undefined {
  return BUILTIN_ENGINES.find((engine) => engine.engine_id === engineId);
}

export function requireEngine(engineId: string): EngineRecord {
  const engine = getEngine(engineId);
  if (!engine) {
    const planned = PLANNED_ENGINES.find((candidate) => candidate.engine_id === engineId);
    if (planned) {
      throw new Error(
        `Engine '${engineId}' is planned but not implemented in this build. ` +
          `Reason: ${planned.note}`,
      );
    }
    throw new Error(
      `Unknown engine '${engineId}'. Available engines: ${BUILTIN_ENGINES.map((e) => e.engine_id).join(", ")}`,
    );
  }
  if (engine.installation_state !== "builtin" && engine.installation_state !== "installed") {
    throw new Error(
      `Engine '${engineId}' is registered but not available (${engine.installation_state}).`,
    );
  }
  return engine;
}

export function engineSupports(engineId: string, taskType: string): boolean {
  const engine = getEngine(engineId);
  return Boolean(engine?.supported_tasks.includes(taskType as never));
}
