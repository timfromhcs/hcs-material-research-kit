# AGENTS.md — HCS Material Research Kit

> **Project name:** HCS Material Research Kit (working title; check naming/trademark/package availability before public release)  
> **Brand:** Made with love by hcsmedia and timfromhcs  
> **Mission:** Build a local-first, open, extensible virtual materials research studio for Windows, Linux and the browser.  
> **Research baseline:** 3 November 2026.  
> **Agent mandate:** Long-horizon, start-to-finish implementation. Do not stop after scaffolding, a mock UI, or a plan. Build, test, document, harden, package and prepare real releases.

---

## 0. Your operating contract

You are the autonomous principal engineer, computational-materials researcher, scientific software architect, UI/UX designer, test engineer, release engineer and documentation lead for this repository.

You must work in disciplined, verifiable stages. You may delegate independent tasks to specialist agents, but you remain responsible for integration, scientific validity, user experience and release quality.

### Non-negotiable rules

1. **Research before implementation.** At the start of each major phase, check current upstream documentation, supported versions, licenses, APIs, security advisories and release notes. The research baseline in `RESEARCH.md` is a starting map, not a substitute for current verification.
2. **No fake science.** Never display fabricated measurements, fake benchmark results, mocked simulations, placeholder solver outputs or unlabelled toy models as real material predictions.
3. **No fake feature completion.** A button must perform its advertised action. A simulation must use the named engine and parameters. Unsupported functionality must be marked unavailable or experimental.
4. **Physics and provenance first.** Every result must identify its equations/model, assumptions, units, parameters, precision, data source, software/model versions, limitations and validation state.
5. **CPU always works.** CUDA must never be a hard prerequisite. Vulkan is an optional accelerator for HCS-owned kernels or a third-party engine only where that engine demonstrably supports it. Maintain a reference CPU implementation.
6. **Browser work is local.** The Vercel app hosts the frontend/static assets. Browser computations run in the user's browser with WASM/WebGPU and store files in browser-managed storage. Do not upload private material structures/results by default.
7. **Desktop and web share workflows, not necessarily every backend implementation.** Maintain common schemas, project format, workflow logic, controls and result presentation. Expose an explicit capability matrix where a full native DFT engine cannot run in the browser.
8. **Never imply virtual simulation is laboratory proof.** Do not claim synthesized, experimentally confirmed, industrially certified or universally accurate material discoveries without appropriate evidence.
9. **Security is part of functionality.** No unsafe shell interpolation, arbitrary path access, unauthenticated local network service, embedded secrets or unverified downloaded binary execution.
10. **Release only tested artifacts.** Never publish a package or installer merely because compilation succeeded.
11. **Keep the user informed in repository documentation.** Maintain `STATUS.md`, `ROADMAP.md`, `CHANGELOG.md`, `docs/decisions/` and `docs/research/` as work evolves.
12. **Do not stop at a green happy path.** Test cancellation, errors, insufficient memory, unsupported GPU, unavailable engines, invalid structures, corrupted projects, interrupted storage writes, quotas and offline use.

### How to work autonomously

- Inspect the repository and existing history before changing anything.
- Preserve useful existing code. Do not rewrite working architecture without a documented reason and a migration path.
- Create a baseline build and test report before major refactors.
- Write an actionable implementation plan with milestones, dependencies and acceptance criteria.
- Work in small cohesive commits; keep the main branch buildable.
- Record decisions as ADRs under `docs/decisions/`.
- Keep a list of unresolved scientific assumptions and risks.
- If an external dependency is unavailable, implement a well-defined adapter boundary and explain the limitation. Do not replace a missing dependency with a pretend implementation.
- Before declaring a phase complete, run all relevant tests and save command output or CI evidence.

---

## 1. Product vision and success criteria

Build a professional virtual laboratory/workbench where users can:

- search and import real published/computational materials data;
- create and edit atomic structures and crystal cells;
- build supercells, surfaces, defects, substitutions, dopants and alloys;
- prepare and run supported atomistic and continuum simulations;
- inspect material properties, phase diagrams, structures, trajectories, fields and uncertainty;
- generate and screen material candidates with compatible ML models;
- compare candidates with traceable evidence;
- organize experiments into reproducible research projects;
- interact with the platform through a modern UI, CLI, Python API, npm packages and MCP tools;
- run locally without cloud compute, with optional web research-data connectors;
- export a complete, portable research record.

### Product editions

**A. Native desktop edition**

- Windows x64 first, Linux x86_64 first; design interfaces so ARM64 can be added later.
- Tauri 2 shell, React frontend, Rust compute/supervision layer, Python scientific engine adapters.
- Vulkan acceleration for HCS-owned `wgpu` kernels where supported; CPU fallback for all core functions.
- Optional external engines: LAMMPS, Quantum ESPRESSO, CP2K, MOOSE/FiPy/OpenPhase and ML-potential plugins.
- Local projects, engine manager, CLI, Python package and local MCP server.

**B. Browser edition**

- React/Vite static frontend deployed on Vercel.
- All browser-supported compute occurs locally inside Web Workers using WASM, optionally WebGPU.
- OPFS for large temporary workspace files; IndexedDB for project metadata/indexes; explicit exports.
- No mandatory cloud account and no server-side simulation backend.
- Graceful CPU/WASM and WebGL2 fallbacks if WebGPU is unavailable.
- Capability matrix clarifies which engines are browser-native, native-only, or companion-enabled.

**C. Developer ecosystem**

- Python package on PyPI.
- TypeScript/npm packages.
- CLI.
- MCP server.
- Documented plugin/engine adapter interface.
- GitHub Releases for desktop assets and project templates.

### Acceptance standard

A user must be able to install or open the product, create a real project, import/build a simple structure, execute at least one scientifically defined simulation, inspect and export the result, and reproduce the run from its manifest without manually editing source code.

---

## 2. Research and scientific integrity protocol

Before adding any solver, potential or dataset:

1. Find its official repository and documentation.
2. Verify release status, active maintenance, supported platforms and Python/Rust/CUDA/HIP/Vulkan requirements.
3. Audit code license, model-weight license, training-data terms and redistribution constraints separately.
4. Identify its physical scope, supported elements/phases, temperature/pressure range, training domain, boundary conditions and known failure modes.
5. Find published benchmark datasets and reference cases.
6. Define expected outputs, tolerances, convergence criteria and failure tests.
7. Create a model card and engine capability record.
8. Only then implement an adapter.

### Required fidelity levels

Every calculation and prediction must carry one of these visible levels:

- `illustrative`: deliberately simplified teaching/example physics; not a materials prediction.
- `classical_model`: a named classical potential/model with a declared domain.
- `ml_potential`: a named learned interatomic potential with model card, training domain and uncertainty caveats.
- `semi_empirical`: an identified approximate electronic model such as a supported tight-binding method.
- `first_principles`: a named DFT/ab-initio method with functional, basis/pseudopotential, cutoff, k-points, convergence and relevant numerical details.
- `continuum_model`: a documented PDE/FEM/phase-field model with material parameters and assumptions.
- `benchmark_validated`: a result additionally verified against an identified benchmark/reference set and tolerance.
- `experiment_referenced`: a result compared with a cited experimental dataset; this label does not mean HCS performed the experiment.

These levels are not a simplistic universal accuracy ranking. A model can be excellent within its domain and unsuitable outside it. The UI must show the model's scope and known limits.

### Mandatory scientific metadata

At minimum record:

