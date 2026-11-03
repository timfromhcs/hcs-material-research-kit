/**
 * Structural analysis: radial distribution function and mean-square
 * displacement.
 *
 * Definitions used (written down so results can be checked):
 *
 *   g(r) = 2V / (N(N-1)) · Σ_pairs δ(r - r_ij) / (4π r² Δr)
 *   n(r) = 4π (N/V) ∫₀^r r'² g(r') dr'      (running coordination number)
 *
 * For a non-periodic cluster this expression is still computed, but it must
 * not be interpreted as a bulk RDF; the function reports that explicitly.
 */

import type { Vec3 } from "../linalg.js";
import { norm } from "../linalg.js";
import type { Structure } from "../types.js";
import { assertAngstrom, cartesianPositions, cellVolume } from "../structure.js";

export interface RdfOptions {
  cutoff?: number;
  bins?: number;
}

export interface RdfResult {
  r: number[];
  g: number[];
  coordinationNumber: number[];
  cutoff: number;
  bins: number;
  binWidth: number;
  normalization: "periodic-bulk" | "finite-cluster";
  warnings: string[];
  pairsCounted: number;
}

export function computeRdf(structure: Structure, options: RdfOptions = {}): RdfResult {
  assertAngstrom(structure);
  const n = structure.sites.length;
  if (n < 2) throw new Error("RDF needs at least two atoms");
  const volume = cellVolume(structure);
  const vectors = structure.lattice.vectors;
  const shortest = Math.min(
    Math.hypot(...vectors[0]),
    Math.hypot(...vectors[1]),
    Math.hypot(...vectors[2]),
  );
  const cutoff = options.cutoff ?? Math.min(shortest / 2, 10);
  if (!(cutoff > 0)) throw new Error("RDF cutoff must be positive");
  if (cutoff > shortest / 2) {
    throw new Error(
      `RDF cutoff ${cutoff.toFixed(2)} Å exceeds half the shortest lattice vector ` +
        `(${(shortest / 2).toFixed(2)} Å); the minimum-image result would be ambiguous.`,
    );
  }
  const bins = Math.max(10, options.bins ?? 100);
  const binWidth = cutoff / bins;
  const histogram = new Array<number>(bins).fill(0);
  const fractional = structure.sites.map((site) => site.fractional_position);
  let pairsCounted = 0;

  for (let i = 0; i < n; i++) {
    const fi = fractional[i]!;
    for (let j = i + 1; j < n; j++) {
      const fj = fractional[j]!;
      let dx = fj[0] - fi[0];
      let dy = fj[1] - fi[1];
      let dz = fj[2] - fi[2];
      if (structure.pbc[0]) dx -= Math.round(dx);
      if (structure.pbc[1]) dy -= Math.round(dy);
      if (structure.pbc[2]) dz -= Math.round(dz);
      const rx = dx * vectors[0][0] + dy * vectors[1][0] + dz * vectors[2][0];
      const ry = dx * vectors[0][1] + dy * vectors[1][1] + dz * vectors[2][1];
      const rz = dx * vectors[0][2] + dy * vectors[1][2] + dz * vectors[2][2];
      const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (r <= 0 || r >= cutoff) continue;
      const bin = Math.min(bins - 1, Math.floor(r / binWidth));
      histogram[bin]! += 1;
      pairsCounted++;
    }
  }

  const periodic = structure.pbc.every(Boolean);
  const r: number[] = [];
  const g: number[] = [];
  const coordinationNumber: number[] = [];
  let cumulative = 0;
  const numberDensity = n / volume;
  for (let b = 0; b < bins; b++) {
    const rMid = (b + 0.5) * binWidth;
    const shellVolume = 4 * Math.PI * rMid * rMid * binWidth;
    const idealPairs = periodic ? (n * (n - 1) * shellVolume) / (2 * volume) : 0;
    const value = idealPairs > 0 ? histogram[b]! / idealPairs : 0;
    r.push(rMid);
    g.push(value);
    cumulative += value * shellVolume * numberDensity;
    coordinationNumber.push(cumulative);
  }

  const warnings: string[] = [];
  if (!periodic) {
    warnings.push(
      "Non-periodic cluster: g(r) is normalised by the cell volume and must not be read as a bulk RDF.",
    );
  }
  if (bins < 40) {
    warnings.push(
      "Fewer than 40 bins: the histogram is coarse; increase bins for publication plots.",
    );
  }
  return {
    r,
    g,
    coordinationNumber,
    cutoff,
    bins,
    binWidth,
    normalization: periodic ? "periodic-bulk" : "finite-cluster",
    warnings,
    pairsCounted,
  };
}

