#!/usr/bin/env node
/**
 * Runs the Python test suite from the repository root.
 *
 * `npm run test:python` used to call `.venv/Scripts/python.exe` directly, which
 * Windows shells cannot execute (forward slashes in the command path). This
 * wrapper finds the virtual environment on Windows and POSIX, falls back to the
 * interpreter on PATH, and fails with a clear message if none is available.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = join(repoRoot, "python", "hcs_materials");

const candidates =
  process.platform === "win32"
    ? [join(packageDir, ".venv", "Scripts", "python.exe"), "python", "py"]
    : [join(packageDir, ".venv", "bin", "python"), "python3", "python"];

const python = candidates.find(
  (candidate) =>
    candidate.startsWith(packageDir) ? existsSync(candidate) : whichOnPath(candidate) !== null,
);

if (!python) {
  console.error(
    "error: no Python interpreter found. Create the environment first:\n" +
      "  cd python/hcs_materials && uv venv && uv pip install -e \".[dev]\"",
  );
  process.exit(2);
}

const args = ["-m", "pytest", ...process.argv.slice(2)];
const result = spawnSync(python, args, { cwd: packageDir, stdio: "inherit", shell: false });
if (result.error) {
  console.error(`error: could not start ${python}: ${result.error.message}`);
  process.exit(2);
}
process.exit(result.status ?? 1);

function whichOnPath(command) {
  const pathValue = process.env.PATH ?? "";
  const extensions = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE").split(";") : [""];
  for (const directory of pathValue.split(process.platform === "win32" ? ";" : ":")) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension.toLowerCase()}`);
      if (existsSync(candidate)) return candidate;
      const upper = join(directory, `${command}${extension.toUpperCase()}`);
      if (existsSync(upper)) return upper;
    }
  }
  return null;
}
