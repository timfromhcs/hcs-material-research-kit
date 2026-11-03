# ADR-0003: Job cancellation semantics

**Status:** accepted · 2026-11-03

## Context

The kernels are synchronous, deterministic loops. A user must be able to stop a long run
without corrupting a project, and the UI must not pretend that a partial computation produced a
result.

## Decision

Two mechanisms, both explicit:

1. **Cooperative cancellation** — the job runner accepts `cancel: { requested: boolean }` and
   polls it inside solver step callbacks (`relaxFire`, `runMd`). On cancellation the job
   transitions to `cancelled` and **no result bundle is emitted**.
2. **Hard cancellation** — the browser terminates the worker. This is the only reliable way to
   interrupt a synchronous loop from the UI thread. Terminated work produces no result, and the
   job is recorded as cancelled by the UI after the worker is gone.

The job state machine already allows `running → cancelled`. Partial results are never labelled
`incomplete` and then used as if they were complete; `incomplete` is reserved for engine
outputs that are structurally valid but failed convergence checks.

## Consequences

- A cancelled run costs the work already done; it does not restart from a checkpoint.
  Checkpoint/restart is a roadmap item, not a current claim.
- Long computations cannot be paused and resumed in the browser yet. Documented in `STATUS.md`.
- Any future async solver must implement both paths.

## Alternatives rejected

- **Promise-based cooperative-only cancellation**: does not interrupt a synchronous loop.
- **Returning partial arrays on cancel**: invites accidental scientific use of truncated data.
