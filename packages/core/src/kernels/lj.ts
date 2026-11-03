/**
 * HCS Lennard-Jones reference engine.
 *
 * Physics implemented here (nothing else):
 *
 *   U_LJ(r) = 4 ε [ (σ/r)^12 − (σ/r)^6 ]
 *   U(r)    = U_LJ(r) · S(r),  S = 1 for r ≤ r_on, cubic switch to 0 at r_c
 *   F_i     = dU/dr · r̂_ij
 *
 * The cubic switching function between r_on = 0.9 r_c and r_c makes both the
 * potential and the force continuous at the cutoff. This matters: a merely
 * energy-shifted potential has a force jump at r_c, which visibly breaks energy
 * conservation in molecular dynamics.
 *
 * Cross-species parameters use the Lorentz-Berthelot rule
 * σ_ij = (σ_i + σ_j)/2, ε_ij = sqrt(ε_i ε_j).
 *
 * No long-range/tail correction is applied and none is claimed.
 *
 * Units: energy eV, length Å, force eV/Å, mass u, time ps.
 */

import type { Vec3 } from "../linalg.js";
import { cross, det3, norm, vecMat, type Mat3 } from "../linalg.js";
import type { Structure } from "../types.js";
import { assertAngstrom, latticeVectorsAngstrom } from "../structure.js";
import { baseSymbol } from "../elements.js";

export interface LJSpeciesParameter {
  /** Well depth ε in eV. */
  epsilon: number;
  /** Zero-crossing distance σ in Å. */
  sigma: number;
}

export interface LJModel {
  id: string;
  name: string;
  description: string;
  cutoff: number;
  mixingRule: "lorentz-berthelot";
  species: Record<string, LJSpeciesParameter>;
  /** Where the parameters come from. Required for scientific honesty. */
  reference: string;
  limitations: string[];
}

/**
 * Single-component Lennard-Jones parameters for the noble gases.
 *
 * These are widely used literature estimates of the *effective* two-body
 * parameters, not first-principles values and not transferable to other
 * elements. HCS ships them for a documented reference system; adding a real
 * material requires an explicit parameter set with a citable source.
 */
export const LJ_NOBLE_GASES: LJModel = {
  id: "lj.noble-gases.v1",
  name: "Lennard-Jones noble gases (reference parameters)",
  description:
    "Single-component Lennard-Jones model for He, Ne, Ar, Kr and Xe with Lorentz-Berthelot mixing.",
  cutoff: 8.5,
  mixingRule: "lorentz-berthelot",
  species: {
    He: { epsilon: 0.00088, sigma: 2.56 },
    Ne: { epsilon: 0.00309, sigma: 2.75 },
    Ar: { epsilon: 0.01032, sigma: 3.405 },
    Kr: { epsilon: 0.01404, sigma: 3.65 },
    Xe: { epsilon: 0.01998, sigma: 4.1 },
  },
  reference:
    "Effective condensed-phase Lennard-Jones parameters for the noble gases as commonly tabulated in atomistic simulation texts; values are approximate and must be re-verified against a cited source before publication.",
  limitations: [
    "Two-body only: no three-body, many-body, electrostatic or quantum contributions.",
    "Parameters are effective and state-dependent; they are not transferable across elements.",
    "Pair sum with a finite cutoff and a cubic switching window; no long-range tail correction.",
    "Suitable for demonstrating and testing a classical reference workflow, not for predicting real-material properties.",
  ],
};

export const LJ_MODELS: Record<string, LJModel> = {
  [LJ_NOBLE_GASES.id]: LJ_NOBLE_GASES,
};

/** Fraction of the cutoff at which the switching window starts. */
export const SWITCH_ON_FRACTION = 0.9;

export function getLJModel(id: string): LJModel {
  const model = LJ_MODELS[id];
  if (!model) {
    throw new Error(`Unknown Lennard-Jones model '${id}'. Available: ${Object.keys(LJ_MODELS).join(", ")}`);
  }
  return model;
}

