# Lennard-Jones reference engine

**Engine id:** `hcs.lj-reference` · **Model id:** `lj.noble-gases.v1` ·
**Fidelity:** `classical_model` · **Version:** 0.2.0

## Purpose

A small, fully documented and tested classical engine that demonstrates the complete HCS
workflow — structure → job → result → provenance — with physics that can be checked against
closed-form results. It is **not** a materials prediction tool.

## Equations

Pair potential (energy in eV, distance in Å):

```text
U_LJ(r) = 4 ε [ (σ/r)^12 − (σ/r)^6 ]
U(r)    = U_LJ(r) · S(r)
```

Cubic switching between `r_on = 0.9 r_c` and `r_c`:

```text
S(r) = (r_c² − r²)² (r_c² + 2r² − 3 r_on²) / (r_c² − r_on²)³    r_on < r < r_c
S(r) = 1                                                        r ≤ r_on
S(r) = 0                                                        r ≥ r_c
```

Force on atom `i` from atom `j`, with `r_ij = r_j − r_i` and minimum-image boundary conditions:

```text
F_i = [ F_LJ(r)·S(r) + U_LJ(r)·12(r_c² − r²)(r_on² − r²)/(r_c² − r_on²)³ ] · r_ij
F_LJ(r) = 24 ε (σ/r)^6 [ 1 − 2 (σ/r)^6 ] / r²
```

Total potential energy: `E = Σ_{i<j, r<r_c} U(r_ij)`.

Cross-species parameters use Lorentz–Berthelot mixing:
`σ_ij = (σ_i + σ_j)/2`, `ε_ij = √(ε_i ε_j)`.

## Parameters and domain

| Species | ε (eV)  | σ (Å) |
| ------- | ------- | ----- |
| He      | 0.00088 | 2.56  |
| Ne      | 0.00309 | 2.75  |
| Ar      | 0.01032 | 3.405 |
| Kr      | 0.01404 | 3.65  |
| Xe      | 0.01998 | 4.10  |

Cutoff: 8.5 Å by default, clamped to `0.5 · min(V / |a_j × a_k|)` when the cell is smaller.

These are effective two-body parameters as commonly tabulated for the condensed noble gases.
They are **not** first-principles values, are state-dependent and are not transferable to other
elements. Any publication must re-verify them against a cited source.

## Supported tasks

| Task              | Output                                                              |
| ----------------- | ------------------------------------------------------------------- |
| `energy.evaluate` | total energy, energy/atom, forces, max force, pair count, cutoff    |
| `structure.relax` | FIRE minimisation of atomic positions (not the cell)                |
| `md.run`          | NVE velocity-Verlet trajectory, energies, temperature series, drift |
| `analysis.rdf`    | g(r) and running coordination number                                |

## Known limitations

- Two-body only: no three-body, electrostatic, magnetic or quantum contributions.
- No long-range/tail correction: cohesive energies depend on the cutoff.
- FIRE relaxes atomic positions only. A perfect crystal has exactly zero force by symmetry, so
  its energy cannot decrease; variable-cell relaxation is not implemented.
- MD is NVE only. There is no thermostat; NVT/NPT requests are rejected rather than imitated
  by velocity rescaling.
- O(N²) pair loop. The UI limits structures to 20 000 atoms (supercell) and 5 000 atoms (MD).
- `analysis.msd` is computed from an MD trajectory in the workbench, not as a standalone job
  and not over periodic wrapping; positions in the trajectory are continuous cartesian
  coordinates.

## Verification evidence

| Property                                   | Test                                | Tolerance                       |
| ------------------------------------------ | ----------------------------------- | ------------------------------- |
| Pair minimum at `2^(1/6)σ` equals `−ε`     | `lj.test.ts`                        | 1e-12 eV                        |
| Forces = −∇E (central differences)         | `lj.test.ts`                        | relative < 1e-5                 |
| Translation invariance                     | `lj.test.ts`                        | < 1e-9 eV                       |
| Zero net force in a periodic cell          | `lj.test.ts`, Rust                  | < 1e-9 eV/Å                     |
| fcc cohesive energy bracket                | `lj.test.ts`                        | −9ε < E/atom < −6.5ε            |
| NVE drift, 108 atoms, 400 × 2 fs           | `md.test.ts`                        | < 1e-3 eV/atom (observed ~3e-7) |
| Deterministic for fixed seed               | `md.test.ts`                        | exact                           |
| RDF first peak at `a/√2`, CN = 12          | `analysis.test.ts`                  | ±0.5                            |
| TS ↔ Rust parity                           | `crates/compute-core`               | < 1e-10 eV                      |
| TS ↔ WASM parity (browser kernel)          | `packages/wasm/test/parity.test.ts` | < 1e-10 eV, 8 tests             |
| In-browser cross-check on every energy job | worker + E2E test                   | tolerance 1e-8 eV / eV/Å        |

## Reproducing the reference values

```bash
npm run build:packages
npx tsx scripts/make-reference-fixtures.ts   # writes tests/fixtures/reference/lj-argon-32.json
cargo test -p hcs-compute-core -p hcs-compute-wasm
npm run build:wasm                            # rebuilds packages/wasm/wasm/hcs_compute.wasm
npx vitest run packages/wasm                   # TS ↔ WASM parity
```

## Two independent implementations

The same physics exists twice: in TypeScript (`packages/core`) and in Rust
(`crates/compute-core`, compiled to WebAssembly for the browser). They are compared:

1. in CI against a committed reference fixture (1e-10 eV);
2. in the browser on every single-point energy job, where the worker re-evaluates the cell with
   the other kernel and reports the maximum deviation. A deviation above 1e-8 eV is surfaced as
   an error, not silently accepted.

The worker uses the WASM kernel for energy evaluation, relaxation and MD, records the backend in
the result (`compute_backend`) and in the provenance environment, and falls back to the TypeScript
kernel with a visible notice if the WASM asset cannot be loaded.
