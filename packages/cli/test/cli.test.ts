import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createCrystal,
  makeSupercell,
  structureHash,
  type SimulationSpec,
} from "@hcs-materials/core";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const fixtures = fileURLToPath(new URL("../../../tests/fixtures/structures", import.meta.url));

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

function argonCell() {
  return makeSupercell(createCrystal({ prototype: "fcc", a: 5.26, species: ["Ar"] }), {
    na: 2,
    nb: 2,
    nc: 2,
  });
}

describe("hcs-sim CLI", () => {
  it("inspects a structure with units and validation", () => {
    const result = run(["inspect", join(fixtures, "silicon.cif"), "--json"]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.formula).toBe("Si");
    expect(payload.atoms).toBe(8);
    expect(payload.validation.status).toBe("valid");
    expect(payload.volume_angstrom3).toBeCloseTo(5.431 ** 3, 4);
  });

  it("fails with exit code 3 for a missing file", () => {
    const result = run(["inspect", "does-not-exist.cif"]);
    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/error/);
  });

  it("lists implemented and planned engines separately", () => {
    const result = run(["engines", "--json"]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.engines.map((engine: { engine_id: string }) => engine.engine_id)).toContain(
      "hcs.lj-reference",
    );
    expect(payload.planned.every((engine: { status: string }) => engine.status === "not_implemented")).toBe(true);
  });

  it("runs a spec and writes status, result, provenance and report", () => {
    const dir = mkdtempSync(join(tmpdir(), "hcs-cli-"));
    const structure = argonCell();
    const structurePath = join(dir, "ar.json");
    writeFileSync(structurePath, `${JSON.stringify(structure, null, 2)}\n`, "utf8");

    const spec: SimulationSpec = {
      schema_version: "1.0.0",
      task_id: "cli_task",
      task_type: "energy.evaluate",
      structure_ref: {
        structure_id: structure.structure_id,
        structure_hash: structureHash(structure),
      },
      engine_id: "hcs.lj-reference",
      model_id: "lj.noble-gases.v1",
      fidelity_level: "classical_model",
      parameters: {},
      seed: 1,
    };
    const specPath = join(dir, "spec.json");
    writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

    const out = join(dir, "out");
    const result = run([
      "run",
      "--structure",
      structurePath,
      "--spec",
      specPath,
      "--out",
      out,
      "--json",
    ]);
    expect(result.status, result.stderr).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary.ok).toBe(true);
    expect(summary.state).toBe("completed");
    expect(summary.result.quantities.some((q: { name: string }) => q.name === "total_potential_energy")).toBe(true);

    for (const file of ["status.json", "result.json", "provenance.json", "report.html", "run.log"]) {
      expect(existsSync(join(out, file)), file).toBe(true);
    }
    const provenance = JSON.parse(readFileSync(join(out, "provenance.json"), "utf8"));
    // WASM is available in this workspace; the CLI records which backend ran.
    expect(["cpu", "wasm"]).toContain(provenance.environment.backend);
    const report = readFileSync(join(out, "report.html"), "utf8");
    expect(report).toContain("Reproducibility report");
  });

  it("refuses a spec whose structure hash does not match", () => {
    const dir = mkdtempSync(join(tmpdir(), "hcs-cli-mismatch-"));
    const structure = argonCell();
    const structurePath = join(dir, "ar.json");
    writeFileSync(structurePath, `${JSON.stringify(structure, null, 2)}\n`, "utf8");
    const specPath = join(dir, "spec.json");
    writeFileSync(
      specPath,
      JSON.stringify({
        schema_version: "1.0.0",
        task_id: "t",
        task_type: "energy.evaluate",
        structure_ref: { structure_id: "x", structure_hash: "0".repeat(64) },
        engine_id: "hcs.lj-reference",
        fidelity_level: "classical_model",
        parameters: {},
      }),
    );
    const result = run(["run", "--structure", structurePath, "--spec", specPath, "--out", join(dir, "out")]);
    expect(result.status).toBe(3);
    expect(result.stderr).toMatch(/does not match/);
  });

  it("refuses an engine that is only planned", () => {
    const dir = mkdtempSync(join(tmpdir(), "hcs-cli-engine-"));
    const structure = argonCell();
    const structurePath = join(dir, "ar.json");
    writeFileSync(structurePath, JSON.stringify(structure));
    const specPath = join(dir, "spec.json");
    writeFileSync(
      specPath,
      JSON.stringify({
        schema_version: "1.0.0",
        task_id: "t",
        task_type: "md.run",
        structure_ref: { structure_id: "x", structure_hash: structureHash(structure) },
        engine_id: "lammps",
        fidelity_level: "classical_model",
        parameters: { steps: 10 },
      }),
    );
    const result = run(["run", "--structure", structurePath, "--spec", specPath, "--out", join(dir, "out")]);
    expect(result.status).toBe(3);
    expect(result.stdout + result.stderr).toMatch(/planned but not implemented/);
  });

  it("writes an MD checkpoint and resumes it exactly", () => {
    const dir = mkdtempSync(join(tmpdir(), "hcs-cli-resume-"));
    const structure = argonCell();
    const structurePath = join(dir, "ar.json");
    writeFileSync(structurePath, `${JSON.stringify(structure, null, 2)}\n`, "utf8");

    const mdSpec = (steps: number): SimulationSpec => ({
      schema_version: "1.0.0",
      task_id: "md_resume",
      task_type: "md.run",
      structure_ref: {
        structure_id: structure.structure_id,
        structure_hash: structureHash(structure),
      },
      engine_id: "hcs.lj-reference",
      model_id: "lj.noble-gases.v1",
      fidelity_level: "classical_model",
      parameters: { steps, timestepPs: 0.002, temperatureK: 60, sampleInterval: 10 },
      seed: 42,
    });
    const writeSpec = (name: string, steps: number): string => {
      const path = join(dir, name);
      writeFileSync(path, `${JSON.stringify(mdSpec(steps), null, 2)}\n`, "utf8");
      return path;
    };

    const firstOut = join(dir, "first");
    const first = run([
      "run",
      "--structure",
      structurePath,
      "--spec",
      writeSpec("spec-20.json", 20),
      "--out",
      firstOut,
      "--json",
    ]);
    expect(first.status, first.stderr).toBe(0);
    expect(existsSync(join(firstOut, "checkpoint.json"))).toBe(true);
    const checkpoint = JSON.parse(readFileSync(join(firstOut, "checkpoint.json"), "utf8"));
    expect(checkpoint.steps_completed).toBe(20);
    expect(checkpoint.structure_hash).toBe(structureHash(structure));
    expect(checkpoint.positions).toHaveLength(structure.sites.length);

    const resumedOut = join(dir, "resumed");
    const resumed = run([
      "run",
      "--structure",
      structurePath,
      "--spec",
      writeSpec("spec-20b.json", 20),
      "--out",
      resumedOut,
      "--resume",
      join(firstOut, "checkpoint.json"),
      "--json",
    ]);
    expect(resumed.status, resumed.stderr).toBe(0);
    const resumedResult = JSON.parse(readFileSync(join(resumedOut, "result.json"), "utf8"));
    const quantity = (name: string): number =>
      resumedResult.quantities.find((entry: { name: string }) => entry.name === name).value;
    expect(quantity("steps_resumed_from")).toBe(20);
    expect(quantity("final_step")).toBe(40);
    expect(quantity("steps")).toBe(20);
    const resumedProvenance = JSON.parse(readFileSync(join(resumedOut, "provenance.json"), "utf8"));
    expect(resumedProvenance.method.parameters.resumed_from_steps).toBe(20);

    const continuousOut = join(dir, "continuous");
    const continuous = run([
      "run",
      "--structure",
      structurePath,
      "--spec",
      writeSpec("spec-40.json", 40),
      "--out",
      continuousOut,
      "--json",
    ]);
    expect(continuous.status, continuous.stderr).toBe(0);
    const continuousResult = JSON.parse(readFileSync(join(continuousOut, "result.json"), "utf8"));
    const continuousEnergy = continuousResult.quantities.find(
      (entry: { name: string }) => entry.name === "final_potential_energy",
    ).value;
    expect(quantity("final_potential_energy")).toBe(continuousEnergy);
    expect(resumedResult.result_structure.sites.map((site: { fractional_position: number[] }) => site.fractional_position))
      .toEqual(
        continuousResult.result_structure.sites.map(
          (site: { fractional_position: number[] }) => site.fractional_position,
        ),
      );
  });

  it("refuses a checkpoint from a different structure", () => {
    const dir = mkdtempSync(join(tmpdir(), "hcs-cli-resume-mismatch-"));
    const structure = argonCell();
    const structurePath = join(dir, "ar.json");
    writeFileSync(structurePath, JSON.stringify(structure));
    const specPath = join(dir, "spec.json");
    writeFileSync(
      specPath,
      JSON.stringify({
        schema_version: "1.0.0",
        task_id: "t",
        task_type: "md.run",
        structure_ref: { structure_id: "x", structure_hash: structureHash(structure) },
        engine_id: "hcs.lj-reference",
        fidelity_level: "classical_model",
        parameters: { steps: 5, timestepPs: 0.001 },
      }),
    );
    const checkpointPath = join(dir, "checkpoint.json");
    writeFileSync(
      checkpointPath,
      JSON.stringify({
        schema_version: "1.0.0",
        structure_hash: "0".repeat(64),
        steps_completed: 5,
        timestep_ps: 0.001,
        seed: 1,
        positions: structure.sites.map(() => [0, 0, 0]),
        velocities: structure.sites.map(() => [0, 0, 0]),
      }),
    );
    const result = run([
      "run",
      "--structure",
      structurePath,
      "--spec",
      specPath,
      "--out",
      join(dir, "out"),
      "--resume",
      checkpointPath,
    ]);
    expect(result.status).toBe(3);
    expect(result.stdout + result.stderr).toMatch(/does not match this structure/);
  });
});