export interface ResolvedPair {
  epsilon: number;
  sigma: number;
}

const pairCache = new WeakMap<LJModel, Map<string, ResolvedPair>>();

export function resolvePair(model: LJModel, speciesA: string, speciesB: string): ResolvedPair {
  let cache = pairCache.get(model);
  if (!cache) {
    cache = new Map();
    pairCache.set(model, cache);
  }
  const a = baseSymbol(speciesA);
  const b = baseSymbol(speciesB);
  const key = a <= b ? `${a}|${b}` : `${b}|${a}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pa = model.species[a];
  const pb = model.species[b];
  if (!pa) {
    throw new Error(
      `Model '${model.id}' has no Lennard-Jones parameters for '${a}'. ` +
        `Supported: ${Object.keys(model.species).join(", ")}. ` +
        "HCS will not invent parameters for unsupported elements.",
    );
  }
  if (!pb) {
    throw new Error(
      `Model '${model.id}' has no Lennard-Jones parameters for '${b}'. ` +
        `Supported: ${Object.keys(model.species).join(", ")}.`,
    );
  }
  const resolved: ResolvedPair = {
    sigma: 0.5 * (pa.sigma + pb.sigma),
    epsilon: Math.sqrt(pa.epsilon * pb.epsilon),
  };
  cache.set(key, resolved);
  return resolved;
}

export interface EnergyForces {
  /** Total potential energy in eV. */
  energy: number;
  /** Energy per atom in eV/atom. */
  energyPerAtom: number;
  /** Forces in eV/Å, one per site. */
  forces: Vec3[];
  /** Maximum force magnitude in eV/Å. */
  maxForce: number;
  /** Number of pairs inside the cutoff (including periodic images). */
  pairCount: number;
  /** Cutoff actually used, in Å. */
  cutoff: number;
  /** True when the cutoff had to be reduced to stay inside the minimum-image sphere. */
  cutoffReduced: boolean;
  modelId: string;
}

export interface LJEvaluationOptions {
  /** Requested cutoff in Å; clamped to the largest value the cell can support. */
  cutoff?: number;
}

/** Bare Lennard-Jones pair potential without switching (eV). */
export function ljPairPotential(epsilon: number, sigma: number, r: number): number {
  if (r <= 0) throw new Error("Lennard-Jones potential is undefined at r = 0");
  const s = sigma / r;
  const s6 = s ** 6;
  return 4 * epsilon * (s6 * s6 - s6);
}

/** Cubic switching function S(r) and its radial derivative. */
export function switchingFunction(
  r: number,
  cutoff: number,
): { s: number; ds: number } {
  const rOn = SWITCH_ON_FRACTION * cutoff;
  const r2 = r * r;
  if (r <= rOn) return { s: 1, ds: 0 };
  if (r >= cutoff) return { s: 0, ds: 0 };
  const rc2 = cutoff * cutoff;
  const ron2 = rOn * rOn;
  const a = rc2 - r2;
  const b = rc2 + 2 * r2 - 3 * ron2;
  const d = (rc2 - ron2) ** 3;
  const s = (a * a * b) / d;
  // dS/dr = 12 r a (r_on² − r²) / D
  const ds = (12 * r * a * (ron2 - r2)) / d;
  return { s, ds };
}

/** Switched Lennard-Jones pair potential used by the engine (eV). */
export function ljSwitchedPotential(epsilon: number, sigma: number, r: number, cutoff: number): number {
  if (r >= cutoff) return 0;
  return ljPairPotential(epsilon, sigma, r) * switchingFunction(r, cutoff).s;
}

/**
 * Largest cutoff for which the minimum-image convention is unambiguous.
 *
 * For a general cell that radius is half the smallest distance between
 * lattice planes: d_i = V / |a_j × a_k|. Using a cutoff above it silently
 * counts interactions with the wrong periodic image, so the cutoff is clamped
 * and the caller is told.
 */
export function maxCutoffForCell(structure: Structure): number {
  const [a, b, c] = latticeVectorsAngstrom(structure);
  const volume = Math.abs(det3([a, b, c]));
  if (!(volume > 0)) return 0;
  const areas = [norm(cross(b, c)), norm(cross(c, a)), norm(cross(a, b))];
  const spacing = areas.map((area) => (area > 0 ? volume / area : 0));
  return 0.5 * Math.min(...spacing);
}

function resolveCutoff(
  structure: Structure,
  model: LJModel,
  options: LJEvaluationOptions,
): { cutoff: number; cutoffReduced: boolean } {
  const requested = options.cutoff ?? model.cutoff;
  if (!(requested > 0)) throw new Error("Cutoff must be positive");
  const maxValid = maxCutoffForCell(structure);
  if (!(maxValid > 1e-6)) {
    throw new Error("Cell has no valid minimum-image radius; fix the lattice before evaluating energies");
  }
  const cutoff = Math.min(requested, maxValid);
  if (cutoff < 0.9) {
    throw new Error(
      `Effective cutoff is only ${cutoff.toFixed(3)} Å because the cell is too small. ` +
        "Build a larger supercell or use a shorter-range model.",
    );
  }
  return { cutoff, cutoffReduced: cutoff < requested - 1e-9 };
}

function modelCheck(structure: Structure, model: LJModel, options: LJEvaluationOptions = {}) {
  assertAngstrom(structure);
  if (structure.sites.length === 0) throw new Error("Cannot evaluate an empty structure");
  if (!(model.cutoff > 0)) throw new Error("Cutoff must be positive");
  const { cutoff, cutoffReduced } = resolveCutoff(structure, model, options);
  const m = structure.lattice.vectors as Mat3;
  const f = structure.sites.map((site) => site.fractional_position);
  return { m, f, cutoff, cutoffReduced };
}

/**
 * Evaluates the total switched Lennard-Jones energy and all forces.
 * O(N²) pair loop — the documented reference path, not a scalable MD engine.
 */
export function computeEnergyForces(
  structure: Structure,
  model: LJModel,
  options: LJEvaluationOptions = {},
): EnergyForces {
  const { m, f, cutoff, cutoffReduced } = modelCheck(structure, model, options);
  const n = structure.sites.length;
  const forces: Vec3[] = Array.from({ length: n }, () => [0, 0, 0] as Vec3);
  const species = structure.sites.map((site) => baseSymbol(site.species));
  const cutoff2 = cutoff * cutoff;
  const rOn2 = (SWITCH_ON_FRACTION * cutoff) ** 2;
  const rc2 = cutoff2;
  const ron2 = rOn2;
  const switchDenominator = (rc2 - ron2) ** 3;
  let energy = 0;
  let pairCount = 0;

  for (let i = 0; i < n; i++) {
    const fi = f[i]!;
    for (let j = i + 1; j < n; j++) {
      const fj = f[j]!;
      let dx = fj[0] - fi[0];
      let dy = fj[1] - fi[1];
      let dz = fj[2] - fi[2];
      // Minimum image in fractional space.
      if (structure.pbc[0]) dx -= Math.round(dx);
      if (structure.pbc[1]) dy -= Math.round(dy);
      if (structure.pbc[2]) dz -= Math.round(dz);
      // r_ij = df · M
      const rx = dx * m[0][0] + dy * m[1][0] + dz * m[2][0];
      const ry = dx * m[0][1] + dy * m[1][1] + dz * m[2][1];
      const rz = dx * m[0][2] + dy * m[1][2] + dz * m[2][2];
      const r2 = rx * rx + ry * ry + rz * rz;
      if (r2 > cutoff2 || r2 === 0) continue;
      pairCount++;

      const pair = resolvePair(model, species[i]!, species[j]!);
      const invR2 = 1 / r2;
      const s2 = pair.sigma * pair.sigma * invR2;
      const s6 = s2 * s2 * s2;
      const s12 = s6 * s6;
      const unswitched = 4 * pair.epsilon * (s12 - s6);
      // Per-unit-r_vec force factor of the unswitched potential.
      const fscalar = 24 * pair.epsilon * (s6 - 2 * s12) * invR2;

      let switchValue: number;
      let factor: number;
      if (r2 <= rOn2) {
        switchValue = 1;
        factor = fscalar;
      } else {
        const a = rc2 - r2;
        const b = rc2 + 2 * r2 - 3 * ron2;
        switchValue = (a * a * b) / switchDenominator;
        // dU_sw/dr / r = F_LJ·S + U · 12·a·(ron² − r²)/D
        const dsOverR = (12 * a * (ron2 - r2)) / switchDenominator;
        factor = fscalar * switchValue + unswitched * dsOverR;
      }

      energy += unswitched * switchValue;
      const fx = factor * rx;
      const fy = factor * ry;
      const fz = factor * rz;
      const forceI = forces[i]!;
      const forceJ = forces[j]!;
      forceI[0] += fx;
      forceI[1] += fy;
      forceI[2] += fz;
      forceJ[0] -= fx;
      forceJ[1] -= fy;
      forceJ[2] -= fz;
    }
  }

  let maxForce = 0;
  for (const force of forces) {
    const magnitude = Math.hypot(force[0], force[1], force[2]);
    if (magnitude > maxForce) maxForce = magnitude;
  }

  return {
    energy,
    energyPerAtom: energy / n,
    forces,
    maxForce,
    pairCount,
    cutoff,
    cutoffReduced,
    modelId: model.id,
  };
}

/** Potential energy only, with a cheaper loop than computeEnergyForces. */
export function computePotentialEnergy(
  structure: Structure,
  model: LJModel,
  options: LJEvaluationOptions = {},
): number {
  const { m, f, cutoff } = modelCheck(structure, model, options);
  const n = structure.sites.length;
  const species = structure.sites.map((site) => baseSymbol(site.species));
  const cutoff2 = cutoff * cutoff;
  const ron2 = (SWITCH_ON_FRACTION * cutoff) ** 2;
  const rc2 = cutoff2;
  const denominator = (rc2 - ron2) ** 3;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const fi = f[i]!;
    for (let j = i + 1; j < n; j++) {
      const fj = f[j]!;
      let dx = fj[0] - fi[0];
      let dy = fj[1] - fi[1];
      let dz = fj[2] - fi[2];
      if (structure.pbc[0]) dx -= Math.round(dx);
      if (structure.pbc[1]) dy -= Math.round(dy);
      if (structure.pbc[2]) dz -= Math.round(dz);
      const rx = dx * m[0][0] + dy * m[1][0] + dz * m[2][0];
      const ry = dx * m[0][1] + dy * m[1][1] + dz * m[2][1];
      const rz = dx * m[0][2] + dy * m[1][2] + dz * m[2][2];
      const r2 = rx * rx + ry * ry + rz * rz;
      if (r2 > cutoff2 || r2 === 0) continue;
      const pair = resolvePair(model, species[i]!, species[j]!);
      const s2 = (pair.sigma * pair.sigma) / r2;
      const s6 = s2 * s2 * s2;
      const unswitched = 4 * pair.epsilon * (s6 * s6 - s6);
      if (r2 <= ron2) {
        energy += unswitched;
      } else {
        const a = rc2 - r2;
        const b = rc2 + 2 * r2 - 3 * ron2;
        energy += unswitched * ((a * a * b) / denominator);
      }
    }
  }
  return energy;
}

/** Cartesian positions in angstrom, allocated fresh. */
export function positionsOf(structure: Structure): Vec3[] {
  const m = structure.lattice.vectors as Mat3;
  return structure.sites.map((site) => vecMat(site.fractional_position, m));
}

export function forcesAsVector(forces: Vec3[]): number[] {
  const flat = new Array<number>(forces.length * 3);
  for (let i = 0; i < forces.length; i++) {
    flat[i * 3] = forces[i]![0];
    flat[i * 3 + 1] = forces[i]![1];
    flat[i * 3 + 2] = forces[i]![2];
  }
  return flat;
}
