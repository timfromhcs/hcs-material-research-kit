# Units and numerical conventions

## Canonical units

| Quantity | Unit | Symbol |
|---|---|---|
| length | ångström | Å |
| energy | electron-volt | eV |
| force | eV per ångström | eV/Å |
| mass | unified atomic mass unit | u |
| time | picosecond | ps |
| temperature | kelvin | K |
| velocity | Å per ps | Å/ps |
| acceleration | Å per ps² | Å/ps² |

The continuum solver uses SI (m, s, m²/s) because its parameters are material diffusivities.
A record never mixes the two systems without an explicit conversion.

## Conversions used

```text
1 u·Å²/ps²        = 1.036426… × 10⁻⁴ eV
1 eV/Å/u (force/mass) = 9648.533… Å/ps²
1 √(eV/u)         = 98.22697… Å/ps
1 Å²/ps           = 10⁻⁴ cm²/s
k_B               = 8.617333262 × 10⁻⁵ eV/K
```

All constants live in `packages/core/src/units.ts` and are covered by tests. A thermal velocity
sampled as `√(k_B T / m)` is in `√(eV/u)` and **must** be multiplied by 98.22697 to be integrated
in Å/ps; mixing these was a real bug caught by the temperature test.

## Structure conventions

- Lattice vectors are rows `a, b, c` in the stated length unit; fractional coordinates are in
  that basis: `r = f_a·a + f_b·b + f_c·c`.
- Structures created or imported by HCS use ångström and are wrapped into `[0, 1)` for periodic
  axes.
- Structure identity hashes wrap fractional coordinates modulo 1, round to 10⁻⁶ and sort sites,
  so equivalent periodic images and site order do not change identity.
- Minimum-image vectors use fractional wrapping (`f − round(f)`) per periodic axis. This is
  exact while the cutoff stays below half the smallest inter-planar spacing; the engine clamps
  the cutoff to that radius and records it.
- Validation reports a warning for unphysical overlaps below 0.5 Å and for strongly skewed
  cells (smallest lattice angle < 20° or > 160°).

## Numerical conventions

- All kernels are `float64`. No float32 path is claimed.
- Deterministic seeding: the MD velocity sampler uses a mulberry32 PRNG with the job seed and
  removes net momentum analytically.
- Positions in an MD trajectory are continuous cartesian coordinates; they are not wrapped, so
  MSD needs no unwrapping correction for these frames.
- Convergence is always a named criterion with a numeric threshold, never a boolean alone.

## Display

- Numbers are shown with explicit units in tables and axes.
- Scientific notation is used outside the range 10⁻³ … 10⁵.
- Locale formatting never changes the stored value: parsing accepts `,` and `.` as decimal
  separators, storage remains canonical.
