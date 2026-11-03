# Job lifecycle

```text
created ──► validated ──► queued ──► preparing ──► running ──┬──► checkpointing ──┐
   │            │            │            │            │      │                    │
   │            │            │            │            │      └────────────◄───────┘
   │            │            │            │            ├──► completed
   │            │            │            │            ├──► failed
   │            │            │            │            ├──► cancelled
   │            │            │            │            └──► interrupted ──► queued
   └────────────┴────────────┴────────────┴──► failed / cancelled
```

Illegal transitions throw (`assertTransition`); there is no silent recovery. A job never
becomes `completed` merely because a function returned.

## What is immutable

- `SimulationSpec` is hashed (`input_hash`) when the job is created and never modified.
- `structure_ref.structure_hash` must equal the hash of the submitted structure; a mismatch
  fails the job with `structure_hash_mismatch`.
- Results reference the immutable input hash and the provenance record id.

## What the runner actually checks

1. JSON Schema of spec and structure.
2. Engine exists and is `builtin`/`installed`.
3. Engine supports the task type.
4. Engine declares the requested fidelity level.
5. Structure passes structural validation (cell volume, positions, occupancy, overlaps).
6. Structure hash matches the spec.
7. LJ preflight: effective cutoff, at least one interacting pair.
8. Task-specific validation (parameters, ensemble, trajectory requirements).
9. Cancellation flag at every solver step boundary.

Failures produce a `failed` job with a code (`invalid_spec`, `invalid_structure`,
`structure_hash_mismatch`, `fidelity_mismatch`, `unsupported_ensemble`, `lj.no_interactions`,
`lj.cutoff_reduced` as warning, `kernel_error`).

## Events and warnings

Each transition appends `{at, state, message, data?}`. Warnings are structured
`{code, message, severity}` and are shown in the UI and written into the project archive. A
result bundle cannot be created without `convergence` and at least one `limitation`.

## Cancellation

See ADR-0003. Cooperative inside the kernels, hard by terminating the worker. A cancelled job
has no result bundle.
