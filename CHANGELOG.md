# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) for public APIs.

## [Unreleased]

## [0.2.0] — 2026-11-03

The first release with a public repository, a CI run that actually executed, and
a deployed build. Focus: make the existing claims reproducible instead of adding
new surface area.

### Added

- **MD checkpoint and restart**: `runMd` accepts a portable initial state and
  returns the final positions and velocities; `hcs-sim` writes `checkpoint.json`
  for every `md.run` and `--resume <file>` continues the same cell and timestep.
  A resumed run reproduces one continuous run exactly (asserted to the last bit).
  Provenance records `resumed_from_steps`; `steps_resumed_from` and `final_step`
  are result quantities.
- **MCP `simulations_run`**: an approval-gated tool that starts the stable
  `hcs-sim` job API as a subprocess, confined to the workspace, with a scrubbed
  environment, no shell, a 180 s timeout and hard budgets (20 000 atoms for
  static tasks, 5 000 atoms / 2 000 steps for `md.run`). Refusals are typed:
  `approval_required`, `budget_exceeded`, `path_rejected`, `sim_cli_unavailable`,
  `sim_timeout`, `sim_cli_invalid_output`.
- **WASM buffer arena**: one growable set of linear-memory buffers instead of
  seven allocations per force evaluation, with explicit `dispose()`. Five new
  tests pin reuse, growth, shrink, species isolation and disposal; the benchmark
  records how many arena allocations a workload needed (2 for the full suite).
- **CI**: benchmark parity gate, Python 3.12/3.13 matrix, a non-blocking Node 24
  job, `workflow_dispatch`, and action pins updated to the current majors
  (`checkout@v7`, `setup-node@v7`, `setup-python@v7`, `upload-artifact@v7`).
- **`rust-toolchain.toml`** pinning Rust 1.96.0 and the wasm target so the
  committed `.wasm` asset is rebuildable byte-for-byte.
- **Documentation**: `docs/plan/2026-11-03-v0.2.0-long-horizon.md` (researched
  open questions, phase gates, test loops) and evidence under `docs/plan/evidence/`.

### Changed

- `npm run typecheck` builds workspace dependencies first, so a fresh clone
  typechecks without a previous build (this is why CI failed before it ran).
- `CORE_VERSION` is now displayed in the studio footer and Settings instead of a
  hard-coded version string.
- Version updated to `0.2.0` across npm workspaces, Cargo crates and the Python
  package; the committed WASM asset was rebuilt with the new version.
- `npm run test:python` now uses a cross-platform launcher and finds the venv on
  Windows and POSIX (previously the documented command failed on Windows).

### Fixed

- The reference identity fixture embedded a random `structure_id` and a
  timestamp, so the CI drift check could never pass. Both are now pinned and the
  fixture is byte-stable across regenerations.
- `tsx` is a declared devDependency; CI no longer downloads it implicitly.
- README test counts and the version banner no longer drift from the actual run.

### Removed

- Nothing.

### Known limitations

- `npm run fmt:check` still fails on pre-existing files; a repo-wide formatting
  pass is deferred to v0.3.0 so it can be reviewed as its own diff.
- WebGPU, native Vulkan, Tauri, DFT/ML potentials and database connectors remain
  unimplemented and are still listed as such.

## [0.1.0] — 2026-11-03

First development preview: a tested vertical slice, not a mock interface.

### Added

- **Contracts**: seven canonical JSON Schemas (structure, material, simulation, job, result,
  provenance, engine) with Ajv (TypeScript) and jsonschema (Python) validation.
- **Core domain**: periodic cell mathematics, minimum-image distances, structural validation,
  stable structure hashing shared across TypeScript, Rust and Python.
- **Structure IO**: CIF (crystallographic subset with explicit symmetry operations), POSCAR/
  CONTCAR (VASP 4 and 5), XYZ/extXYZ, HCS JSON; import and export.
- **Structure building**: sc, bcc, fcc, hcp, diamond, rock salt, CsCl, perovskite, wurtzite
  prototypes; supercells; substitution; vacancies; atom placement and movement; multi-selection
  with distance/angle measurement using minimum-image vectors (including a warning when a pair
  crosses a periodic boundary).
- **Lennard-Jones reference engine**: cubic-switched potential, analytic forces, FIRE
  relaxation, velocity-Verlet NVE molecular dynamics, RDF, MSD.
- **Continuum reference**: explicit 1D heat/diffusion solver with a Courant stability guard
  and analytic verification.
- **Jobs**: explicit state machine, structured events, warnings, cooperative cancellation,
  hard worker cancellation, input hashing.
- **Provenance**: fidelity labels, base input hash, structure hash, environment, units,
  assumptions and limitations.
