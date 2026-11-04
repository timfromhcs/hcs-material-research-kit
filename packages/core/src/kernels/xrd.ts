/**
 * Powder X-ray diffraction from a crystal structure.
 *
 * Method (kinematic approximation, no absorption, no instrumental profile):
 *
 *   1. reciprocal lattice G = h·B with B = (M⁻¹)ᵀ, so d_hkl = 1/|G|;
 *   2. Bragg condition sin θ = λ / (2 d_hkl);
 *   3. atomic scattering factor
 *        f(s) = Z − 41.78214 · s² · Σ a_i exp(−b_i s²),  s = sin θ / λ,
 *      with the published coefficients in `scattering-factors.generated.ts`;
 *   4. structure factor F = Σ f_j exp(2πi (h x_j + k y_j + l z_j));
 *   5. intensity I ∝ |F|² · (1 + cos²2θ) / (sin²θ cosθ);
 *   6. every reciprocal point inside the limiting sphere is enumerated, so the
 *      multiplicity of a powder reflection is the number of equivalent points
 *      that fall into the same d-spacing bin.
 *
 * What is deliberately not modelled: Debye–Waller factors, absorption,
 * anomalous dispersion, instrumental broadening, preferred orientation and
 * background. Peak *positions* are exact for the given cell; intensities are
 * kinematic and should be compared with experiment only at that level.
 */

import type { Structure } from "../types.js";
import { baseSymbol, getElement } from "../elements.js";
import { ATOMIC_SCATTERING_COEFFICIENTS } from "./scattering-factors.generated.js";
import { det3 } from "../linalg.js";

export interface XrdOptions {
  /** Wavelength in Å; default Cu Kα1 (1.54056 Å). */
  wavelengthAngstrom?: number;
  /** Lower 2θ bound in degrees; default 5. */
  twoThetaMinDeg?: number;
  /** Upper 2θ bound in degrees; default 120. */
  twoThetaMaxDeg?: number;
  /** Profile sampling step in degrees 2θ; default 0.02. */
  stepDeg?: number;
  /** Gaussian FWHM in degrees 2θ; default 0.10. */
  fwhmDeg?: number;
  /** Highest |h|, |k|, |l| enumerated; default 16. */
  maxMillerIndex?: number;
  /** Reflections closer than this in d are merged; default 1e-4 Å. */
  mergeToleranceAngstrom?: number;
}

export interface XrdPeak {
  h: number;
  k: number;
  l: number;
  dSpacingAngstrom: number;
  twoThetaDeg: number;
  /** Relative intensity, strongest peak = 100. */
  intensity: number;
  /** Number of reciprocal points merged into this powder reflection. */
  multiplicity: number;
  structureFactorSquared: number;
}

export interface XrdPattern {
  peaks: XrdPeak[];
  /** Sampled 2θ grid in degrees. */
  twoThetaDeg: number[];
  /** Sampled intensity, strongest peak = 100. */
  intensity: number[];
  wavelengthAngstrom: number;
  method: string;
  limitations: string[];
  warnings: string[];
}

export const CU_KA1_ANGSTROM = 1.54056;

const MIN_SIN_THETA = 1e-12;

function reciprocalMatrix(
  structure: Structure,
): [[number, number, number], [number, number, number], [number, number, number]] {
  const m = structure.lattice.vectors;
  const [a, b, c] = m;
  const volume = det3(m);
  if (!(Math.abs(volume) > 1e-12)) {
    throw new Error("Cannot compute an XRD pattern for a degenerate cell");
  }
  // With M rows = lattice vectors, the reciprocal vectors are the rows of
  // B = (M⁻¹)ᵀ, i.e. b1 = (b×c)/V, b2 = (c×a)/V, b3 = (a×b)/V.
  return [
    [
      (b[1]! * c[2]! - b[2]! * c[1]!) / volume,
      (b[2]! * c[0]! - b[0]! * c[2]!) / volume,
      (b[0]! * c[1]! - b[1]! * c[0]!) / volume,
    ],
    [
      (c[1]! * a[2]! - c[2]! * a[1]!) / volume,
      (c[2]! * a[0]! - c[0]! * a[2]!) / volume,
      (c[0]! * a[1]! - c[1]! * a[0]!) / volume,
    ],
    [
      (a[1]! * b[2]! - a[2]! * b[1]!) / volume,
      (a[2]! * b[0]! - a[0]! * b[2]!) / volume,
      (a[0]! * b[1]! - a[1]! * b[0]!) / volume,
    ],
  ];
}

