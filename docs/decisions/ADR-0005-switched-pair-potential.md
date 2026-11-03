# ADR-0005: Cubically switched pair potential

**Status:** accepted · 2026-11-03

## Context

The first implementation used the common "truncated and energy-shifted" Lennard-Jones form.
It is continuous in energy but **not** in force at the cutoff. During MD, pairs crossing `r_c`
inject small energy errors every step; measured drift was ≈ 4 × 10⁻³ eV/atom — three orders of
magnitude worse than the documented tolerance and enough to make NVE results untrustworthy.

## Decision

Apply a cubic switching function `S(r)` between `r_on = 0.9 r_c` and `r_c`:

```text
U_sw(r) = U_LJ(r) · S(r)
S(r)    = (r_c² − r²)² (r_c² + 2r² − 3 r_on²) / (r_c² − r_on²)³
```

Energy and force vanish smoothly at `r_c`. The analytic force factor used in the kernel is

```text
F_i = [ F_LJ(r)·S(r) + U_LJ(r)·12(r_c² − r²)(r_on² − r²)/(r_c² − r_on²)³ ] · r_ij
```

## Consequences

- NVE drift falls to ≈ 3 × 10⁻⁷ eV/atom on the 108-atom test cell.
- The potential is no longer the pure Lennard-Jones form; results must state the switching
  window. The model card, provenance equation and report all say so.
- The switched form is implemented identically in TypeScript and Rust and verified within
  1e-10 eV.
- No tail correction is applied; the cohesive energy is therefore cutoff-dependent and is only
  quoted inside a physically justified bracket.

## Verification

- `packages/core/test/lj.test.ts`: forces match central-difference gradients (< 1e-5 relative).
- `packages/core/test/md.test.ts`: |drift| < 1e-3 eV/atom over 400 steps.
- `crates/compute-core`: parity with the TypeScript reference.

## Alternatives rejected

- **Force-shifted (TSF) potential**: also C¹, but changes the force at every distance, not only
  in the switching window; harder to explain to users.
- **Untruncated Ewald-like LJ correction**: out of scope for a reference teaching model; would
  imply accuracy we do not have.
