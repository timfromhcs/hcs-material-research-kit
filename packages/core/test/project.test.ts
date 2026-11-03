import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  buildReproducibilityReport,
  createCrystal,
  createProjectMeta,
  makeSupercell,
  readProjectArchive,
  runJob,
  structureHash,
  writeProjectArchive,
  type SimulationSpec,
  type Structure,
} from "@hcs-materials/core";

function setup() {
  const structure = makeSupercell(createCrystal({ prototype: "fcc", a: 5.3, species: ["Ar"] }), {
    na: 2,
    nb: 2,
    nc: 2,
  });
  const spec: SimulationSpec = {
    schema_version: "1.0.0",
    task_id: "task_a",
    task_type: "energy.evaluate",
    structure_ref: { structure_id: structure.structure_id, structure_hash: structureHash(structure) },
    engine_id: "hcs.lj-reference",
    model_id: "lj.noble-gases.v1",
    fidelity_level: "classical_model",
    parameters: {},
  };
  const outcome = runJob({ spec, structure, projectId: "project_demo" });
  return { structure, spec, outcome };
}

describe("project archive", () => {
  it("round-trips project metadata, structures, jobs and checksums", () => {
    const { structure, spec, outcome } = setup();
    const project = createProjectMeta({ name: "Argon demo", projectId: "project_demo" });
    const bytes = writeProjectArchive({
      project,
      structures: [structure],
      jobs: [
        {
          spec,
          job: outcome.job,
          result: outcome.result,
          provenance: outcome.provenance,
          log: "started\nfinished\n",
          trajectories: { "trajectory.json": { frames: 0 } },
        },
      ],
      reports: { "report.html": "<html></html>" },
    });
    expect(bytes.byteLength).toBeGreaterThan(100);

    const read = readProjectArchive(bytes);
    expect(read.checksumsVerified).toBe(true);
    expect(read.warnings).toEqual([]);
    expect(read.project.name).toBe("Argon demo");
    expect(read.structures).toHaveLength(1);
    expect(structureHash(read.structures[0]!)).toBe(structureHash(structure));
    expect(read.jobs).toHaveLength(1);
    expect(read.jobs[0]!.result?.quantities.length).toBeGreaterThan(0);
    expect(read.jobs[0]!.log).toBe("started\nfinished\n");
    expect(read.jobs[0]!.trajectories["trajectory.json"]).toEqual({ frames: 0 });
    expect(read.reports["report.html"]).toBe("<html></html>");
  });

  it("detects a modified file through checksums", () => {
    const { structure, spec, outcome } = setup();
    const bytes = writeProjectArchive({
      project: createProjectMeta({ name: "tamper", projectId: "p" }),
      structures: [structure],
      jobs: [{ spec, job: outcome.job, result: outcome.result, provenance: outcome.provenance }],
    });
    const entries = unzipSync(bytes);
    const structurePath = Object.keys(entries).find((p) => p.startsWith("structures/"))!;
    entries[structurePath] = strToU8(JSON.stringify({ ...JSON.parse(String(new TextDecoder().decode(entries[structurePath]))), display_name: "tampered" }));
    const tampered = zipSync(entries);
    const read = readProjectArchive(tampered);
    expect(read.checksumsVerified).toBe(false);
    expect(read.warnings.join(" ")).toMatch(/Checksum mismatch/);
  });

  it("rejects path traversal entries", () => {
    const malicious = zipSync({
      "project.json": strToU8("{}"),
      "../escape.txt": strToU8("pwned"),
    });
    expect(() => readProjectArchive(malicious)).toThrow(/Unsafe archive path/);
    const absolute = zipSync({
      "project.json": strToU8("{}"),
      "/etc/passwd": strToU8("x"),
    });
    expect(() => readProjectArchive(absolute)).toThrow(/Unsafe archive path/);
    const windows = zipSync({
      "project.json": strToU8("{}"),
      "C:/Windows/system32/evil.dll": strToU8("x"),
    });
    expect(() => readProjectArchive(windows)).toThrow(/Unsafe archive path/);
  });

  it("warns instead of pretending an archive without checksums is verified", () => {
    const bytes = zipSync({
      "project.json": strToU8(JSON.stringify(createProjectMeta({ name: "no sums" }))),
    });
    const read = readProjectArchive(bytes);
    expect(read.checksumsVerified).toBe(false);
    expect(read.warnings.join(" ")).toMatch(/no checksums.sha256/);
  });

  it("rejects a non-zip payload", () => {
    expect(() => readProjectArchive(strToU8("not a zip"))).toThrow(/Not a readable/);
  });
});

describe("reproducibility report", () => {
  it("contains the method, units and limitations but no invented numbers", () => {
    const { structure, spec, outcome } = setup();
    const html = buildReproducibilityReport({
      result: outcome.result!,
      provenance: outcome.provenance!,
      job: outcome.job,
      spec,
      structure,
      projectName: "Argon demo",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(html).toContain("Reproducibility report");
    expect(html).toContain("classical_model");
    expect(html).toContain("eV");
    expect(html).toContain("Limitations");
    expect(html).toContain(outcome.provenance!.inputs.input_hash);
    expect(html).toContain("not experimental proof");
    // Escape check: a hostile project name must not become markup.
    const hostile = buildReproducibilityReport({
      result: outcome.result!,
      provenance: outcome.provenance!,
      job: outcome.job,
      spec,
      structure,
      projectName: "<script>alert(1)</script>",
    });
    expect(hostile).not.toContain("<script>alert(1)</script>");
    expect(hostile).toContain("&lt;script&gt;");
  });

  it("keeps the structure hash of the input for a relaxed result", () => {
    const structure: Structure = makeSupercell(
      createCrystal({ prototype: "fcc", a: 5.6, species: ["Ar"] }),
      { na: 2, nb: 2, nc: 2 },
    );
    const spec: SimulationSpec = {
      schema_version: "1.0.0",
      task_id: "relax_1",
      task_type: "structure.relax",
      structure_ref: { structure_id: structure.structure_id, structure_hash: structureHash(structure) },
      engine_id: "hcs.lj-reference",
      model_id: "lj.noble-gases.v1",
      fidelity_level: "classical_model",
      parameters: { maxForceEvPerA: 0.2, maxSteps: 100 },
    };
    const outcome = runJob({ spec, structure });
    const html = buildReproducibilityReport({
      result: outcome.result!,
      provenance: outcome.provenance!,
      job: outcome.job,
      spec,
      structure,
    });
    expect(html).toContain(structureHash(structure));
  });
});
