/**
 * Origin Private File System storage for large binary/text artefacts
 * (currently: MD trajectories).
 *
 * OPFS is origin-private and can be evicted. Every write therefore preflights
 * navigator.storage.estimate(), is bounded in size, and failure falls back to
 * in-memory-only data with a warning shown in the UI. OPFS is never presented
 * as a normal `C:\Temp` directory.
 */

const DIR_NAME = "hcs-materials";
const TRAJECTORY_DIR = "trajectories";
const MAX_ARTEFACT_BYTES = 48 * 1024 * 1024;

export interface OpfsStatus {
  supported: boolean;
  reason?: string;
  persisted?: boolean;
  quotaBytes?: number;
  usageBytes?: number;
}

export async function probeOpfs(): Promise<OpfsStatus> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
    return { supported: false, reason: "OPFS is not exposed by this browser." };
  }
  try {
    const root = await navigator.storage.getDirectory();
    await root.getDirectoryHandle(DIR_NAME, { create: true });
    const estimate = await navigator.storage.estimate().catch(() => null);
    const persisted = await navigator.storage.persisted?.().catch(() => false);
    return {
      supported: true,
      persisted,
      quotaBytes: estimate?.quota,
      usageBytes: estimate?.usage,
    };
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function trajectoryDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const base = await root.getDirectoryHandle(DIR_NAME, { create: true });
  return base.getDirectoryHandle(TRAJECTORY_DIR, { create: true });
}

export async function writeTrajectory(jobId: string, payload: unknown): Promise<{ ok: true; bytes: number } | { ok: false; reason: string }> {
  const text = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_ARTEFACT_BYTES) {
    return { ok: false, reason: `Trajectory exceeds the 48 MB artefact limit (${(bytes / 1024 / 1024).toFixed(1)} MB).` };
  }
  try {
    const estimate = await navigator.storage.estimate();
    if (estimate.quota !== undefined && estimate.usage !== undefined) {
      if (estimate.quota - estimate.usage < bytes * 1.2) {
        return {
          ok: false,
          reason: `Not enough browser storage for this trajectory (${(bytes / 1024 / 1024).toFixed(1)} MB needed).`,
        };
      }
    }
    const dir = await trajectoryDir();
    const handle = await dir.getFileHandle(`${sanitize(jobId)}.json`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return { ok: true, bytes };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}

export async function readTrajectory(jobId: string): Promise<unknown | null> {
  try {
    const dir = await trajectoryDir();
    const handle = await dir.getFileHandle(`${sanitize(jobId)}.json`);
    const file = await handle.getFile();
    return JSON.parse(await file.text()) as unknown;
  } catch {
    return null;
  }
}

export async function deleteTrajectory(jobId: string): Promise<void> {
  try {
    const dir = await trajectoryDir();
    await dir.removeEntry(`${sanitize(jobId)}.json`);
  } catch {
    /* missing entry is not an error */
  }
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}
