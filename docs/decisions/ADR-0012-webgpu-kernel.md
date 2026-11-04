# ADR-0012 — WebGPU kernel with a mandatory CPU cross-check

**Status:** accepted (2026-11-04)
**Context:** v0.2.0 probed WebGPU but ran every kernel on CPU/WASM. WebGPU now ships by default
in Chrome/Edge, Firefox (Windows) and Safari 26, so a real GPU path is defensible — provided the
product never presents GPU numbers that have not been checked.

## Decision

Implement a WebGPU compute-shader Lennard-Jones kernel in `packages/webgpu`:

- one invocation per atom; each invocation sums its own force over every other atom, so no
  floating-point atomics are required and the result is deterministic;
- the energy is accumulated with a ½ factor because each pair is visited from both ends;
- the pair count uses an integer atomic (guaranteed by WebGPU);
- f32 throughout, with a documented tolerance against the f64 CPU reference.

**Every WebGPU energy job is cross-checked against the TypeScript f64 kernel before the result
is presented.** The cross-check is part of the result, not a debug log. A failing check is shown
as an error badge.

## Consequences

- The kernel is asynchronous. The synchronous job runner therefore uses it for single-point
  `energy.evaluate` jobs only; MD and FIRE relaxation keep the WASM/CPU path. The UI does not
  claim otherwise.
- The worker pre-computes the GPU result, then supplies it to the synchronous runner as a
  single-point kernel. A structure-id guard prevents the pre-computation from being reused for a
  different cell.
- Provenance records `precision: "float32"` for WebGPU, never `float64`.
- If a caller forces `backend: "webgpu"` and no adapter exists, the job fails with the reason
  instead of silently falling back. `auto` falls back to WASM and records the reason.
- No GPU memory is retained between jobs; buffers are destroyed after readback.

## Evidence

`docs/plan/evidence/webgpu-parity.txt` records the automated browser run: 108-atom argon,
max ΔE 2.83e-6 eV, max ΔF 1.93e-7 eV/Å, cross-check passed, provenance precision f32.

## Alternatives rejected

| Alternative                              | Why not                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Float atomics for force accumulation     | Not universally available and not deterministic across vendors.                            |
| Present GPU results without a CPU check  | A driver bug would become a scientific result.                                             |
| Async rewrite of the whole job runner    | Large, risky change for one backend; the single-point path captures most of the value now. |
| Fake GPU badge based on adapter presence | The backend must be the one that produced the numbers.                                     |