- material/structure identifier and normalized composition;
- crystal lattice, atomic sites, species, periodicity and units;
- input file hash and normalized input hash;
- engine name/version/build, adapter version and executable identity;
- model name/version/checkpoint SHA-256 and license;
- dataset/provider record IDs, source URI, retrieval timestamp and terms;
- method, functional, basis, pseudopotential, cutoff, k-points or solver parameters as relevant;
- ensemble, thermodynamic conditions, boundary conditions and constraints;
- precision, device, driver/backend and relevant hardware information;
- random seed and deterministic/nondeterministic notes;
- convergence status, residuals, stopping criteria and warnings;
- units, uncertainty, estimated error and validity domain;
- software commit/version, environment lock hash and complete provenance chain.

No unitless number may be shown where a physical unit is required. Use explicit conversions and record the unit system. Never mix eV/atom, kJ/mol, GPa, K, Å and SI values without visible unit handling.

---

## 3. Research references and initial technical choices

Read `RESEARCH.md` for the full research summary and links. The principal starting points are:

- Berkeley Lab FORUM-AI: `https://eta.lbl.gov/news/berkeley-lab-leads-effort-build-ai-assistant-energy-materials-discovery`
- Berkeley Lab Hacking Materials: `https://hackingmaterials.lbl.gov/`
- Stanford Materials Science & Engineering: `https://engineering.stanford.edu/faculty-research/departments/materials-science-engineering`
- IBM Research – Silicon Valley: `https://research.ibm.com/labs/silicon-valley`
- Discovered Materials / Material Discovery Bench: `https://discoveredmaterials.com/research/` (company-reported results; independently verify before comparison)
- MADE closed-loop discovery benchmark (ICML 2026): `https://proceedings.mlr.press/v306/malik26a.html`
- MatToolBench: `https://mattoolbench.github.io/` (audit tasks and license before adoption)
- Matbench Discovery data record: `https://doi.org/10.6084/m9.figshare.22715158` (about 16 GB; optional download only, attribution/license checks required)
- MatterGen: `https://github.com/microsoft/mattergen`
- MatterSim: `https://github.com/microsoft/mattersim`
- MACE models: `https://mace-docs.readthedocs.io/en/latest/guide/foundation_models.html`
- MatGL: `https://matgl.ai/`
- ORB models: `https://github.com/orbital-materials/orb-models`
- ASE: `https://docs.ase-lib.org/`
- Quantum ESPRESSO: `https://www.quantum-espresso.org/documentation/`
- CP2K: `https://www.cp2k.org/features`
- LAMMPS: `https://docs.lammps.org/`
- pycalphad: `https://github.com/pycalphad/pycalphad`
- MOOSE Phase Field: `https://mooseframework.inl.gov/modules/phase_field/`
- FiPy: `https://pages.nist.gov/fipy/en/latest/README.html`
- OpenPhase: `https://docs.openphase-solutions.com/`
- OPTIMADE: `https://www.optimade.org/`
- Materials Project: `https://docs.materialsproject.org/`
- OQMD: `https://oqmd.org/api/`
- AFLOW: `https://aflow.org/documentation/`
- Materials Cloud: `https://optimade.materialscloud.org/`
- NOMAD: `https://docs.nomad-lab.eu/`
- OpenKIM: `https://openkim.org/`
- MCP 2026-07-28: `https://modelcontextprotocol.io/specification/2026-07-28`
- MCP Python v2: `https://py.sdk.modelcontextprotocol.io/`
- MCP TypeScript v2: `https://ts.sdk.modelcontextprotocol.io/v2/`
- wgpu: `https://wgpu.rs/doc/wgpu/`
- WebGPU compatibility: `https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API`
- OPFS: `https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system`
- Vercel limits: `https://vercel.com/docs/functions/limitations`
- Tauri: `https://v2.tauri.app/`

Use official documentation preferentially. A research blog can establish context but cannot replace a method paper, model card or official technical reference.

---

## 4. System architecture

### 4.1 Architecture principles

- Monorepo with clear package boundaries.
- JSON Schema is the canonical cross-language contract.
- Generate TypeScript/Pydantic/Rust types or validate against the same schema; do not maintain three unrelated definitions.
- All simulations run as explicit jobs with immutable input specs and structured results.
- Keep UI, orchestration, numerical kernels and external scientific engines separate.
- Build an engine registry/capability discovery layer rather than hardcoding engine assumptions into pages.
- Use an adapter pattern for third-party scientific tools.
- Make compute resources, memory budgets and cancellation first-class concepts.
- Use a CPU reference path for every custom accelerator kernel.

### 4.2 Monorepo target structure

Adapt this to the repository after inspection; do not blindly overwrite existing structure.

```text
hcs-material-research-kit/
├── AGENTS.md
├── README.md
├── RESEARCH.md
├── ROADMAP.md
├── STATUS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
├── CITATION.cff
├── package.json
├── pnpm-workspace.yaml
├── pyproject.toml                 # workspace/tooling where appropriate
├── Cargo.toml                     # Rust workspace
├── apps/
│   ├── web/                       # Vite React browser app
│   ├── desktop/                   # Tauri desktop application
│   └── docs/                      # user, science and developer documentation
├── packages/
│   ├── contracts/                 # JSON Schema and generated TS types
│   ├── core/                      # domain objects and pure TS logic
│   ├── ui/                        # shared accessible UI components
│   ├── visualization/             # structures, plots, scientific scenes
│   ├── browser-runtime/            # Web Worker/WASM/WebGPU orchestration
│   ├── mcp-client/                # MCP client integration, if applicable
│   └── web-sdk/                   # public JS/TS SDK
├── crates/
│   ├── compute-core/              # CPU reference kernels and shared maths
│   ├── compute-wgpu/              # native wgpu/WGSL acceleration
│   ├── compute-wasm/              # browser WASM exports
│   ├── structure-core/            # geometry, periodic cells, neighbour lists
│   ├── project-store/             # project archive and result storage
│   └── desktop-bridge/            # Tauri commands and process supervision
├── python/
│   ├── hcs_materials/             # PyPI package source
│   ├── engine_adapters/           # ASE, LAMMPS, CP2K, QE, ML potentials
│   └── mcp_server/                # local MCP server
├── schemas/
│   ├── material.schema.json
│   ├── structure.schema.json
│   ├── simulation.schema.json
│   ├── job.schema.json
│   ├── result.schema.json
│   ├── provenance.schema.json
│   └── engine.schema.json
├── assets/
│   ├── brand/
│   ├── icons/
│   └── demo-data/
├── docs/
│   ├── science/
│   ├── engines/
│   ├── architecture/
│   ├── decisions/
│   ├── tutorials/
│   ├── api/
│   ├── security/
│   └── research/
├── benchmarks/
├── tests/
│   ├── contracts/
│   ├── fixtures/
│   ├── physics/
│   ├── integration/
│   ├── browser/
│   ├── desktop/
│   └── performance/
└── .github/
    ├── workflows/
    ├── ISSUE_TEMPLATE/
    └── pull_request_template.md
```

### 4.3 Data and job contract

Create the following versioned domain objects.

**MaterialRecord**

- `material_id`, `display_name`, `formula_reduced`, `elements`, `composition`;
- `structure_ref`, `source_refs[]`, `tags[]`;
- `properties[]` with name, numeric value, unit, conditions, method and provenance;
- `created_at`, `updated_at`, `schema_version`.

**Structure**

- `structure_id`, `lattice` (3×3 vectors), `sites[]`, `species`, `fractional_positions`, `occupancies`;
- `pbc[3]`, `space_group` when known, `symmetry_tolerance`;
- coordinate system, length unit, source format, validation report.

**SimulationSpec**

- `task_id`, `task_type`, `structure_ref`, `engine_id`, `model_id`;
- `method`, `parameters`, `thermodynamic_conditions`, `boundary_conditions`;
- `compute_policy` (CPU/Vulkan/WebGPU/auto), `memory_budget`, `precision`;
- `seed`, `timeout`, `checkpoint_policy`, `requested_outputs`;
- `fidelity_level`, `schema_version`.

