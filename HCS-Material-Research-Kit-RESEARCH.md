# HCS Material Research Kit — Research Brief

**Research date:** 3 November 2026  
**Proposed project:** HCS Material Research Kit (working title)  
**Brand line:** _Made with love by hcsmedia and timfromhcs_  
**Purpose:** Research basis for a local-first, cross-platform virtual materials research studio with native Windows/Linux and Vercel-hosted browser editions.

---

## 1. Executive research conclusion

The strongest architecture is **not** a single universal physics engine. It is an integrated research workbench that combines:

- established scientific engines for different physical regimes;
- machine-learning interatomic potentials and material foundation models for fast screening;
- interoperable materials databases;
- an auditable workflow and provenance layer;
- an MCP interface for agentic research;
- a shared UX and job/result contract across desktop and browser execution profiles.

The project should distinguish a _shared research workflow_ from _identical solver capability_. A browser can run meaningful local simulations using WebAssembly and WebGPU, but it cannot honestly promise that every full desktop DFT, ab-initio molecular dynamics, large-scale molecular dynamics, and multiphysics workload is available at the same scale. The web edition should provide the same project model, workflow, visualisation, parameter interface, and export formats, while declaring which execution engines are available in the browser. Heavy engines can be enabled in the native app or through a separately installed local companion.

No result should be described as “1:1 real” in an unrestricted sense. Simulation output is conditional on the physical model, approximations, training domain, numerical settings, reference data, boundary conditions, and convergence. The product should target **scientifically defensible, reproducible, benchmarked virtual experiments**, with explicit fidelity labels and validation evidence.

## 2. Research trends and notable laboratories

### 2.1 Agentic materials research

Lawrence Berkeley National Laboratory announced **FORUM-AI** on 3 February 2026. The project is described as a full-stack agentic AI system for materials science, intended to support hypothesis generation, computer simulation, and experimental analysis. This is a particularly relevant reference for the HCS product direction: the agent should orchestrate and explain research workflows, not merely answer questions in a chat pane.

- Berkeley Lab announcement: <https://eta.lbl.gov/news/berkeley-lab-leads-effort-build-ai-assistant-energy-materials-discovery>
- Berkeley Lab News Center: <https://newscenter.lbl.gov/2026/02/03/berkeley-lab-leads-effort-build-ai-assistant-energy-materials-discovery/>

### 2.2 AI-generated materials and stability screening

**MatterGen** is Microsoft's generative model for inorganic materials design. Its public implementation supports conditional material generation and provides an evaluation workflow that uses MatterSim for relaxation and screening. The repository documents Linux/CUDA-oriented installation guidance and notes that ML-force-field screening is not equivalent to DFT; it recommends DFT confirmation, especially for less common chemical systems.

- MatterGen repository: <https://github.com/microsoft/mattergen>
- MatterGen paper: <https://www.nature.com/articles/s41586-025-08628-5>

**MatterSim** is an open-source machine-learning atomistic model. Its public repository identifies two v1 checkpoints and explicitly warns that the v1 model is designed for bulk atomistic simulations; surfaces, interfaces, and long-range-interaction-dominated properties require caution or fine-tuning.

- MatterSim repository: <https://github.com/microsoft/mattersim>
- MatterSim documentation: <https://microsoft.github.io/mattersim/>

A separate Microsoft Foundry Labs page describes newer MatterSim capabilities, but the implementation must verify that any referenced model/checkpoint is publicly downloadable, licensed for the intended use, and reproducible before exposing it as a supported engine.

- Microsoft Foundry Labs MatterSim overview: <https://labs.ai.azure.com/innovations/mattersim/>

### 2.3 Equivariant and graph-based potentials

**MACE** is a family of equivariant machine-learning interatomic potentials. Its foundation-model documentation lists MACE-MP-0, MACE-MPA-0, MACE-OMAT-0, and MACE-MATPES-0 variants, with different training data, model sizes, and intended scientific domains. Model choice must therefore be tied to chemical composition, phase, target property, and training domain—not just a generic “accuracy” score.

- MACE foundation models: <https://mace-docs.readthedocs.io/en/latest/guide/foundation_models.html>

**MatGL v3.0.0 (May 2026)** moved to a PyTorch Geometric-only backend and corrected message-passing behavior in TensorNet, M3GNet, and QET. It also states that pre-existing weights from the earlier convention are no longer numerically valid and that updated weights are hosted by the `materialyze` Hugging Face organization. HCS must pin compatible package/checkpoint pairs and record model hashes.

