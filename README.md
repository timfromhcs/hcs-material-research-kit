# HCS Material Research Kit

**A local-first virtual materials research studio.** Build and validate atomic structures, run
documented classical calculations — in the browser, on the desktop, or from a CLI — and export a
reproducible research record with provenance.

> Made with love by **hcsmedia** and **timfromhcs**.

**Repository:** https://github.com/timfromhcs/hcs-material-research-kit
**Live studio:** https://hcs-material-research-kit.vercel.app

[![tests](https://img.shields.io/badge/TypeScript%20tests-169%20passing-4fd6c4)](#verification)
[![rust](https://img.shields.io/badge/Rust%20tests-9%20passing-4fd6c4)](#verification)
[![python](https://img.shields.io/badge/Python%2FMCP-53%20passing-4fd6c4)](#verification)
[![e2e](https://img.shields.io/badge/Playwright%20E2E-10%20passing-4fd6c4)](#verification)
[![ci](https://github.com/timfromhcs/hcs-material-research-kit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/timfromhcs/hcs-material-research-kit/actions/workflows/ci.yml)

---

## What this is (v0.3.0 "Frontier")

A working local-first workbench, not a mock-up and not a cloud service:

| Capability                                                                 | State                            | Evidence                                                    |
| -------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| **Stillinger–Weber silicon** — two- and three-body classical potential     | Implemented                      | analytic forces vs numerical gradient, lattice scan, NVE    |
| **Lennard-Jones noble gases** — energy, FIRE relaxation, MD, RDF           | Implemented                      | force-vs-gradient, energy conservation, RDF coordination 12 |
| **NVE and Langevin NVT** — BAOAB splitting, bit-reproducible thermostat    | Implemented                      | target temperature, equipartition, bit-exact resume         |
| **WebGPU kernel** — WGSL Lennard-Jones energy/forces                       | Implemented (single-point jobs)  | ΔE 2.83e-6 eV, ΔF 1.93e-7 eV/Å vs the f64 CPU kernel        |
| **Powder XRD** — structure factor, 99 published form factors, multiplicity | Implemented                      | Si 111/220/311 at 28.44°/47.30°/56.12°, ZnO 002 at 34.42°   |
| **Structure Studio** — prototypes, supercells, substitution, vacancies     | Implemented                      | E2E, unit tests, 3D viewer                                  |
| **CIF / POSCAR / XYZ / extXYZ / HCS JSON** import and export               | Implemented (documented subsets) | round-trip fixtures, symmetry-operation expansion           |
| **Distance/angle measurement** with periodic minimum images                | Implemented                      | unit tests + E2E                                            |
| **MD checkpoint and restart** — `hcs-sim --resume`                         | Implemented                      | resumed run is bit-identical to a continuous run            |
| **Job lifecycle, events, warnings, provenance**                            | Implemented                      | state-machine tests, job tests                              |
| **`.hcsproj` archive** with checksums and path safety                      | Implemented                      | tamper/traversal tests (TS + Python)                        |
| **Browser studio** — EN/DE/FR, dark/light, command palette, 390 px         | Implemented                      | Vite build, Playwright E2E                                  |
| **Desktop app** — Tauri 2, Windows NSIS + MSI installers                   | Implemented (unsigned)           | built and launched locally; CI matrix for Linux/macOS       |
| **WASM backend** — energy, relaxation, MD                                  | Implemented                      | 13 parity tests, E2E asserts backend                        |
| **Rust CPU kernel** — cross-language parity                                | Implemented                      | 1e-10 eV agreement with TypeScript                          |
| **Node CLI** (`hcs-sim`)                                                   | Implemented                      | 8 CLI tests                                                 |
| **Python CLI** (`hcs-materials`)                                           | Implemented                      | 53 tests                                                    |
| **OPTIMADE 1.3 import** — cached, rate-limited, provenance                 | Implemented (Python/desktop)     | live COD query, 10 tests                                    |
| **MCP server** — stdio + loopback Streamable HTTP, approval-gated runs     | Implemented                      | 10 tools, 2 resources, official-client round-trip           |
| **Reproducible benchmark harness**                                         | Implemented                      | committed baseline with a parity gate                       |
| DFT, LAMMPS, ML potentials, NPT, slabs, elastic constants                  | **Not implemented**              | see `ROADMAP.md` — never faked                              |

The browser, desktop, CLI and Python editions share schemas, file formats, workflows and
provenance. They do **not** share every solver: the browser has no Python engines, and the
Python package does not embed the TypeScript kernels. `docs/engines/engine-registry.md` states
this explicitly.

## Install and run

### Browser

Open https://hcs-material-research-kit.vercel.app. Nothing is uploaded; computation runs in a
Web Worker and results stay in your browser.

### Windows desktop

The v0.3.0 release publishes an NSIS installer and an MSI built from this repository. They are
**unsigned**: Windows SmartScreen will warn, and the release notes say so. Linux and macOS
bundles are produced by the `desktop` CI workflow, not on this machine.

### From source

```bash
# npm 11 is required (npm 10 cannot resolve the Vitest 5 peer graph)
npm install
npm run build

npm run dev            # studio at http://localhost:5173

npm test               # 169 TypeScript tests
npm run test:rust      # 9 Rust tests (kernels + desktop command)
npm run test:python    # 53 Python/MCP tests (finds .venv automatically)
npm run test:e2e       # 10 Playwright acceptance tests
```

Desktop development:

```bash
cd apps/desktop
npm run dev            # builds the studio, then opens the Tauri window
npm run build          # NSIS + MSI in src-tauri/target/release/bundle
```

Python package:

```bash
python scripts/sync-python-schemas.py
cd python/hcs_materials
uv venv && uv pip install -e ".[dev]"
.venv/Scripts/python.exe -m pytest
```

Simulation CLI:

```bash
npm run build:packages
node packages/cli/dist/index.js inspect tests/fixtures/structures/silicon.cif
node packages/cli/dist/index.js run --structure ar.json --spec spec.json --out ./run-001
node packages/cli/dist/index.js run --structure ar.json --spec spec-2.json --out ./run-002 \
  --resume ./run-001/checkpoint.json
```

## Three real workflows

**1. Silicon with a many-body potential (browser).** Create **Silicon (diamond)**, build a
2×2×2 supercell (64 atoms — the smallest cell that supports the SW cutoff), open the Workbench
and run a single-point energy: −4.3365 eV/atom, with the 1985 parameter source in the
provenance. The 1×1×1 cell is refused with the required supercell size.

**2. Liquid argon with a thermostat (browser).** Create **Argon (fcc, LJ reference)** (108
atoms), choose **NVT — Langevin thermostat**, target 300 K, friction 10/ps, and run. The result
reports the realised mean temperature, the ensemble, the friction and the stochastic nature of
a single trajectory.

**3. Import a real structure and diffract it.** `hcs-materials optimade search --provider cod
--filter 'nelements=2' --limit 3 --out ./imported` writes validated HCS structures with
provider, record id and licence. Open one in the studio: the Powder XRD panel shows the peak
list and exports CSV.

Everything stays local. There is no account, no telemetry and no upload endpoint.

## Scientific honesty rules enforced in code

- Every result carries a fidelity label, units, model id, parameters, convergence status,
  limitations and the kernel backend that produced it (`cpu`, `wasm` or `webgpu`).
- `ResultBundle` cannot be created without `limitations` and `convergence`.
- An engine is only selectable when it exists in the registry. Planned engines are listed
  separately with `status: not_implemented` and cannot run.
- A fidelity level the engine does not declare is rejected (`fidelity_mismatch`).
- A model the engine does not declare is rejected (`model_not_declared_by_engine`).
- Unknown elements are refused, never assigned invented parameters.
- A many-body cutoff is never truncated: a too-small cell is refused with the required
  supercell size.
- NPT is rejected: there is a thermostat, but no barostat, so no pressure-controlled claim.
- CIF space-group symbols are not expanded without explicit symmetry operations; the reader
  warns instead of silently dropping atoms.
- A POSCAR without a species line becomes `X1…Xn` with a warning; elements are not guessed.
- WebGPU results are cross-checked against the f64 CPU kernel before they are shown; provenance
  records `float32` for the GPU path.
- XRD refuses elements without published scattering coefficients instead of inventing a form
  factor.
- Results never claim laboratory proof, synthesis or certification.

## Verification

Current local evidence (Windows 11, Node 22.23, Python 3.14, Rust 1.96, Chrome 144):

```text
TypeScript  169 tests passing   vitest run (incl. SW, NVT, XRD, WebGPU, WASM parity)
Rust          9 tests passing   cargo test (5 core + 3 wasm + 1 desktop)
Python       53 tests passing   pytest (OPTIMADE, MCP stdio + HTTP, archives)
Playwright   10 tests passing   production bundle, Chrome, WASM/WebGPU backends
Web build    vite build ok      ~381 kB app + 559 kB three + 236 kB worker + 58 kB wasm
npm audit    0 vulnerabilities
```

Key scientific checks:

- forces equal the negative numerical energy gradient for both potentials (rel. < 1e-5);
- Stillinger–Weber silicon: −4.3365 eV/atom at the ideal diamond cell, energy minimum between
  5.38 Å and 5.50 Å, NVE drift < 1e-3 eV/atom;
- NVE total-energy drift < 1e-3 eV/atom over 400 steps on a 108-atom argon cell;
- Langevin NVT reaches the target within 10 % and satisfies equipartition; resume is
  bit-identical;
- TypeScript and Rust agree within **1e-10 eV** on a 32-atom reference structure;
- WebGPU (f32) agrees with TypeScript (f64) within 2.83e-6 eV and 1.93e-7 eV/Å on 108 atoms;
- XRD: Si 111/220/311 at 28.44°/47.30°/56.12° ±0.05°, diamond-forbidden 200 absent, wurtzite
  ZnO 002 at 34.42°;
- 1D heat solver matches the analytic Fourier-mode decay within 5e-4;
- fcc RDF first peak at `a/√2`, coordination number 12 ± 0.5;
- silicon diamond density 2.329 g/cm³ and rock-salt NaCl 2.165 g/cm³ within 1.5 %.

CI runs five jobs (TypeScript/unit/build + benchmark parity, Node 24 signal, Rust, Python
3.12/3.13, Playwright) and a `desktop` matrix for Windows/Linux/macOS bundles.

## Repository layout

```text
apps/web                 React studio (static, Vite) — local computation only
apps/desktop             Tauri 2 shell and bundle configuration
packages/contracts       Canonical JSON Schemas + Ajv validators
packages/core            Domain model, IO, kernels (LJ, SW, XRD, MD, relax), jobs, archives
packages/ui              Design tokens + accessible primitives (hand-written CSS)
packages/visualization   Three.js structure viewer, accessible SVG plots
packages/wasm            WASM loader + committed hcs_compute.wasm (+ manifest)
packages/webgpu          WGSL Lennard-Jones kernel and availability probe
packages/cli             hcs-sim: local simulation runner (CPU/WASM), reports and records
crates/compute-core      Rust CPU kernel, parity-tested against the TS reference
crates/compute-wasm      C-ABI entry points for wasm32-unknown-unknown
python/hcs_materials     CLI, OPTIMADE client, project archives, MCP server
schemas/                 Single source of truth for all contracts
tests/fixtures           Structure fixtures and cross-language reference outputs
docs/                    Science, architecture, decisions, security, tutorials
```

## Status and limits

Read `STATUS.md` for what is done, what is blocked and what comes next, and `ROADMAP.md` for the
phase gates. Known limitations of this release:

- the atomistic engines are **classical**: Stillinger–Weber silicon and Lennard-Jones noble
  gases; there is no DFT, no ML potential and no LAMMPS adapter;
- O(N²) pair loops (O(N·z²) for SW triplets); the UI limits are 20 000 atoms for supercells and
  5 000 for MD;
- NVE and Langevin NVT only — **no barostat**, so NPT is refused;
- WebGPU accelerates single-point energy/force jobs; MD and relaxation stay on WASM/CPU because
  the reference runner is synchronous;
- no slab builder and no elastic constants yet (moved to 1.1 with a written reason);
- the desktop binaries are **unsigned**; Linux/macOS artifacts come from CI;
- browser storage is IndexedDB + OPFS and can be evicted — export archives;
- OPTIMADE is available in the Python/desktop editions; the browser cannot call providers
  directly because they send no CORS headers;
- MCP HTTP is loopback-only with a bearer token; it is not a remote service;
- E2E tests cover Chromium only; Firefox/Safari are untested.

## License

MIT for the code. Model parameters, third-party engines, datasets and checkpoints carry their
own licenses and are never bundled blindly. See `docs/engines/engine-registry.md`.
