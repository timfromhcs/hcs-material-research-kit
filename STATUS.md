# Current Status

**Date:** 2026-11-03
**Branch:** `main` (release built on `release/0.2.0`)
**Repository:** https://github.com/timfromhcs/hcs-material-research-kit
**Version:** 0.2.0 — first public release

## Working product surfaces

- **Browser studio** (`apps/web`): Dashboard, Structure Studio, Simulation Workbench, Jobs,
  Data & Provenance, Settings. Static Vite build, HashRouter, EN/DE/FR, dark and light theme,
  responsive down to 390 px. The footer and Settings show `CORE_VERSION`, so the displayed
  version cannot drift from the code.
- **Automated end-to-end suite** (`tests/e2e`): seven Playwright tests against the production
  bundle, covering the full acceptance workflow including downloads and archive re-import.
- **Structure Studio**: create 9 prototypes, import CIF/POSCAR/XYZ/extXYZ/HCS JSON, supercells,
  substitution, vacancies, atom insertion/movement, distance/angle measurement with minimum-image
  vectors, validation panel, 3D viewer (Three.js, WebGL2), export in four formats.
- **Simulation Workbench**: single-point energy, FIRE relaxation, NVE MD (with trajectory),
  RDF; Web Worker execution, progress, hard cancel, MSD from trajectory, reproducibility
  report download.
- **Jobs**: lifecycle table and event log per job.
- **Data & Provenance**: provenance record, fidelity taxonomy, engine/model notes, archive
  integrity check.
- **Python CLI** (`hcs-materials`): doctor, hardware, engines list/inspect, structure
  validate/convert, project create/validate, report build.
- **Node simulation CLI** (`hcs-sim`): inspect, engines, run with CPU/WASM backend; writes
  status/result/provenance/report/log plus trajectory, relaxed structure and — for `md.run` —
  `checkpoint.json`. `--resume <checkpoint>` continues the exact cell and timestep.
- **MCP server** (`hcs-materials-mcp`, stdio): engines_list, structures_validate,
  structures_convert, project_validate, simulations_validate_spec (validation only),
  results_summarize (read-only) and **simulations_run** (approval-gated, bounded, workspace
  confined) + 2 resources + 2 prompts.
- **Rust crate** (`hcs-compute-core`): switched Lennard-Jones energy/forces, parity-tested.
- **WASM kernel** (`@hcs-materials/wasm`): the Rust kernel compiled to wasm32-unknown-unknown
  with a plain C ABI, built by a pinned Rust 1.96.0 toolchain. The loader keeps one growable
  buffer arena (two allocations for the whole benchmark suite) and exposes `dispose()`. The
  worker uses it for energy, FIRE relaxation and NVE MD, records the backend, and re-evaluates
  energy jobs with the other implementation.

## Completed capabilities

- Canonical JSON Schema contracts (7 schemas) with runtime validation in TypeScript and Python.
- Structure identity hashing that is stable across TypeScript, Rust and Python.
- Periodic cell mathematics, minimum-image distances, validation checks.
- File IO with explicit failure modes and documented subsets.
- Job state machine with illegal-transition rejection and structured events.
- Provenance records with input hashes, environment, units and limitations; resumed MD runs
  record `resumed_from_steps` without mutating the user's spec.
- MD checkpoint/restart that reproduces a continuous run bit-for-bit.
- `.hcsproj` archive writer/reader with checksums, size limits and path-traversal rejection.
- Portable HTML reproducibility report.
- Cross-language reference fixtures and parity test (TS ↔ Rust, TS ↔ Python), regenerated
  deterministically (pinned ids and timestamps).
- Reusable WASM buffer arena (removes per-evaluation allocation).
- Approval-gated MCP simulation tool with hard workload budgets and typed refusals.
- CI that has actually run: typecheck/unit/build, benchmark parity, Rust (fmt, clippy, parity,
  fixture and WASM drift), Python 3.12/3.13, Node 24 signal, Playwright E2E.

## Capabilities in progress

- OPFS artefacts beyond trajectories (currently only trajectories are written to OPFS).

## Known limitations

- Only classical Lennard-Jones (He, Ne, Ar, Kr, Xe) and a 1D heat solver are implemented.
- O(N²) pair loops; the UI limit is 20 000 atoms for supercells and 5 000 for MD.
- NVE only; no thermostat or barostat.
- No Tauri desktop app, no installers, no PyPI/npm publication.
- The 3D viewer uses WebGL2; no WebGPU renderer is implemented.
- Browser storage can be evicted; there is no automatic backup.
- MCP stdio only; loopback HTTP transport is not implemented.
- The committed WASM asset is built by a pinned toolchain, but byte identity across operating
  systems is not claimed: the compiler embeds platform metadata. CI verifies the manifest hash
  and that a fresh rebuild passes the full WASM test suite.

## Scientific validation evidence