function scatteringFactor(symbol: string, s: number): number {
  const coefficients = ATOMIC_SCATTERING_COEFFICIENTS[symbol];
  if (!coefficients) {
    throw new Error(
      `No X-ray scattering coefficients for '${symbol}'. ` +
        "HCS refuses to invent a form factor; add a cited coefficient set before using this element.",
    );
  }
  const element = getElement(symbol);
  if (!element) {
    throw new Error(`Unknown element '${symbol}' for X-ray scattering`);
  }
  const s2 = s * s;
  let sum = 0;
  for (const [a, b] of coefficients) {
    sum += a * Math.exp(-b * s2);
  }
  return element.z - 41.78214 * s2 * sum;
}

/** Computes a powder pattern. Deterministic for a given structure and options. */
export function computeXrdPattern(structure: Structure, options: XrdOptions = {}): XrdPattern {
  const wavelength = options.wavelengthAngstrom ?? CU_KA1_ANGSTROM;
  if (!(wavelength > 0)) throw new Error("Wavelength must be positive");
  const twoThetaMin = options.twoThetaMinDeg ?? 5;
  const twoThetaMax = options.twoThetaMaxDeg ?? 120;
  if (!(twoThetaMax > twoThetaMin)) throw new Error("twoThetaMaxDeg must exceed twoThetaMinDeg");
  const step = options.stepDeg ?? 0.02;
  if (!(step > 0)) throw new Error("stepDeg must be positive");
  const fwhm = options.fwhmDeg ?? 0.1;
  if (!(fwhm > 0)) throw new Error("fwhmDeg must be positive");
  const maxIndex = Math.max(1, Math.floor(options.maxMillerIndex ?? 16));
  const mergeTolerance = options.mergeToleranceAngstrom ?? 1e-4;
  if (structure.sites.length === 0)
    throw new Error("Cannot compute an XRD pattern for an empty structure");

  const reciprocal = reciprocalMatrix(structure);
  const sinMax = Math.sin((twoThetaMax / 2) * (Math.PI / 180));
  const dMin = wavelength / (2 * sinMax);
  const warnings: string[] = [];

  const species = structure.sites.map((site) => baseSymbol(site.species));
  const uniqueSpecies = [...new Set(species)];
  const missing = uniqueSpecies.filter((symbol) => !ATOMIC_SCATTERING_COEFFICIENTS[symbol]);
  if (missing.length > 0) {
    throw new Error(
      `No X-ray scattering coefficients for: ${missing.join(", ")}. ` +
        "The pattern cannot be computed without inventing a form factor.",
    );
  }

  interface RawReflection {
    h: number;
    k: number;
    l: number;
    d: number;
    twoTheta: number;
    intensity: number;
    structureFactorSquared: number;
  }
  const raw: RawReflection[] = [];

  for (let h = -maxIndex; h <= maxIndex; h++) {
    for (let k = -maxIndex; k <= maxIndex; k++) {
      for (let l = -maxIndex; l <= maxIndex; l++) {
        if (h === 0 && k === 0 && l === 0) continue;
        const gx = h * reciprocal[0][0] + k * reciprocal[1][0] + l * reciprocal[2][0];
        const gy = h * reciprocal[0][1] + k * reciprocal[1][1] + l * reciprocal[2][1];
        const gz = h * reciprocal[0][2] + k * reciprocal[1][2] + l * reciprocal[2][2];
        const g = Math.hypot(gx, gy, gz);
        if (!(g > 0)) continue;
        const d = 1 / g;
        if (d < dMin - 1e-12) continue;
        const sinTheta = wavelength / (2 * d);
        if (sinTheta <= MIN_SIN_THETA || sinTheta > 1) continue;
        const twoTheta = (2 * Math.asin(sinTheta) * 180) / Math.PI;
        if (twoTheta < twoThetaMin || twoTheta > twoThetaMax) continue;

        const s = sinTheta / wavelength;
        let real = 0;
        let imag = 0;
        for (let index = 0; index < structure.sites.length; index++) {
          const site = structure.sites[index]!;
          const f = scatteringFactor(species[index]!, s) * (site.occupancy ?? 1);
          const phase =
            2 *
            Math.PI *
            (h * site.fractional_position[0] +
              k * site.fractional_position[1] +
              l * site.fractional_position[2]);
          real += f * Math.cos(phase);
          imag += f * Math.sin(phase);
        }
        const structureFactorSquared = real * real + imag * imag;
        if (structureFactorSquared < 1e-12) continue;

        const theta = (twoTheta / 2) * (Math.PI / 180);
        const cosTheta = Math.cos(theta);
        const sinThetaValue = Math.sin(theta);
        const lorentzPolarization =
          (1 + Math.cos(2 * theta) ** 2) / (sinThetaValue * sinThetaValue * cosTheta);
        raw.push({
          h,
          k,
          l,
          d,
          twoTheta,
          intensity: structureFactorSquared * lorentzPolarization,
          structureFactorSquared,
        });
      }
    }
  }

  // Merge symmetry-equivalent (and accidentally degenerate) reflections.
  // Largest d first, so the peak list is ordered by increasing 2θ.
  raw.sort((left, right) => right.d - left.d);
  interface Merged {
    h: number;
    k: number;
    l: number;
    d: number;
    twoTheta: number;
    intensity: number;
    strongestIntensity: number;
    multiplicity: number;
    structureFactorSquared: number;
  }
  const merged: Merged[] = [];
  for (const reflection of raw) {
    const previous = merged[merged.length - 1];
    if (previous && Math.abs(previous.d - reflection.d) <= mergeTolerance) {
      previous.intensity += reflection.intensity;
      previous.structureFactorSquared += reflection.structureFactorSquared;
      previous.multiplicity += 1;
      if (reflection.intensity > previous.strongestIntensity) {
        previous.strongestIntensity = reflection.intensity;
        previous.h = reflection.h;
        previous.k = reflection.k;
        previous.l = reflection.l;
        previous.twoTheta = reflection.twoTheta;
      }
    } else {
      merged.push({
        h: reflection.h,
        k: reflection.k,
        l: reflection.l,
        d: reflection.d,
        twoTheta: reflection.twoTheta,
        intensity: reflection.intensity,
        strongestIntensity: reflection.intensity,
        multiplicity: 1,
        structureFactorSquared: reflection.structureFactorSquared,
      });
    }
  }

  const maxIntensity = merged.reduce((maximum, peak) => Math.max(maximum, peak.intensity), 0);
  if (!(maxIntensity > 0)) {
    throw new Error(
      "No reflections fall inside the requested 2θ range. Widen the range or use a shorter wavelength.",
    );
  }
  const peaks: XrdPeak[] = merged.map((peak) => ({
    h: peak.h,
    k: peak.k,
    l: peak.l,
    dSpacingAngstrom: peak.d,
    twoThetaDeg: peak.twoTheta,
    intensity: (peak.intensity / maxIntensity) * 100,
    multiplicity: peak.multiplicity,
    structureFactorSquared: peak.structureFactorSquared,
  }));

  // Gaussian profile on a uniform grid.
  const steps = Math.max(1, Math.round((twoThetaMax - twoThetaMin) / step));
  const twoThetaDeg: number[] = [];
  const intensity: number[] = [];
  const gaussianDenominator = 4 * Math.log(2);
  for (let index = 0; index <= steps; index++) {
    const x = twoThetaMin + index * step;
    let y = 0;
    for (const peak of peaks) {
      const offset = (x - peak.twoThetaDeg) / fwhm;
      y += peak.intensity * Math.exp(-gaussianDenominator * offset * offset);
    }
    twoThetaDeg.push(x);
    intensity.push(y);
  }

  if (maxIndex < 10) {
    warnings.push(
      `Miller indices were limited to ±${maxIndex}; reflections outside that sphere are missing.`,
    );
  }
  if (twoThetaMax > 150) {
    warnings.push("Above 150° 2θ the flat-sample assumption and the absence of absorption matter.");
  }

  return {
    peaks,
    twoThetaDeg,
    intensity,
    wavelengthAngstrom: wavelength,
    method:
      "Kinematic powder XRD: structure factor with published atomic scattering coefficients, " +
      "Lorentz–polarisation factor, Gaussian profile; all reciprocal points enumerated for multiplicity.",
    limitations: [
      "Kinematic approximation: no absorption, extinction, anomalous dispersion or Debye–Waller factor.",
      "No instrumental broadening, background, preferred orientation or sample displacement.",
      "Intensities are relative (strongest peak = 100), not absolute.",
      "Peak positions are exact for the given cell; a real measurement also depends on the diffractometer.",
    ],
    warnings,
  };
}

/** CSV export of the peak list (2θ, d, h, k, l, multiplicity, relative intensity). */
export function xrdPeaksToCsv(pattern: XrdPattern): string {
  const header = "two_theta_deg,d_angstrom,h,k,l,multiplicity,relative_intensity";
  const rows = pattern.peaks.map((peak) =>
    [
      peak.twoThetaDeg.toFixed(5),
      peak.dSpacingAngstrom.toFixed(6),
      peak.h,
      peak.k,
      peak.l,
      peak.multiplicity,
      peak.intensity.toFixed(4),
    ].join(","),
  );
  return `${header}\n${rows.join("\n")}\n`;
}