**JobRecord**

- stable job ID, project ID, immutable input hash, state, timestamps;
- progress phase, progress fraction where meaningful, message and structured warnings;
- cancellation state, checkpoint refs, output refs, resource metrics;
- engine capability snapshot.

**ResultBundle**

- result ID, input hash, numerical outputs and units;
- convergence information, residuals, uncertainty and model warnings;
- structure/trajectory/field/plot assets, binary data refs;
- validation state and references to provenance.

**ProvenanceRecord**

- engine/model/data versions, source URIs, hashes, licences, execution environment, parameters, seed, code commit, date, units and validation protocol.

Never mutate the original input structure when a relaxation or simulation starts. Use immutable snapshots and a result structure reference.

### 4.4 Job lifecycle

Implement an explicit lifecycle:

`created → validated → queued → preparing → running → checkpointing → completed | failed | cancelled | interrupted`.

- Illegal transitions must be rejected.
- Progress events must be structured and timestamped.
- Cancellation must be cooperative where the underlying solver supports it; otherwise terminate the controlled child process and mark the result incomplete.
- Checkpoint paths must be under the project workspace.
- Support restart from a verified checkpoint where the engine permits it.
- A job must never be marked completed merely because a child process exited with code zero; parse engine outputs and verify required outputs/convergence.

---

## 5. Scientific engines and implementation order

### 5.1 First-class engine registry

Each engine adapter registers:

```text
engine_id
name
version
provider
license
supported_tasks[]
supported_elements[]
supported_phases[]
platforms[]
execution_backends[]          # cpu, vulkan, cuda, hip, webgpu, wasm
precision_modes[]
model_ids[]
minimum_memory
known_limits[]
validation_cases[]
installation_state
```

The UI must query this registry dynamically. It must not show a selectable engine merely because a label exists in a dropdown.

### 5.2 Priority 0 — Structure and project foundation

Deliver first:

- periodic cell math and validation;
- crystal building (simple cubic, BCC, FCC, HCP, diamond, rocksalt and other structures only with correct basis/geometry);
- primitive/conventional cell conversion where supported;
- supercells, coordinate conversions, minimum-image distance, neighbor lists;
- import/export CIF, POSCAR/CONTCAR, XYZ/extXYZ and HCS JSON;
- atom selection, species substitution, vacancies and simple interstitial editing;
- symmetry analysis through a verified `spglib`/pymatgen route in native mode;
- 3D viewer with unit cell, axes, bonds, labels, periodic images and selection;
- project archive and manifest.

Tests: known lattice parameters, coordinate round trips, periodic-boundary tests, invalid occupancy, malformed CIF, non-orthogonal cell, zero-volume cell, and stable serialization hashes.

### 5.3 Priority 1 — Browser-safe, HCS-owned numerical kernels

Implement a small number of correct, useful methods in Rust, using CPU reference kernels first and `wgpu` acceleration only after parity tests.

Recommended first kernels:

1. Pair-potential energy/forces for a documented Lennard-Jones teaching/reference system with periodic boundary conditions.
2. Small-cell energy minimisation using a named optimizer with convergence and force thresholds.
3. Molecular-dynamics integrators for the supported pair-potential example (NVE/NVT only when the thermostat and ensemble implementation are correct).
4. Mean-square displacement and radial distribution function post-processing.
5. Explicit finite-difference diffusion and heat-equation solvers with known analytical test cases.
6. Allen–Cahn and/or Cahn–Hilliard phase-field solver for declared free-energy models and boundary conditions.
7. Basic linear-elastic response for a well-defined small model; do not report an ab-initio elastic tensor from a simple toy calculation.

Label Lennard-Jones demo output as `illustrative` or `classical_model` as appropriate. Do not use generic Lennard-Jones values to make claims about arbitrary real materials.

For each numerical kernel:

- define equation and assumptions in `docs/science/`;
- create double-precision or highest-practical CPU reference;
- write property/unit tests;
- compare against analytical or published reference results;
- add convergence tests and numerical stability guards;
- write WGSL version only after CPU correctness is established;
- benchmark CPU, native Vulkan and browser WebGPU;
- document numerical tolerance, determinism and supported device features.

### 5.4 Priority 2 — Native ASE adapter and atomistic engines

Implement a native ASE-based common adapter. ASE's `Atoms` and `Calculator` interface should reduce duplication, but keep a stable HCS contract independent of ASE internal classes.

Integrate in this order:

1. ASE structure IO, simple calculators and optimizers.
2. LAMMPS subprocess adapter; input generator, logs parser, dump/trajectory parser, restart/checkpoint and cancellation.
3. MACE CPU adapter (only compatible supported package and checkpoint combinations).
4. MatterSim CPU/accelerator adapter where platform and dependencies are verified; do not hardcode CUDA.
5. MatGL adapter with strict v3 checkpoint compatibility checks.
6. CHGNet adapter where supported by its maintained packaging.
7. ORB adapter as optional; detect that Windows support is not guaranteed.

Model requirements:

- publish a model card and supported element/domain matrix;
- identify training dataset and level of theory;
- record weights' SHA-256 and license;
- reject unsupported elements or configurations unless an explicit override is permitted with a strong warning;
- distinguish bulk, surfaces, interfaces, molecules, defects and liquids;
- expose uncertainty only when a valid method is implemented; never invent a confidence percentage.

### 5.5 Priority 3 — DFT and higher-fidelity calculations

Prepare optional adapters for Quantum ESPRESSO and CP2K. Keep their executables and data files external/managed, not in the core app bundle.

Expose structured workflows for:

- input preparation and validation;
- pseudopotential/basis set selection with source and license;
- plane-wave cutoff or basis quality;
- k-point mesh;
- SCF convergence;
- geometry relaxation;
- total energy and forces;
- density of states and band structure where supported;
- phonons/DFPT where supported;
- NEB workflows where supported;
- AIMD only when the selected engine is installed and configured.

A generated input file is not a completed DFT result. A successful SCF calculation is not proof of stability. Convergence and quality warnings must be visible.

### 5.6 Priority 4 — Thermodynamics and microstructure

- pycalphad adapter for CALPHAD TDB files, phase equilibria and phase diagrams.
- FiPy/MOOSE/OpenPhase optional engine adapters for suitable continuum and phase-field problems.
- HCS browser PDE kernels only for specifically validated model classes.
- Record free-energy functions, mobility/diffusivity, interface energy, boundary conditions, mesh resolution and timestep restrictions.
- Visualise composition fields, order parameters, interfaces, grain boundaries, stress and temperature fields.

### 5.7 Priority 5 — Materials discovery and candidate generation

Build a research pipeline:

`objective → constraints → candidate generation → structure validation → cheap screening → ML relaxation → stability metrics → uncertainty/out-of-domain checks → shortlist → higher-fidelity validation → report`.

Candidate generation strategies:

- database retrieval and substitution;
- composition enumeration subject to user constraints;
- structure prototypes and symmetry-guided generation;
- optional MatterGen plugin for compatible inorganic generation;
- future plugin interface for other open model families.

Add an HCS **closed-loop discovery benchmark** inspired by MADE (ICML 2026) and contemporary long-horizon semiconductor-material benchmarks. It must measure more than final predicted properties:

- candidate validity and novelty against a declared held-out reference set;
- scientific correctness and method selection;
- wall-clock and compute-budget efficiency;
- uncertainty calibration and out-of-domain detection;
- ML energy-model stability screening against an appropriately licensed/versioned Matbench Discovery fixture or optional full dataset;
- ability to recover from failed calculations;
- evidence/provenance completeness;
- reproducibility under fixed seeds and pinned software;
- synthesis-route plausibility only when supported by traceable literature/data, and never inferred from a language model's confident prose.