| Check                                         | Result                                               | Where                                                            |
| --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Forces = −∇E (central differences)            | rel. deviation < 1e-5                                | `packages/core/test/lj.test.ts`                                  |
| LJ pair minimum at 2^(1/6)σ = −ε              | abs < 1e-12 eV                                       | `packages/core/test/lj.test.ts`                                  |
| fcc cohesive energy bracket (truncated)       | −9ε < E/atom < −6.5ε                                 | `packages/core/test/lj.test.ts`                                  |
| NVE energy conservation, 108 atoms, 400 steps | < 1e-3 eV/atom (observed ~3e-7)                      | `packages/core/test/md.test.ts`                                  |
| Resumed MD = continuous MD                    | exact float equality (positions, velocities, energy) | `packages/core/test/md.test.ts`, `packages/cli/test/cli.test.ts` |
| Translation invariance of energy              | < 1e-9 eV                                            | `packages/core/test/lj.test.ts`                                  |
| Zero net force in periodic cell               | < 1e-9 eV/Å                                          | TS + Rust tests                                                  |
| RDF first peak at a/√2, coordination 12       | ±0.5 atoms                                           | `packages/core/test/analysis.test.ts`                            |
| Heat solver vs analytic sine mode             | max abs error < 5e-4                                 | `packages/core/test/heat1d.test.ts`                              |
| TS ↔ Rust energy/forces                       | abs < 1e-10                                          | `crates/compute-core/src/lib.rs`                                 |
| TS ↔ WASM energy/forces                       | abs < 1e-10, 13 tests incl. arena                    | `packages/wasm/test/`                                            |
| TS ↔ WASM relaxation minimum                  | abs < 1e-8 eV, 3 tests                               | `packages/wasm/test/kernels.test.ts`                             |
| TS ↔ WASM first MD step                       | abs < 1e-10, same seed                               | `packages/wasm/test/kernels.test.ts`                             |
| In-browser cross-check                        | tolerance 1e-8, asserted in E2E                      | worker + `tests/e2e`                                             |
| TS ↔ Python structure identity hash           | exact equality                                       | `python/.../tests/test_structure.py`                             |
| Silicon density 2.329 g/cm³                   | within 1 %                                           | `packages/core/test/structure.test.ts`                           |
| NaCl density 2.165 g/cm³                      | within 1.5 %                                         | TS + Python tests                                                |
| Archive tamper detection                      | checksum mismatch reported                           | TS + Python tests                                                |
| Archive path traversal                        | rejected                                             | TS + Python tests                                                |
| MCP tool round-trip                           | official SDK client passes                           | `python/.../tests/test_mcp.py`                                   |
| MCP budget/approval refusals                  | 5 tests                                              | `python/.../tests/test_mcp.py`                                   |
| Full acceptance workflow                      | 7 Playwright tests pass                              | `tests/e2e/workflow.spec.ts`                                     |
| CPU vs WASM timings                           | parity gate passed; baseline recorded                | `benchmarks/results/latest.json`                                 |

## Native hardware tested

- Windows 11 x64, AMD Ryzen 7 7735HS (16 threads), 24 GB RAM, Radeon 680M (Vulkan-capable).
- The CPU reference path was used for all test runs; no Vulkan or WebGPU kernel exists yet.

## Deployment

- `vercel.json` and `.vercelignore` configure a static deployment of `apps/web/dist`.
- The project is linked locally as `hcsmediacorp/hcs-material-research-kit`.
- See the "Deployment evidence" section below for the URL and smoke test performed for this
  release. If no URL is listed, no deployment has been verified.

## Browser/device matrix tested

- **Automated** (Chromium 144, production bundle): create → validate → run energy → run NVE MD →
  MSD → report download → project export → re-import with checksum verification; element
  refusal; language/theme persistence; mobile viewport without horizontal overflow.
- Manual (Chrome, Windows 11, 930×866 and 1280×800): visual review of both themes.
- Firefox/Safari: not tested in this workspace.
- WebGPU: adapter present (with a benign `powerPreference` warning on Windows); unused.

## CI state

- `.github/workflows/ci.yml` runs five jobs: typecheck/unit/build + benchmark parity, Node 24
  (non-blocking), Rust (fmt, clippy, parity, fixture and WASM drift), Python 3.12/3.13, and
  Playwright E2E (Chromium).
- The workflow executed for the first time on 2026-11-03. All release jobs are green on
  `release/0.2.0`; the release run is linked in the GitHub release notes.
- Local equivalent: `npm run verify` plus `npm run test:python`.

## Security/license state

- `npm audit`: 0 vulnerabilities with npm 11.21.1.
- No secrets in the repository; `.env*` ignored.
- MIT license for HCS code; third-party notices documented per engine.
- Archive and file parsers are bounded and reject unsafe paths.
- The MCP simulation tool runs without a shell, forwards only a fixed environment allow-list,
  confines output to the workspace and enforces workload budgets.

## Current blockers

1. Vercel preview/production deployment depends on the account's 24 h deployment window
   (`api-deployments-free-per-day`, Hobby: 100 deployments/day). See deployment evidence.
2. GPU kernel validation requires a WebGPU-capable CI runner (not available yet).
3. External scientific engines require licensed installations and isolated environments.

## Next 5 concrete tasks (v0.3.0)

1. WebGPU kernel (energy at minimum) with a CPU fallback and parity tests against WASM.
2. Tauri shell with engine manager and honest unavailable states.
3. OPTIMADE 1.3 provider connector with provenance, caching and rate limiting.
4. Publication dry-run (`npm pack`, `python -m build`) without publishing.
5. Checkpoint/resume in the browser workbench (currently CLI-only).

## Deployment evidence

- **Production URL:** https://hcs-material-research-kit.vercel.app
- **Deployed:** 2026-11-03 21:40 UTC, Vercel CLI 65.9.0, project
  `hcsmediacorp/hcs-material-research-kit` (static build of `apps/web/dist`), from the
  release commit `c24db2c` (tag `v0.2.0`).
- **HTTP check:** `200 OK`, `text/html; charset=utf-8`, 1054 bytes, with
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` and HSTS present;
  `X-Vercel-Cache: HIT`.
- **Smoke test:** the full Playwright acceptance suite was run against the URL
  (`HCS_E2E_BASE_URL=https://hcs-material-research-kit.vercel.app`) and passed
  7/7 in 12.6 s, including the WASM energy job, NVE MD + MSD, report download and
  archive re-import with checksum verification.