- **Portable project**: `.hcsproj` archive (zip) with manifest, per-file checksums, size limits
  and path-traversal protection; HTML reproducibility report export.
- **Browser studio**: Dashboard, Structure Studio, Simulation Workbench, Jobs, Data &
  Provenance, Settings; EN/DE/FR; dark/light; responsive; Web Worker execution; IndexedDB
  persistence; OPFS trajectory storage with quota preflight.
- **Packages**: `@hcs-materials/contracts`, `@hcs-materials/core`, `@hcs-materials/ui`,
  `@hcs-materials/visualization`, `@hcs-materials/web`.
- **Rust**: `hcs-compute-core` CPU kernel, parity-tested against the TypeScript reference
  within 1e-10 eV.
- **Python**: `hcs-materials` package with CLI (`doctor`, `hardware`, `engines`, `structure`,
  `project`, `report`) and an MCP v2 stdio server (4 tools, 2 resources, 2 prompts).
- **Documentation**: science notes, architecture, ADRs, security threat model, tutorial,
  status and roadmap.
- **End-to-end tests**: seven Playwright tests against the production bundle covering create →
  validate → energy → NVE MD → MSD → report download → archive export → re-import with
  checksum verification, element refusal, language/theme persistence and the mobile viewport.
- **MCP tools for agents**: `simulations_validate_spec` (engine/task/fidelity/element/hash checks,
  starts nothing) and `results_summarize` (read-only quantities and provenance from an archive).
- **Benchmark harness**: `benchmarks/lj-benchmark.mjs` measures energy, MD and relaxation for the
  CPU and WASM kernels, aborts on parity failure, and records environment, warm-up, sample count
  and dispersion in `benchmarks/results/latest.json`.
- **Node simulation CLI** (`@hcs-materials/cli`, binary `hcs-sim`): `inspect`, `engines`,
  `run`; validates the structure/spec hash, runs the job with the CPU or WASM kernel, and writes
  `status.json`, `result.json`, `provenance.json`, `report.html`, `run.log` plus trajectory or
  relaxed structure when produced.
- **WebAssembly kernel**: `crates/compute-wasm` compiles the Rust kernel to
  `wasm32-unknown-unknown` with a C ABI and no imports; `@hcs-materials/wasm` loads it with ABI
  validation. The solver worker uses it for energy evaluation, FIRE relaxation and NVE MD, records
  `compute_backend` in the result and the provenance environment, and falls back to the TypeScript
  kernel with a visible notice if the asset cannot load. Energy jobs are re-evaluated with the
  other implementation and the deviation is reported (11 parity tests, tolerance 1e-8 in the UI).
- **CI definition**: `.github/workflows/ci.yml` with typecheck/unit/build, Rust (fmt, clippy,
  parity, fixture and WASM drift), Python (CLI + MCP) and Playwright E2E jobs.

### Changed

- `react-router-dom` 6 → 7.18.5 (fixes open-redirect and constructor-injection advisories;
  HashRouter/Routes/NavLink API unchanged).
- `vitest` 2 → 4.1.12; the duplicate `vitest` 2 devDependency in `packages/core` was removed
  (it pulled `tinypool` and Vite 5 into the tree).
- npm 11 is now required to install the workspace (`packageManager: npm@11.21.1`) because npm
  10's arborist fails on the Vitest 4 peer graph.
- `npm audit` now reports **0 vulnerabilities**.

### Fixed during development

- Force sign in the Lennard-Jones kernel was verified against the numerical gradient before
  any dynamics were accepted.
- Velocity-Verlet used a stale force array in the first half-kick; energy drift dropped from
  4e-3 to 3e-7 eV/atom after the fix.
- The energy-shifted potential produced a force discontinuity at the cutoff; replaced by a
  cubic switching window between 0.9·r_c and r_c.
- A pair cutoff larger than the minimum-image radius silently counted wrong periodic images;
  the cutoff is now clamped by plane spacing and recorded in the result.
- Cells with no interacting pair returned `E = 0`; such jobs are now rejected with guidance.
- Structure identity ignored periodic equivalence (`x` vs `x+1`); hashing now wraps
  fractional coordinates in periodic directions.
- Formula ordering produced `ClNa`/`O3SrTi`; electronegativity ordering now yields
  `NaCl`/`SrTiO3`.
- Responsive CSS base rules overrode the mobile media query, breaking the 390 px layout.
- Locale-dependent `type="number"` inputs could silently reset physical parameters; replaced
  by a decimal-tolerant number input.

### Known limitations

See `STATUS.md`. Most important: one classical model, no DFT/ML potentials, no GPU kernels,
no desktop installer, no published packages, no CI run on GitHub yet.