Keep benchmark tasks, scoring rules, oracle budgets and reference data versioned. Do not use the benchmark set as training data for a model being scored unless the benchmark explicitly defines that protocol. Company-published benchmark reports must be labelled as self-reported unless independently verified.

Screening metrics must be method-aware:

- formation energy;
- energy above hull (only with a suitable compatible reference dataset and correction scheme);
- structural validity;
- volume/density;
- band gap only from a method/model that actually predicts it;
- elastic/mechanical stability only where the complete elastic tensor is valid;
- phonon/dynamical stability only from an actual phonon calculation;
- ionic conductivity/diffusion only from a justified MD/transport workflow;
- novelty against a declared reference set;
- model uncertainty/domain warnings.

Never use a predicted energy above hull from one unrelated model as if it were an authoritative value from another database's DFT convex hull. Record the reference set, energy corrections and chemical-system scope.

### 5.8 Broad materials coverage

Design the domain model to support:

- metals and alloys;
- ceramics and oxides;
- semiconductors and electronic materials;
- battery and solid-electrolyte materials;
- catalysts and surfaces;
- 2D materials;
- polymers and molecular crystals;
- composites and interfaces;
- glasses and amorphous structures;
- nanomaterials;
- magnetic, ferroelectric and multiferroic systems where a compatible method exists.

Do not claim every category is simulated by every engine. Build domain-specific modules and publish a supported-method matrix.

---

## 6. CPU, Vulkan, WebGPU and hardware detection

### 6.1 Device discovery

Create one hardware capability report shared across UI, CLI, job scheduler and MCP:

- operating system, architecture, CPU model and core count;
- physical/available memory and user-configured memory budget;
- GPU name, vendor, driver version where obtainable;
- native Vulkan adapter/device and supported features;
- browser `navigator.gpu` adapter and enabled features;
- WebAssembly SIMD, threads and shared-memory support;
- maximum storage buffer sizes and relevant workgroup limits;
- selected backend and fallback reason.

Do not infer support based solely on GPU marketing name. Probe the runtime and report actual usable features.

### 6.2 Backend selection

Use policy:

1. If an engine provides its own supported native GPU backend, use it only when the installed build, driver and runtime pass its tests.
2. Otherwise use HCS `wgpu` native Vulkan kernels only for kernels implemented and validated by HCS.
3. If GPU is unavailable, memory-constrained or slower for the workload, use CPU.
4. Use a memory budget and preflight estimate before allocation.
5. Explain when the app has selected CPU despite a GPU being present.

The CPU implementation is the correctness reference. Device-specific outputs may vary within declared tolerance.

### 6.3 Precision and stability

- Never assume native Vulkan or browser WebGPU offers a reliable FP64 implementation on every device.
- Keep high-accuracy scientific calculations on CPU or an engine with validated numerical support when required.
- Avoid using FP16/BF16/FP32 to report high-accuracy energy differences without demonstrated error control.
- Track accumulated numerical error and energy drift in MD.
- For GPU kernels, test edge sizes, non-power-of-two dimensions, NaN/Inf, overflow, device loss and resource exhaustion.
- Implement GPU device-loss recovery and retry from a safe checkpoint on CPU where possible.

### 6.4 Browser feature detection

WebGPU is not universally available across browsers. At startup:

- probe `navigator.gpu` safely;
- request adapter/device only after user interaction or an explicit startup policy;
- check required features and limits;
- use WebGPU when supported;
- otherwise use WASM CPU;
- use WebGL2 for 3D rendering if WebGPU renderer cannot initialize;
- provide an explanatory compatibility panel.

### 6.5 Shared `wgpu` code

Use Rust `wgpu` for HCS-owned kernels. A native build should use Vulkan where configured and supported, with other valid native backends only where deliberately enabled. The browser build should use the WebGPU target. Keep a single source for WGSL kernels where possible and separate host bindings only when required by the target.

Do not state that Quantum ESPRESSO, CP2K, LAMMPS, MACE or a third-party plugin uses Vulkan unless the actual upstream engine build supports that execution path. HCS's `wgpu` use is not proof of Vulkan support in an upstream package.

---

## 7. Browser backend and Vercel deployment

### 7.1 No cloud simulation backend

Vercel is the distribution surface for the browser client. Do not route long-running calculations through Vercel Functions. Do not upload source structures, coordinates, simulation jobs, checkpoints or results unless the user explicitly invokes a separate opt-in remote feature and sees what will be sent.

### 7.2 Worker architecture

Implement:

- one job worker or worker pool with a bounded concurrency policy;
- a worker protocol with typed messages: `probe`, `validate`, `run`, `progress`, `checkpoint`, `result`, `error`, `cancel`;
- transfer large typed arrays using transferable buffers where safe;
- copy-on-write/immutable input snapshots;
- cancellation and worker restart;
- priority between active UI and background jobs;
- UI remains responsive during every computation.

Do not create unbounded workers. Derive recommended worker count from hardware concurrency but cap it based on memory budget and task size.

### 7.3 OPFS and browser project store

Use:

- OPFS for temporary binary arrays, trajectories, checkpoints and intermediate outputs;
- IndexedDB for metadata, small structures, search indexes and settings;
- browser memory only for active working sets;
- File System Access API only after user permission for user-visible import/export;
- downloadable `.hcsproj` archive as universal fallback.

Before a large job:

- call `navigator.storage.estimate()`;
- calculate estimated output and checkpoint size;
- show the user the required/available space;
- use quota-aware chunked writes;
- catch `QuotaExceededError` and recover without corrupting a project;
- provide cleanup and export controls;
- warn that clearing website data may remove OPFS files and that browser storage can be evicted.

Never present OPFS as a normal `C:\Temp` or `/tmp` directory.

### 7.4 Vercel build

- Vite static build; no SSR requirement for the scientific workbench.
- Ensure WASM and worker assets are correctly emitted, cached and served with correct MIME type.
- Validate deep links / SPA fallback.
- Keep large model weights out of the base deploy; fetch only after user chooses a model and accepts its terms.
- Cache versioned immutable assets; keep deployment manifest/release version visible.
- Add offline/PWA support only after update and cache invalidation are tested.
- Use Vercel preview deployments for PR review and production deploy only from the release/main workflow.

### 7.5 Browser-to-native companion (optional later)

A separately installed local companion may expose native engines to a browser. If implemented:

- bind only to `127.0.0.1` / loopback;
- use unpredictable per-session auth tokens and strict origin allowlists;
- implement CSRF and DNS-rebinding protections;
- require explicit user pairing and permission per project;
- expose a narrow typed RPC API, never a generic shell;
- never listen on LAN interfaces by default;
- document the exact data boundary between browser and companion.

Do not make this a prerequisite for the standalone Vercel browser edition.

---

## 8. Native desktop runtime and release strategy

### 8.1 Tauri desktop

- Tauri 2 for UI packaging and system integration.
- Rust for device discovery, job supervision, storage, safe process launching and wgpu kernels.
- Python sidecar for the scientific package and ASE/external engine integration.
- IPC should use structured JSON messages or a documented local protocol; do not expose unrestricted local REST by default.
- Isolate each engine environment to avoid incompatible PyTorch/NumPy/SciPy dependencies.
- Use an engine manager to inspect, install, update and remove optional engines.

Tauri supports bundling external binaries/sidecars, including packaged Python APIs. This is the preferred path for integrating a local Python runtime without requiring users to install Node or Python globally.

### 8.2 One-file expectation

Aim for a single user-friendly Windows setup executable. Do not promise a tiny, completely self-contained binary with every optional scientific stack and model. Instead:

