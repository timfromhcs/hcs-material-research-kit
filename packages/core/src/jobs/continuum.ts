import type { JobRecord, ProvenanceRecord, ResultBundle, SimulationSpec } from "../types.js";
import { SCHEMA_VERSION } from "../types.js";
import { solveHeat1D, analyticSineMode } from "../kernels/heat1d.js";
import { newId } from "../structure.js";
import { hashJson } from "../hash.js";
import { JobController } from "./state.js";
import type { JobOutcome } from "./runner.js";
import { requireEngine } from "../engines.js";
import { CANONICAL_UNITS } from "../units.js";

export interface ContinuumJobOptions {
  spec: SimulationSpec;
  onProgress?: (update: { phase: string; fraction: number; message: string }) => void;
  cancel?: { requested: boolean };
  projectId?: string;
  jobId?: string;
  now?: () => Date;
}

function num(params: Record<string, unknown>, key: string, fallback?: number): number {
  const raw = params[key];
  if (raw === undefined) {
    if (fallback === undefined) throw new Error(`Missing required parameter '${key}'`);
    return fallback;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw))
    throw new Error(`Parameter '${key}' must be finite`);
  return raw;
}

/**
 * Runs the 1D heat/diffusion reference model. The analytic sine-mode error is
 * computed and reported when the initial profile is that mode, so the result
 * carries its own numerical verification instead of a bare field plot.
 */
export function runContinuumJob(options: ContinuumJobOptions): JobOutcome {
  const { spec } = options;
  const now = options.now ?? (() => new Date());
  const jobId = options.jobId ?? newId("job");
  const projectId = options.projectId ?? "local";
  const inputHash = hashJson(spec);

  const controller = new JobController({
    job_id: jobId,
    project_id: projectId,
    task_type: spec.task_type,
    input_hash: inputHash,
    spec_ref: `${projectId}/simulations/${jobId}/input.json`,
    engine_id: spec.engine_id,
    fidelity_level: spec.fidelity_level,
    now,
  });

  try {
    const engine = requireEngine(spec.engine_id);
    controller.transition("validated", "Spec validated");
    controller.transition("queued", "Queued");
    controller.transition("preparing", "Preparing grid");
    if (spec.task_type !== "continuum.heat_1d" && spec.task_type !== "continuum.diffusion_1d") {
      throw new Error(`Continuum runner does not handle '${spec.task_type}'`);
    }

    const length = num(spec.parameters, "length", 1);
    const alpha = num(spec.parameters, "alpha", 1e-5);
    const nodes = Math.round(num(spec.parameters, "nodes", 101));
    const steps = Math.round(num(spec.parameters, "steps", 1000));
    const dtRaw = spec.parameters.dt;
    const left = num(spec.parameters, "left", 0);
    const right = num(spec.parameters, "right", 0);
    const amplitude = num(spec.parameters, "amplitude", 1);
    const fieldName = spec.parameters.field === "concentration" ? "concentration" : "temperature";
    const fieldUnit = fieldName === "concentration" ? "mol/m^3" : "K";

    controller.transition("running", "Integrating heat equation (explicit FTCS)");
    const result = solveHeat1D({
      length,
      alpha,
      nodes,
      steps,
      ...(typeof dtRaw === "number" ? { dt: dtRaw } : {}),
      left,
      right,
      initial: (x) => amplitude * Math.sin((Math.PI * x) / length),
      saveInterval: Math.max(1, Math.floor(steps / 100)),
    });

    if (options.cancel?.requested) {
      controller.transition("cancelled", "Cancelled");
      return { job: controller.snapshot };
    }

    const finalTime = result.times[result.times.length - 1] ?? 0;
    const finalField = result.fields[result.fields.length - 1] ?? [];
    let maxError = 0;
    for (let i = 0; i < result.x.length; i++) {
      const reference = analyticSineMode(result.x[i]!, finalTime, length, alpha, amplitude);
      maxError = Math.max(maxError, Math.abs((finalField[i] ?? 0) - reference));
    }

    const series = [
      {
        name: `${fieldName}_profile`,
        x_label: "x",
        y_label: fieldName,
        x_unit: "m",
        y_unit: fieldUnit,
        x: result.x,
        y: finalField,
        method: "explicit FTCS, Dirichlet boundaries",
      },
      {
        name: "center_value_vs_time",
        x_label: "time",
        y_label: fieldName,
        x_unit: "s",
        y_unit: fieldUnit,
        x: result.times,
        y: result.fields.map((field) => field[Math.floor(result.x.length / 2)] ?? 0),
      },
    ];

    const resultBundle: ResultBundle = {
      schema_version: SCHEMA_VERSION,
      result_id: newId("result"),
      job_id: jobId,
      input_hash: inputHash,
      fidelity_level: spec.fidelity_level,
      engine_id: engine.engine_id,
      model_id: "heat1d.ftcs.v1",
      status: "complete",
      quantities: [
        { name: "diffusivity", value: alpha, unit: "m^2/s" },
        { name: "grid_spacing", value: result.dx, unit: "m" },
        { name: "timestep", value: result.dt, unit: "s" },
        { name: "courant_number", value: result.courant, unit: "1" },
        { name: "final_time", value: finalTime, unit: "s" },
        { name: "analytic_max_abs_error", value: maxError, unit: fieldUnit },
      ],
      series,
      convergence: {
        converged: result.stable,
        criterion: "explicit stability condition alpha·dt/dx² <= 0.5",
        final_value: result.courant,
        threshold: 0.5,
      },
      limitations: [
        "1D continuum model with constant diffusivity; not a materials-specific prediction.",
        "Only Dirichlet boundaries and a single scalar field are supported.",
        "Explicit FTCS has first-order time and second-order space accuracy.",
      ],
      created_at: now().toISOString(),
      provenance_ref: "",
    };

    controller.transition("completed", "Continuum run completed");
    const provenanceId = `prov_${hashJson({ input: inputHash, task: spec.task_type }).slice(0, 16)}`;
    resultBundle.provenance_ref = provenanceId;
    controller.setResultRef(`${jobId}/result.json`);
    const job: JobRecord = controller.finalize({ backend: "cpu" });
    const provenance: ProvenanceRecord = {
      schema_version: SCHEMA_VERSION,
      provenance_id: provenanceId,
      recorded_at: now().toISOString(),
      fidelity_level: "continuum_model",
      method: {
        name: "Explicit finite-difference heat equation solver",
        equation_reference: "∂u/∂t = α ∂²u/∂x², FTCS discretisation, Dirichlet boundaries",
        parameters: spec.parameters,
        assumptions: ["Constant isotropic diffusivity", "1D geometry", "No source term"],
        limitations: resultBundle.limitations,
        validation_state: "analytically_verified",
      },
      software: {
        name: "@hcs-materials/core",
        version: engine.version,
        engine_id: engine.engine_id,
        engine_version: engine.version,
      },
      inputs: { input_hash: inputHash },
      environment: { backend: "cpu", precision: "float64", deterministic: true },
      units: { ...CANONICAL_UNITS, length: "m", time: "s" },
    };
    return { job, result: resultBundle, provenance };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (controller.state !== "failed" && controller.state !== "cancelled") {
      controller.transition("failed", message);
    }
    return { job: controller.snapshot, error: { code: "continuum_error", message } };
  }
}
