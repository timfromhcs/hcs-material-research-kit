import type {
  JobRecord,
  ProvenanceRecord,
  ResultBundle,
  Series,
  SimulationSpec,
  Structure,
} from "../types.js";
import { SCHEMA_VERSION } from "../types.js";
import { validate } from "@hcs-materials/contracts";
import { JobController } from "./state.js";
import { buildProvenance } from "./provenance.js";
import { requireEngine } from "../engines.js";
import type { EnergyForcesKernel } from "../kernels/relax.js";
import { relaxFire } from "../kernels/relax.js";
import { runMd, type MdCheckpoint, type MdTrajectoryFrame } from "../kernels/md.js";
import { computeRdf } from "../kernels/analysis.js";
import { structureHash, validateStructure } from "../structure.js";
import { newId } from "../structure.js";
import { hashJson } from "../hash.js";
import { CANONICAL_UNITS } from "../units.js";
import type { FidelityLevel } from "../types.js";
import { maxCutoffForCell } from "../kernels/lj.js";
import {
  evaluatePotential,
  getPotentialModelForEngine,
  isLJModel,
  missingElements,
  type PotentialModel,
} from "../kernels/potential.js";

export interface ProgressUpdate {
  phase: string;
  fraction: number;
  message: string;
}

export interface RunJobOptions {
  spec: SimulationSpec;
  structure: Structure;
  projectId?: string;
  jobId?: string;
  onProgress?: (update: ProgressUpdate) => void;
  /**
   * Cooperative cancellation flag. It is polled inside solver step callbacks.
   * A synchronous solver cannot observe a flag set from the same thread while
   * it runs; browser cancellation therefore also terminates the worker
   * (see docs/decisions/ADR-0003-job-cancellation.md).
   */
  cancel?: { requested: boolean };
  /**
   * Optional alternative energy/force implementation (for example the WASM
   * kernel). It must match the CPU contract, including cutoff handling and
   * error behaviour; the job records which backend produced the numbers.
   */
  energyKernel?: EnergyForcesKernel;
  /** Continue an MD run from a checkpoint (only valid for `md.run`). */
  mdResume?: MdCheckpoint;
  now?: () => Date;
}

export interface JobOutcome {
  job: JobRecord;
  result?: ResultBundle;
  provenance?: ProvenanceRecord;
  trajectory?: MdTrajectoryFrame[];
  /** Final MD state, so a caller can persist a checkpoint. */
  mdCheckpoint?: MdCheckpoint;
  error?: { code: string; message: string };
}

function failJob(
  controller: JobController,
  outcome: Omit<JobOutcome, "job">,
  message: string,
  code: string,
): JobOutcome {
  controller.warn(code, message, "error");
  if (controller.state !== "failed" && controller.state !== "cancelled") {
    controller.transition("failed", message, { code });
  }
  return { job: controller.snapshot, ...outcome, error: { code, message } };
}

function numberParam(params: Record<string, unknown>, key: string, fallback?: number): number {
  const raw = params[key];
  if (raw === undefined) {
    if (fallback === undefined) throw new Error(`Missing required parameter '${key}'`);
    return fallback;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new Error(`Parameter '${key}' must be a finite number`);
  }
  return raw;
}

function integerParam(params: Record<string, unknown>, key: string, fallback?: number): number {
  const value = numberParam(params, key, fallback);
  if (!Number.isInteger(value)) throw new Error(`Parameter '${key}' must be an integer`);
  return value;
}

function modelFrom(spec: SimulationSpec): PotentialModel {
  return getPotentialModelForEngine(spec.engine_id, spec.model_id);
}

/**
 * Executes one atomistic job and returns the lifecycle record, result bundle
 * and provenance. It never fabricates a result: every failure path returns an
 * error and a failed/cancelled job.
 */
