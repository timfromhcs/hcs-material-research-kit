# Engine registry and capability matrix

An engine appears in the runtime registry **only if it is implemented and tested**. Planned
engines are listed separately with `status: "not_implemented"` and can never be selected in the
UI or called through MCP.

## Implemented (runnable)

| Engine                 | Tasks                  | Elements           | Backends                                    | Fidelity          | License note                                      |
| ---------------------- | ---------------------- | ------------------ | ------------------------------------------- | ----------------- | ------------------------------------------------- |
| `hcs.lj-reference`     | energy, relax, md, rdf | He, Ne, Ar, Kr, Xe | cpu (TS), cpu (Rust), wasm, webgpu (energy) | `classical_model` | HCS code MIT; parameters are literature estimates |
| `hcs.sw-silicon`       | energy, relax, md, rdf | Si                 | cpu (TS)                                    | `classical_model` | HCS code MIT; 1985 parameters are published data  |
| `hcs.heat1d-reference` | heat_1d, diffusion_1d  | —                  | cpu (TS)                                    | `continuum_model` | MIT                                               |

Ensembles: `hcs.lj-reference` and `hcs.sw-silicon` run **NVE** and **Langevin NVT**. There is no
barostat, so **NPT is refused** with `unsupported_ensemble`; the message names the missing
component.

The WASM backend is the Rust kernel compiled with a C ABI (`crates/compute-wasm`). It covers
Lennard-Jones energy/force evaluation, FIRE relaxation and NVE/NVT molecular dynamics, and is
used for the actual computation in the browser. Every result records `compute_backend`;
single-point energy jobs are additionally re-evaluated with another implementation and the
deviation is shown.

The WebGPU backend (`@hcs-materials/webgpu`) is a WGSL Lennard-Jones kernel used for single-point
energy/force jobs. It is f32, and every GPU result is cross-checked against the f64 TypeScript
kernel before it is presented. MD and relaxation stay on WASM/CPU because the reference runner
is synchronous. If a caller forces `backend: "webgpu"` and no adapter exists, the job fails with
the reason instead of silently falling back.

The Stillinger–Weber engine is CPU-only in this release. Its cutoff is mandatory (`a·σ ≈
3.771 Å`), so a cell that cannot support it is refused with the required supercell size rather
than truncated.

## Planned (not implemented, not runnable)

| Engine                   | Planned tasks           | Blocker                                                                            |
| ------------------------ | ----------------------- | ---------------------------------------------------------------------------------- |
| ASE bridge               | validate, relax, energy | native Python bridge + adapter tests                                               |
| LAMMPS                   | md, relax               | subprocess adapter, input generation, log/dump parsing, cancellation               |
| Quantum ESPRESSO         | energy, relax           | external install, pseudopotentials, convergence records                            |
| CP2K                     | energy, md              | external install, CPU-first integration                                            |
| MACE                     | energy, relax, md       | model card, checkpoint hash, license and element matrix                            |
| MatterSim                | energy, relax           | checkpoint availability and platform verification                                  |
| MatGL v3                 | energy, relax           | pinned package/checkpoint pair (v3 weights are not numerically compatible with v2) |
| pycalphad                | phase diagram           | TDB data licensing and native module                                               |
| FiPy / MOOSE / OpenPhase | phase field             | native installation and validated model classes                                    |
| NPT barostat             | md                      | cell dynamics and stress; a wrong barostat is worse than an honest refusal         |

OPTIMADE is **implemented** as an import path in the Python/desktop editions (CLI + MCP), not as
an atomistic engine. The browser cannot call providers directly because they send no CORS
headers.

## Definition of done for adding an engine

1. Official repository, release status, supported platforms verified.
2. License audit per artefact: code, weights, training data, redistribution.
3. Physical scope: elements, phases, temperature/pressure, training domain, failure modes.
4. Benchmark or reference cases with tolerances.
5. Model card and `EngineRecord` with `known_limits`.
6. Adapter with input validation and output parsing.
7. Integration test, scientific regression test, failure/cancel/restart behaviour.
8. Unsupported systems rejected cleanly; docs contain a reproducible example.

Nothing is added "just in case"; a dropdown entry without an engine behind it is a bug.
