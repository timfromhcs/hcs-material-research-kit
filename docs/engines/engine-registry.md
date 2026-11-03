# Engine registry and capability matrix

An engine appears in the runtime registry **only if it is implemented and tested**. Planned
engines are listed separately with `status: "not_implemented"` and can never be selected in the
UI or called through MCP.

## Implemented (runnable)

| Engine                 | Tasks                  | Elements           | Backends                                 | Fidelity          | License note                                      |
| ---------------------- | ---------------------- | ------------------ | ---------------------------------------- | ----------------- | ------------------------------------------------- |
| `hcs.lj-reference`     | energy, relax, md, rdf | He, Ne, Ar, Kr, Xe | cpu (TS), cpu (Rust), wasm (energy only) | `classical_model` | HCS code MIT; parameters are literature estimates |
| `hcs.heat1d-reference` | heat_1d, diffusion_1d  | —                  | cpu (TS)                                 | `continuum_model` | MIT                                               |

Execution backends are probed, not assumed: WebGPU adapters are detected and reported, but no
HCS kernel currently has a WebGPU implementation, so the CPU path is used and the UI says so.

The WASM backend is the Rust kernel compiled with a C ABI (`crates/compute-wasm`). It covers
energy/force evaluation, FIRE relaxation and NVE molecular dynamics, and is used for the actual
computation in the browser. Every result records `compute_backend`; single-point energy jobs are
additionally re-evaluated with the other implementation and the deviation is shown.

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
| OPTIMADE connectors      | database search         | provider terms, rate limits, API-key handling                                      |

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
