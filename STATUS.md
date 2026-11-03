# Current Status

**Date:** 2026-11-03
**Branch:** `main` (local repository, no remote configured yet)
**Version:** 0.1.0 — development preview

## Working product surfaces

- **Browser studio** (`apps/web`): Dashboard, Structure Studio, Simulation Workbench, Jobs,
  Data & Provenance, Settings. Static Vite build, HashRouter, EN/DE/FR, dark and light theme,
  responsive down to 390 px.
- **Automated end-to-end suite** (`tests/e2e`): seven Playwright tests against the production
  bundle, covering the full acceptance workflow including downloads and archive re-import.
- **Structure Studio**: create 9 prototypes, import CIF/POSCAR/XYZ/extXYZ/HCS JSON, supercells,
  substitution, vacancies, atom insertion/movement, validation panel, 3D viewer (Three.js,
  WebGL2), export in four formats.
- **Simulation Workbench**: single-point energy, FIRE relaxation, NVE MD (with trajectory),
  RDF; Web Worker execution, progress, hard cancel, MSD from trajectory, reproducibility
  report download.
- **Jobs**: lifecycle table and event log per job.
- **Data & Provenance**: provenance record, fidelity taxonomy, engine/model notes, archive
  integrity check.
- **Python CLI** (`hcs-materials`): doctor, hardware, engines list/inspect, structure
  validate/convert, project create/validate, report build.
- **MCP server** (`hcs-materials-mcp`, stdio): engines_list, structures_validate,
  structures_convert, project_validate + 2 resources + 2 prompts.
- **Rust crate** (`hcs-compute-core`): switched Lennard-Jones energy/forces, parity-tested.

## Completed capabilities

- Canonical JSON Schema contracts (7 schemas) with runtime validation in TypeScript and Python.
- Structure identity hashing that is stable across TypeScript, Rust and Python.
- Periodic cell mathematics, minimum-image distances, validation checks.
- File IO with explicit failure modes and documented subsets.
- Job state machine with illegal-transition rejection and structured events.
- Provenance records with input hashes, environment, units and limitations.
- `.hcsproj` archive writer/reader with checksums, size limits and path-traversal rejection.
- Portable HTML reproducibility report.
- Cross-language reference fixtures and parity test (TS ↔ Rust, TS ↔ Python).

## Capabilities in progress

- MCP simulation tools (blocked until a stable job API is exposed over MCP).
- OPFS artefacts beyond trajectories (currently only trajectories are written to OPFS).
- WASM build of the Rust kernel (parity test next).

## Known limitations

- Only classical Lennard-Jones (He, Ne, Ar, Kr, Xe) and a 1D heat solver are implemented.
- O(N²) pair loops; the UI limit is 20 000 atoms for supercells and 5 000 for MD.
- NVE only; no thermostat or barostat.
- No Tauri desktop app, no installers, no PyPI/npm publication, no CI run on GitHub yet.
- The 3D viewer uses WebGL2; no WebGPU renderer is implemented.
- Browser storage can be evicted; there is no automatic backup.
- MCP stdio only; loopback HTTP transport is not implemented.

## Scientific validation evidence

| Check | Result | Where |
|---|---|---|
| Forces = −∇E (central differences) | rel. deviation < 1e-5 | `packages/core/test/lj.test.ts` |
| LJ pair minimum at 2^(1/6)σ = −ε | abs < 1e-12 eV | `packages/core/test/lj.test.ts` |
| fcc cohesive energy bracket (truncated) | −9ε < E/atom < −6.5ε | `packages/core/test/lj.test.ts` |
| NVE energy conservation, 108 atoms, 400 steps | < 1e-3 eV/atom (observed ~3e-7) | `packages/core/test/md.test.ts` |
| Translation invariance of energy | < 1e-9 eV | `packages/core/test/lj.test.ts` |
| Zero net force in periodic cell | < 1e-9 eV/Å | TS + Rust tests |
| RDF first peak at a/√2, coordination 12 | ±0.5 atoms | `packages/core/test/analysis.test.ts` |
| Heat solver vs analytic sine mode | max abs error < 5e-4 | `packages/core/test/heat1d.test.ts` |
| TS ↔ Rust energy/forces | abs < 1e-10 | `crates/compute-core/src/lib.rs` |
| TS ↔ Python structure identity hash | exact equality | `python/.../tests/test_structure.py` |
| Silicon density 2.329 g/cm³ | within 1 % | `packages/core/test/structure.test.ts` |
| NaCl density 2.165 g/cm³ | within 1.5 % | TS + Python tests |
| Archive tamper detection | checksum mismatch reported | TS + Python tests |
| Archive path traversal | rejected | TS + Python tests |
| MCP tool round-trip | official SDK client passes | `python/.../tests/test_mcp.py` |
| Full acceptance workflow | 7 Playwright tests pass | `tests/e2e/workflow.spec.ts` |

## Native hardware tested

- Windows 11 x64, AMD Ryzen 7 7735HS (16 threads), 24 GB RAM, Radeon 680M (Vulkan-capable).
- The CPU reference path was used for all test runs; no Vulkan or WebGPU kernel exists yet.

## Browser/device matrix tested

- **Automated** (Chromium 144, production bundle): create → validate → run energy → run NVE MD →
  MSD → report download → project export → re-import with checksum verification; element
  refusal; language/theme persistence; mobile viewport without horizontal overflow.
- Manual (Chrome, Windows 11, 930×866 and 1280×800): visual review of both themes.
- Firefox/Safari: not tested in this workspace.
- WebGPU: adapter present (with a benign `powerPreference` warning on Windows); unused.

## CI state

- `.github/workflows/ci.yml` defines four jobs: typecheck/unit/build, Rust (fmt, clippy, parity,
  fixture drift), Python (CLI + MCP) and Playwright E2E (Chromium).
- **Not yet executed on GitHub** — no remote is configured in this workspace. Do not claim a
  green CI badge until it has run.
- Local equivalent: `npm run verify` plus `npm run test:e2e`.

## Security/license state

- `npm audit`: 0 vulnerabilities after upgrading React Router to 7.18.5 and Vitest to 4.1.12
  (see `SECURITY.md`; npm 11 is required to install the tree).
- No secrets in the repository; `.env*` ignored.
- MIT license for HCS code; third-party notices documented per engine.
- Archive and file parsers are bounded and reject unsafe paths.

## Current blockers

1. No remote/GitHub Actions run yet, so the CI workflow is defined but unproven.
2. GPU kernel validation requires a WebGPU-capable CI runner (not available yet).
3. External scientific engines require licensed installations and isolated environments.

## Next 5 concrete tasks

1. Compile `compute-core` to WASM and add TS ↔ WASM parity plus a worker backend switch.
2. Implement MCP simulation tools over a stable, approval-gated job API.
3. Add checkpoint/restart for long MD runs (cooperative pause).
4. Add a Tauri shell and engine manager skeleton with honest unavailable states.
5. Build the OPTIMADE provider connector with provenance and rate limiting.
