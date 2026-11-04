# Current Status

**Date:** 2026-11-04
**Branch:** `main` (release built on `release/0.3.0`)
**Repository:** https://github.com/timfromhcs/hcs-material-research-kit
**Version:** 0.3.0 "Frontier" — the all-platform release

## What changed in 0.3.0

- **Real materials physics:** a Stillinger–Weber silicon engine (two- and three-body terms,
  1985 parameters, analytic forces) alongside the Lennard-Jones reference.
- **Finite temperature:** BAOAB Langevin NVT with a bit-reproducible thermostat; NPT is still
  refused because there is no barostat.
- **GPU tier:** a WGSL Lennard-Jones kernel with worker dispatch, WASM/CPU fallback and a
  mandatory f64 CPU cross-check for every GPU result.
- **Characterization:** powder XRD with 99 published atomic scattering coefficient sets,
  multiplicity by reciprocal-space enumeration, a Studio panel and CSV export.
- **Desktop:** a Tauri 2 shell that loads the same studio, with NSIS and MSI installers built
  and launched locally.
- **Data:** an OPTIMADE 1.3 client (CLI + MCP) with a provider allow-list, disk cache, rate
  limiting and per-record provenance.
- **Agents:** loopback Streamable HTTP for MCP with a bearer token, in addition to stdio.
- **Toolchain:** React 19, Vite 8, Vitest 5, three 0.187, TypeScript 5.9.

## Working product surfaces

- **Browser studio** (`apps/web`): Dashboard, Structure Studio, Simulation Workbench, Jobs,
  Data & Provenance, Settings. Static Vite build, HashRouter, EN/DE/FR, dark/light, command
  palette (Ctrl/Cmd-K), responsive down to 390 px. The footer and Settings show `CORE_VERSION`.
- **Desktop app** (`apps/desktop`): Tauri 2.12, same studio build, one read-only `app_info`
  command, explicit CSP, NSIS + MSI. Unsigned.
- **Automated end-to-end suite** (`tests/e2e`): ten Playwright tests against the production
  bundle, covering the full acceptance workflow, SW silicon, NVT, XRD/CSV, the palette,
  downloads, archive re-import and a 390 px viewport.
- **Structure Studio**: nine prototypes, import of CIF/POSCAR/XYZ/extXYZ/HCS JSON, supercells,
  substitution, vacancies, atom insertion/movement, distance/angle measurement, validation,
  3D viewer (WebGL2), export in four formats, live XRD panel.
- **Simulation Workbench**: engine and model selection, single-point energy, FIRE relaxation,
  NVE and Langevin NVT MD with trajectory, RDF; Web Worker execution, progress, hard cancel,
  MSD from trajectory, reproducibility report.
- **Jobs**: lifecycle table and event log per job.
- **Data & Provenance**: provenance record, fidelity taxonomy, engine/model notes, archive
  integrity check.
- **Python CLI** (`hcs-materials`): doctor, hardware, engines, structure validate/convert,
  project create/validate, report build, OPTIMADE providers/info/search/fetch.
- **Node simulation CLI** (`hcs-sim`): inspect, engines, run with CPU/WASM; status/result/
  provenance/report/log plus trajectory, relaxed structure and `checkpoint.json`; `--resume`.
- **MCP server** (`hcs-materials-mcp`): stdio and loopback Streamable HTTP; ten tools
  (including bounded OPTIMADE search and the approval-gated `simulations_run`), two resources,
  two prompts.
- **Rust crate** (`hcs-compute-core`): switched Lennard-Jones energy/forces, parity-tested.
- **WASM kernel** (`@hcs-materials/wasm`): the Rust kernel compiled to wasm32-unknown-unknown,
  with a reusable buffer arena.
- **WebGPU kernel** (`@hcs-materials/webgpu`): WGSL energy/forces for single-point jobs.

## Completed capabilities

