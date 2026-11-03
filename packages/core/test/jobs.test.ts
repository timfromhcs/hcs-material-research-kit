import { describe, expect, it } from "vitest";
import {
  JobController,
  LJ_NOBLE_GASES,
  assertTransition,
  canTransition,
  computeEnergyForces,
  createCrystal,
  makeSupercell,
  runContinuumJob,
  runJob,
  structureHash,
  makeRng,
  type EnergyForcesKernel,
  type SimulationSpec,
  type Structure,
} from "@hcs-materials/core";

function argon(n = 2, a = 5.3): Structure {
  return makeSupercell(createCrystal({ prototype: "fcc", a, species: ["Ar"] }), {
    na: n,
    nb: n,
    nc: n,
  });
}

function spec(structure: Structure, overrides: Partial<SimulationSpec> = {}): SimulationSpec {
  return {
    schema_version: "1.0.0",
    task_id: "task_1",
    task_type: "energy.evaluate",
    structure_ref: {
      structure_id: structure.structure_id,
      structure_hash: structureHash(structure),
    },
    engine_id: "hcs.lj-reference",
    model_id: "lj.noble-gases.v1",
    fidelity_level: "classical_model",
    parameters: {},
    ...overrides,
  };
}

describe("job state machine", () => {
  it("allows the documented lifecycle and rejects shortcuts", () => {
    expect(canTransition("created", "validated")).toBe(true);
    expect(canTransition("created", "completed")).toBe(false);
    expect(canTransition("running", "completed")).toBe(true);
    expect(canTransition("completed", "running")).toBe(false);
    expect(() => assertTransition("created", "running")).toThrow(/Illegal job transition/);
  });

  it("records an audit trail and refuses reuse after completion", () => {
    const controller = new JobController({
      job_id: "job_1",
      project_id: "p",
      task_type: "energy.evaluate",
      input_hash: "a".repeat(64),
      spec_ref: "spec.json",
    });
    controller.transition("validated", "ok");
    controller.transition("queued", "ok");
    controller.transition("preparing", "ok");
    controller.transition("running", "go");
    controller.transition("completed", "done");
    expect(controller.events.map((e) => e.state)).toEqual([
      "created",
      "validated",
      "queued",
      "preparing",
      "running",
      "completed",
    ]);
    expect(() => controller.transition("running", "again")).toThrow();
    controller.requestCancel(); // terminal: ignored
    expect(controller.isCancelled).toBe(false);
  });
});

describe("runJob: energy evaluation", () => {
  it("produces a complete result with matching provenance", () => {
    const structure = argon();
    const outcome = runJob({ spec: spec(structure), structure });
    expect(outcome.error).toBeUndefined();
    expect(outcome.job.state).toBe("completed");
    expect(outcome.result?.status).toBe("complete");
    expect(outcome.provenance?.inputs.structure_hash).toBe(structureHash(structure));
    expect(outcome.result?.provenance_ref).toBe(outcome.provenance?.provenance_id);
    expect(outcome.result?.quantities.find((q) => q.name === "total_potential_energy")?.unit).toBe("eV");
    expect(outcome.result?.limitations.length).toBeGreaterThan(0);
    expect(outcome.job.events.some((e) => e.state === "completed")).toBe(true);
    // Result documents survive a JSON round-trip (export readiness).
    expect(() => JSON.parse(JSON.stringify(outcome.result))).not.toThrow();
  });

  it("rejects a spec whose structure hash no longer matches", () => {
    const structure = argon();
    const stale = spec(structure);
    const modified = { ...structure, sites: structure.sites.slice(0, 4) };
    const outcome = runJob({ spec: stale, structure: modified });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.code).toBe("structure_hash_mismatch");
  });

  it("rejects an engine that is not implemented", () => {
    const structure = argon();
    const outcome = runJob({
      spec: spec(structure, { engine_id: "lammps" }),
      structure,
    });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.message).toMatch(/planned but not implemented/);
  });

  it("rejects a fidelity label the engine does not declare", () => {
    const structure = argon();
    const outcome = runJob({
      spec: spec(structure, { fidelity_level: "first_principles" }),
      structure,
    });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.code).toBe("fidelity_mismatch");
  });

  it("refuses a cell in which the model has no interactions", () => {
    // One conventional fcc cell: nearest pair (3.72 Å) is beyond the cutoff the
    // cell can support (2.63 Å), so E = 0 would be an artefact, not a result.
    const structure = argon(1, 5.26);
    const outcome = runJob({ spec: spec(structure), structure });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.code).toBe("lj.no_interactions");
    expect(outcome.error?.message).toMatch(/supercell/i);
  });

  it("fails a structurally invalid input instead of computing garbage", () => {
    const structure = argon();
    const collapsed: Structure = {
      ...structure,
      lattice: { vectors: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] },
      structure_id: structure.structure_id,
    };
    const outcome = runJob({
      spec: spec(collapsed, {
        structure_ref: { structure_id: collapsed.structure_id, structure_hash: structureHash(collapsed) },
      }),
      structure: collapsed,
    });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.code).toBe("invalid_structure");
  });
});

