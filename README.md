# HCS Material Research Kit

**A local-first virtual materials research studio.** Build and validate atomic structures,
run documented classical reference calculations in your browser, and export a reproducible
research record with provenance.

> Made with love by **hcsmedia** and **timfromhcs**.

[![tests](https://img.shields.io/badge/TypeScript%20tests-107%20passing-4fd6c4)](#verification)
[![rust](https://img.shields.io/badge/Rust%20tests-8%20passing-4fd6c4)](#verification)
[![python](https://img.shields.io/badge/Python%2FMCP-32%20passing-4fd6c4)](#verification)
[![e2e](https://img.shields.io/badge/Playwright%20E2E-7%20passing-4fd6c4)](#verification)

---

## What this repository is today (v0.1.0)

A working vertical slice, not a mock-up:

| Capability | State | Evidence |
|---|---|---|
| Canonical JSON Schema contracts | Implemented | `schemas/`, validated in TS and Python |
| Structure model, periodic cells, minimum image | Implemented | 30+ unit tests incl. known densities |
| CIF / POSCAR / XYZ / extXYZ import + export | Implemented (documented subsets) | round-trip fixtures |
| Structure Studio with 3D viewer, supercells, substitution, vacancies | Implemented | manual browser test, screenshots |
| Lennard-Jones reference engine (energy, forces, FIRE, NVE MD, RDF) | Implemented | force-vs-gradient, energy conservation |
| 1D heat/diffusion solver | Implemented | analytic Fourier-mode comparison |
| Job lifecycle, events, warnings, provenance | Implemented | state-machine tests, job tests |
| `.hcsproj` archive with checksums and path safety | Implemented | tamper/traversal tests (TS + Python) |
| Browser studio (EN/DE/FR, dark/light, responsive) | Implemented | Vite build, Playwright E2E |
| Rust CPU kernel with cross-language parity | Implemented | 1e-10 eV agreement with TS |
| WASM kernel + in-browser cross-check | Implemented (energy/forces) | 8 parity tests, E2E assertion |
| Python CLI | Implemented | 32 tests |
| MCP v2 stdio server | Implemented (subset) | official SDK client tests |
| Automated acceptance workflow | Implemented | 7 Playwright tests on the production bundle |
| WebGPU kernels, DFT/LAMMPS/ML potentials, Tauri app | **Not implemented** | see `ROADMAP.md` |

The browser and native editions do not share every solver — they share schemas, workflows,
file formats and provenance. `docs/engines/engine-registry.md` states this explicitly.

## Quick start

```bash
# 1. Install JS dependencies and build the packages + studio
#    npm 11 is required (npm 10 cannot resolve the Vitest 4 peer graph)
npm install
npm run build

# 2. Run the studio
npm run dev            # http://localhost:5173

# 3. Tests
npm test               # TypeScript: 99 tests
npm run test:rust      # Rust parity: 5 tests
npm run test:python    # Python + MCP: 32 tests (needs the venv below)
npm run test:e2e       # Playwright: 7 acceptance tests (uses installed Chrome)
```

On a machine with npm 10, install the pinned package manager first: `npm i -g npm@11`.
For a machine without Chrome, run `npx playwright install --with-deps chromium` and set
`PW_CHANNEL=chromium`.

Python package:

```bash
python scripts/sync-python-schemas.py
cd python/hcs_materials
uv venv && uv pip install -e ".[dev]"
.venv/Scripts/python.exe -m pytest        # Windows
```

## A two-minute real workflow

1. Open the studio and choose **Argon (fcc, LJ reference)** — this creates a 3×3×3 cell
   (108 atoms) so the pair cutoff has real interactions.
2. Go to **Simulation Workbench**, choose **NVE molecular dynamics**, keep the default
   200 steps / 2 fs / 60 K, and run. The computation happens in a Web Worker.
3. Read the result: mean temperature, energy drift per atom (~1e-7 eV/atom for this cell),
   convergence criterion, limitations, and the provenance record with input hashes.
4. Press **Compute MSD from trajectory**, then **Download reproducibility report**.
5. **Dashboard → Export project** writes a `.hcsproj` with structures, job inputs, results,
   provenance and per-job reports, plus `checksums.sha256`.

Everything stays in your browser. There is no account, no telemetry and no upload endpoint.

## Repository layout

```text
apps/web                 React studio (static, Vite) — local computation only
packages/contracts       Canonical JSON Schemas + Ajv validators
packages/core            Domain model, IO, kernels, jobs, archives, reports
packages/ui              Design tokens + accessible primitives (hand-written CSS)
packages/visualization    Three.js structure viewer, accessible SVG plots
packages/wasm            WASM loader + committed hcs_compute.wasm (+ manifest)
crates/compute-core      Rust CPU kernel, parity-tested against the TS reference
crates/compute-wasm      C-ABI entry points for wasm32-unknown-unknown
python/hcs_materials     CLI, project archives, MCP server (official v2 SDK)
schemas/                 Single source of truth for all contracts
tests/fixtures           Structure fixtures and cross-language reference outputs
docs/                    Science, architecture, decisions, security, tutorials
```

## Scientific honesty rules enforced in code

- Every result carries a fidelity label, units, model id, parameters, convergence status
  and limitations. `ResultBundle` cannot be created without `limitations` and `convergence`.
- An engine is only selectable when it exists in the registry. Planned engines are listed
  separately with `status: not_implemented` and cannot run.
- A fidelity level the engine does not declare is rejected (`fidelity_mismatch`).
- Unknown elements are refused, never assigned invented parameters.
- A cell too small for the cutoff is clamped and **recorded**; a cell with no interacting
  pair at all is rejected instead of returning `E = 0`.
- NVT/NPT requests are rejected: no thermostat exists in this build, so none is imitated.
- CIF space-group symbols are not expanded without explicit symmetry operations; the
  reader warns instead of silently dropping atoms.
- A POSCAR without species line becomes `X1…Xn` with a warning; elements are not guessed.
- Results never claim laboratory proof, synthesis or certification.

## Verification

Current local evidence (Windows 11, Node 22.23, Python 3.14, Rust 1.96):

```text
TypeScript 107 tests passing   vitest run (includes 8 TS ↔ WASM parity tests)
Rust         8 tests passing   cargo test -p hcs-compute-core -p hcs-compute-wasm
Python      32 tests passing   pytest (includes real MCP client/server round-trip)
Playwright   7 tests passing   production bundle, Chrome channel
Web build   vite build ok      ~375 kB app + 471 kB three + 218 kB worker + 58 kB wasm
npm audit   0 vulnerabilities
```

Key scientific checks:

- forces equal the negative numerical energy gradient (relative deviation < 1e-5);
- NVE total-energy drift < 1e-3 eV/atom over 400 steps on a 108-atom argon cell;
- TypeScript and Rust agree within **1e-10 eV** on a 32-atom reference structure;
- 1D heat solver matches the analytic Fourier-mode decay within 5e-4;
- fcc RDF first peak at `a/√2`, coordination number 12 ± 0.5;
- silicon diamond density 2.329 g/cm³ and rock-salt NaCl 2.165 g/cm³ within 1.5 %.

No CI badge is claimed: `.github/workflows/ci.yml` exists but has not been executed on
GitHub in this workspace yet.

## Status and limits

Read `STATUS.md` for what is done, what is blocked and what comes next, and `ROADMAP.md`
for the phase gates. Known limitations of this release:

- the only physics engine is a **classical Lennard-Jones reference** for He/Ne/Ar/Kr/Xe;
- O(N²) pair loop (documented; fine for a few thousand atoms);
- no DFT, no ML potentials, no LAMMPS, no CALPHAD, no phase field beyond the 1D heat solver;
- no Tauri desktop app, no installers, no PyPI/npm publication;
- browser storage is IndexedDB + OPFS and can be evicted — export archives;
- MCP exposes structure/project tools only (no simulation tool yet);
- E2E tests cover Chromium only; Firefox/Safari are untested.

## License

MIT for the code. Model parameters, third-party engines, datasets and checkpoints carry
their own licenses and are never bundled blindly. See `docs/engines/engine-registry.md`.