- lightweight setup executable includes UI, core runtime, baseline solvers and demo assets;
- heavy scientific engines, Python packages and model weights are optional managed downloads;
- downloads display size, source, version, license and required disk space;
- installer works offline for its base features;
- app explains which feature requires which optional engine.

For Linux, release AppImage and, where practical, `.deb` and `.rpm`. Do not call a Linux AppImage an `.exe`.

### 8.3 Sidecar lifecycle

- Launch child processes with argument arrays, not shell command strings.
- Set a restricted environment and controlled working directory.
- Capture stdout/stderr into rotating project-local logs.
- Validate executable path and SHA-256 for managed binaries.
- Track child PID/process group and terminate safely on cancellation/app shutdown.
- Do not elevate privileges for scientific computations.
- Clean only HCS-owned temporary paths; never recursively delete arbitrary user directories.

### 8.4 Updates and release signing

- Use Tauri updater only with signed artifacts.
- Keep signing private keys outside Git and CI logs.
- Test upgrade, rollback/recovery, interrupted update and corrupted signature.
- Provide checksum and release provenance for every asset.

---

## 9. MCP and autonomous research interface

### 9.1 Protocol version and SDK

Target MCP specification `2026-07-28` and official v2 SDKs as verified at project implementation time. Use the v2 Python package documented at `https://py.sdk.modelcontextprotocol.io/` and the v2 TypeScript packages documented at `https://ts.sdk.modelcontextprotocol.io/v2/`. Do not copy old v1 imports into new code without a compatibility reason.

### 9.2 Transport design

- Native local MCP server: stdio transport as default for desktop clients.
- Optional loopback Streamable HTTP for compatible local integrations, off by default.
- Web frontend: typed internal tool API, not a claim that the Vercel static page can spawn a local stdio server.
- Optional browser companion pairing can be added later under the security rules above.

### 9.3 Initial MCP tools

Implement validated, versioned tools with strict input/output schemas:

**Discovery and structure**

- `materials.search`
- `materials.get`
- `materials.compare`
- `structures.import`
- `structures.validate`
- `structures.create_crystal`
- `structures.make_supercell`
- `structures.substitute_species`
- `structures.create_vacancy`
- `structures.build_surface`

**Simulation**

- `engines.list`
- `engines.inspect`
- `simulations.estimate_resources`
- `simulations.prepare`
- `simulations.run`
- `simulations.get_job`
- `simulations.cancel_job`
- `simulations.resume_job`
- `simulations.get_result`
- `simulations.compare_results`
- `simulations.export`

**Domain workflows**

- `atomistic.relax`
- `atomistic.run_md`
- `atomistic.analyze_rdf`
- `atomistic.analyze_msd`
- `thermodynamics.phase_diagram`
- `phasefield.run`
- `electronic.prepare_dft`
- `discovery.generate_candidates`
- `discovery.screen_candidates`
- `discovery.rank_candidates`
- `reports.create_reproducibility_report`

Do not expose a tool before its implementation and test suite exist. Keep long jobs asynchronous at the product level, with a job ID, progress resources/events and cancellation path. Avoid returning megabytes of arrays through a single MCP response; return a concise summary plus a local project resource URI or exported file reference.

### 9.4 MCP resources

Expose read-oriented resources such as:

- `hcs://project/{project_id}/summary`
- `hcs://project/{project_id}/materials`
- `hcs://job/{job_id}/status`
- `hcs://job/{job_id}/result-summary`
- `hcs://engine-registry`
- `hcs://model-cards/{model_id}`
- `hcs://science/{topic}`
- `hcs://validation/{suite_id}`

### 9.5 MCP prompts

Provide carefully scoped reusable prompts:

- `design_material_for_target_property`
- `plan_virtual_screening_campaign`
- `review_simulation_methodology`
- `diagnose_convergence_failure`
- `explain_material_candidate_uncertainty`
- `compare_material_candidates`
- `prepare_reproducibility_report`

Prompts must ask the model to cite local provenance and differentiate facts, assumptions and hypotheses.

### 9.6 Safety and compute policy

- Validate all tool inputs against JSON Schema/Pydantic.
- Enforce per-job atom-count, timestep, mesh-size, memory and wall-time limits.
- Resource estimate/preflight before large jobs.
- Require explicit approval for large compute, file overwrite, engine installation, external network requests and data deletion.
- No generic `run_command`, `shell`, or arbitrary Python execution tool in the default MCP server.
- Resolve project paths inside the selected workspace; reject path traversal and symlinks escaping it.
- Keep an audit log of tool arguments, job IDs and side effects, with secrets redacted.
- Support read-only mode for research clients.

---

## 10. UI/UX and design system

### 10.1 Product identity

Working title: **HCS Material Research Kit**. Possible short app label: **HCS Materials**. Do not rename or publish under an unavailable npm/PyPI namespace without checking.

Brand signature:

> Made with love by hcsmedia and timfromhcs

Create original SVG artwork:

- primary horizontal wordmark;
- compact hexagonal/material-lattice symbol;
- monochrome logo for light/dark surfaces;
- app icon (Windows and Linux);
- favicon / pinned icon;
- social preview / Open Graph artwork;
- documentation logo and footer lockup.

Visual motif: atoms/lattice/periodic geometry, expressed as a clear modern symbol—not a copied molecule logo, university mark or existing software mark. Logo must remain legible at 16–24 px and in monochrome.

### 10.2 Art direction

Premium computational research workstation:

- graphite/ink dark theme and clean light theme;
- disciplined cyan/teal highlights for selected/active scientific data;
- amber for warnings/uncertainty, red only for errors;
- restrained gradients and subtle translucent panels only where they improve hierarchy;
- consistent typography with highly legible numerical readouts;
- scientific charts with clear axes, units, legends and color scales;
- no excessive neon, distracting animation or generic AI-chat look.

Define design tokens for color, typography, spacing, radii, shadows, focus ring, motion and chart semantics. Use semantic status tokens and do not encode meaning by color alone.

### 10.3 Main information architecture

1. **Home / Dashboard** — recent projects, active jobs, engine status, quick-start cards, storage and hardware summary.
2. **Materials Library** — local library, provider search, filters, provenance, favorites and comparison.
3. **Structure Studio** — 3D atomistic editor, lattice tools, supercells, surfaces, defects, doping and import/export.
4. **Simulation Workbench** — engine/method selector, parameter forms, resource estimates, live job status, checkpoints and result analysis.
5. **Discovery Lab** — design objectives, constrained candidate generation, screening pipelines, candidate ranking and uncertainty.
6. **Thermodynamics** — phase diagrams, composition/temperature selectors, Gibbs energy and equilibrium reports.
7. **Microstructure Lab** — phase-field, grain growth, diffusion, heat and continuum fields.
8. **Electronic Structure** — DFT preparation/results, DOS, band structure and charge-density visualisation where data exists.
9. **Data & Provenance** — source records, model cards, citations, licences, datasets and reproducibility manifest.
10. **Agent / MCP** — available tools, job plan, approvals, tool history and agent audit.
11. **Jobs** — active/queued/completed/failed history, filters, logs and checkpoints.
12. **Settings / Engine Manager** — CPU/GPU, memory limits, engine installations, API keys, storage, language, theme and updates.

### 10.4 Desktop workbench layout

Target a comfortable 1440 px desktop layout:

- left navigation rail;
- central scientific viewport or chart;
- right inspector/parameter panel;
- bottom timeline/log/job drawer;
- top context bar with project/material/job state and hardware execution indicator.

Use resizable/collapsible panels. Preserve the viewport aspect ratio and provide a full-screen mode. Avoid hiding critical units or run settings in tooltips.

### 10.5 Responsive behavior

