/**
 * Portable .hcsproj project archive.
 *
 * Layout (format version 1.0.0):
 *   manifest.json
 *   project.json
 *   structures/<structure_id>.json
 *   simulations/<job_id>/input.json
 *   simulations/<job_id>/status.json
 *   simulations/<job_id>/result.json
 *   simulations/<job_id>/provenance.json
 *   simulations/<job_id>/logs/run.log
 *   simulations/<job_id>/artifacts/<name>
 *   checksums.sha256
 *
 * Security: archive paths are validated (no absolute paths, drive letters,
 * "..", backslashes), entry count and uncompressed size are bounded, and
 * checksums are verified on read. Paths inside the archive are plain relative
 * POSIX paths.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type {
  JobRecord,
  ProvenanceRecord,
  ResultBundle,
  SimulationSpec,
  Structure,
} from "./types.js";
import { SCHEMA_VERSION } from "./types.js";
import { sha256Hex } from "./hash.js";
import { newId } from "./structure.js";
import { CORE_VERSION } from "./engines.js";

export const PROJECT_FORMAT_VERSION = "1.0.0";

export interface ProjectMeta {
  schema_version: typeof SCHEMA_VERSION;
  project_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  app: { name: string; version: string };
  structure_ids: string[];
  job_ids: string[];
  tags?: string[];
}

export interface ProjectArchiveInput {
  project: ProjectMeta;
  structures: Structure[];
  /** One entry per job with its spec, record, result and provenance. */
  jobs: Array<{
    spec: SimulationSpec;
    job: JobRecord;
    result?: ResultBundle;
    provenance?: ProvenanceRecord;
    trajectories?: Record<string, unknown>;
    log?: string;
  }>;
  /** Extra free-form files, keys are POSIX relative paths inside reports/. */
  reports?: Record<string, string>;
}

export interface ProjectArchiveReadResult {
  project: ProjectMeta;
  structures: Structure[];
  jobs: Array<{
    spec: SimulationSpec;
    job: JobRecord;
    result?: ResultBundle;
    provenance?: ProvenanceRecord;
    log?: string;
    trajectories: Record<string, unknown>;
  }>;
  reports: Record<string, string>;
  checksumsVerified: boolean;
  warnings: string[];
}

const MAX_ENTRIES = 5000;
const MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 64 * 1024 * 1024;

export function isSafeArchivePath(path: string): boolean {
  if (!path || path.length > 300) return false;
  if (path.includes("\\")) return false;
  if (path.includes("\0")) return false;
  if (path.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function assertSafePath(path: string): void {
  if (!isSafeArchivePath(path)) {
    throw new Error(`Unsafe archive path rejected: '${path}'`);
  }
}

export function createProjectMeta(options: {
  name: string;
  description?: string;
  projectId?: string;
  now?: Date;
}): ProjectMeta {
  const timestamp = (options.now ?? new Date()).toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    project_id: options.projectId ?? newId("project"),
    name: options.name,
    description: options.description,
    created_at: timestamp,
    updated_at: timestamp,
    app: { name: "HCS Material Research Kit", version: CORE_VERSION },
    structure_ids: [],
    job_ids: [],
  };
}

export function writeProjectArchive(input: ProjectArchiveInput): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const checksums: Array<{ path: string; sha256: string; bytes: number }> = [];

  const put = (path: string, content: string): void => {
    assertSafePath(path);
    const bytes = strToU8(content);
    if (bytes.byteLength > MAX_SINGLE_FILE_BYTES) {
      throw new Error(`File '${path}' exceeds the 64 MB single-file limit`);
    }
    files[path] = bytes;
    checksums.push({ path, sha256: sha256Hex(bytes), bytes: bytes.byteLength });
  };

  const project: ProjectMeta = {
    ...input.project,
    structure_ids: input.structures.map((s) => s.structure_id),
    job_ids: input.jobs.map((j) => j.job.job_id),
    updated_at: new Date().toISOString(),
    app: { name: "HCS Material Research Kit", version: CORE_VERSION },
  };

  for (const structure of input.structures) {
    put(`structures/${structure.structure_id}.json`, `${JSON.stringify(structure, null, 2)}\n`);
  }

  for (const entry of input.jobs) {
    const base = `simulations/${entry.job.job_id}`;
    put(`${base}/input.json`, `${JSON.stringify(entry.spec, null, 2)}\n`);
    put(`${base}/status.json`, `${JSON.stringify(entry.job, null, 2)}\n`);
    if (entry.result) put(`${base}/result.json`, `${JSON.stringify(entry.result, null, 2)}\n`);
    if (entry.provenance) {
      put(`${base}/provenance.json`, `${JSON.stringify(entry.provenance, null, 2)}\n`);
    }
    if (entry.log) put(`${base}/logs/run.log`, entry.log);
    for (const [name, payload] of Object.entries(entry.trajectories ?? {})) {
      assertSafePath(name);
      put(`${base}/artifacts/${name}`, `${JSON.stringify(payload)}\n`);
    }
  }

  for (const [name, content] of Object.entries(input.reports ?? {})) {
    assertSafePath(name);
    put(`reports/${name}`, content);
  }

  const manifest = {
    format: "hcsproj",
    format_version: PROJECT_FORMAT_VERSION,
    created_at: new Date().toISOString(),
    app: { name: "HCS Material Research Kit", version: CORE_VERSION },
    project_id: project.project_id,
    files: checksums,
  };
  put("project.json", `${JSON.stringify(project, null, 2)}\n`);

  // checksums.sha256 excludes manifest.json and itself.
  const checksumText = checksums
    .slice()
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((entry) => `${entry.sha256}  ${entry.path}`)
    .join("\n");
  const checksumBytes = strToU8(`${checksumText}\n`);
  const manifestWithChecksum = {
    ...manifest,
    files: [
      ...checksums,
      {
        path: "checksums.sha256",
        sha256: sha256Hex(checksumBytes),
        bytes: checksumBytes.byteLength,
      },
    ],
  };
  files["checksums.sha256"] = checksumBytes;
  files["manifest.json"] = strToU8(`${JSON.stringify(manifestWithChecksum, null, 2)}\n`);

  const zip = zipSync(files, { level: 6, mtime: new Date() });
  if (zip.byteLength > MAX_UNCOMPRESSED_BYTES) {
    throw new Error("Project archive exceeds the 256 MB limit");
  }
  return zip;
}

