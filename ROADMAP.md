# Roadmap

Phase gates are evidence-based. A phase is not complete because code exists; it is complete
when the gate below is satisfied and linked. See `STATUS.md` for the current state.

## Phase 0 — Repository audit, research refresh, technical design

| Task | State | Evidence |
|---|---|---|
| Research brief and baseline | Done | `HCS-Material-Research-Kit-RESEARCH.md`, `docs/research/baseline.md` |
| Verify upstream SDK reality (MCP v2, pip `mcp` 2.3.0) | Done | `python/.../tests/test_mcp.py` runs against the official SDK |
| Architecture, decisions | Done | `docs/architecture/`, `docs/decisions/` |
| Contract design | Done | `schemas/*.schema.json`, validators in two languages |
| Baseline build/test report | Done | `README.md`, `STATUS.md` |

**Gate status:** met for the implemented slice. Naming/registry availability checks
(npm scope `@hcs-materials`, PyPI `hcs-materials`) are **not** verified and must happen
before any publication.

## Phase 1 — Cross-platform foundation and product shell

| Task | State | Evidence |
|---|---|---|
| React/Vite studio | Done | `apps/web`, `vite build` |
| Brand system and responsive shell | Done | `apps/web/public/brand/*`, desktop + 390 px checks |
| DE/EN/FR i18n | Done | `apps/web/src/i18n/` |
| Design tokens and accessible primitives | Done | `packages/ui`, visible focus states |
| Engine registry UI with honest unavailable states | Done | `PLANNED_ENGINES` rendered as "not runnable" |
| Tauri desktop shell | **Not started** | — |

**Gate status:** browser part met; desktop app not started.

## Phase 2 — Schemas, structure studio, project format

| Task | State | Evidence |
|---|---|---|
| JSON Schema contracts + bindings | Done | `schemas/`, Ajv, jsonschema |
| CIF/POSCAR/XYZ/extXYZ IO | Done (subsets) | round-trip tests, symop expansion test |
| Lattice construction, supercells, validation | Done | `build.ts`, `structure.ts` tests |
| 3D viewer with selection, cell, bonds | Done | `packages/visualization` |
| `.hcsproj` parser/writer + checksums | Done | TS + Python tests |
| Symmetry analysis via spglib | **Not started** | requires native bridge |

**Gate status:** met for the documented subsets; symmetry analysis is future work.

## Phase 3 — Compute core, browser WASM, GPU

| Task | State | Evidence |
|---|---|---|
| CPU reference kernels | Done | TS + Rust, parity 1e-10 |
| One validated classical workflow | Done | LJ energy/relax/NVE/RDF with tests |
| Analytic PDE verification | Done | 1D heat equation |
| Jobs, progress, cancel | Done | state machine, worker, hard cancel |
| WASM compilation of the Rust core | Done (energy, relax, MD) | `crates/compute-wasm`, 11 parity tests, in-browser cross-check, E2E backend assertion |
| WebGPU kernels + CPU fallback | **Not started** | capability probe only |
| Native wgpu/Vulkan path | **Not started** | crate is CPU-only |

**Gate status:** WASM parity exists for every implemented atomistic task. GPU paths remain
unimplemented and are not claimed.

## Phase 4 — Python package, CLI, external engines

| Task | State | Evidence |
|---|---|---|
| `hcs_materials` package + CLI | Done (subset) | 32 tests |
| ASE bridge | **Not started** | |
| LAMMPS adapter | **Not started** | |
| MACE / MatterSim / MatGL adapters | **Not started** | |
| CP2K / Quantum ESPRESSO preparation | **Not started** | |
| Engine installer/manager | **Not started** | |

**Gate status:** not met.

## Phase 5 — Databases and materials informatics

All items (OPTIMADE, OQMD, AFLOW, Materials Cloud, NOMAD, Materials Project) are **not
started**. No API key handling exists yet, so no connector may be advertised.

## Phase 6 — Discovery Lab

**Not started.** No candidate generation, no ML screening, no hull metrics. The UI has no
Discovery page by design — it would be a fake surface.

## Phase 7 — MCP v2 and research agents

| Task | State | Evidence |
|---|---|---|
| MCP v2 stdio server | Done (subset) | official SDK client tests |
| Strict tool schemas | Done | 4 tools, typed |
| Simulation tools over MCP | **Not started** | needs stable job API + approval flow |
| Loopback HTTP transport | **Not started** | stdio only |
| Agent audit panel | **Not started** | |

**Gate status:** partially met; destructive/heavy operations are absent rather than gated.

## Phase 8 — Polish, documentation, packaging, launch

| Task | State | Evidence |
|---|---|---|
| Documentation set | Done for this slice | `README.md`, `docs/` |
| Windows/Linux installers | **Not started** | |
| PyPI/npm publication | **Not started** | names unverified |
| Vercel project + config | Prepared, deployment blocked | linked `hcsmediacorp/hcs-material-research-kit`; quota `api-deployments-free-per-day` |
| Security/license audit | Partial | `SECURITY.md`, engine notes |

**Gate status:** not met. A preview deployment must succeed and be smoke-tested before this
phase can close.

## Phase 9 — Advanced research expansion

Not started, and intentionally gated behind a stable release.