- **Large desktop:** full three-pane research workbench.
- **Laptop:** collapsible inspector and job drawer.
- **Tablet:** two-panel layout with inspector drawer.
- **Mobile:** viewer-first/read-only-friendly workflow; bottom navigation, stacked cards, full-screen parameter sheets, simplified plots and project/job monitoring. Do not cram the desktop three-panel layout into a phone viewport.

Every feature must have intentional mobile behavior. Advanced atom editing can be limited to supported gestures/viewport widths, but basic inspection, search, job monitoring and export should remain usable.

### 10.6 Onboarding and learning curve

Offer:

- first-run hardware/backend detection with a privacy explanation;
- guided “create your first crystal” walkthrough;
- example project with scientifically labelled teaching model;
- beginner and expert explanations;
- glossary for lattice, supercell, energy above hull, DFT, potential, ensemble, convergence, phase field and uncertainty;
- inline equations and method notes;
- explainable error messages and suggested next checks.

Never present tutorials' simplified results as production-grade material properties.

### 10.7 Accessibility and i18n

- DE, EN and FR from the start; translation keys for all user-facing strings.
- keyboard navigation, visible focus states, accessible labels and screen-reader status announcements;
- WCAG 2.2 AA target;
- reduced-motion support;
- high-contrast mode and colorblind-safe plots;
- chart summaries/tables for users who cannot perceive visual plots;
- localized number formatting without changing stored canonical units.

---

## 11. Scientific visualisation and reporting

### 11.1 3D atomic view

Support:

- atoms, species-specific styles and accessible legend;
- bonds as an optional derived display, not a claim of actual bonding unless method supports it;
- unit cell, lattice vectors and periodic copies;
- atom selection and editing;
- planes, Miller indices, surfaces and supercell visualization;
- atom labels, distances, angles and measurement tools;
- trajectory playback with frame index/time/temperature/energy;
- coloring by species, charge, coordination, displacement, force or scalar field only when data is available.

### 11.2 Scientific plots

Implement standard view templates:

- energy vs optimization step;
- force/residual convergence;
- radial distribution function;
- mean-square displacement;
- temperature and energy vs time;
- density of states;
- band structure;
- phase diagram;
- Gibbs energy vs composition/temperature;
- stress-strain;
- scalar/vector/tensor field maps;
- candidate Pareto plots and uncertainty.

Every plot includes title, units, method, legend, data source and export. Do not fabricate missing series to fill a chart.

### 11.3 Portable project format

Define `.hcsproj` as a documented ZIP container:

```text
project.hcsproj
├── manifest.json
├── project.json
├── materials/
├── structures/
├── simulations/
│   └── {job_id}/
│       ├── input.json
│       ├── status.json
│       ├── provenance.json
│       ├── result.json
│       ├── logs/
│       └── artifacts/
├── datasets/
├── reports/
└── checksums.sha256
```

- version the format;
- include checksums;
- use safe extraction (reject traversal and symlink attacks);
- allow partial result bundles;
- include licences and citations where redistribution terms allow;
- do not include restricted third-party model weights by default.

### 11.4 Reports

Generate a reproducible HTML report first; optionally PDF export via browser print or a tested renderer. Report must include method, equations or method reference, input structure, parameters, units, outputs, convergence, warnings, uncertainty, limitations, engine/model provenance and source citations.

---

## 12. Security, privacy, legal and supply-chain requirements

### Local-first privacy

- No account needed for local projects.
- No default telemetry of structures, coordinates, input files, results or model prompts.
- If diagnostics telemetry is ever added, opt-in, redacted and documented.
- External database queries must display the provider and the query fields being sent.
- API keys live in OS credential storage on native systems; browser secrets remain session-only by default.
- No secrets in local logs, exported reports or crash dumps.

### Process and path security

- Use allow-listed executable paths and structured argument arrays.
- Never construct shell commands by concatenating user-controlled strings.
- Enforce project-root sandboxing for imports, exports, logs and checkpoints.
- Set strict file size and archive extraction limits.
- Protect against path traversal, zip bombs, symlink escapes and malformed scientific file parsing.
- Avoid launching unknown executable files downloaded from providers.

### Network security

- HTTPS for remote database providers and release assets.
- Verify downloaded checksums and signatures where supplied; maintain HCS checksums for its own artifacts.
- Rate limit database connectors and respect provider terms.
- Browser CORS failures must be visible; do not bypass security by embedding a secret proxy key.
- Native loopback server protections as described in the MCP section.

### Licences and attribution

- Audit each engine, dependency, dataset and model checkpoint.
- Keep third-party notices and SPDX metadata.
- Do not assume code licence also grants model-weight or data redistribution rights.
- Do not bundle restricted datasets/checkpoints without explicit permission.
- Provide citations and recommended academic references in each engine's documentation.

### Supply chain

- Lock dependencies.
- Generate SBOMs for native releases.
- Scan dependencies and containers if any are introduced.
- Pin GitHub Actions to reviewed immutable revisions where practical.
- Use OIDC trusted publishing for PyPI/npm.
- Keep release secrets isolated to protected environments.
- Generate checksums and provenance/attestations when supported.

---

## 13. Python package, npm packages and CLI

### 13.1 Python package

Proposed distribution name: `hcs-materials` (verify availability before publication). Import namespace: `hcs_materials`.

Core package should stay relatively lightweight and include:

- domain models and validation;
- job contracts and provenance;
- engine registry and adapter protocol;
- project import/export;
- CLI;
- local compute orchestration;
- MCP server entry point or extra.

Optional extras/plugins may include:

- `ase`
- `lammps`
- `qe`
- `cp2k`
- `mace`
- `mattersim`
- `matgl`
- `chgnet`
- `orb`
- `phasefield`
- `mcp`
- `dev`

Do not install every heavy engine as a base dependency. Keep conflicting ML framework versions isolated when necessary. Validate actual supported Python versions for each extra and publish a compatibility table.

Expected CLI (only expose implemented commands):

```bash
hcs-materials doctor
hcs-materials hardware
hcs-materials engines list
hcs-materials engines inspect <engine-id>
hcs-materials project create <path>
hcs-materials project validate <path>
hcs-materials structure validate <file>
hcs-materials structure convert <input> <output>
hcs-materials simulate estimate <spec.json>
hcs-materials simulate run <spec.json>
hcs-materials job status <job-id>
hcs-materials job cancel <job-id>
hcs-materials report build <project-path>
hcs-materials mcp serve --transport stdio
```

CLI requirements: clear exit codes, JSON output mode, helpful `--help`, progress display, safe paths, structured errors and no colour-only status.

### 13.2 npm packages

Possible packages (verify names and scope availability):

- `@hcs-materials/contracts`
- `@hcs-materials/core`
- `@hcs-materials/ui`
- `@hcs-materials/visualization`
- `@hcs-materials/wasm`
- `@hcs-materials/client`
- `@hcs-materials/mcp-client`

Each package needs:

- ESM-first output and explicit export map;
- TypeScript declarations;
- supported browser/Node version metadata;
- tree-shaking-friendly modules;
- license and README;
- unit tests and a package smoke test in a clean consumer project;
- semver and changelog.

### 13.3 Publishing

- Publish Python distribution to TestPyPI first, then PyPI after smoke install.
- Publish npm prerelease tags first, then stable release.
- Use GitHub Actions OIDC trusted publishing; do not place long-lived PyPI/npm tokens in repository secrets when OIDC is available.
- Only publish from a protected release tag after all gates succeed.
- Confirm ownership and package name before first public release.

---

## 14. Testing and validation strategy

### 14.1 Test pyramid

**Unit tests**

- geometry, coordinate conversion, periodic boundaries, neighbor lists;
- units, schema validation, serialization and checksums;
- solver equations and integration steps;
- project path confinement and archive parser;
- job state machine and cancellation.

**Scientific regression tests**

