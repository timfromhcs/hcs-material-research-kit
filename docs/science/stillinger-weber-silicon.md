# Stillinger–Weber silicon reference

**Engine id:** `hcs.sw-silicon`
**Model id:** `sw.silicon.v1`
**Fidelity:** `classical_model`
**Reference:** F. H. Stillinger and T. A. Weber, "Computer simulation of local order in condensed
phases of silicon", _Physical Review B_ **31**, 5262 (1985).

## What the model is

A classical two- and three-body potential fitted to diamond-structure silicon:

```text
φ2(r)      = A ε [ B (σ/r)^p − (σ/r)^q ] exp( σ / (r − aσ) )

φ3(i,j,k)  = λ ε [ cos θ_jik + 1/3 ]²
             · exp( γσ / (r_ij − aσ) ) · exp( γσ / (r_ik − aσ) )

E          = Σ_{i<j} φ2(r_ij) + Σ_i Σ_{j<k, j,k≠i} φ3(i,j,k)
```

The three-body term is summed over every atom as the central atom. That is the convention the
1985 parameter set was fitted with: a given triple contributes once per choice of centre.

## Parameters (as published, not tuned by HCS)

| Symbol | Value        |
| ------ | ------------ |
| ε      | 2.16826 eV   |
| σ      | 2.0951 Å     |
| a      | 1.80         |
| λ      | 21.0         |
| γ      | 1.20         |
| A      | 7.049556277  |
| B      | 0.6022245584 |
| p      | 4            |
| q      | 0            |
| cos θ₀ | −1/3         |

The interaction cutoff is part of the model: `r_c = a·σ = 3.77118 Å`. HCS does not truncate
below it. A cell whose minimum-image radius is smaller than `r_c` is refused with an
instruction to build a larger supercell. For diamond silicon at `a = 5.431 Å`, a 2×2×2
conventional cell (64 atoms) is the smallest valid choice.

## What it is validated against

| Check                                  | Result                        | Where                                  |
| -------------------------------------- | ----------------------------- | -------------------------------------- |
| Analytic force vs central differences  | max deviation < 1e-5 eV/Å     | `packages/core/test/sw.test.ts`        |
| Pair derivative vs central differences | relative deviation < 1e-6     | `packages/core/test/sw.test.ts`        |
| Three-body term vs explicit expression | < 1e-12 eV                    | `packages/core/test/sw.test.ts`        |
| Energy at ideal diamond                | −4.3365 eV/atom               | `packages/core/test/sw.test.ts`        |
| Minimum of the energy–lattice scan     | between 5.38 Å and 5.50 Å     | `packages/core/test/sw.test.ts`        |
| NVE energy conservation, 64 atoms      | < 1e-3 eV/atom over 200 steps | `packages/core/test/sw.test.ts`        |
| Translation invariance                 | < 1e-9 eV                     | `packages/core/test/sw.test.ts`        |
| Net force in a periodic cell           | < 1e-9 eV/Å                   | `packages/core/test/sw.test.ts`        |
| Element refusal                        | names the unsupported element | `packages/core/test/sw-runner.test.ts` |

The published cohesive energy of the 1985 silicon set is about −4.34 eV/atom at its own
equilibrium lattice constant; the test brackets it between −5.5 and −4.0 eV/atom and checks the
minimum position independently. No experimental claim is made.

## What it does not do

- It is **silicon only**. The parameters are not transferable; every other element is refused.
- It has no electronic structure, charge transfer, magnetism or long-range electrostatics.
- It is fitted to diamond silicon. Liquid and amorphous silicon are outside its strongest
  domain, and the original set does not reproduce the density anomaly of liquid Si.
- It does not include a barostat: `NPT` is refused rather than imitated.
- The O(N·z²) neighbour-triplet loop is a reference implementation, not a large-scale MD engine.

## Reproducing a run

```bash
npm run build:packages
node packages/cli/dist/index.js run \
  --structure silicon-2x2x2.json \
  --spec sw-energy.json \
  --out ./runs/si-energy
```

with a spec containing:

```json
{
  "task_type": "energy.evaluate",
  "engine_id": "hcs.sw-silicon",
  "model_id": "sw.silicon.v1",
  "fidelity_level": "classical_model",
  "parameters": {}
}
```

The result, provenance, report and log are written to `--out`; the provenance names the 1985
paper and records the full cutoff and the three-body convention.
