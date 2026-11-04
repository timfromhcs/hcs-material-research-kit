import { describe, expect, it } from "vitest";
import {
  createCrystal,
  makeSupercell,
  runJob,
  structureHash,
  SW_SILICON,
  type SimulationSpec,
  type Structure,
} from "@hcs-materials/core";

function siliconSupercell(): Structure {
  return makeSupercell(createCrystal({ prototype: "diamond", a: 5.431, species: ["Si"] }), {
    na: 2,
    nb: 2,
    nc: 2,
  });
}

function spec(structure: Structure, overrides: Partial<SimulationSpec> = {}): SimulationSpec {
  return {
    schema_version: "1.0.0",
    task_id: "task_si",
    task_type: "energy.evaluate",
    structure_ref: {
      structure_id: structure.structure_id,
      structure_hash: structureHash(structure),
    },
    engine_id: "hcs.sw-silicon",
    model_id: SW_SILICON.id,
    fidelity_level: "classical_model",
    parameters: {},
    ...overrides,
  };
}

describe("runJob: Stillinger–Weber silicon", () => {
  it("runs a silicon energy job with the many-body engine", () => {
    const structure = siliconSupercell();
    const outcome = runJob({ spec: spec(structure), structure });
    expect(outcome.error).toBeUndefined();
    expect(outcome.job.state).toBe("completed");
    expect(outcome.result?.engine_id).toBe("hcs.sw-silicon");
    expect(outcome.result?.model_id).toBe(SW_SILICON.id);
    const perAtom = outcome.result?.quantities.find(
      (quantity) => quantity.name === "potential_energy_per_atom",
    );
    expect(Number(perAtom?.value)).toBeGreaterThan(-5.5);
    expect(Number(perAtom?.value)).toBeLessThan(-4.0);
    expect(outcome.provenance?.method?.name).toContain("Stillinger–Weber");
    expect(outcome.provenance?.method?.assumptions?.join(" ")).toContain("three-body");
  });

  it("refuses a model the engine does not declare", () => {
    const structure = siliconSupercell();
    const outcome = runJob({
      spec: spec(structure, {
        engine_id: "hcs.lj-reference",
        model_id: SW_SILICON.id,
      }),
      structure,
    });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.code).toBe("model_not_declared_by_engine");
  });

  it("refuses a cell too small for the full many-body cutoff", () => {
    const structure = createCrystal({ prototype: "diamond", a: 5.431, species: ["Si"] });
    const outcome = runJob({ spec: spec(structure), structure });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.code).toBe("cell_too_small");
    expect(outcome.error?.message).toContain("supercell");
  });

  it("refuses unsupported elements before evaluating anything", () => {
    const base = siliconSupercell();
    const structure: Structure = {
      ...base,
      sites: base.sites.map((site, index) => (index === 0 ? { ...site, species: "Ge" } : site)),
    };
    const outcome = runJob({ spec: spec(structure), structure });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.code).toBe("unsupported_elements");
    expect(outcome.error?.message).toContain("Ge");
  });

  it("refuses a truncated many-body cutoff", () => {
    const structure = siliconSupercell();
    const outcome = runJob({
      spec: spec(structure, { parameters: { cutoff: 3.0 } }),
      structure,
    });
    expect(outcome.job.state).toBe("failed");
    expect(outcome.error?.code).toBe("cutoff_not_supported");
  });

  it("runs a relaxation and reports a converged geometry", () => {
    const base = siliconSupercell();
    // A small deterministic perturbation gives the minimiser real work without
    // creating an unphysical overlap (a global fractional rescale would press
    // the last atom against the periodic image of the first).
    const strained: Structure = {
      ...base,
      sites: base.sites.map((site, index) => ({
        ...site,
        fractional_position: [
          site.fractional_position[0] + (index % 3 === 0 ? 0.003 : 0),
          site.fractional_position[1] - (index % 5 === 0 ? 0.002 : 0),
          site.fractional_position[2] + (index % 7 === 0 ? 0.001 : 0),
        ] as [number, number, number],
      })),
    };
    const outcome = runJob({
      spec: spec(strained, {
        task_type: "structure.relax",
        parameters: { maxForceEvPerA: 0.05, maxSteps: 100 },
      }),
      structure: strained,
    });
    expect(outcome.error).toBeUndefined();
    expect(outcome.job.state).toBe("completed");
    expect(outcome.result?.result_structure).toBeDefined();
    const maxForce = outcome.result?.quantities.find((quantity) => quantity.name === "max_force");
    expect(Number(maxForce?.value)).toBeLessThan(0.1);
  });
});
