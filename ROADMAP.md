# Roadmap

Phase gates are evidence-based. A phase is complete when the gate is satisfied and linked, not
because code exists. See `STATUS.md` for the current state.

## Phase 0 — Repository audit, research refresh, technical design

| Task                        | State | Evidence                                                             |
| --------------------------- | ----- | -------------------------------------------------------------------- |
| Research brief and baseline | Done  | `HCS-Material-Research-Kit-RESEARCH.md`, `docs/research/baseline.md` |
| Upstream SDK reality (MCP)  | Done  | official SDK 2.3.0, protocol 2026-07-28, stdio + HTTP tests          |
| Architecture and decisions  | Done  | `docs/architecture/`, `docs/decisions/`                              |
| Contract design             | Done  | `schemas/*.schema.json`, validators in two languages                 |

## Phase 1 — Cross-platform foundation and product shell

| Task                                            | State | Evidence                                      |
| ----------------------------------------------- | ----- | --------------------------------------------- |
| React/Vite studio                               | Done  | `apps/web`, `vite build`                      |
| Brand system, responsive shell, command palette | Done  | desktop + 390 px screenshots, E2E             |
| DE/EN/FR i18n                                   | Done  | `apps/web/src/i18n/`                          |
| Design tokens and accessible primitives         | Done  | `packages/ui`, focus states, palette keyboard |
| Engine registry with honest unavailable states  | Done  | planned engines cannot run                    |
| Tauri desktop shell and Windows installers      | Done  | NSIS + MSI built and launched; CI matrix      |

## Phase 2 — Schemas, structure studio, project format

| Task                                         | State           | Evidence                                 |
| -------------------------------------------- | --------------- | ---------------------------------------- |
| JSON Schema contracts + bindings             | Done            | `schemas/`, Ajv, jsonschema              |
| CIF/POSCAR/XYZ/extXYZ IO                     | Done (subsets)  | round-trip tests, symop expansion test   |
| Lattice construction, supercells, validation | Done            | `build.ts`, `structure.ts` tests         |
| 3D viewer with selection, cell, bonds        | Done            | `packages/visualization`                 |
| `.hcsproj` parser/writer + checksums         | Done            | TS + Python tests                        |
| Miller-index slab builder                    | **Not started** | moved to 1.1; no partial builder shipped |
| Lattice-metric symmetry report               | **Not started** | full space-group detection needs spglib  |

## Phase 3 — Compute core, browser WASM, GPU

| Task                              | State                    | Evidence                                     |
| --------------------------------- | ------------------------ | -------------------------------------------- |
| CPU reference kernels             | Done                     | TS + Rust, parity 1e-10                      |
| Lennard-Jones workflow            | Done                     | energy/relax/NVE/NVT/RDF tests               |
| Stillinger–Weber silicon          | Done                     | analytic forces, lattice scan, NVE, 13 tests |
| Langevin NVT thermostat           | Done                     | target T, equipartition, bit-exact resume    |
| Analytic PDE verification         | Done                     | 1D heat equation                             |
| Jobs, progress, cancel            | Done                     | state machine, worker, hard cancel           |
| WASM compilation of the Rust core | Done                     | 13 parity tests, in-browser cross-check      |
| WebGPU energy/force kernel        | Done (single-point jobs) | ΔE 2.83e-6 eV vs CPU, E2E backend assertion  |
| WebGPU MD/relax                   | **Not started**          | requires an async job runner                 |
| Native wgpu/Vulkan path           | **Not started**          | crate is CPU-only                            |

## Phase 4 — Python package, CLI, external engines

| Task                                | State           | Evidence                                     |
| ----------------------------------- | --------------- | -------------------------------------------- |
| `hcs_materials` package + CLI       | Done (subset)   | 53 tests                                     |
| OPTIMADE 1.3 import                 | Done            | live COD query, CLI + MCP, cache/rate limit  |
| ASE bridge                          | **Not started** |                                              |
| LAMMPS adapter                      | **Not started** |                                              |
| MACE / MatterSim / MatGL adapters   | **Not started** | adapter boundary + model card required first |
| CP2K / Quantum ESPRESSO preparation | **Not started** |                                              |
| Engine installer/manager            | **Not started** |                                              |

## Phase 5 — Databases and materials informatics

| Task                    | State             | Evidence                                    |
| ----------------------- | ----------------- | ------------------------------------------- |
| OPTIMADE 1.3 federation | Done (structures) | 4 verified providers, provenance per record |
| OQMD/AFLOW/NOMAD direct | Via OPTIMADE      | no separate connectors                      |
| Materials Project key   | **Not started**   | no API-key handling                         |

## Phase 6 — Discovery Lab

**Not started.** No candidate generation, no ML screening, no hull metrics. The UI has no
Discovery page by design — it would be a fake surface.

## Phase 7 — MCP and research agents

| Task                      | State           | Evidence                                           |
| ------------------------- | --------------- | -------------------------------------------------- |
| MCP 2026-07-28 stdio      | Done            | official SDK client tests                          |
| Strict tool schemas       | Done            | 10 tools, typed                                    |
| Simulation tools over MCP | Done            | approval-gated, bounded, 5 refusal tests           |
| Loopback Streamable HTTP  | Done            | bearer token, 1 MB cap, official-client round-trip |
| Agent audit panel         | **Not started** |                                                    |

## Phase 8 — Polish, documentation, packaging, launch

| Task                    | State                   | Evidence                                        |
| ----------------------- | ----------------------- | ----------------------------------------------- |
| Documentation set       | Done for this slice     | `README.md`, `docs/`                            |
| Windows installers      | Done (unsigned)         | NSIS + MSI built and launched                   |
| Linux/macOS installers  | CI matrix               | `.github/workflows/desktop.yml`                 |
| PyPI/npm publication    | Dry run + workflows     | no tokens; names verified free                  |
| GitHub repository + CI  | Done                    | public repo, green runs linked in `STATUS.md`   |
| Vercel project + config | See deployment evidence | linked `hcsmediacorp/hcs-material-research-kit` |
| Security/license audit  | Partial                 | `SECURITY.md`, engine notes                     |

## Phase 9 — Advanced research expansion

Not started, and intentionally gated behind a stable release. Candidates: full space-group
detection, phonons, elastic constants, RO-Crate export, uMLIP adapters, NPT barostat.
