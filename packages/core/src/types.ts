import type { LengthUnit } from "./units.js";
import type { Mat3, Vec3 } from "./linalg.js";

export const SCHEMA_VERSION = "1.0.0" as const;

export type FidelityLevel =
  | "illustrative"
  | "classical_model"
  | "ml_potential"
  | "semi_empirical"
  | "first_principles"
  | "continuum_model"
  | "benchmark_validated"
  | "experiment_referenced";

export interface Site {
  species: string;
  label?: string;
  fractional_position: Vec3;
  cartesian_position?: Vec3;
  occupancy?: number;
  charge?: number;
  mobility?: boolean[];
}

export interface Composition {
  reduced_formula: string;
  elements: string[];
  amounts: Record<string, number>;
  total_atoms?: number;
}

export interface SpaceGroup {
  symbol: string;
  number?: number;
  symmetry_tolerance_angstrom?: number;
}

export interface StructureSource {
  format: "cif" | "poscar" | "xyz" | "extxyz" | "hcs-json" | "generated" | "optimade";
  uri?: string;
  filename?: string;
  retrieved_at?: string;
  provider?: string;
  provider_record_id?: string;
  license?: string;
  notes?: string;
}

export type CheckStatus = "pass" | "warning" | "fail";

export interface ValidationCheck {
  id: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationReport {
  status: "valid" | "warning" | "invalid" | "unchecked";
  checks: ValidationCheck[];
}

export interface Structure {
  schema_version: typeof SCHEMA_VERSION;
  structure_id: string;
  display_name?: string;
  length_unit: LengthUnit;
  lattice: { vectors: Mat3 };
  pbc: [boolean, boolean, boolean];
  sites: Site[];
  composition?: Composition;
  space_group?: SpaceGroup;
  source?: StructureSource;
  validation?: ValidationReport;
  created_at?: string;
  updated_at?: string;
}

export type TaskType =
  | "structure.validate"
  | "energy.evaluate"
  | "structure.relax"
  | "md.run"
  | "analysis.rdf"
  | "analysis.msd"
  | "continuum.diffusion_1d"
  | "continuum.heat_1d";

export interface SimulationSpec {
  schema_version: typeof SCHEMA_VERSION;
  task_id: string;
  task_type: TaskType;
  structure_ref: { structure_id: string; structure_hash: string };
  engine_id: string;
  model_id?: string;
  fidelity_level: FidelityLevel;
  parameters: Record<string, unknown>;
  thermodynamic_conditions?: {
    temperature?: number;
    pressure?: number;
    ensemble?: "NVE" | "NVT" | "NPT" | "none";
  };
  boundary_conditions?: { periodic?: [boolean, boolean, boolean]; description?: string };
  compute_policy?: {
    backend?: "auto" | "cpu" | "wasm" | "webgpu" | "vulkan";
    precision?: "float64" | "float32";
    memory_budget_mb?: number;
    max_threads?: number;
  };
  seed?: number;
  timeout_seconds?: number;
  checkpoint_policy?: { enabled?: boolean; interval_steps?: number };
  requested_outputs?: Array<
    "energy" | "forces" | "trajectory" | "rdf" | "msd" | "thermo" | "field" | "structure"
  >;
  notes?: string;
}

export type JobState =
  | "created"
  | "validated"
  | "queued"
  | "preparing"
  | "running"
  | "checkpointing"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface JobEvent {
  at: string;
  state: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface JobRecord {
  schema_version: typeof SCHEMA_VERSION;
  job_id: string;
  project_id: string;
  task_type: string;
  engine_id?: string;
  fidelity_level?: string;
  state: JobState;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  input_hash: string;
  spec_ref: string;
  progress?: { phase: string; fraction: number; message: string };
  events: JobEvent[];
  warnings?: Array<{ code: string; message: string; severity?: "info" | "warning" | "error" }>;
  cancel_requested?: boolean;
  checkpoint_refs?: string[];
  output_refs?: string[];
  result_ref?: string;
  resource_metrics?: {
    wall_time_seconds?: number;
    compute_time_seconds?: number;
    peak_memory_mb?: number;
    backend?: string;
    device?: string;
  };
  engine_capability_snapshot?: Record<string, unknown>;
}

export interface Quantity {
  name: string;
  value: number | string | boolean;
  unit: string;
  method?: string;
  uncertainty?: number;
  description?: string;
}

export interface Series {
  name: string;
  x_label?: string;
  y_label?: string;
  x_unit: string;
  y_unit: string;
  x: number[];
  y: number[];
  method?: string;
}

export interface ResultBundle {
  schema_version: typeof SCHEMA_VERSION;
  result_id: string;
  job_id: string;
  input_hash: string;
  fidelity_level: string;
  engine_id: string;
  model_id?: string;
  status: "complete" | "incomplete" | "invalid";
  quantities: Quantity[];
  series?: Series[];
  convergence: {
    converged: boolean;
    criterion: string;
    iterations?: number;
    final_value?: number;
    threshold?: number;
    residuals?: number[];
  };
  limitations: string[];
  warnings?: string[];
  result_structure?: Structure;
  artifacts?: Array<{
    name: string;
    path: string;
    media_type: string;
    sha256?: string;
    bytes?: number;
  }>;
  provenance_ref: string;
  created_at?: string;
}

export interface ProvenanceRecord {
  schema_version: typeof SCHEMA_VERSION;
  provenance_id: string;
  recorded_at: string;
  fidelity_level: FidelityLevel;
  method?: {
    name?: string;
    equation_reference?: string;
    model_id?: string;
    model_version?: string;
    parameters?: Record<string, unknown>;
    assumptions?: string[];
    limitations?: string[];
    validation_state?:
      "unvalidated" | "unit_tested" | "analytically_verified" | "benchmark_verified";
  };
  software: {
    name: string;
    version: string;
    commit?: string;
    engine_id?: string;
    engine_version?: string;
    adapter_version?: string;
    executable_sha256?: string;
  };
  inputs: {
    input_hash: string;
    normalized_input_hash?: string;
    structure_id?: string;
    structure_hash?: string;
    dataset_refs?: Array<{
      provider: string;
      record_id: string;
      uri?: string;
      retrieved_at?: string;
      license?: string;
    }>;
  };
  environment?: {
    os?: string;
    architecture?: string;
    runtime?: string;
    backend?: "cpu" | "wasm" | "webgpu" | "vulkan" | "cuda" | "hip" | "unknown";
    precision?: "float64" | "float32" | "mixed" | "unknown";
    device_name?: string;
    threads?: number;
    random_seed?: number;
    deterministic?: boolean;
  };
  units: Record<string, string>;
  warnings?: string[];
}

export interface EngineRecord {
  schema_version: typeof SCHEMA_VERSION;
  engine_id: string;
  name: string;
  version: string;
  provider: string;
  license: string;
  supported_tasks: TaskType[];
  supported_elements?: string[];
  supported_phases?: string[];
  platforms?: Array<"windows" | "linux" | "macos" | "browser">;
  execution_backends: Array<"cpu" | "wasm" | "webgpu" | "vulkan" | "cuda" | "hip">;
  precision_modes?: Array<"float64" | "float32">;
  model_ids?: string[];
  minimum_memory_mb?: number;
  known_limits?: string[];
  validation_cases?: Array<{
    id: string;
    description: string;
    status: "passing" | "failing" | "not_run";
    tolerance?: string;
  }>;
  installation_state:
    "builtin" | "installed" | "not_installed" | "unsupported_platform" | "unavailable";
  installation_notes?: string;
  fidelity_levels?: string[];
  docs_url?: string;
}
