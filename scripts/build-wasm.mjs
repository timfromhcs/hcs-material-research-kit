#!/usr/bin/env node
/**
 * Builds the Rust kernel for wasm32-unknown-unknown and copies the artefact
 * into the @hcs-materials/wasm package together with a manifest.
 *
 * The .wasm file is committed so the studio and the parity tests work without a
 * Rust toolchain. The manifest records how it was produced; CI rebuilds it and
 * fails on drift.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = "wasm32-unknown-unknown";
const crate = "hcs-compute-wasm";
const produced = join(repoRoot, "target", target, "release", `${crate.replace(/-/g, "_")}.wasm`);
const outputDir = join(repoRoot, "packages", "wasm", "wasm");
const output = join(outputDir, "hcs_compute.wasm");

console.log(`[wasm] cargo build -p ${crate} --target ${target} --release`);
execFileSync("cargo", ["build", "-p", crate, "--target", target, "--release"], {
  cwd: repoRoot,
  stdio: "inherit",
});

mkdirSync(outputDir, { recursive: true });
copyFileSync(produced, output);

const bytes = readFileSync(output);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const rustc = execFileSync("rustc", ["--version"], { encoding: "utf8" }).trim();

const manifest = {
  crate,
  profile: "release",
  target,
  rustc,
  sha256,
  bytes: bytes.byteLength,
  abi_version: 1,
  source: "crates/compute-wasm/src/lib.rs + crates/compute-core/src/lib.rs",
  rebuild: "npm run build:wasm",
};
writeFileSync(join(outputDir, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[wasm] wrote ${output}`);
console.log(`[wasm] ${bytes.byteLength} bytes, sha256 ${sha256}`);