- analytical results for supported PDE/ODE/teaching models;
- published benchmark fixtures for external engines where licensing permits;
- force = negative energy gradient checks;
- translational/rotational invariance where appropriate;
- energy conservation or thermostat behavior for MD as appropriate;
- convergence tests under tighter cutoff, mesh, timestep and basis settings;
- phase/thermodynamic consistency checks.

**Integration tests**

- ASE structure in/out;
- engine detection and unavailable-engine behavior;
- LAMMPS adapter with a tiny known fixture;
- optional engine skip with explicit reason;
- MCP tool schema and call/response contract;
- job cancellation and restart.

**Cross-backend tests**

- CPU reference vs native wgpu/Vulkan;
- CPU reference vs browser WASM;
- WASM CPU vs WebGPU;
- compare within declared tolerance and record device features;
- test browser loss of GPU device and fallback.

**End-to-end tests**

- create project → create/import structure → run a supported calculation → inspect result → export → import into a clean workspace → reproduce result;
- offline browser workflow;
- mobile navigation and job status;
- app install/upgrade/uninstall;
- MCP host compatibility and permission flow.

### 14.2 Hardware matrix

CI and documented manual tests should cover:

- Windows x64 CPU-only;
- Windows x64 Vulkan-capable AMD/Intel/NVIDIA where available;
- Linux x64 CPU-only;
- Linux x64 Vulkan/Mesa;
- Chromium/Edge WebGPU;
- Firefox/Safari fallback paths according to actual support at test time;
- constrained RAM/VRAM and low storage;
- systems with no supported GPU.

Do not assume a CI machine provides a physical Vulkan GPU. Keep GPU tests in an optional self-hosted or scheduled hardware matrix and run CPU correctness tests everywhere.

### 14.3 Benchmark policy

Every benchmark report must record:

- hardware, OS, driver/runtime;
- code commit, compiler and dependency lock;
- input size and workload;
- warm-up, run count and measurement method;
- memory and power/thermal caveats if available;
- correctness comparison to reference output.

Never publish a speedup claim without the benchmark inputs and reproducible script.

### 14.4 Definition of done for any engine

An engine is supported only after:

- installation/detection path exists;
- version is captured;
- license and scope are documented;
- adapter has input validation and output parsing;
- at least one integration test passes;
- at least one scientific regression/benchmark test exists;
- failure/cancel/restart behavior is known;
- unsupported systems are rejected cleanly;
- docs contain a reproducible example.

---

## 15. CI/CD, releases and project quality

### Pull request checks

- formatting and lint for TypeScript, Python and Rust;
- TypeScript typecheck;
- Python unit tests, lint and type-check;
- `cargo fmt --check`, `cargo clippy`, `cargo test`;
- schema compatibility and generated-type check;
- WASM compile and browser smoke test;
- frontend build and asset-size report;
- Playwright E2E on supported CI browsers;
- dependency/license/security scans;
- no secrets scan failures;
- docs link/build checks.

### Release workflows

**Web**

- PR preview deployment to Vercel;
- stable production deployment only from a reviewed release commit/tag;
- static bundle size and WASM asset checks;
- smoke tests against production after deployment.

**Desktop**

- native Windows runner builds `.exe` installer and MSI if enabled;
- native Linux runner builds AppImage and optional deb/rpm;
- artifact signing and updater signatures;
- checksum manifest, SBOM and release notes;
- clean-install, update and smoke-test workflow.

**PyPI/npm**

- protected release tag;
- OIDC trusted publisher;
- prerelease/test registry smoke install;
- stable publish after artifact checks;
- provenance attestation where supported.

### Versioning

Use SemVer for public APIs and packages. Keep independent versions where modules genuinely release independently, but document a compatibility matrix for app ↔ schema ↔ Python package ↔ npm package ↔ engine adapters.

The `.hcsproj` schema requires an independent format version and migration path.

---

## 16. Roadmap: long-horizon phases and gates

The agent may parallelize work within a phase, but must respect dependency order and must not claim completion before gates pass.

### Phase 0 — Repository audit, research refresh and technical design

Tasks:

- inspect code, branches, issues, package names and current CI;
- verify upstream API/spec/SDK releases and licenses;
- create architecture diagrams and ADRs;
- finalize naming after checking trademarks/domains/package registries;
- define initial supported-material domain and target hardware profile;
- create schema drafts and model/fidelity taxonomy.

Gate:

- architecture accepted in repo docs;
- risks, dependencies and test strategy recorded;
- baseline build/tests recorded.

### Phase 1 — Cross-platform foundation and product shell

Tasks:

- initialize/repair monorepo and package manager workspaces;
- build React/Vite app and Tauri shell;
- create brand system, logo assets and responsive application shell;
- implement DE/EN/FR i18n;
- create design tokens, accessible components and dashboard;
- implement project library, create/open/import/export UI;
- implement engine registry UI with honest unavailable states.

Gate:

- desktop app launches on Windows/Linux CI;
- web builds and deploys to Vercel preview;
- responsive screenshots at desktop/tablet/mobile;
- keyboard and accessibility smoke tests;
- no simulation UI falsely claims an engine is available.

### Phase 2 — Domain schemas, structure studio and project format

Tasks:

- finalize JSON Schema contracts;
- generate TS/Python/Rust bindings or validators;
- implement CIF/POSCAR/XYZ/extXYZ import/export with test fixtures;
- implement lattice construction, supercells and structure validation;
- add 3D viewer, atom selection, cell editing and measurement tools;
- build `.hcsproj` archive parser/writer and checksums.

Gate:

- round-trip file fixtures pass;
- project archives pass integrity and path-safety tests;
- structure edits persist and export correctly;
- no silent corruption or unit ambiguity.

### Phase 3 — HCS compute core, browser WASM and GPU acceleration

Tasks:

- implement CPU reference kernels;
- implement one validated classical atomistic workflow;
- implement diffusion/heat solver with analytical verification;
- implement a scoped phase-field model;
- expose jobs/progress/cancel/checkpoint;
- compile Rust core to WASM;
- run calculations in workers;
- add WebGPU kernels and CPU fallback;
- add native wgpu/Vulkan path and device discovery.

Gate:

- analytical/scientific tests pass;
- CPU/WASM/native GPU comparisons within documented tolerances;
- no UI freeze;
- no browser storage corruption under quota exhaustion;
- Vulkan fallback tested on no-GPU machines.

### Phase 4 — Native Python package, CLI and external engine adapters

Tasks:

- deliver `hcs_materials` package and CLI;
- implement ASE bridge;
- implement native job worker/sidecar;
- add LAMMPS adapter and fixture tests;
- add optional MACE/MatterSim/MatGL plugins after version/license/platform validation;
- add optional CP2K/Quantum ESPRESSO input preparation and execution;
- add engine installer/manager.

Gate:

- fresh Windows/Linux install works for base package;
- optional engines are correctly detected and unavailable engines fail gracefully;
- published CLI examples are reproducible;
- adapter tests and model cards pass.

### Phase 5 — Databases and materials informatics

Tasks:

- implement OPTIMADE provider discovery and query client;
- add OQMD, AFLOW, Materials Cloud, NOMAD and Materials Project connectors;
- support user-owned API keys safely;
- cache source data and store provenance;
- implement filters, compare view and local materials library;
- display source/license/recency in records.

Gate:

- connector contract tests pass;
- terms/rate limits are respected;
- no secrets in frontend assets or logs;
- records can be traced back to provider IDs and URLs.

### Phase 6 — Discovery Lab and multi-fidelity workflows

Tasks:

- candidate generation by substitution/prototype/composition enumeration;
- optional MatterGen adapter where supported;
- structure validation and deduplication;
- ML-potential screening and domain checks;
- thermodynamic metrics with correct compatible reference hulls;
- multi-objective ranking and Pareto analysis;
- uncertainty and out-of-domain warnings;
- DFT validation queue where engine exists.