describe("runJob: relaxation and MD", () => {
  it("relaxes and attaches the result structure", () => {
    const base = argon(2, 5.3);
    const rng = makeRng(3);
    const structure: Structure = {
      ...base,
      sites: base.sites.map((site) => ({
        ...site,
        fractional_position: site.fractional_position.map(
          (x) => x + (rng() - 0.5) * 0.06,
        ) as [number, number, number],
      })),
    };
    const outcome = runJob({
      spec: spec(structure, {
        task_type: "structure.relax",
        parameters: { maxForceEvPerA: 0.03, maxSteps: 800 },
      }),
      structure,
    });
    expect(outcome.job.state).toBe("completed");
    expect(outcome.result?.result_structure).toBeDefined();
    expect(outcome.result?.series?.length).toBe(2);
    expect(outcome.result?.convergence.converged).toBe(true);
    // Provenance points at the INPUT structure, not the relaxed one.
    expect(outcome.provenance?.inputs.structure_hash).toBe(structureHash(structure));
    expect(structureHash(outcome.result!.result_structure!)).not.toBe(structureHash(structure));
  });

  it("refuses NVT because no thermostat is implemented", () => {
    const structure = argon();
    const outcome = runJob({
      spec: spec(structure, {
        task_type: "md.run",
        parameters: { steps: 10, timestepPs: 0.001, temperatureK: 50 },
        thermodynamic_conditions: { ensemble: "NVT", temperature: 50 },
      }),
      structure,
    });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.code).toBe("unsupported_ensemble");
    expect(outcome.error?.message).toMatch(/no thermostat/i);
  });

  it("runs a real NVE trajectory and reports drift", () => {
    const structure = argon(2, 5.3);
    const outcome = runJob({
      spec: spec(structure, {
        task_type: "md.run",
        parameters: { steps: 100, timestepPs: 0.002, temperatureK: 60, sampleInterval: 10 },
        seed: 9,
        requested_outputs: ["trajectory"],
      }),
      structure,
    });
    expect(outcome.job.state).toBe("completed");
    expect(outcome.trajectory?.length).toBeGreaterThan(1);
    const drift = outcome.result?.quantities.find((q) => q.name === "energy_drift_per_atom");
    expect(typeof drift?.value).toBe("number");
    expect(Math.abs(Number(drift?.value))).toBeLessThan(1e-3);
  });

  it("records which kernel backend produced the numbers", () => {
    const structure = argon(2);
    let calls = 0;
    const alternative: EnergyForcesKernel = (candidate, model, evaluation) => {
      calls++;
      return { ...computeEnergyForces(candidate, model, evaluation), backend: "wasm" };
    };
    const outcome = runJob({ spec: spec(structure), structure, energyKernel: alternative });
    expect(outcome.job.state).toBe("completed");
    expect(calls).toBeGreaterThan(0);
    const backend = outcome.result?.quantities.find((quantity) => quantity.name === "compute_backend");
    expect(backend?.value).toBe("wasm");
    expect(outcome.provenance?.environment?.backend).toBe("wasm");
    // The physics must be unchanged: the wrapper delegates to the CPU kernel.
    const energy = outcome.result?.quantities.find((quantity) => quantity.name === "total_potential_energy");
    expect(Number(energy?.value)).toBeCloseTo(
      computeEnergyForces(structure, LJ_NOBLE_GASES).energy,
      10,
    );
  });

  it("cancels before starting when a cancellation was requested", () => {    const structure = argon();
    const outcome = runJob({
      spec: spec(structure, {
        task_type: "structure.relax",
        parameters: { maxForceEvPerA: 1e-8, maxSteps: 1000 },
      }),
      structure,
      cancel: { requested: true },
    });
    expect(outcome.job.state).toBe("cancelled");
  });

  it("returns a failed job when a parameter is missing", () => {
    const structure = argon();
    const outcome = runJob({
      spec: spec(structure, { task_type: "analysis.rdf", parameters: {} }),
      structure,
    });
    // cutoff has no default -> explicit failure
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.message).toMatch(/cutoff/);
  });
});

describe("runContinuumJob", () => {
  const baseSpec: SimulationSpec = {
    schema_version: "1.0.0",
    task_id: "heat_1",
    task_type: "continuum.heat_1d",
    structure_ref: { structure_id: "none", structure_hash: "b".repeat(64) },
    engine_id: "hcs.heat1d-reference",
    model_id: "heat1d.ftcs.v1",
    fidelity_level: "continuum_model",
    parameters: {
      length: 1,
      alpha: 1e-5,
      nodes: 51,
      steps: 200,
      left: 0,
      right: 0,
      amplitude: 1,
      field: "temperature",
    },
  };

  it("runs and reports its analytic error", () => {
    const outcome = runContinuumJob({ spec: baseSpec });
    expect(outcome.job.state).toBe("completed");
    const error = outcome.result?.quantities.find((q) => q.name === "analytic_max_abs_error");
    expect(Number(error?.value)).toBeLessThan(5e-4);
    expect(outcome.provenance?.method?.validation_state).toBe("analytically_verified");
    expect(outcome.result?.provenance_ref).toBe(outcome.provenance?.provenance_id);
  });

  it("fails on an unstable timestep", () => {
    const outcome = runContinuumJob({
      spec: { ...baseSpec, parameters: { ...baseSpec.parameters, dt: 1000 } },
    });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.message).toMatch(/unstable/);
  });
});