export function runJob(options: RunJobOptions): JobOutcome {
  const { spec, structure } = options;
  const now = options.now ?? (() => new Date());
  const jobId = options.jobId ?? newId("job");
  const projectId = options.projectId ?? "local";
  const inputHash = hashJson(spec);

  let engine;
  try {
    engine = requireEngine(spec.engine_id);
  } catch (error) {
    // Engine unknown: still produce a failed job record for the audit trail.
    const controller = new JobController({
      job_id: jobId,
      project_id: projectId,
      task_type: spec.task_type,
      input_hash: inputHash,
      spec_ref: `${projectId}/simulations/${jobId}/input.json`,
      now,
    });
    return failJob(controller, {}, (error as Error).message, "engine_unavailable");
  }

  const controller = new JobController({
    job_id: jobId,
    project_id: projectId,
    task_type: spec.task_type,
    input_hash: inputHash,
    spec_ref: `${projectId}/simulations/${jobId}/input.json`,
    engine_id: engine.engine_id,
    fidelity_level: spec.fidelity_level,
    engine_capability_snapshot: {
      engine_version: engine.version,
      supported_tasks: engine.supported_tasks,
      execution_backends: engine.execution_backends,
      fidelity_levels: engine.fidelity_levels,
      known_limits: engine.known_limits,
    },
    now,
  });

  const report = (phase: string, fraction: number, message: string): void => {
    controller.progress(phase, fraction, message);
    options.onProgress?.({ phase, fraction, message });
  };

  try {
    report("validate", 0.02, "Validating contract and structure");

    const specErrors = validate("simulation", spec);
    if (specErrors.length > 0) {
      return failJob(
        controller,
        {},
        `Simulation spec failed schema validation: ${specErrors
          .slice(0, 5)
          .map((e) => `${e.instancePath} ${e.message}`)
          .join("; ")}`,
        "invalid_spec",
      );
    }
    if (!engine.supported_tasks.includes(spec.task_type)) {
      return failJob(
        controller,
        {},
        `Engine '${engine.engine_id}' does not support task '${spec.task_type}'. Supported: ${engine.supported_tasks.join(", ")}`,
        "unsupported_task",
      );
    }
    const fidelityLevels = engine.fidelity_levels ?? [];
    if (fidelityLevels.length > 0 && !fidelityLevels.includes(spec.fidelity_level)) {
      return failJob(
        controller,
        {},
        `Fidelity level '${spec.fidelity_level}' is not declared by engine '${engine.engine_id}' ` +
          `(${fidelityLevels.join(", ")}). Refusing to label a result with a fidelity it does not have.`,
        "fidelity_mismatch",
      );
    }
    if (options.mdResume && spec.task_type !== "md.run") {
      return failJob(
        controller,
        {},
        `A checkpoint was supplied but the task is '${spec.task_type}'. Checkpoints only apply to md.run.`,
        "resume_not_applicable",
      );
    }
    const structureErrors = validate("structure", structure);
    if (structureErrors.length > 0) {
      return failJob(
        controller,
        {},
        `Structure failed schema validation: ${structureErrors
          .slice(0, 5)
          .map((e) => `${e.instancePath} ${e.message}`)
          .join("; ")}`,
        "invalid_structure",
      );
    }
    if (spec.structure_ref.structure_hash !== structureHash(structure)) {
      return failJob(
        controller,
        {},
        "Structure hash does not match spec.structure_ref.structure_hash. " +
          "The input changed after the spec was created; create a new spec.",
        "structure_hash_mismatch",
      );
    }
    const structural = validateStructure(structure);
    if (structural.status === "invalid") {
      return failJob(
        controller,
        {},
        `Structure is invalid: ${structural.checks
          .filter((c) => c.status === "fail")
          .map((c) => c.message)
          .join(" ")}`,
        "invalid_structure",
      );
    }
    controller.transition("validated", "Spec and structure validated");
    controller.transition("queued", "Job queued");
    controller.transition("preparing", "Preparing kernel");

    const cancelled = (): boolean => options.cancel?.requested === true;

    if (spec.task_type === "structure.validate") {
      controller.transition("running", "Reporting validation");
      report("analysis", 0.5, "Collecting validation report");
      const result: ResultBundle = {
        schema_version: SCHEMA_VERSION,
        result_id: newId("result"),
        job_id: jobId,
        input_hash: inputHash,
        fidelity_level: spec.fidelity_level,
        engine_id: engine.engine_id,
        status: "complete",
        quantities: [
          {
            name: "validation_status",
            value: structural.status,
            unit: "1",
            method: "HCS structural validation checks",
          },
          {
            name: "check_count",
            value: structural.checks.length,
            unit: "1",
          },
          {
            name: "failed_checks",
            value: structural.checks.filter((c) => c.status === "fail").length,
            unit: "1",
          },
        ],
        convergence: { converged: true, criterion: "deterministic validation, no iteration" },
        limitations: [
          "Structural validation checks geometry and input sanity only; it is not a physical stability test.",
        ],
        created_at: now().toISOString(),
        provenance_ref: "",
      };
      controller.transition("completed", "Job completed");
      return finish(
        controller,
        result,
        spec,
        structure,
        engine,
        undefined,
        options,
        now,
        undefined,
      );
    }

    // ---- atomistic tasks ------------------------------------------------
    const model = modelFrom(spec);
    if (engine.model_ids && spec.model_id && !engine.model_ids.includes(spec.model_id)) {
      return failJob(
        controller,
        {},
        `Model '${spec.model_id}' is not declared by engine '${engine.engine_id}' ` +
          `(${engine.model_ids.join(", ")}). The engine would run different physics than the label says.`,
        "model_not_declared_by_engine",
      );
    }
    const missing = missingElements(model, structure);
    if (missing.length > 0) {
      return failJob(
        controller,
        {},
        `Model '${model.id}' has no parameters for: ${missing.join(", ")}. ` +
          "HCS refuses to invent parameters or to drop those atoms.",
        "unsupported_elements",
      );
    }

    const cutoffParam =
      spec.parameters.cutoff === undefined ? undefined : numberParam(spec.parameters, "cutoff");
    let effectiveCutoff: number;
    if (isLJModel(model)) {
      effectiveCutoff = Math.min(cutoffParam ?? model.cutoff, maxCutoffForCell(structure));
      if (effectiveCutoff < (cutoffParam ?? model.cutoff) - 1e-9) {
        controller.warn(
          "lj.cutoff_reduced",
          `Pair cutoff reduced from ${(cutoffParam ?? model.cutoff).toFixed(2)} Å to ${effectiveCutoff.toFixed(2)} Å ` +
            "because the cell is smaller than twice the requested cutoff. Build a larger supercell for a converged result.",
          "warning",
        );
      }
    } else {
      // Many-body potentials are defined with their full cutoff; truncating
      // them would silently change the fitted model, so a too-small cell is
      // refused instead of clamped.
      effectiveCutoff = cutoffParam ?? model.cutoff;
      const maxValid = maxCutoffForCell(structure);
      if (effectiveCutoff > maxValid + 1e-9) {
        return failJob(
          controller,
          {},
          `Model '${model.id}' requires its full cutoff of ${effectiveCutoff.toFixed(3)} Å, but this cell's ` +
            `minimum-image radius is only ${maxValid.toFixed(3)} Å. Build a larger supercell ` +
            "(for diamond Si at a = 5.43 Å, a 2×2×2 conventional cell is the smallest valid choice).",
          "cell_too_small",
        );
      }
      if (cutoffParam !== undefined && Math.abs(cutoffParam - model.cutoff) > 1e-9) {
        return failJob(
          controller,
          {},
          `Model '${model.id}' is defined with a cutoff of ${model.cutoff.toFixed(3)} Å; ` +
            `the spec requests ${cutoffParam.toFixed(3)} Å. Truncating a many-body potential is not supported.`,
          "cutoff_not_supported",
        );
      }
    }
    controller.transition("running", `Running ${spec.task_type} with ${model.id}`);
    report("run", 0.05, `Running ${spec.task_type}`);

    // Preflight: a cell whose supported cutoff reaches no other atom has no
    // physics in it. Refusing is honest; returning E = 0 would look like data.
    const evaluate: EnergyForcesKernel =
      isLJModel(model) && options.energyKernel
        ? options.energyKernel
        : (candidate, candidateModel, evaluation) =>
            evaluatePotential(candidate, candidateModel, evaluation ?? { cutoff: effectiveCutoff });
    const preflight = evaluate(structure, model, { cutoff: effectiveCutoff });
    const backend = preflight.backend;
    if (preflight.pairCount === 0) {
      return failJob(
        controller,
        {},
        `No atom pair lies within the effective cutoff of ${effectiveCutoff.toFixed(2)} Å in this ` +
          `${structure.sites.length}-atom cell, so the model has no interactions here. ` +
          "Build a larger supercell in Structure Studio (or raise the cutoff) and run again.",
        "lj.no_interactions",
      );
    }

    if (spec.task_type === "energy.evaluate") {
      const evaluatedNow = evaluate(structure, model, { cutoff: effectiveCutoff });
      report("analysis", 0.9, "Collecting single-point energy and forces");
      const result: ResultBundle = {
        schema_version: SCHEMA_VERSION,
        result_id: newId("result"),
        job_id: jobId,
        input_hash: inputHash,
        fidelity_level: spec.fidelity_level,
        engine_id: engine.engine_id,
        model_id: model.id,
        status: "complete",
        quantities: [
          {
            name: "total_potential_energy",
            value: evaluatedNow.energy,
            unit: CANONICAL_UNITS.energy,
          },
          { name: "potential_energy_per_atom", value: evaluatedNow.energyPerAtom, unit: "eV/atom" },
          { name: "max_force", value: evaluatedNow.maxForce, unit: CANONICAL_UNITS.force },
          { name: "pair_count", value: evaluatedNow.pairCount, unit: "1" },
          { name: "atom_count", value: structure.sites.length, unit: "1" },
          { name: "cutoff", value: model.cutoff, unit: CANONICAL_UNITS.length },
          { name: "compute_backend", value: backend, unit: "1" },
        ],
        convergence: {
          converged: true,
          criterion: "single-point evaluation (no iterative convergence criterion applies)",
        },
        limitations: model.limitations,
        warnings: structural.status === "warning" ? ["Structure carries validation warnings."] : [],
        created_at: now().toISOString(),
        provenance_ref: "",
      };
      controller.transition("completed", "Energy evaluation completed");
      return finish(controller, result, spec, structure, engine, model, options, now, undefined);
    }

    if (spec.task_type === "structure.relax") {
      const maxForceTarget = numberParam(spec.parameters, "maxForceEvPerA", 0.01);
      const maxSteps = integerParam(spec.parameters, "maxSteps", 500);
      const relaxation = relaxFire(structure, model, {
        maxForceEvPerA: maxForceTarget,
        maxSteps,
        cutoff: effectiveCutoff,
        energyKernel: evaluate,
        onStep: ({ step, energy, maxForce }) => {
          report(
            "relax",
            Math.min(0.95, 0.05 + 0.9 * (step / maxSteps)),
            `Step ${step}: E=${energy.toFixed(4)} eV, Fmax=${maxForce.toFixed(4)} eV/Å`,
          );
          return !cancelled();
        },
      });
      if (cancelled() || relaxation.cancelled) {
        controller.transition("cancelled", "Cancelled during relaxation");
        return { job: controller.snapshot };
      }
      const result: ResultBundle = {
        schema_version: SCHEMA_VERSION,
        result_id: newId("result"),
        job_id: jobId,
        input_hash: inputHash,
        fidelity_level: spec.fidelity_level,
        engine_id: engine.engine_id,
        model_id: model.id,
        status: "complete",
        quantities: [
          {
            name: "final_potential_energy",
            value: relaxation.energy,
            unit: CANONICAL_UNITS.energy,
          },
          {
            name: "final_potential_energy_per_atom",
            value: relaxation.energyPerAtom,
            unit: "eV/atom",
          },
          { name: "max_force", value: relaxation.maxForce, unit: CANONICAL_UNITS.force },
          { name: "steps", value: relaxation.steps, unit: "1" },
          { name: "converged", value: relaxation.converged, unit: "1" },
          { name: "compute_backend", value: backend, unit: "1" },
        ],
        series: [
          {
            name: "energy_vs_step",
            x_label: "step",
            y_label: "potential energy",
            x_unit: "1",
            y_unit: CANONICAL_UNITS.energy,
            x: relaxation.energyHistory.map((_, i) => i),
            y: relaxation.energyHistory,
          },
          {
            name: "max_force_vs_step",
            x_label: "step",
            y_label: "max force",
            x_unit: "1",
            y_unit: CANONICAL_UNITS.force,
            x: relaxation.maxForceHistory.map((_, i) => i),
            y: relaxation.maxForceHistory,
          },
        ],
        convergence: {
          converged: relaxation.converged,
          criterion: relaxation.criterion,
          iterations: relaxation.steps,
          final_value: relaxation.maxForce,
          threshold: maxForceTarget,
        },
        limitations: [
          ...model.limitations,
          "The minimisation finds a local minimum of this model's potential energy surface; it is not a statement of thermodynamic or dynamical stability.",
        ],
        result_structure: relaxation.structure,
        created_at: now().toISOString(),
        provenance_ref: "",
      };
      controller.transition(
        "completed",
        relaxation.converged ? "Relaxation converged" : "Relaxation stopped without convergence",
      );
      if (!relaxation.converged) {
        controller.warn(
          "relax.not_converged",
          `Maximum force ${relaxation.maxForce.toFixed(4)} eV/Å did not reach the target within ${maxSteps} steps.`,
        );
      }
      return finish(controller, result, spec, structure, engine, model, options, now, undefined);
    }

    if (spec.task_type === "md.run") {
      const requestedEnsemble = spec.thermodynamic_conditions?.ensemble ?? "NVE";
      if (requestedEnsemble === "NPT") {
        const message =
          "Ensemble 'NPT' is not implemented. HCS has a Langevin thermostat but no barostat, " +
          "so the cell would stay fixed while the result claimed a pressure-controlled ensemble.";
        controller.transition("failed", message);
        return { job: controller.snapshot, error: { code: "unsupported_ensemble", message } };
      }
      if (
        requestedEnsemble !== "NVE" &&
        requestedEnsemble !== "NVT" &&
        requestedEnsemble !== "none"
      ) {
        const message = `Ensemble '${requestedEnsemble}' is not implemented in this build.`;
        controller.transition("failed", message);
        return { job: controller.snapshot, error: { code: "unsupported_ensemble", message } };
      }
      const ensemble: "NVE" | "NVT" = requestedEnsemble === "NVT" ? "NVT" : "NVE";
      const steps = integerParam(spec.parameters, "steps", 200);
      const timestep = numberParam(spec.parameters, "timestepPs", 0.001);
      const temperature = numberParam(spec.parameters, "temperatureK", 50);
      const targetTemperatureK =
        spec.thermodynamic_conditions?.temperature ??
        numberParam(spec.parameters, "targetTemperatureK", temperature);
      const frictionPerPs = numberParam(spec.parameters, "frictionPerPs", 1.0);
      const sampleInterval = integerParam(spec.parameters, "sampleInterval", 5);
      const wantTrajectory = (spec.requested_outputs ?? []).includes("trajectory");
      const trajectoryInterval = wantTrajectory ? Math.max(1, Math.floor(steps / 100)) : 0;

      const resume = options.mdResume;
      if (resume) {
        if (resume.structure_hash !== structureHash(structure)) {
          return failJob(
            controller,
            {},
            "Checkpoint structure_hash does not match this structure. A checkpoint only continues " +
              "the exact cell it was written for.",
            "checkpoint_structure_mismatch",
          );
        }
        if (Math.abs(resume.timestep_ps - timestep) > 1e-12) {
          return failJob(
            controller,
            {},
            `Checkpoint timestep ${resume.timestep_ps} ps does not match the requested ${timestep} ps. ` +
              "Changing the timestep would silently change the integrator; restart instead.",
            "checkpoint_timestep_mismatch",
          );
        }
        if (resume.positions.length !== structure.sites.length) {
          return failJob(
            controller,
            {},
            `Checkpoint has ${resume.positions.length} positions but the structure has ` +
              `${structure.sites.length} sites.`,
            "checkpoint_shape_mismatch",
          );
        }
        controller.progress(
          "resume",
          0.04,
          `Resuming from checkpoint at step ${resume.steps_completed}`,
        );
      }

      const md = runMd(structure, model, {
        steps,
        timestep,
        temperature,
        ensemble,
        ...(ensemble === "NVT" ? { thermostat: { targetTemperatureK, frictionPerPs } } : {}),
        seed: spec.seed ?? 12345,
        cutoff: effectiveCutoff,
        energyKernel: evaluate,
        sampleInterval,
        trajectoryInterval,
        ...(resume
          ? {
              initialState: {
                positionsCartesian: resume.positions,
                velocities: resume.velocities,
                step: resume.steps_completed,
              },
            }
          : {}),
        onStep: ({ step, totalEv }) => {
          const localStep = step - (resume?.steps_completed ?? 0);
          report(
            "md",
            Math.min(0.95, 0.05 + 0.9 * (localStep / steps)),
            `Step ${localStep}/${steps} (total ${step}), E_total=${totalEv.toFixed(4)} eV`,
          );
          return !cancelled();
        },
      });

      if (cancelled() || md.cancelled) {
        controller.transition("cancelled", "Cancelled during molecular dynamics");
        return { job: controller.snapshot };
      }

      const driftPerAtom = md.energyDriftEvPerAtom;
      if (ensemble === "NVE" && Math.abs(driftPerAtom) > 1e-3) {
        controller.warn(
          "md.energy_drift",
          `NVE total-energy drift ${driftPerAtom.toExponential(2)} eV/atom exceeds 1e-3 eV/atom. ` +
            "Reduce the timestep or check for overlapping atoms.",
        );
      }
      const temperatureError =
        Math.abs(md.meanTemperatureK - targetTemperatureK) / targetTemperatureK;
      if (ensemble === "NVT" && temperatureError > 0.1) {
        controller.warn(
          "md.temperature_not_reached",
          `Mean temperature ${md.meanTemperatureK.toFixed(1)} K differs from the target ` +
            `${targetTemperatureK.toFixed(1)} K by more than 10 %. Run longer or raise the friction.`,
        );
      }

      const series: Series[] = [
        {
          name: "temperature_vs_time",
          x_label: "time",
          y_label: "temperature",
          x_unit: CANONICAL_UNITS.time,
          y_unit: CANONICAL_UNITS.temperature,
          x: md.temperatureSeries.timePs,
          y: md.temperatureSeries.temperatureK,
        },
        {
          name: "energy_vs_time",
          x_label: "time",
          y_label: "total energy",
          x_unit: CANONICAL_UNITS.time,
          y_unit: CANONICAL_UNITS.energy,
          x: md.energySeries.timePs,
          y: md.energySeries.totalEv,
        },
      ];

      const result: ResultBundle = {
        schema_version: SCHEMA_VERSION,
        result_id: newId("result"),
        job_id: jobId,
        input_hash: inputHash,
        fidelity_level: spec.fidelity_level,
        engine_id: engine.engine_id,
        model_id: model.id,
        status: "complete",
        quantities: [
          {
            name: "mean_temperature",
            value: md.meanTemperatureK,
            unit: CANONICAL_UNITS.temperature,
          },
          { name: "energy_drift_total", value: md.energyDriftEv, unit: CANONICAL_UNITS.energy },
          { name: "energy_drift_per_atom", value: driftPerAtom, unit: "eV/atom" },
          { name: "relative_energy_drift", value: md.relativeEnergyDrift, unit: "1" },
          {
            name: "final_potential_energy",
            value: md.finalPotentialEv,
            unit: CANONICAL_UNITS.energy,
          },
          { name: "steps", value: md.steps, unit: "1" },
          { name: "steps_resumed_from", value: md.initialStep, unit: "1" },
          { name: "final_step", value: md.finalStep, unit: "1" },
          { name: "timestep", value: md.timestepPs, unit: CANONICAL_UNITS.time },
          { name: "ensemble", value: md.thermostate, unit: "1" },
          ...(ensemble === "NVT"
            ? [
                {
                  name: "target_temperature",
                  value: targetTemperatureK,
                  unit: CANONICAL_UNITS.temperature,
                },
                { name: "langevin_friction", value: frictionPerPs, unit: "1/ps" },
              ]
            : []),
          { name: "compute_backend", value: backend, unit: "1" },
        ],
        series,
        convergence:
          ensemble === "NVE"
            ? {
                converged: Math.abs(driftPerAtom) <= 1e-3,
                criterion: "NVE total-energy drift <= 1e-3 eV/atom",
                final_value: driftPerAtom,
                threshold: 1e-3,
              }
            : {
                converged: temperatureError <= 0.1,
                criterion: "NVT mean temperature within 10 % of the target",
                final_value: md.meanTemperatureK,
                threshold: targetTemperatureK,
              },
        limitations: [
          ...model.limitations,
          ensemble === "NVE"
            ? "NVE: the sample temperature is an output of the dynamics, not a controlled variable."
            : `NVT with a Langevin thermostat (target ${targetTemperatureK} K, friction ${frictionPerPs} 1/ps); the dynamics are stochastic, so a single trajectory is not a unique sample.`,
          "Temperature and kinetic energy oscillate because energy is exchanged with the potential; a short run does not establish an equilibrated temperature.",
          "Trajectory length is short by MD standards; transport coefficients from it are indicative at best.",
        ],
        result_structure: md.finalStructure,
        created_at: now().toISOString(),
        provenance_ref: "",
      };
      controller.transition("completed", "MD run completed");
      const mdCheckpoint: MdCheckpoint = {
        schema_version: "1.0.0",
        structure_hash: structureHash(structure),
        steps_completed: md.finalStep,
        timestep_ps: timestep,
        seed: spec.seed ?? 12345,
        positions: md.finalPositions,
        velocities: md.finalVelocities,
      };
      return finish(
        controller,
        result,
        spec,
        structure,
        engine,
        model,
        options,
        now,
        md.trajectory,
        {
          mdCheckpoint,
          ...(resume ? { resumedFrom: resume.steps_completed } : {}),
        },
      );
    }

    if (spec.task_type === "analysis.rdf") {
      const cutoff = numberParam(spec.parameters, "cutoff", undefined);
      const bins = integerParam(spec.parameters, "bins", 100);
      const rdf = computeRdf(structure, { cutoff, bins });
      report("analysis", 0.9, "RDF computed");
      for (const warning of rdf.warnings) controller.warn("rdf.warning", warning, "info");
      const result: ResultBundle = {
        schema_version: SCHEMA_VERSION,
        result_id: newId("result"),
        job_id: jobId,
        input_hash: inputHash,
        fidelity_level: spec.fidelity_level,
        engine_id: engine.engine_id,
        status: "complete",
        quantities: [
          { name: "rdf_pairs_counted", value: rdf.pairsCounted, unit: "1" },
          { name: "rdf_cutoff", value: rdf.cutoff, unit: CANONICAL_UNITS.length },
          { name: "rdf_bins", value: rdf.bins, unit: "1" },
          { name: "normalization", value: rdf.normalization, unit: "1" },
        ],
        series: [
          {
            name: "radial_distribution_function",
            x_label: "r",
            y_label: "g(r)",
            x_unit: CANONICAL_UNITS.length,
            y_unit: "1",
            x: rdf.r,
            y: rdf.g,
            method: "pair histogram normalised by an ideal-gas shell population",
          },
          {
            name: "coordination_number",
            x_label: "r",
            y_label: "n(r)",
            x_unit: CANONICAL_UNITS.length,
            y_unit: "1",
            x: rdf.r,
            y: rdf.coordinationNumber,
          },
        ],
        convergence: { converged: true, criterion: "deterministic analysis, no iteration" },
        limitations: [
          "RDF is a static structural descriptor of this finite simulation cell.",
          `Cutoff ${rdf.cutoff.toFixed(2)} Å limited to half the shortest cell vector.`,
        ],
        warnings: rdf.warnings,
        created_at: now().toISOString(),
        provenance_ref: "",
      };
      controller.transition("completed", "RDF analysis completed");
      return finish(controller, result, spec, structure, engine, model, options, now, undefined);
    }

    if (
      spec.task_type === "analysis.msd" ||
      spec.task_type === "continuum.diffusion_1d" ||
      spec.task_type === "continuum.heat_1d"
    ) {
      const message =
        spec.task_type === "analysis.msd"
          ? "MSD is computed from an md.run result inside the workbench (trajectory required), not as a standalone job."
          : "Continuum tasks are run by the continuum solver entry point (runContinuumJob), not the atomistic runner.";
      controller.transition("failed", message);
      return { job: controller.snapshot, error: { code: "wrong_runner", message } };
    }

    const unsupported = `Task type '${spec.task_type}' is not implemented by this runner.`;
    controller.transition("failed", unsupported);
    return { job: controller.snapshot, error: { code: "unsupported_task", message: unsupported } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failJob(controller, {}, message, "kernel_error");
  }
}

function finish(
  controller: JobController,
  result: ResultBundle,
  spec: SimulationSpec,
  structure: Structure,
  engine: ReturnType<typeof requireEngine>,
  model: PotentialModel | undefined,
  options: RunJobOptions,
  now: () => Date,
  trajectory: MdTrajectoryFrame[] | undefined,
  extras: { mdCheckpoint?: MdCheckpoint; resumedFrom?: number } = {},
): JobOutcome {
  const backendQuantity = result.quantities.find((quantity) => quantity.name === "compute_backend");
  const backend =
    backendQuantity?.value === "wasm"
      ? "wasm"
      : backendQuantity?.value === "webgpu"
        ? "webgpu"
        : "cpu";
  const provenance = buildProvenance({
    spec,
    structure,
    engine,
    model,
    backend,
    randomSeed: spec.seed,
    deterministic: spec.seed !== undefined,
    recordedAt: now().toISOString(),
    ...(extras.resumedFrom !== undefined
      ? { parameters: { ...spec.parameters, resumed_from_steps: extras.resumedFrom } }
      : {}),
  });
  const finalResult: ResultBundle = {
    ...result,
    provenance_ref: provenance.provenance_id,
    fidelity_level: spec.fidelity_level as FidelityLevel,
  };
  controller.setResultRef(`${controller.snapshot.job_id}/result.json`);
  controller.setMetrics({
    backend,
    wall_time_seconds: Math.max(
      0,
      (new Date(now()).getTime() - new Date(controller.snapshot.created_at).getTime()) / 1000,
    ),
  });
  const job = controller.finalize();
  return {
    job,
    result: finalResult,
    provenance,
    ...(trajectory ? { trajectory } : {}),
    ...(extras.mdCheckpoint ? { mdCheckpoint: extras.mdCheckpoint } : {}),
    ...(options.projectId ? {} : {}),
  };
}