- Canonical JSON Schema contracts (7 schemas) with runtime validation in TypeScript and Python.
- Structure identity hashing stable across TypeScript, Rust and Python.
- Periodic cell mathematics, minimum-image distances, validation checks.
- File IO with explicit failure modes and documented subsets.
- Job state machine with illegal-transition rejection and structured events.
- Provenance records with input hashes, environment, units, model parameters and limitations.
- MD checkpoint/restart that reproduces a continuous run bit-for-bit, including NVT.
- `.hcsproj` archive writer/reader with checksums, size limits and path-traversal rejection.
- Portable HTML reproducibility report.
- Cross-language reference fixtures and parity test (TS ↔ Rust, TS ↔ Python).
- Reusable WASM buffer arena; WebGPU buffer lifecycle with explicit destruction.
- Approval-gated MCP simulation tool with hard workload budgets and typed refusals.
- OPTIMADE 1.3 import with caching, rate limiting, allow-list and licence metadata.
- CI that has actually run: typecheck/unit/build, benchmark parity, Rust, Python 3.12/3.13,
  Node 24 signal, Playwright E2E, and a desktop bundle matrix.

## Known limitations

- Only classical Stillinger–Weber silicon and Lennard-Jones noble gases; no DFT, ML potentials,
  LAMMPS, CALPHAD or phase field beyond the 1D heat solver.
- O(N²) pair loops (O(N·z²) for SW triplets); UI limits 20 000 atoms for supercells, 5 000 for MD.
- NVE and Langevin NVT only; no barostat, so NPT is refused.
- WebGPU runs single-point energy/force jobs only; MD and relaxation use WASM/CPU.
- No slab builder, no elastic constants, no full space-group detection (lattice-metric symmetry
  only), no RO-Crate export.
- Desktop binaries are unsigned; Linux/macOS bundles are produced by CI.
- Browser storage can be evicted; there is no automatic backup.
- MCP HTTP is loopback-only with a shared token, not OAuth.
- OPTIMADE is not available in the browser (providers send no CORS headers).
- The committed WASM asset is built by a pinned toolchain; byte identity across operating
  systems is not claimed.

## Scientific validation evidence

| Check                                         | Result                                     | Where                                  |
| --------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| LJ forces = −∇E                               | rel. deviation < 1e-5                      | `packages/core/test/lj.test.ts`        |
| SW forces = −∇E                               | max deviation < 1e-5 eV/Å                  | `packages/core/test/sw.test.ts`        |
| SW three-body term vs explicit expression     | < 1e-12 eV                                 | `packages/core/test/sw.test.ts`        |
| SW ideal diamond energy                       | −4.3365 eV/atom                            | `packages/core/test/sw.test.ts`        |
| SW energy minimum                             | between 5.38 Å and 5.50 Å                  | `packages/core/test/sw.test.ts`        |
| SW NVE conservation, 64 atoms                 | < 1e-3 eV/atom over 200 steps              | `packages/core/test/sw.test.ts`        |
| Langevin NVT target                           | within 10 % of target                      | `packages/core/test/md.test.ts`        |
| Langevin NVT equipartition                    | ½k_BT per degree of freedom                | `packages/core/test/md.test.ts`        |
| NVT checkpoint/resume                         | bit-identical                              | `packages/core/test/md.test.ts`        |
| NVE energy conservation, 108 atoms, 400 steps | < 1e-3 eV/atom (observed ~3e-7)            | `packages/core/test/md.test.ts`        |
| WebGPU vs CPU (108 atoms)                     | ΔE 2.83e-6 eV, ΔF 1.93e-7 eV/Å             | `docs/plan/evidence/webgpu-parity.txt` |
| Si XRD 111/220/311                            | 28.44° / 47.30° / 56.12° ±0.05             | `packages/core/test/xrd.test.ts`       |
| Diamond-forbidden Si 200                      | absent                                     | `packages/core/test/xrd.test.ts`       |
| Wurtzite ZnO 002                              | 34.42°                                     | `packages/core/test/xrd.test.ts`       |
| TS ↔ Rust energy/forces                       | abs < 1e-10                                | `crates/compute-core/src/lib.rs`       |
| TS ↔ WASM energy/forces                       | abs < 1e-10, 13 tests                      | `packages/wasm/test/`                  |
| TS ↔ Python structure hash                    | exact equality                             | `python/.../tests/test_structure.py`   |
| Archive tamper detection / traversal          | reported / rejected                        | TS + Python tests                      |
| MCP stdio round-trip                          | official SDK client passes                 | `python/.../tests/test_mcp.py`         |
| MCP Streamable HTTP round-trip                | 10 tools, 2 resources, protocol 2026-07-28 | `docs/plan/evidence/mcp-http.txt`      |
| OPTIMADE live import                          | Al2O3 / LaNi5 / MgB2 from COD              | `docs/plan/evidence/optimade-live.txt` |
| Full acceptance workflow                      | 10 Playwright tests pass                   | `tests/e2e/workflow.spec.ts`           |