export interface MsdOptions {
  /** Timestep per frame in ps. */
  frameTimePs: number;
  /** Maximum lag in frames; default half the trajectory length. */
  maxLag?: number;
  /** Lag window used for the Einstein fit, in frames. */
  fitFrom?: number;
  fitTo?: number;
}

export interface MsdResult {
  lagPs: number[];
  msd: number[];
  slopeAngstrom2PerPs: number;
  /** D = slope/6 converted to cm²/s (3D Einstein relation). */
  diffusionCm2PerS: number;
  fitLagPs: [number, number];
  atomsCounted: number;
  warnings: string[];
}

export function computeMsd(frames: Vec3[][], options: MsdOptions): MsdResult {
  if (frames.length < 2) throw new Error("MSD needs at least two frames");
  const atoms = frames[0]!.length;
  if (!frames.every((frame) => frame.length === atoms)) {
    throw new Error("All trajectory frames must contain the same number of atoms");
  }
  const maxLag = Math.min(options.maxLag ?? Math.floor(frames.length / 2), frames.length - 1);
  if (maxLag < 1) throw new Error("Not enough frames for a lag of one frame");
  const lagPs: number[] = [];
  const msd: number[] = [];
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    let count = 0;
    for (let t = 0; t + lag < frames.length; t++) {
      const a = frames[t]!;
      const b = frames[t + lag]!;
      for (let i = 0; i < atoms; i++) {
        const pa = a[i]!;
        const pb = b[i]!;
        const dx = pb[0] - pa[0];
        const dy = pb[1] - pa[1];
        const dz = pb[2] - pa[2];
        sum += dx * dx + dy * dy + dz * dz;
        count++;
      }
    }
    lagPs.push(lag * options.frameTimePs);
    msd.push(count > 0 ? sum / count : 0);
  }

  const fitFrom = options.fitFrom ?? Math.max(1, Math.floor(lagPs.length * 0.25));
  const fitTo = Math.min(options.fitTo ?? lagPs.length, lagPs.length);
  if (fitTo - fitFrom < 2) throw new Error("Fit window needs at least two lag points");
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  const points = fitTo - fitFrom + 1;
  for (let i = fitFrom - 1; i < fitTo; i++) {
    const x = lagPs[i]!;
    const y = msd[i]!;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denominator = points * sumXX - sumX * sumX;
  const slope = denominator !== 0 ? (points * sumXY - sumX * sumY) / denominator : Number.NaN;
  const diffusion = (slope / 6) * 1e-4; // Å²/ps -> cm²/s

  const warnings: string[] = [];
  if (!Number.isFinite(slope) || slope <= 0) {
    warnings.push(
      "MSD slope is not positive; no diffusion coefficient is reported. The trajectory may be too short, " +
        "the system may be solid-like, or the atoms may be vibrating around fixed positions.",
    );
  }
  warnings.push(
    "Positions are continuous cartesian coordinates from the NVE run; no periodic wrapping is applied, " +
      "so no displacement unwrapping correction is needed for these frames.",
  );

  return {
    lagPs,
    msd,
    slopeAngstrom2PerPs: slope,
    diffusionCm2PerS: diffusion,
    fitLagPs: [lagPs[fitFrom - 1]!, lagPs[fitTo - 1]!],
    atomsCounted: atoms,
    warnings,
  };
}

/** Mean displacement magnitude per atom between two frames, in Å. */
export function meanDisplacement(a: Vec3[], b: Vec3[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++)
    sum += norm([b[i]![0] - a[i]![0], b[i]![1] - a[i]![1], b[i]![2] - a[i]![2]]);
  return sum / Math.max(1, a.length);
}

export function radialDistributionOfPair(
  structure: Structure,
  speciesA: string,
  speciesB: string,
  options: RdfOptions = {},
): RdfResult {
  const subset: Structure = {
    ...structure,
    sites: structure.sites.filter((site) => site.species === speciesA || site.species === speciesB),
  };
  if (subset.sites.length < 2) throw new Error("Pair RDF needs at least two matching atoms");
  return computeRdf(subset, options);
}

/** Convenience for callers that already have a structure. */
export function cartesianFrame(structure: Structure): Vec3[] {
  return cartesianPositions(structure);
}
