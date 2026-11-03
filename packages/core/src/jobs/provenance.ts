import type {
  EngineRecord,
  FidelityLevel,
  ProvenanceRecord,
  SimulationSpec,
  Structure,
} from "../types.js";
import { SCHEMA_VERSION } from "../types.js";
import { hashJson, structureHash } from "../index-internal.js";
import { CANONICAL_UNITS } from "../units.js";
import { CORE_VERSION } from "../engines.js";
import type { LJModel } from "../kernels/lj.js";

export interface ProvenanceInput {
  spec: SimulationSpec;
  structure: Structure;
  engine: EngineRecord;
  model?: LJModel;
  backend?: "cpu" | "wasm" | "webgpu" | "vulkan" | "cuda" | "hip" | "unknown";
  deviceName?: string;
  randomSeed?: number;
  deterministic?: boolean;
  warnings?: string[];
  provenanceId?: string;
  recordedAt?: string;
  /**
   * Method parameters to record instead of `spec.parameters`. Used when the run
   * consumed additional inputs that are not part of the spec (for example a
   * resumed MD checkpoint), so the record stays complete without mutating the
   * user's spec.
   */
  parameters?: Record<string, unknown>;
}

export function buildProvenance(input: ProvenanceInput): ProvenanceRecord {
  const { spec, structure, engine, model } = input;
  const structureDigest = structureHash(structure);
  const inputHash = hashJson(spec);
  const normalizedInputHash = hashJson({
    structure_hash: structureDigest,
    task_type: spec.task_type,
    engine_id: spec.engine_id,
    model_id: spec.model_id ?? null,
    parameters: spec.parameters,
    fidelity_level: spec.fidelity_level,
  });
  const assumptions: string[] = [];
  const limitations: string[] = [];
  let methodName: string = spec.task_type;
  let equationReference: string | undefined;

  if (model) {
    methodName = `Lennard-Jones pair potential (${model.id})`;
    equationReference =
      "U(r) = 4ε[(σ/r)^12 - (σ/r)^6] with a cubic switching function between 0.9·r_c and r_c; Lorentz-Berthelot mixing";
    assumptions.push(
      "Interactions are pairwise and isotropic.",
      `Cutoff ${model.cutoff} Å, cubically switched so potential and force vanish at r_c; no tail correction.`,
      "Cross-species parameters follow the Lorentz-Berthelot mixing rule.",
      "Atoms carry no charge, dipole or magnetic moment.",
    );
    limitations.push(...model.limitations);
  }

  return {
    schema_version: SCHEMA_VERSION,
    provenance_id: input.provenanceId ?? `prov_${inputHash.slice(0, 16)}`,
    recorded_at: input.recordedAt ?? new Date().toISOString(),
    fidelity_level: spec.fidelity_level as FidelityLevel,
    method: {
      name: methodName,
      equation_reference: equationReference,
      model_id: spec.model_id,
      model_version: model ? "1" : undefined,
      parameters: input.parameters ?? spec.parameters,
      assumptions,
      limitations,
      validation_state: model ? "analytically_verified" : "unit_tested",
    },
    software: {
      name: "@hcs-materials/core",
      version: CORE_VERSION,
      engine_id: engine.engine_id,
      engine_version: engine.version,
      adapter_version: CORE_VERSION,
    },
    inputs: {
      input_hash: inputHash,
      normalized_input_hash: normalizedInputHash,
      structure_id: structure.structure_id,
      structure_hash: structureDigest,
    },
    environment: {
      os: typeof navigator !== "undefined" ? "browser" : "node",
      architecture: "unknown",
      runtime:
        typeof navigator !== "undefined"
          ? (navigator.userAgent ?? "browser")
          : `node ${process.version}`,
      backend: input.backend ?? "cpu",
      precision: "float64",
      device_name: input.deviceName,
      random_seed: input.randomSeed,
      deterministic: input.deterministic ?? true,
    },
    units: { ...CANONICAL_UNITS },
    warnings: input.warnings,
  };
}