- MatGL: <https://matgl.ai/>

**ORB** publishes pretrained atomic simulation models. Its repository notes that Windows support is not guaranteed, so an HCS Windows installer must not advertise ORB as a guaranteed built-in feature. Treat it as an opt-in adapter with platform checks.

- ORB models: <https://github.com/orbital-materials/orb-models>

### 2.4 Discovery at scale and its limits

Google DeepMind's GNoME work demonstrated large-scale graph-network-guided crystal discovery. Its paper reports 2.2 million candidate crystal structures stable with respect to earlier reference data and 381,000 entries on an updated convex hull. The paper also discusses remaining challenges such as polymorph competition, vibrational stability, configurational entropy, and synthesizability. This is a strong argument for HCS to separate _predicted thermodynamic stability_ from _dynamical stability_ and _experimental synthesizability_.

- DeepMind overview: <https://deepmind.google/blog/millions-of-new-materials-discovered-with-deep-learning/>
- Nature paper: <https://www.nature.com/articles/s41586-023-06735-9>

A November 2026 review describes a direction integrating foundation models, LLMs, explainable AI, causal inference, and autonomous laboratories into a closed-loop materials-discovery process. HCS should adopt the interoperable software architecture, while remaining explicitly a virtual simulation/research tool unless connected to real laboratory hardware.

- Review: <https://doi.org/10.1016/j.materresbull.2026.114251>

### 2.5 Relevant West Coast / Silicon Valley research ecosystem

The most relevant cluster is broader than private Silicon Valley companies alone:

- **Lawrence Berkeley National Laboratory (Berkeley):** Materials Project, energy materials, materials informatics, AI and FORUM-AI. The Hacking Materials research group describes its work as computational materials science using theory, high-performance computing and AI, and directly connects Materials Project and FORUM-AI to the discovery workflow.
- **Stanford University (Palo Alto):** materials science and engineering research spanning polymers, ceramics, glass, composites, biomaterials, energy storage and information technology.
- **Lawrence Livermore National Laboratory (Livermore):** computational materials and HPC research; include as a regional national-lab ecosystem node and verify specific project interfaces before integrating.
- **IBM Research – Silicon Valley (San Jose):** AI/ML, semiconductors, renewable materials and storage-related research.
- **Google DeepMind:** GNoME and graph-network materials discovery.
- **Microsoft AI for Science:** MatterGen and MatterSim.
- **Discovered Materials (Silicon Valley startup):** its company-published research page introduces Material Discovery Bench, a long-horizon benchmark around thermally conductive dielectric materials for semiconductor/3D-chip applications. The company reports hundreds of computational candidate discoveries but only one candidate with a plausible synthesis route on its own benchmark page. Treat these numbers and rankings as company-reported, not independent verification; the synthesis gap is still a useful benchmark lesson.
- **NIST:** FiPy and computational approaches to microstructural evolution.

This is a landscape map, not a claim that these labs endorse or participate in HCS.

### 2.6 Long-horizon discovery and agent benchmarks (2026)

The **MADE: Benchmark Environments for Closed-Loop Materials Discovery** paper was published in ICML 2026 (PMLR 306). It argues that static property prediction tests miss the sequential, budget-constrained and adaptive nature of discovery, and proposes a benchmark environment for closed-loop candidate proposal, evaluation and refinement. This is particularly useful for measuring HCS research agents rather than only their final answers.

The **Material Discovery Bench** from Discovered Materials is a Silicon Valley industry benchmark focused on dielectric materials for semiconductor cooling / 3D chip packaging. Its company-published page describes long-horizon research runs, candidate ranking and synthesis-route evaluation. The page itself reports that its agent runs produced many computational candidates but very few plausible synthesis pathways. Treat its results as self-reported benchmark data and review its scoring/verifiers before making direct comparisons.

**MatToolBench** advertises tasks spanning GUI workflows, scientific software APIs and materials-data retrieval. It is relevant to desktop-agent and MCP testing, but its task set, dependencies and licensing must be audited before adoption.

**Matbench Discovery** remains a key evaluation target for ML energy models that screen inorganic-crystal stability. Its Figshare data record showed a refreshed dataset posted on 1 November 2026 with a total download size of about 16 GB and a CC BY 4.0 license. HCS should ship only tiny permitted fixtures by default and offer a clearly labelled optional benchmark-data downloader with license attribution and disk-space preflight.

