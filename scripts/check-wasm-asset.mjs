#!/usr/bin/env node
/**
 * Integrity check for the committed WebAssembly asset.
 *
 * The .wasm file is committed so the studio and the parity tests work without a
 * Rust toolchain. This script proves the committed bytes are the bytes described
 * by MANIFEST.json (the same check the loader performs for ABI compatibility).
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = join(repoRoot, "packages", "wasm", "wasm");
const wasmPath = join(assetDir, "hcs_compute.wasm");
const manifestPath = join(assetDir, "MANIFEST.json");

const bytes = readFileSync(wasmPath);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const sha256 = createHash("sha256").update(bytes).digest("hex");

const problems = [];
if (manifest.sha256 !== sha256) {
  problems.push(`MANIFEST sha256 ${manifest.sha256} != asset ${sha256}`);
}
if (manifest.bytes !== bytes.byteLength) {
  problems.push(`MANIFEST bytes ${manifest.bytes} != asset ${bytes.byteLength}`);
}
if (manifest.abi_version !== 1) {
  problems.push(`unexpected ABI version ${manifest.abi_version}`);
}
if (!manifest.rustc) {
  problems.push("MANIFEST does not record the compiler that produced the asset");
}

if (problems.length > 0) {
  console.error("[wasm] asset integrity check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `[wasm] asset ok: ${bytes.byteLength} bytes, sha256 ${sha256}, ` +
    `ABI ${manifest.abi_version}, built by ${manifest.rustc}`,
);
