# Browser runtime and storage

## Workers

- One worker per job, created from `apps/web/src/workers/solver.worker.ts`.
- Typed protocol: `run`, `ping` → `ready`, `progress`, `result`, `error`.
- Progress messages originate from the solver step callbacks inside `packages/core`.
- Cancellation terminates the worker (ADR-0003); a terminated run produces no result.
- The worker imports the same `@hcs-materials/core` build as the UI, so there is one
  implementation of the physics, not a browser copy.

## Storage layers

| Layer | Contents | Durability |
|---|---|---|
| React state | active project, structures, jobs, selected items | session |
| IndexedDB (`hcs-materials`/`kv`) | project metadata, structures, job records, results, provenance (no trajectories) | until site data is cleared |
| OPFS (`hcs-materials/trajectories`) | MD trajectory JSON, one file per job | until eviction; quota-checked |
| Memory | active trajectory while the workbench is open | session |

Before writing a trajectory the app calls `navigator.storage.estimate()` and refuses writes
larger than the free space; artefacts above 48 MB are refused outright. If OPFS is unavailable,
the trajectory stays in memory and the UI shows `memory` instead of claiming persistence.

`navigator.storage.persist()` status is displayed but never assumed.

## Quota and failure handling

- `QuotaExceededError` during an OPFS write is caught; the run still completes and the UI
  reports that the trajectory is memory-only.
- IndexedDB write failures are swallowed at the persistence layer so the session keeps working;
  the user is expected to export an archive. This is a known limitation, not a guarantee.
- Clearing site data deletes projects. The UI states this and offers `.hcsproj` export.

## Static deployment

- `vite build` emits `index.html`, hashed JS/CSS, the worker chunk and brand assets.
- `HashRouter` is used, so no server rewrite rules are required; `vercel.json` adds security
  headers and immutable caching for hashed assets.
- WASM and model weights are not part of the bundle. When they are added, they must be fetched
  only after an explicit user action with size and license shown.