References:

- Berkeley Lab Hacking Materials group: <https://hackingmaterials.lbl.gov/>
- Materials Project at Berkeley Lab: <https://materialssciences.lbl.gov/research/research-programs/materials-project/>
- Stanford Materials Science and Engineering: <https://engineering.stanford.edu/faculty-research/departments/materials-science-engineering>
- IBM Research – Silicon Valley: <https://research.ibm.com/labs/silicon-valley>
- MADE (PMLR ICML 2026): <https://proceedings.mlr.press/v306/malik26a.html>
- Material Discovery Bench: <https://discoveredmaterials.com/research/>
- MatToolBench: <https://mattoolbench.github.io/>
- Matbench Discovery data record (updated 1 November 2026): <https://doi.org/10.6084/m9.figshare.22715158>
- MatFlowBench overview (October 2026): <https://blog.collinear.ai/p/introducing-matflowbench>

HCS should create its own public, deterministic benchmark suite with bounded compute budgets, held-out materials, executable verifiers, reproducible seeds and scoring for correctness, cost, uncertainty calibration, method selection, synthesis plausibility (where evidence exists), and provenance quality. Include both a narrow scientific benchmark and an end-to-end agent benchmark.

## 3. Simulation engines and what each should do

| Area                               | Candidate engine / library          | Appropriate use                                                                     | HCS integration stance                                                                       |
| ---------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Atomistic data model and workflows | ASE                                 | Build/manipulate structures; common calculator interface                            | Core Python integration layer                                                                |
| Electronic structure / DFT         | Quantum ESPRESSO                    | Plane-wave DFT, energies, forces, phonons, NEB workflows                            | Optional installed native engine; never pretend a simple web model is DFT                    |
| DFT and ab-initio MD               | CP2K                                | Solids, liquids, molecules, AIMD, mixed Gaussian/plane-wave workflows               | Optional native engine; CPU route first, GPU availability documented separately              |
| Molecular dynamics                 | LAMMPS                              | Classical and ML-potential MD, transport and thermal workflows                      | Optional native engine; CPU baseline and supported accelerator packages                      |
| ML interatomic potentials          | MACE, MatterSim, MatGL, CHGNet, ORB | Fast force/energy predictions and relaxation in defined domains                     | Plugin adapters; model card, license, checkpoint hash and validity scope required            |
| Phase equilibria                   | pycalphad                           | CALPHAD thermodynamics and phase diagrams                                           | Native optional Python module; browser subset only where dependency/data support is verified |
| Phase field / multiphysics         | MOOSE, FiPy, OpenPhase              | Microstructure evolution, diffusion, phase transformations, mechanics/heat coupling | Native optional adapters; small validated browser solvers for simple models                  |
| PDE / continuum models             | FiPy; selected FEM/PDE solvers      | Heat, diffusion, coupled fields                                                     | HCS Rust/WASM solver kernels for a carefully scoped subset                                   |
| Structure and symmetry             | ASE, pymatgen, spglib               | CIF/POSCAR/XYZ conversion, symmetry, defects, surfaces, supercells                  | Shared data contract with native implementations and browser WASM subset                     |

Official sources:

- Quantum ESPRESSO: <https://www.quantum-espresso.org/documentation/>
- CP2K features: <https://www.cp2k.org/features>
- LAMMPS accelerator packages: <https://docs.lammps.org/latest/package.html>
- ASE: <https://docs.ase-lib.org/>
- pycalphad: <https://github.com/pycalphad/pycalphad>
- MOOSE Phase Field: <https://mooseframework.inl.gov/modules/phase_field/>
- FiPy: <https://pages.nist.gov/fipy/en/latest/README.html>
- OpenPhase: <https://docs.openphase-solutions.com/OpenPhase/getting-started/introduction.html>
- OpenKIM: <https://openkim.org/> and <https://github.com/openkim/kim-api>

## 4. Databases and interoperability

HCS should implement a provider-neutral materials data layer. **OPTIMADE** is the first interoperability target; its v1.3.0 release is listed as December 2025. One filter/query model can then be used across participating databases.

Priority sources:

1. **Materials Project** — materials properties and computed structures; API key management is required for the supported API. Never put a shared API key in public frontend code.
2. **OQMD** — REST API and OPTIMADE interface; its API page states that public API access does not require credentials.
3. **AFLOW** — REST API for searching and downloading materials records.
4. **Materials Cloud** — OPTIMADE endpoints and datasets.
5. **NOMAD** — open research-data platform with search, API, upload and workflow facilities.
6. **OpenKIM** — standardized interatomic model repository and tests; distinguish model repository metadata from a materials-structure database.