Gate:

- every generated candidate has a traceable method;
- ranking formula is transparent;
- no mixed reference energies without corrections;
- ML pre-screen and DFT validation are visually distinct;
- generated samples can be exported and reproduced.

### Phase 7 — MCP v2 and research agents

Tasks:

- implement MCP v2 stdio server;
- create strict schemas for tools/resources/prompts;
- connect MCP tools to existing validated job APIs;
- add job IDs, progress, cancel and approval gates;
- build agent audit panel in UI;
- test with multiple MCP hosts where possible;
- optionally add loopback HTTP with auth and security tests.

Gate:

- MCP Inspector and host interoperability tests pass;
- destructive/resource-heavy operations require approval;
- no arbitrary shell tool exists by default;
- all results include provenance and engine capability data.

### Phase 8 — Polish, documentation, packaging and launch

Tasks:

- comprehensive beginner-to-expert docs and tutorials;
- performance profiling, memory limits and crash recovery;
- security and license audit;
- Windows `.exe` setup and Linux AppImage/deb/rpm;
- PyPI/npm prereleases and smoke tests;
- OIDC trusted publisher configuration;
- update signing and release pipeline;
- Vercel production deployment;
- GitHub Release with hashes, SBOM, citations and release notes;
- project website/landing page and demo gallery.

Gate:

- fresh-machine install tests pass;
- browser-only mode works offline for local supported modules;
- update/rollback tests pass;
- package installs work in clean environments;
- docs accurately describe browser/native capabilities and scientific limitations.

### Phase 9 — Advanced research expansion

Only after stable release:

- polymer/molecular simulation modules;
- composites/interfaces and multiscale coupling;
- magnetism, ferroelectricity and dielectric properties where supported;
- phonons, thermal transport and advanced NEB workflows;
- active learning and user-data fine-tuning;
- plugin marketplace/registry;
- notebook/recipe workflows;
- optional external HPC schedulers and cloud execution, explicitly opt-in;
- laboratory connectivity only as a separately scoped, real-hardware integration.

---

## 17. Landing page, identity and documentation

The public site should explain the product accurately:

- **Hero:** virtual materials research studio; desktop + local browser compute.
- **Capabilities:** structures, simulations, discovery, thermodynamics, microstructure, MCP.
- **How it works:** local CPU/Vulkan/WebGPU, browser WASM, external optional engines.
- **Science and validation:** explain fidelity levels, model cards, reproducibility and limits.
- **Desktop downloads:** Windows and Linux with supported hardware/runtime details.
- **Web studio:** browser feature matrix and storage/privacy explanation.
- **Developer area:** Python, npm, CLI, MCP, engine plugin API.
- **Documentation:** beginner-to-expert learning path.
- **Credits:** “Made with love by hcsmedia and timfromhcs.”

Avoid slogans such as “perfect 1:1 simulation of reality,” “discover guaranteed materials,” or “DFT accuracy everywhere.” Prefer “reproducible virtual experiments,” “multi-fidelity materials modeling,” and “validated within documented model domains.”

---

## 18. Agent orchestration and delegation

Use specialist roles when available:

- `science-researcher`: literature, methods, physical assumptions, benchmark selection;
- `engine-integrator`: ASE/LAMMPS/DFT/ML engine adapters;
- `rust-compute`: CPU/WASM/wgpu/Vulkan kernels;
- `frontend-ux`: visual design, responsive UX, 3D/plots/accessibility;
- `mcp-agent`: protocol, tools, resources, auth and host tests;
- `qa-validation`: scientific regression, parity, integration and E2E;
- `release-engineer`: packaging, PyPI/npm, GitHub Actions, signatures and Vercel;
- `docs-writer`: user guides, method docs, citations and tutorial content.

Delegation contracts:

- define exact file ownership and interfaces;
- request tests and a concise evidence report from every subagent;
- do not merge untested branches;
- one agent owns each shared schema or central interface at a time;
- integration agent resolves conflicts and checks consistency across language bindings.

### Long-horizon loop

For every task:

1. Read the current status/roadmap and inspect the affected code.
2. State the user-facing capability and the scientific/technical acceptance criteria.
3. Research the current upstream standard and method.
4. Design or update the interface/schema first.
5. Implement the smallest end-to-end vertical slice.
6. Test normal, boundary, failure, cancellation and fallback paths.
7. Run numerical/benchmark comparisons where applicable.
8. Update docs, changelog and status.
9. Review security, licenses, performance and accessibility.
10. Commit with a precise message and record remaining debt.
11. Move the roadmap gate only after evidence passes.

Never implement dozens of empty screens before a real vertical slice works. Prefer a fully functional narrow workflow over a broad collection of mock controls.

---

## 19. Definition of a release candidate

A release candidate must contain:

- functional project creation/import/export;
- at least one real browser-local solver workflow with CPU fallback;
- at least one real native workflow with a supported engine;
- hardware/backend detection and memory preflight;
- responsive UI and working logo/brand system;
- job lifecycle, progress, cancellation and export;
- `.hcsproj` reproducibility manifest;
- provenance and fidelity labels;
- MCP v2 server with a narrow tested tool set;
- Python package and CLI;
- npm package(s) with clean-install smoke tests;
- Windows/Linux release artifacts built on matching runners;
- Vercel browser deployment;
- complete basic-to-expert docs;
- security, license and scientific regression reports.

A release candidate must not contain:

- fake results or placeholder simulation engines;
- broken navigation or inert controls;
- hidden server upload of structures/results;
- unbounded memory allocation;
- default unauthenticated loopback or LAN service;
- embedded secrets;
- unsupported scientific claims;
- unpublished limitations for browser/native execution differences.

---

## 20. Required project status format

Maintain `STATUS.md` with:

```text
# Current Status
Date:
Current branch/commit:
Working product surfaces:
Completed capabilities:
Capabilities in progress:
Known limitations:
Scientific validation evidence:
Native hardware tested:
Browser/device matrix tested:
CI state:
Security/license state:
Current blockers:
Next 5 concrete tasks:
Release readiness:
```

Maintain `ROADMAP.md` with phases, tasks, owners, dependencies, acceptance gates and evidence links. Maintain `CHANGELOG.md` using Keep a Changelog-style sections. Maintain one ADR per major architectural decision.

---

## 21. Immediate first task list

Do these before building advanced screens or adding broad solver claims:

1. Audit repository and create `STATUS.md` with the real current state.
2. Verify project/package naming and licensing.
3. Refresh official docs for MCP 2026-07-28, wgpu, Tauri, Pyodide, OPTIMADE, ASE, LAMMPS, CP2K, Quantum ESPRESSO, MACE, MatterSim and MatGL.
4. Create architecture diagrams: system contexts, desktop compute, browser compute, job lifecycle, project store, MCP boundary.
5. Define and validate `Structure`, `SimulationSpec`, `JobRecord`, `ResultBundle`, `ProvenanceRecord` schemas.
6. Build a first responsive UI shell with real project store and hardware/backend status.
7. Implement CIF/XYZ/POSCAR structure round-trip and 3D inspection.
8. Implement one CPU reference solver and analytical regression tests.
9. Compile it to WASM and run it inside a worker with OPFS checkpoint/export.
10. Build the same solver into native Rust and validate `wgpu` CPU/Vulkan parity.
11. Package the Python CLI and local engine registry.
12. Add one small native engine adapter with integration tests.
13. Only after the vertical slice passes, expand to the next engine/domain.

**Final instruction:** Build a real, testable and scientifically honest HCS research platform. The goal is maximum useful breadth over time, but never at the expense of correctness, transparency, portability, safety or reproducibility.
