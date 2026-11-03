#!/usr/bin/env node
/**
 * hcs-sim — local simulation CLI.
 *
 * Reads a structure file and a SimulationSpec, validates both, runs the job with
 * the CPU or WASM kernel, and writes a reproducible record:
 *
 *   <out>/status.json      job lifecycle and warnings
 *   <out>/result.json      quantities, series, convergence, limitations
 *   <out>/provenance.json  hashes, environment, units, assumptions
 *   <out>/report.html      human-readable reproducibility report
 *   <out>/run.log          event log
 *
 * Exit codes: 0 success, 2 usage error, 3 validation/run failure.
 */

import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  buildReproducibilityReport,
  cellVolume,
  densityGPerCm3,
  exportStructure,
  importStructure,
  listEngines,
  PLANNED_ENGINES,
  runJob,
  structureHash,
  totalMassAmu,
  validateStructure,
  type EnergyForcesKernel,
  type MdCheckpoint,
  type SimulationSpec,
  type Structure,
} from "@hcs-materials/core";
import { instantiateWasmKernel } from "@hcs-materials/wasm";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_FAILED = 3;

interface Arguments {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Arguments {
  const [command = "", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token.startsWith("--")) {
      const [name, inline] = token.slice(2).split("=");
      if (inline !== undefined) {
        flags[name!] = inline;
      } else if (rest[i + 1] && !rest[i + 1]!.startsWith("--")) {
        flags[name!] = rest[++i]!;
      } else {
        flags[name!] = true;
      }
    } else {
      positional.push(token);
    }
  }
  return { command, positional, flags };
}

function usage(): void {
  console.log(`hcs-sim — HCS Material Research Kit local simulation CLI

Usage:
  hcs-sim inspect <structure-file> [--json]
  hcs-sim engines [--planned]
  hcs-sim run --structure <file> --spec <spec.json> [--out <dir>] [--backend auto|cpu|wasm]
              [--resume <checkpoint.json>]

Exit codes: 0 success, 2 usage error, 3 validation or run failure.

Notes:
  * The spec's structure_ref.structure_hash must match the structure file.
  * Only engines implemented in this build are accepted; planned engines are listed,
    never executed.
  * The WASM backend is used by default when the asset is available; the result records
    which backend produced the numbers.
  * md.run writes checkpoint.json into the output directory; --resume continues that
    exact cell and timestep for the number of steps in the spec.`);
}

function readStructure(path: string): Structure {
  const text = readFileSync(path, "utf8");
  return importStructure(text, basename(path)).structure;
}

function isVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function readCheckpoint(path: string): MdCheckpoint {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("Checkpoint must be a JSON object");
  const candidate = parsed as Partial<MdCheckpoint>;
  if (candidate.schema_version !== "1.0.0") {
    throw new Error(`Unsupported checkpoint schema_version '${String(candidate.schema_version)}'`);
  }
  if (typeof candidate.structure_hash !== "string" || candidate.structure_hash.length === 0) {
    throw new Error("Checkpoint is missing structure_hash");
  }
  if (!Number.isInteger(candidate.steps_completed) || (candidate.steps_completed ?? -1) < 0) {
    throw new Error("Checkpoint steps_completed must be a non-negative integer");
  }
  if (typeof candidate.timestep_ps !== "number" || !(candidate.timestep_ps > 0)) {
    throw new Error("Checkpoint timestep_ps must be positive");
  }
  if (typeof candidate.seed !== "number" || !Number.isInteger(candidate.seed)) {
    throw new Error("Checkpoint seed must be an integer");
  }
  if (!Array.isArray(candidate.positions) || !candidate.positions.every(isVec3)) {
    throw new Error("Checkpoint positions must be an array of [x, y, z] triples");
  }
  if (!Array.isArray(candidate.velocities) || !candidate.velocities.every(isVec3)) {
    throw new Error("Checkpoint velocities must be an array of [x, y, z] triples");
  }
  if (candidate.positions.length !== candidate.velocities.length) {
    throw new Error("Checkpoint positions and velocities have different lengths");
  }
  return candidate as MdCheckpoint;
}

