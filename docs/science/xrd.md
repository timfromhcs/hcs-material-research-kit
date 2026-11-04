# Powder X-ray diffraction

**Function:** `computeXrdPattern(structure, options)` in `packages/core/src/kernels/xrd.ts`
**UI:** Structure Studio → Powder X-ray diffraction (live, with CSV export)

## Method

1. Reciprocal lattice `G = h·B` with `B = (M⁻¹)ᵀ`, so `d_hkl = 1/|G|`.
2. Bragg condition `sin θ = λ / (2 d_hkl)`.
3. Atomic scattering factor

   ```text
   f(s) = Z − 41.78214 · s² · Σ a_i exp(−b_i s²),    s = sin θ / λ
   ```

   with the published coefficients in `scattering-factors.generated.ts`
   (source: pymatgen `atomic_scattering_params.json`, commit
   `9100860d7d938560610bcfadd04923b53756548e`, SHA-256
   `c675301248bb86ea359428f20c3987d719b1ac1a779166ef27e1d0f652467d93`).

4. Structure factor `F = Σ f_j exp(2πi (h x_j + k y_j + l z_j))`.
5. Intensity `I ∝ |F|² · (1 + cos²2θ) / (sin²θ cosθ)`.
6. Every reciprocal point inside the limiting sphere is enumerated, so the
   multiplicity of a powder reflection is the number of equivalent points that
   fall into the same d-spacing bin. This is why no space-group table is needed.

The profile is a Gaussian of user-set FWHM; the peak list reports the
representative hkl, d, 2θ, multiplicity and relative intensity (strongest = 100).

## Validation

| Check                             | Result                         | Where                            |
| --------------------------------- | ------------------------------ | -------------------------------- |
| Si 111 / 220 / 311 (Cu Kα1)       | 28.44° / 47.30° / 56.12° ±0.05 | `packages/core/test/xrd.test.ts` |
| Si multiplicities 111 / 220 / 311 | 8 / 12 / 24                    | `packages/core/test/xrd.test.ts` |
| Diamond-forbidden Si 200          | absent                         | `packages/core/test/xrd.test.ts` |
| NaCl 200 / 220 (a = 5.6402 Å)     | 31.70° / 45.45°                | `packages/core/test/xrd.test.ts` |
| Wurtzite ZnO 002 (hexagonal cell) | 34.42°                         | `packages/core/test/xrd.test.ts` |
| Normalisation                     | strongest peak = 100           | `packages/core/test/xrd.test.ts` |
| Determinism                       | identical peak lists           | `packages/core/test/xrd.test.ts` |

## What is not modelled

- **No Debye–Waller factor**: thermal motion is not included, so high-angle
  intensities are systematically too strong.
- **No absorption, extinction or anomalous dispersion** (no `f'`, `f''`).
- **No instrumental effects**: no background, sample displacement, axial
  divergence, preferred orientation or detector response.
- **Kinematic only**: intensities are not absolute and are not suitable for
  quantitative phase analysis without calibration.
- Peak positions are exact for the given cell; a measured pattern also depends
  on the diffractometer and the sample.

The function refuses elements without published scattering coefficients instead
of inventing a form factor.