## Native hardware tested

- Windows 11 x64, AMD Ryzen 7 7735HS (16 threads), 24 GB RAM, Radeon 680M (Vulkan-capable).
- WebGPU ran in Chrome 144 through the automated suite; the kernel is f32 and cross-checked.
- The desktop NSIS and MSI installers were built on this machine; the release binary was launched
  and its window title verified. Installation and the other platforms are covered by CI.

## Deployment

- `vercel.json` and `.vercelignore` configure a static deployment of `apps/web/dist`.
- The project is linked locally as `hcsmediacorp/hcs-material-research-kit`.
- See the "Deployment evidence" section below for the URL and smoke test of this release.

## Browser/device matrix tested

- **Automated** (Chromium/Chrome 144, production bundle): create → validate → SW energy →
  XRD/CSV → NVE MD → NVT MD → MSD → report download → project export → re-import with checksum
  verification; command palette; language/theme persistence; 390 px without horizontal overflow.
- Manual (Chrome, Windows 11): visual review of dark and light themes at 1440×900 and 390×844.
- Firefox/Safari: not tested in this workspace.
- WebGPU: available in the automated Chrome run; unavailable in `about:blank` probes (secure
  context requirement) and on browsers without an adapter.

## CI state

- `.github/workflows/ci.yml`: five jobs (typecheck/unit/build + benchmark parity, Node 24,
  Rust, Python 3.12/3.13, Playwright). Green on the release commit:
  https://github.com/timfromhcs/hcs-material-research-kit/actions/runs/41818225953
- `.github/workflows/desktop.yml`: Tauri bundles on Windows, Ubuntu and macOS (unsigned). All
  three green: https://github.com/timfromhcs/hcs-material-research-kit/actions/runs/41818226014
- Local equivalent: `npm run verify:full` (verify + Python).

## Security/license state

- `npm audit`: 0 vulnerabilities.
- No secrets in the repository; `.env*` ignored.
- MIT license for HCS code; third-party notices documented per engine and dataset.
- Archive and file parsers are bounded and reject unsafe paths.
- The MCP simulation tool runs without a shell, forwards only a fixed environment allow-list,
  confines output to the workspace and enforces workload budgets.
- MCP HTTP binds loopback only and requires a bearer token; non-loopback binding needs an
  explicit override.

## Current blockers

1. Vercel deployments depend on the account's 24 h deployment window; see deployment evidence.
2. Desktop code signing requires certificates that do not exist here.
3. PyPI/npm publication requires tokens; this release ships a dry run and publish workflows.
4. External scientific engines require licensed installations and isolated environments.

## Next concrete tasks (v0.4.0)

1. Miller-index slab builder with an orthogonal-cell geometry suite.
2. Cubic elastic constants from strain-energy curvature.
3. Lattice-metric symmetry report (crystal system, centering candidates) and primitive-cell
   reduction; full space-group detection stays gated on a spglib bridge.
4. RO-Crate export for projects.
5. uMLIP adapter boundary (MACE/MatterSim) with a model card and an honest unavailable state.

## Deployment evidence

- **Production URL:** https://hcs-material-research-kit.vercel.app
- **Release:** https://github.com/timfromhcs/hcs-material-research-kit/releases/tag/v0.3.0
  (Windows NSIS + MSI attached; Linux/macOS bundles in the desktop workflow artifacts).
- **v0.3.0 build:** deployed 2026-11-04 from tag `v0.3.0`, Vercel CLI 65.9.0, project
  `hcsmediacorp/hcs-material-research-kit` (static build of `apps/web/dist`).
- **HTTP check:** `200 OK`, `text/html; charset=utf-8`, security headers present
  (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS),
  `X-Vercel-Cache: HIT`.
- **Smoke test:** the full Playwright acceptance suite was run against the URL with Chromium
  (the same browser as CI) and passed 10/10 in 27.6 s, including SW silicon, WebGPU energy,
  NVE and NVT MD, XRD/CSV, the command palette, report download, archive re-import and a
  390 px viewport with zero horizontal overflow.
- **v0.2.0 build:** deployed 2026-11-03 from `c24db2c`; smoke-tested 7/7.