Sources:

- OPTIMADE: <https://www.optimade.org/>; specification: <https://www.optimade.org/specification/latest/>
- Materials Project API: <https://github.com/materialsproject/docs/blob/master/docs/open-apis/the-materials-api.md>
- OQMD API: <https://oqmd.org/api/>
- AFLOW API: <https://aflow.org/documentation/>
- Materials Cloud OPTIMADE: <https://optimade.materialscloud.org/>
- NOMAD: <https://docs.nomad-lab.eu/>
- OpenKIM: <https://openkim.org/>

Implementation rules:

- Store provider name, provider record ID, source URL, retrieval timestamp, license/terms, and source revision where available.
- Cache API responses with provider-specific expiry and rate limiting.
- Allow a user-provided Materials Project API key, stored only in the native OS credential vault for desktop; for web use, keep it session-only unless the user explicitly opts into browser storage.
- No secret, API key, or privileged proxy token may be embedded in a Vercel static bundle.
- Preserve source provenance and do not silently merge different values with different calculation settings.

## 5. MCP and agentic research

As of the research date, the official MCP Python SDK documentation identifies **v2 as the current stable line**, implementing the **2026-07-28 specification**. The TypeScript SDK v2 is likewise the stable line. Python SDK v2 requires Python 3.11+ and supports stdio, Streamable HTTP, and SSE; TypeScript v2 uses separate packages such as `@modelcontextprotocol/server` and `@modelcontextprotocol/client`.

The 2026-07-28 specification describes a stateless protocol core, multi-round-trip requests, header-based routing, cacheable list results, authorization hardening, and a formal extension framework. The newer Streamable HTTP transport changes how clients handle sessions and streaming. HCS must implement the current SDK line and test compatibility with target MCP hosts rather than copy 2025-era examples.

- MCP 2026-07-28 announcement: <https://blog.modelcontextprotocol.io/posts/2026-07-28/>
- Specification: <https://modelcontextprotocol.io/specification/2026-07-28>
- Python SDK v2: <https://py.sdk.modelcontextprotocol.io/>
- TypeScript SDK v2: <https://ts.sdk.modelcontextprotocol.io/v2/>

Suggested MCP capability design:

- **Tools:** search materials, retrieve structure, validate structure, generate cell, build supercell, relax structure, run MD, calculate phase diagram, run phase-field model, prepare DFT input, inspect job, cancel job, compare candidates, export report.
- **Resources:** engine registry, material records, project summaries, experiment manifests, model cards, validation protocol and scientific glossary.
- **Prompts:** propose a material for a target, critique a calculation, diagnose convergence, plan a screening campaign, explain uncertainty, prepare a reproducibility report.

The native app should expose a local stdio MCP server and optionally a loopback Streamable HTTP bridge. The browser app should not pretend that a Vercel-hosted page can launch a local stdio MCP process. Browser-only agent actions may use an internal typed tool API; local MCP integration should require a separately installed companion or native app. Any HTTP bridge must be loopback-only, authenticated, origin-restricted, protected against DNS rebinding, and disabled by default.

## 6. Browser execution: WebAssembly, WebGPU and local storage

### 6.1 Feasible approach

- Compile the shared Rust numerical core to WASM for browser use.
- Use WebGPU for selected parallel kernels when available.
- Use a WebAssembly SIMD or ordinary CPU fallback for every browser-supported operation.
- Run all long-running tasks in Web Workers; never block the UI thread.
- Use WebGL2 as a rendering fallback where WebGPU is unavailable.
- Consider Pyodide for optional Python notebooks or scripts, not as a promise that every native scientific Python dependency will run in a browser.

`wgpu` is a particularly useful cross-platform foundation: its native Rust API runs on Vulkan, Metal, D3D12 and OpenGL, and its WASM target runs on WebGPU (with a WebGL2 path). This allows selected HCS-owned WGSL compute kernels to be reused across native and browser environments. This does **not** automatically make Quantum ESPRESSO, CP2K, LAMMPS, MACE or arbitrary Python packages portable to WebAssembly.

Sources:

- wgpu: <https://wgpu.rs/doc/wgpu/>
- WebGPU API: <https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API>
- Three.js WebGPU renderer and WebGL2 fallback: <https://threejs.org/manual/pages/webgpurenderer>
- Pyodide: <https://pyodide.org/en/stable/>