export function readProjectArchive(bytes: Uint8Array): ProjectArchiveReadResult {
  const warnings: string[] = [];
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes);
  } catch (error) {
    throw new Error(`Not a readable .hcsproj archive: ${(error as Error).message}`);
  }
  const paths = Object.keys(raw);
  if (paths.length > MAX_ENTRIES)
    throw new Error(`Archive has ${paths.length} entries; limit is ${MAX_ENTRIES}`);

  let totalBytes = 0;
  for (const path of paths) {
    assertSafePath(path);
    const size = raw[path]!.byteLength;
    if (size > MAX_SINGLE_FILE_BYTES) throw new Error(`Entry '${path}' exceeds the 64 MB limit`);
    totalBytes += size;
  }
  if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new Error(`Archive expands to ${totalBytes} bytes; limit is ${MAX_UNCOMPRESSED_BYTES}`);
  }

  const readText = (path: string): string | undefined => {
    const entry = raw[path];
    return entry ? strFromU8(entry) : undefined;
  };

  // Checksum verification.
  let checksumsVerified = false;
  const checksumText = readText("checksums.sha256");
  if (checksumText) {
    const lines = checksumText.split(/\r?\n/).filter(Boolean);
    let mismatches = 0;
    for (const line of lines) {
      const match = /^([a-f0-9]{64})\s\s(.+)$/.exec(line.trim());
      if (!match) {
        warnings.push(`Malformed checksum line: ${line.slice(0, 60)}`);
        continue;
      }
      const [, digest, path] = match;
      assertSafePath(path!);
      const entry = raw[path!];
      if (!entry) {
        warnings.push(`Checksum entry for missing file: ${path}`);
        continue;
      }
      if (sha256Hex(entry) !== digest) {
        mismatches++;
        warnings.push(`Checksum mismatch for ${path}`);
      }
    }
    checksumsVerified = mismatches === 0 && warnings.length === 0;
    if (!checksumsVerified) {
      warnings.push(
        "Project integrity could not be fully verified; treat extracted results as untrusted.",
      );
    }
  } else {
    warnings.push("Archive has no checksums.sha256; integrity cannot be verified.");
  }

  const projectText = readText("project.json");
  if (!projectText) throw new Error("Archive has no project.json");
  const project = JSON.parse(projectText) as ProjectMeta;

  const structures: Structure[] = [];
  for (const path of paths) {
    if (!path.startsWith("structures/") || !path.endsWith(".json")) continue;
    const text = readText(path);
    if (!text) continue;
    try {
      structures.push(JSON.parse(text) as Structure);
    } catch {
      warnings.push(`Structure file '${path}' is not valid JSON and was skipped`);
    }
  }

  const jobsByDir = new Map<
    string,
    {
      spec?: SimulationSpec;
      job?: JobRecord;
      result?: ResultBundle;
      provenance?: ProvenanceRecord;
      log?: string;
      trajectories: Record<string, unknown>;
    }
  >();
  for (const path of paths) {
    const match = /^simulations\/([^/]+)\/(.+)$/.exec(path);
    if (!match) continue;
    const [, jobId, rest] = match;
    const entry = jobsByDir.get(jobId!) ?? { trajectories: {} };
    jobsByDir.set(jobId!, entry);
    const text = readText(path);
    if (!text) continue;
    try {
      if (rest === "input.json") entry.spec = JSON.parse(text) as SimulationSpec;
      else if (rest === "status.json") entry.job = JSON.parse(text) as JobRecord;
      else if (rest === "result.json") entry.result = JSON.parse(text) as ResultBundle;
      else if (rest === "provenance.json") entry.provenance = JSON.parse(text) as ProvenanceRecord;
      else if (rest === "logs/run.log") entry.log = text;
      else if (rest?.startsWith("artifacts/")) {
        entry.trajectories[rest.slice("artifacts/".length)] = JSON.parse(text) as unknown;
      }
    } catch {
      warnings.push(`Could not parse '${path}'`);
    }
  }

  const jobs: ProjectArchiveReadResult["jobs"] = [];
  for (const [jobId, entry] of jobsByDir) {
    if (!entry.spec || !entry.job) {
      warnings.push(
        `Job '${jobId}' is incomplete (missing input.json or status.json) and was skipped`,
      );
      continue;
    }
    jobs.push({
      spec: entry.spec,
      job: entry.job,
      result: entry.result,
      provenance: entry.provenance,
      log: entry.log,
      trajectories: entry.trajectories,
    });
  }

  const reports: Record<string, string> = {};
  for (const path of paths) {
    if (!path.startsWith("reports/")) continue;
    const text = readText(path);
    if (text !== undefined) reports[path.slice("reports/".length)] = text;
  }

  return { project, structures, jobs, reports, checksumsVerified, warnings };
}
