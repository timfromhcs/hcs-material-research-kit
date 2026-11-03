# Fidelity levels

Every result carries exactly one visible level. The labels describe the **method and evidence
behind a result**, not a universal accuracy ranking: a classical model can be excellent inside
its domain and wrong outside it.

| Level | Meaning | What must be recorded |
|---|---|---|
| `illustrative` | Deliberately simplified teaching physics; not a materials prediction | that it is illustrative, the simplified equations |
| `classical_model` | A named classical potential or model with a declared domain | model id, parameters, parameter source, cutoff/mixing rules |
| `ml_potential` | A named learned interatomic potential | model card, checkpoint SHA-256, license, training domain, supported elements |
| `semi_empirical` | An identified approximate electronic model (e.g. a supported tight-binding method) | method, parameterisation, reference |
| `first_principles` | A named DFT/ab-initio method | functional, basis/pseudopotential, cutoff, k-points, convergence, code version |
| `continuum_model` | A documented PDE/FEM/phase-field model | equations, material parameters, boundary conditions, mesh, timestep |
| `benchmark_validated` | Additionally verified against an identified benchmark | benchmark id/version, tolerance, measured deviation |
| `experiment_referenced` | Compared with a cited experimental dataset | citation, conditions; **HCS did not perform the experiment** |

## Rules enforced by the code

- `ResultBundle` requires `fidelity_level`, `convergence` and at least one `limitation`.
- The job runner rejects a fidelity level the engine does not declare (`fidelity_mismatch`).
- An engine is only runnable when it is in the registry with `builtin` or `installed` state.
- `benchmark_validated` is never assigned automatically; it requires an explicit benchmark run.
- A fidelity label never implies laboratory proof, synthesis or certification.

## Current mapping in v0.1.0

| Engine | Level | Notes |
|---|---|---|
| `hcs.lj-reference` | `classical_model` | pair potential, noble gases only, `analytically_verified` for forces and energy conservation |
| `hcs.heat1d-reference` | `continuum_model` | analytically verified against a Fourier mode |

No engine in this release is `first_principles`, `ml_potential` or `benchmark_validated`.