### 6.2 Browser compatibility and scientific precision

MDN currently labels WebGPU as having limited availability / not Baseline. Feature detection is mandatory. If WebGPU is absent or denied, all supported operations must use CPU/WASM, and the visualiser must use WebGL2 where possible.

Scientific DFT and many high-accuracy solvers rely on complex arithmetic and double precision. WebGPU does not provide a universally portable, full FP64 path equivalent to native scientific libraries. Therefore:

- use CPU FP64 for high-precision/reference calculations where needed;
- use GPU/WGSL only for kernels whose precision and stability have passed benchmarks;
- expose numerical precision and selected device in result metadata;
- compare GPU results against CPU reference implementations within per-kernel, scientifically justified tolerances;
- never relabel an approximate or reduced-precision computation as DFT.

### 6.3 Browser-local storage is sandboxed

The Origin Private File System (OPFS) offers efficient origin-private file storage, including synchronous access handles in workers. It is not a normal visible Windows/Linux temporary folder. It is governed by browser storage quotas, may be removed when site data is cleared, and can be evicted under storage pressure. Use `navigator.storage.estimate()` and optionally request persistence with `navigator.storage.persist()`, while still treating browser storage as potentially disposable.

- MDN OPFS: <https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system>
- MDN storage quotas and eviction: <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>

Recommended web workspace design:

- OPFS for temporary job data and large binary arrays;
- IndexedDB for project metadata, settings and small indexes;
- in-memory worker buffers for transient arrays;
- explicit export to user-selected files or downloadable project archives;
- storage quota monitor, cleanup manager and interrupted-job recovery;
- no claim that browser temporary files are guaranteed to survive a browser reset.

### 6.4 Vercel's correct role

Deploy the browser client as a static Vite build to Vercel. Run numerical work on the user's machine via browser WASM/WebGPU. Do not put long-running atomistic or DFT simulations in Vercel Functions. Vercel documents finite function duration, memory, and deployment limits; static hosting avoids turning a local-first science application into a server-compute product.

- Vercel function limits: <https://vercel.com/docs/functions/limitations>
- Vercel general limits: <https://vercel.com/docs/limits>
- Vite assets: <https://vite.dev/guide/assets>

Optional server functions may be used for public metadata, release manifests, or non-sensitive discovery helpers, but not as the core simulation backend. Static browser builds must contain no private API keys.

## 7. Desktop and native acceleration

Use **Tauri 2 + Rust + wgpu + Python scientific sidecars**.

- Tauri packages desktop UI and native capabilities; it supports Windows NSIS `.exe` and MSI installers, and Linux AppImage/deb/rpm targets.
- Tauri can bundle external sidecar executables, including Python programs packaged with PyInstaller.
- `wgpu` native Vulkan can accelerate HCS-owned compute kernels on supported Windows/Linux GPUs; CPU implementations remain the correctness reference and fallback.
- Existing engines must be integrated through their own supported backends. Do not claim that a library has Vulkan support merely because the HCS shell uses wgpu.

Sources:

- Tauri bundle configuration: <https://v2.tauri.app/reference/config/>
- Tauri sidecars: <https://v2.tauri.app/develop/sidecar/>
- Tauri Windows installers: <https://tauri.app/distribute/windows-installer/>
- wgpu: <https://wgpu.rs/doc/wgpu/>

A truly self-contained single-file executable containing every scientific engine, Python runtime, model checkpoint and dataset is not realistic as a sensible default. The practical release target is:

- Windows: one signed NSIS setup `.exe` (plus MSI if useful); optionally a portable launcher build for the lightweight core.
- Linux: AppImage plus `.deb` and `.rpm` where CI supports them; Linux does not have a Windows-style universal `.exe`.
- Package only the lightweight app, local core, essential runtime and demo models. Install large engines/checkpoints on demand through an engine manager with explicit license acceptance and disk-space estimates.

Tauri's updater requires signed update artifacts. Keep private signing keys in CI secrets, never in the repository.

- Tauri updater: <https://v2.tauri.app/plugin/updater/>

## 8. Frontend and scientific UX stack recommendation

A maintainable starting stack:

- React + TypeScript + Vite for a static web application and Tauri frontend.
- Tailwind CSS with a Radix/shadcn-style accessible component system.
- TanStack Router and TanStack Query for navigation and remote metadata state.
- Zustand (or another small state store) for local workbench state.
- Zod for client-side schema validation, generated from the canonical JSON Schema contracts.
- Three.js WebGPURenderer with its WebGL2 fallback for atomic/crystal interaction.
- VTK.js for scientific scalar/vector/tensor and volumetric visualisation where appropriate.
- Plotly.js or another mature scientific plotting library for DOS, band structures, trajectories, phase diagrams and time-series plots.
- Web Workers for simulation jobs and Pyodide only for optional browser Python workflows.

References:

- Three.js WebGPU renderer: <https://threejs.org/manual/pages/webgpurenderer>
- VTK.js: <https://kitware.github.io/vtk-js/docs/>
- Vite asset handling: <https://vite.dev/guide/assets>

Visual direction: premium scientific workstation, not generic SaaS. Use a restrained graphite/ink foundation, high-contrast typography, carefully chosen cyan/teal and amber accents, excellent scientific plot legibility, and a light theme as well as dark theme. Include original SVG brand assets for HCS Material Research Kit, a compact mark, monochrome mark, favicon, desktop icon and social preview. Avoid copying other research-lab branding.

## 9. Packaging and registries

### Python / PyPI

Publish a small core package such as `hcs-materials` (name must be checked for availability before release). Keep heavy engines optional extras or separately versioned plugins. Use the package for the domain model, engine registry, CLI, local job service, and Python adapters. Use Python package metadata, typed public APIs, tests, documentation, and wheels/sdists.

Use PyPI Trusted Publishing with GitHub Actions OIDC rather than long-lived upload tokens where possible.

- PyPI Trusted Publishers: <https://docs.pypi.org/trusted-publishers/>

### npm

Potential packages:

- `@hcs-materials/contracts`
- `@hcs-materials/core`
- `@hcs-materials/ui`
- `@hcs-materials/visualization`
- `@hcs-materials/wasm`
- `@hcs-materials/mcp-client`

Confirm package-name availability, ownership, package boundaries and license metadata before the first public publish. npm Trusted Publishing can use GitHub Actions OIDC and can generate provenance for public packages.

- npm Trusted Publishers: <https://docs.npmjs.com/trusted-publishers/>

## 10. Major implementation risks

1. **Scientific overclaiming:** solved with fidelity labels, benchmark suites, provenance, uncertainty and clear model limitations.
2. **Browser parity overclaiming:** use a common workflow/API and engine capability matrix, not a false promise that browser WASM equals every native engine.
3. **Vulkan overclaiming:** use Vulkan only for HCS kernels and adapters that actually support it; CPU is always available.
4. **FP64 and convergence:** CPU reference implementations and solver-specific precision checks.
5. **Engine install complexity:** engine manager, isolated optional environments, version pinning and explicit hardware/license checks.
6. **Model licensing and data usage:** audit code, weights, training datasets and reference data independently; record the relevant license and usage terms.
7. **Model out-of-domain results:** domain checks, uncertainty indicators, fallback to higher-level calculations, and no silent extrapolation.
8. **Browser storage eviction:** workspace export, quota monitoring, checkpointing and data-loss warnings.
9. **MCP safety:** constrained tools, strict schemas, job quotas, confirmation for destructive or resource-heavy actions, safe paths and no arbitrary shell execution.
10. **One-file release expectations:** ship a compact launcher/installer and download optional engines and weights on demand.

---

## 11. Recommended engineering decisions

1. **Shared domain contract:** JSON Schema is canonical; generate/validate TypeScript and Python types.
2. **One workflow model:** the same project, task, job, result and provenance schemas are used by desktop and browser.
3. **Two execution profiles:** `native` (Rust + Python + external engines) and `browser` (WASM + WebGPU + OPFS).
4. **CPU as baseline:** all core calculations must work without CUDA; Vulkan is an optional acceleration path for validated HCS kernels.
5. **External engines remain external:** integrate mature solvers rather than forking them into an unmaintainable monolith.
6. **Local-first privacy:** no simulation structure or result is uploaded by default.
7. **MCP v2:** use official 2026-07-28-compatible SDKs.
8. **Auditable results:** every result includes input hashes, code/engine/model versions, units, precision, parameters, random seed, data source and validation status.
9. **Staged scientific scope:** start with a small set of correct, tested workflows; add domains through adapters and benchmark gates.
10. **Public releases:** PyPI/npm via OIDC, desktop binaries via GitHub Releases, web app on Vercel.