async function loadKernel(backend: string): Promise<{ kernel?: EnergyForcesKernel; note: string }> {
  if (backend === "cpu") return { note: "backend: cpu (requested)" };
  try {
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("@hcs-materials/wasm/hcs_compute.wasm");
    const bytes = readFileSync(wasmPath);
    const kernel = await instantiateWasmKernel(bytes);
    return {
      kernel: kernel.energyForces.bind(kernel),
      note: `backend: wasm (ABI ${kernel.abiVersion}, ${kernel.moduleBytes} bytes)`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (backend === "wasm") throw new Error(`WASM backend requested but unavailable: ${reason}`);
    return { note: `backend: cpu (WASM unavailable: ${reason})` };
  }
}

async function main(argv: string[]): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);
  const json = Boolean(flags.json);

  if (!command || command === "help" || flags.help) {
    usage();
    return command ? EXIT_OK : EXIT_USAGE;
  }

  if (command === "engines") {
    const engines = listEngines();
    if (json) {
      console.log(JSON.stringify({ engines, planned: PLANNED_ENGINES }, null, 2));
    } else {
      for (const engine of engines) {
        console.log(
          `${engine.engine_id.padEnd(24)} v${engine.version.padEnd(8)} ${engine.installation_state.padEnd(12)} ${engine.name}`,
        );
      }
      if (flags.planned) {
        console.log("\nPlanned (not runnable):");
        for (const engine of PLANNED_ENGINES) {
          console.log(`${engine.engine_id.padEnd(24)} ${engine.status.padEnd(16)} ${engine.note}`);
        }
      }
    }
    return EXIT_OK;
  }

  if (command === "inspect") {
    const file = positional[0];
    if (!file) {
      console.error("error: inspect needs a structure file");
      return EXIT_USAGE;
    }
    try {
      const structure = readStructure(file);
      const validation = validateStructure(structure);
      const volume = cellVolume(structure);
      const density = (() => {
        try {
          return densityGPerCm3(totalMassAmu(structure), volume);
        } catch {
          return null;
        }
      })();
      const payload = {
        file,
        formula: structure.composition?.reduced_formula,
        atoms: structure.sites.length,
        structure_hash: structureHash(structure),
        volume_angstrom3: volume,
        density_g_per_cm3: density,
        validation,
      };
      if (json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log(`${payload.formula}  ${payload.atoms} atoms`);
        console.log(`hash:    ${payload.structure_hash}`);
        console.log(`volume:  ${volume.toFixed(4)} Å³`);
        console.log(`density: ${density === null ? "—" : density.toFixed(4)} g/cm³`);
        console.log(`status:  ${validation.status}`);
        for (const check of validation.checks.filter((c) => c.status !== "pass")) {
          console.log(`  [${check.status}] ${check.id}: ${check.message}`);
        }
      }
      return validation.status === "invalid" ? EXIT_FAILED : EXIT_OK;
    } catch (error) {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
      return EXIT_FAILED;
    }
  }

  if (command === "run") {
    const structureFile = typeof flags.structure === "string" ? flags.structure : undefined;
    const specFile = typeof flags.spec === "string" ? flags.spec : undefined;
    if (!structureFile || !specFile) {
      console.error("error: run needs --structure <file> and --spec <file>");
      return EXIT_USAGE;
    }
    try {
      const structure = readStructure(structureFile);
      const spec = JSON.parse(readFileSync(specFile, "utf8")) as SimulationSpec;
      const actualHash = structureHash(structure);
      if (spec.structure_ref?.structure_hash !== actualHash) {
        console.error(
          `error: spec.structure_ref.structure_hash does not match the structure file\n` +
            `  spec:      ${spec.structure_ref?.structure_hash}\n  structure: ${actualHash}`,
        );
        return EXIT_FAILED;
      }

      const backend = typeof flags.backend === "string" ? flags.backend : "auto";
      const { kernel, note } = await loadKernel(backend);
      console.error(note);

      const resumeFile = typeof flags.resume === "string" ? flags.resume : undefined;
      const resume = resumeFile ? readCheckpoint(resumeFile) : undefined;
      if (resume && spec.task_type !== "md.run") {
        console.error(`error: --resume only applies to md.run (spec task is '${spec.task_type}')`);
        return EXIT_USAGE;
      }

      const outcome = runJob({
        spec,
        structure,
        projectId: "cli",
        ...(kernel ? { energyKernel: kernel } : {}),
        ...(resume ? { mdResume: resume } : {}),
        onProgress: (update) => {
          if (process.stderr.isTTY && !json) {
            process.stderr.write(`\r${update.phase} ${(update.fraction * 100).toFixed(0)}%   `);
          }
        },
      });
      if (process.stderr.isTTY && !json) process.stderr.write("\n");

      const outDir = resolve(
        typeof flags.out === "string"
          ? flags.out
          : join(process.cwd(), `hcs-run-${outcome.job.job_id}`),
      );
      mkdirSync(outDir, { recursive: true });
      const write = (name: string, value: unknown): void => {
        writeFileSync(join(outDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
      };
      write("status.json", outcome.job);
      if (outcome.result) write("result.json", outcome.result);
      if (outcome.provenance) write("provenance.json", outcome.provenance);
      writeFileSync(
        join(outDir, "run.log"),
        outcome.job.events
          .map((event) => `${event.at} ${event.state} ${event.message}`)
          .join("\n") + "\n",
        "utf8",
      );
      if (outcome.result && outcome.provenance) {
        const html = buildReproducibilityReport({
          result: outcome.result,
          provenance: outcome.provenance,
          job: outcome.job,
          spec,
          structure,
          projectName: "hcs-sim",
        });
        writeFileSync(join(outDir, "report.html"), html, "utf8");
      }
      if (outcome.trajectory) write("trajectory.json", outcome.trajectory);
      if (outcome.mdCheckpoint) write("checkpoint.json", outcome.mdCheckpoint);
      if (outcome.result?.result_structure) {
        writeFileSync(
          join(outDir, "structure.cif"),
          exportStructure(outcome.result.result_structure, "cif"),
          "utf8",
        );
      }

      const summary = {
        ok: outcome.job.state === "completed",
        state: outcome.job.state,
        job_id: outcome.job.job_id,
        out: outDir,
        result: outcome.result
          ? {
              quantities: outcome.result.quantities,
              convergence: outcome.result.convergence,
              limitations: outcome.result.limitations,
            }
          : null,
        error: outcome.error ?? null,
      };
      if (json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(`job ${outcome.job.job_id}: ${outcome.job.state}`);
        for (const quantity of outcome.result?.quantities ?? []) {
          console.log(
            `  ${quantity.name.padEnd(32)} ${String(quantity.value).padEnd(16)} ${quantity.unit}`,
          );
        }
        if (outcome.error) console.error(`error: ${outcome.error.code}: ${outcome.error.message}`);
        console.log(`wrote ${outDir}`);
      }
      return outcome.job.state === "completed" ? EXIT_OK : EXIT_FAILED;
    } catch (error) {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
      return EXIT_FAILED;
    }
  }

  console.error(`error: unknown command '${command}'`);
  usage();
  return EXIT_USAGE;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = EXIT_FAILED;
  });
