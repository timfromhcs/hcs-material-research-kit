# ADR-0010: WASM kernel ABI without wasm-bindgen

**Status:** accepted · 2026-11-03

## Context

The CPU reference kernel is written in Rust (`crates/compute-core`) and duplicated in
TypeScript for the browser. Two implementations are valuable for cross-checking, but only if
they are compared continuously. We wanted the Rust kernel available in the browser as a real
second implementation, without adding a second build toolchain (wasm-bindgen/wasm-pack) or a
JavaScript glue layer that can drift.

## Decision

- `crates/compute-wasm` compiles the existing Rust kernel to `wasm32-unknown-unknown` with a
  plain C ABI and **no imports**.
- One entry point, explicit linear-memory buffers:
  `hcs_lj_energy_forces(n, lattice*, pbc*, frac*, eps*, sigma*, cutoff, out_forces*, out_scalars*)`.
- Two small memory helpers (`hcs_alloc`, `hcs_free`) and `hcs_abi_version()`.
- Output scalars: energy, energy per atom, max force, cutoff actually used, pair count.
- Site parameters are passed per atom, so Lorentz–Berthelot mixing happens inside the kernel
  with the same formula as the TypeScript engine.
- The loader (`packages/wasm`) validates the ABI version, element support and cell geometry,
  and throws typed errors instead of returning zeros.
- The `.wasm` artefact is committed together with `MANIFEST.json` (sha256, rustc version,
  target, rebuild command) so the studio and tests work without a Rust toolchain. CI rebuilds it
  and fails on drift.

## Use in the product

The solver worker keeps the TypeScript kernel as the job engine and runs the WASM kernel as a
**cross-implementation check** for single-point evaluations: it reports the maximum energy and
force deviation and whether both agree within 1e-8 (observed: ~1e-16). A disagreement is shown
as an error, not hidden. If the WASM asset cannot be loaded, the job still completes and the
check states why it was unavailable.

## Consequences

- The browser has two independent implementations of the pair potential; the numbers are
  verified on every energy job instead of only in CI.
- Backend coverage is honest but partial: relaxation and MD still run the TypeScript kernel.
  A full kernel abstraction is a separate decision.
- The ABI is versioned; a stale asset is detected at load time.
- No wasm-bindgen dependency, no generated glue, ~58 kB artefact.

## Verification

- `packages/wasm/test/parity.test.ts` (8 tests): argon, mixed Ar/Kr, cutoff clamping, explicit
  cutoff, zero-interaction cell, degenerate cell, unsupported element.
- `crates/compute-core` parity test against the TypeScript fixture (1e-10 eV).
- End-to-end: `tests/e2e/workflow.spec.ts` asserts the in-browser cross-check passes.

## Alternatives rejected

- **wasm-bindgen / wasm-pack**: extra toolchain, generated JS that can drift, larger artefact,
  and no benefit for one function with numeric buffers.
- **Run jobs only in WASM**: would break the readable TypeScript reference and the ability to
  compare implementations at runtime.
