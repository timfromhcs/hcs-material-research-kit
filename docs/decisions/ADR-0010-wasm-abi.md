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

The solver worker instantiates the WASM kernel once per job and passes it to the job runner for
**energy evaluation, FIRE relaxation and NVE molecular dynamics**. The runner records the backend
in the result (`compute_backend`) and in the provenance environment, so a result states which
implementation produced it. If the asset cannot be loaded, the job falls back to the TypeScript
kernel and reports the reason.

Additionally, every single-point energy job is re-evaluated with the *other* implementation and
the maximum energy/force deviation is shown (tolerance 1e-8; observed ~1e-16). A disagreement is
displayed as an error, not hidden.

## Consequences

- The browser has two independent implementations; the WASM path is used for the real
  computation, not only for a badge.
- Relaxation and MD call into WASM once per force evaluation, so array copying and allocation
  cost matters for large cells. The current buffers are allocated per call; a reusable buffer
  pool is a follow-up optimisation, not a correctness issue.
- The ABI is versioned; a stale asset is detected at load time.
- No wasm-bindgen dependency, no generated glue, ~58 kB artefact.

## Verification

- `packages/wasm/test/parity.test.ts` (8 tests): argon, mixed Ar/Kr, cutoff clamping, explicit
  cutoff, zero-interaction cell, degenerate cell, unsupported element.
- `packages/wasm/test/kernels.test.ts` (3 tests): relaxation to the same minimum within 1e-8,
  identical first MD step within 1e-10, energy conservation with the WASM kernel.
- `crates/compute-core` parity test against the TypeScript fixture (1e-10 eV).
- End-to-end: `tests/e2e/workflow.spec.ts` asserts the cross-check passes and that the result
  reports backend `wasm`.

## Alternatives rejected

- **wasm-bindgen / wasm-pack**: extra toolchain, generated JS that can drift, larger artefact,
  and no benefit for one function with numeric buffers.
- **Run only the cross-check in WASM**: would leave the browser physics on a single
  implementation and make the cross-check the only consumer.

