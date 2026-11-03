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
});
