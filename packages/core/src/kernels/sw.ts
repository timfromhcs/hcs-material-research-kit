/**
 * HCS Stillinger–Weber silicon engine.
 *
 * Physics implemented here (nothing else), following
 * F. H. Stillinger and T. A. Weber, "Computer simulation of local order in
 * condensed phases of silicon", Phys. Rev. B 31, 5262 (1985):
 *
 *   φ2(r)   = A ε [ B (σ/r)^p − (σ/r)^q ] exp( σ / (r − aσ) )
 *   φ3(i,j,k) = λ ε [ cos θ_jik + 1/3 ]²
 *               · exp( γσ / (r_ij − aσ) ) · exp( γσ / (r_ik − aσ) )
 *
 *   E = Σ_{i<j} φ2(r_ij) + Σ_i Σ_{j<k, j,k≠i} φ3(i,j,k)
 *
 * The three-body term is summed over every atom as the central atom, which is
 * the convention the 1985 parameter set was fitted with: a given triple is
 * therefore counted three times, once per choice of centre.
 *
 * Forces are analytic. The test suite checks them against central differences
 * of the energy, which is the only thing that makes an analytic derivative
 * trustworthy.
 *
 * Scope and honesty:
 *   * the parameter set is the original silicon set only; no other element is
 *     accepted and no parameters are interpolated or invented;
 *   * the cutoff aσ is part of the model, so a cell that cannot support it is
 *     refused instead of silently truncating the potential;
 *   * no electrostatics, no long-range correction, no temperature-dependent
 *     parameterisation.
 *
 * Units: energy eV, length Å, force eV/Å, mass u, time ps.
 */

import type { Vec3 } from "../linalg.js";
import type { Structure } from "../types.js";
import { assertAngstrom } from "../structure.js";
import { baseSymbol } from "../elements.js";
import { maxCutoffForCell, type EnergyForces } from "./lj.js";

export interface SWParameters {
  /** Well depth ε in eV. */
  epsilon: number;
  /** Length scale σ in Å. */
  sigma: number;
  /** Cutoff in units of σ: r_c = a·σ. */
  a: number;
  /** Three-body strength λ (dimensionless). */
  lambda: number;
  /** Three-body decay γ (dimensionless). */
  gamma: number;
  /** Two-body prefactor A (dimensionless). */
  A: number;
  /** Two-body ratio B (dimensionless). */
  B: number;
  /** Repulsive exponent p. */
  p: number;
  /** Attractive exponent q (0 for the 1985 silicon set). */
  q: number;
  /** Preferred cosine of the bond angle (−1/3 for the tetrahedral angle). */
  costheta0: number;
}

export interface SWModel {
  kind: "sw";
  id: string;
  name: string;
  description: string;
  /** Full interaction cutoff r_c = a·σ in Å. */
  cutoff: number;
  /** Elements this parameter set is valid for. Nothing else is accepted. */
  elements: string[];
  parameters: SWParameters;
  reference: string;
  limitations: string[];
}

/**
 * Original Stillinger–Weber silicon parameters (PRB 31, 5262, 1985, Table I).
 * The numbers are reproduced here as published; they are not fitted or tuned
 * by HCS.
 */
export const SW_SILICON: SWModel = {
  kind: "sw",
  id: "sw.silicon.v1",
  name: "Stillinger–Weber silicon (1985 parameters)",
  description:
    "Two- and three-body Stillinger–Weber potential for diamond-structure silicon, " +
    "with the original 1985 parameter set.",
  cutoff: 1.8 * 2.0951,
  elements: ["Si"],
  parameters: {
    epsilon: 2.16826,
    sigma: 2.0951,
    a: 1.8,
    lambda: 21.0,
    gamma: 1.2,
    A: 7.049556277,
    B: 0.6022245584,
    p: 4,
    q: 0,
    costheta0: -1 / 3,
  },
  reference:
    "F. H. Stillinger and T. A. Weber, Phys. Rev. B 31, 5262 (1985), Table I. " +
    "Parameters as published for silicon.",
  limitations: [
    "Silicon only: the published parameter set is not transferable to other elements.",
    "Classical two- and three-body model: no charge transfer, no electronic structure, no magnetism.",
    "The original set was fitted to diamond silicon; it does not describe liquid silicon's density anomaly accurately.",
    "No long-range or electrostatic terms; the potential vanishes identically at r_c = a·σ.",
    "The cutoff a·σ is mandatory: cells too small for it are refused rather than truncated.",
  ],
};

export const SW_MODELS: Record<string, SWModel> = {
  [SW_SILICON.id]: SW_SILICON,
};

export function getSWModel(id: string): SWModel {
  const model = SW_MODELS[id];
  if (!model) {
    throw new Error(
      `Unknown Stillinger–Weber model '${id}'. Available: ${Object.keys(SW_MODELS).join(", ")}`,
    );
  }
  return model;
}

/** Two-body term φ2(r) in eV. */
export function swPairPotential(r: number, parameters: SWParameters): number {
  if (r <= 0) throw new Error("Stillinger–Weber potential is undefined at r = 0");
  const { A, B, epsilon, sigma, p, q, a } = parameters;
  const x = sigma / r;
  const exponential = Math.exp(sigma / (r - a * sigma));
  return A * epsilon * (B * x ** p - x ** q) * exponential;
}

/** Analytic derivative dφ2/dr in eV/Å. */
export function swPairPotentialDerivative(r: number, parameters: SWParameters): number {
  if (r <= 0) throw new Error("Stillinger–Weber potential is undefined at r = 0");
  const { A, B, epsilon, sigma, p, q, a } = parameters;
  const x = sigma / r;
  const xp = x ** p;
  const xq = x ** q;
  const exponential = Math.exp(sigma / (r - a * sigma));
  const radialDecay = sigma / (r - a * sigma) ** 2;
  const bracket = B * xp - xq;
  const bracketDerivative = -(B * p * xp) / r + (q * xq) / r;
  return A * epsilon * exponential * (bracketDerivative - bracket * radialDecay);
}

/**
 * Three-body term for one triple, given the two pair distances and the cosine
 * of the angle at the central atom. Returns eV.
 */
export function swThreeBodyTerm(
  r1: number,
  r2: number,
  cosTheta: number,
  parameters: SWParameters,
): number {
  const { epsilon, lambda, sigma, a, gamma, costheta0 } = parameters;
  const radial =
    Math.exp((gamma * sigma) / (r1 - a * sigma)) * Math.exp((gamma * sigma) / (r2 - a * sigma));
  const angular = (cosTheta - costheta0) ** 2;
  return lambda * epsilon * radial * angular;
}

interface Neighbour {
  index: number;
  /** Cartesian vector from the central atom to the neighbour, Å. */
  vector: Vec3;
  distance: number;
}

function minimumImageVector(structure: Structure, i: number, j: number): Vec3 {
  const m = structure.lattice.vectors;
  const fi = structure.sites[i]!.fractional_position;
  const fj = structure.sites[j]!.fractional_position;
  let dx = fj[0] - fi[0];
  let dy = fj[1] - fi[1];
  let dz = fj[2] - fi[2];
  if (structure.pbc[0]) dx -= Math.round(dx);
  if (structure.pbc[1]) dy -= Math.round(dy);
  if (structure.pbc[2]) dz -= Math.round(dz);
  return [
    dx * m[0][0] + dy * m[1][0] + dz * m[2][0],
    dx * m[0][1] + dy * m[1][1] + dz * m[2][1],
    dx * m[0][2] + dy * m[1][2] + dz * m[2][2],
  ];
}

export interface SWEvaluationOptions {
  /** Requested cutoff in Å. Must equal the model cutoff for a valid SW energy. */
  cutoff?: number;
}

function assertCellSupportsCutoff(structure: Structure, model: SWModel, requested: number): number {
  const maxValid = maxCutoffForCell(structure);
  if (!(maxValid > 0)) {
    throw new Error(
      "Cell has no valid minimum-image radius; fix the lattice before evaluating energies",
    );
  }
  if (requested > maxValid + 1e-9) {
    throw new Error(
      `Stillinger–Weber cutoff ${requested.toFixed(3)} Å exceeds the minimum-image radius ` +
        `${maxValid.toFixed(3)} Å of this cell. The potential is defined with its full cutoff, so ` +
        "HCS refuses to truncate it. Build a larger supercell (for diamond Si, at least 2×2×2 of the " +
        "conventional cell).",
    );
  }
  return requested;
}

function assertElements(structure: Structure, model: SWModel): void {
  const allowed = new Set(model.elements);
  const missing = new Set<string>();
  for (const site of structure.sites) {
    const symbol = baseSymbol(site.species);
    if (!allowed.has(symbol)) missing.add(symbol);
  }
  if (missing.size > 0) {
    throw new Error(
      `Model '${model.id}' has no parameters for: ${[...missing].sort().join(", ")}. ` +
        `Supported: ${model.elements.join(", ")}. HCS will not invent parameters for unsupported elements.`,
    );
  }
}

/**
 * Evaluates the total Stillinger–Weber energy and all forces.
 * O(N·z²) with z neighbours per atom inside r_c; the reference path, not a
 * scalable MD engine.
 */
export function computeSwEnergyForces(
  structure: Structure,
  model: SWModel,
  options: SWEvaluationOptions = {},
): EnergyForces {
  assertAngstrom(structure);
  if (structure.sites.length === 0) throw new Error("Cannot evaluate an empty structure");
  const cutoff = assertCellSupportsCutoff(structure, model, options.cutoff ?? model.cutoff);
  assertElements(structure, model);

  const parameters = model.parameters;
  const n = structure.sites.length;
  const forces: Vec3[] = Array.from({ length: n }, () => [0, 0, 0] as Vec3);
  const cutoff2 = cutoff * cutoff;

  // Neighbour lists with minimum-image vectors. Each directed pair is stored
  // once, which the three-body loop needs (both (i→j) and (i→k)).
  const neighbours: Neighbour[][] = Array.from({ length: n }, () => []);
  let pairCount = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const vector = minimumImageVector(structure, i, j);
      const r2 = vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2];
      if (r2 > cutoff2 || r2 === 0) continue;
      neighbours[i]!.push({ index: j, vector, distance: Math.sqrt(r2) });
      if (j > i) pairCount++;
    }
  }

  let energy = 0;

  // Two-body energy and forces (each unordered pair once).
  for (let i = 0; i < n; i++) {
    for (const neighbour of neighbours[i]!) {
      const j = neighbour.index;
      if (j <= i) continue;
      const r = neighbour.distance;
      energy += swPairPotential(r, parameters);
      const derivative = swPairPotentialDerivative(r, parameters);
      const inverseR = 1 / r;
      const fx = derivative * neighbour.vector[0] * inverseR;
      const fy = derivative * neighbour.vector[1] * inverseR;
      const fz = derivative * neighbour.vector[2] * inverseR;
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

  // Three-body energy and forces. Every atom is the centre once; a triple is
  // therefore counted three times, as the 1985 convention requires.
  const { epsilon, lambda, sigma, a, gamma, costheta0 } = parameters;
  const gammaSigma = gamma * sigma;
  for (let i = 0; i < n; i++) {
    const list = neighbours[i]!;
    const forceI = forces[i]!;
    for (let p1 = 0; p1 < list.length; p1++) {
      const first = list[p1]!;
      const u = first.vector;
      const r1 = first.distance;
      const g1 = Math.exp(gammaSigma / (r1 - a * sigma));
      // d ln g / dr. Written directly: g can underflow to 0 near the cutoff,
      // and g'/g would then be 0/0 = NaN.
      const g1LogDerivative = -gammaSigma / (r1 - a * sigma) ** 2;
      const uHat: Vec3 = [u[0] / r1, u[1] / r1, u[2] / r1];
      for (let p2 = p1 + 1; p2 < list.length; p2++) {
        const second = list[p2]!;
        const v = second.vector;
        const r2 = second.distance;
        const g2 = Math.exp(gammaSigma / (r2 - a * sigma));
        const g2LogDerivative = -gammaSigma / (r2 - a * sigma) ** 2;

        const cosTheta = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (r1 * r2);
        const angular = cosTheta - costheta0;
        energy += lambda * epsilon * g1 * g2 * angular * angular;

        const common = lambda * epsilon * g1 * g2;
        const angularDerivative = 2 * angular;
        const inverseR1R2 = 1 / (r1 * r2);

        // ∂U/∂u and ∂U/∂v. u and v point from the central atom outwards.
        const dUdu: Vec3 = [
          common * g1LogDerivative * angular * angular * uHat[0] +
            common * angularDerivative * (v[0] * inverseR1R2 - (cosTheta * u[0]) / (r1 * r1)),
          common * g1LogDerivative * angular * angular * uHat[1] +
            common * angularDerivative * (v[1] * inverseR1R2 - (cosTheta * u[1]) / (r1 * r1)),
          common * g1LogDerivative * angular * angular * uHat[2] +
            common * angularDerivative * (v[2] * inverseR1R2 - (cosTheta * u[2]) / (r1 * r1)),
        ];
        const vHat: Vec3 = [v[0] / r2, v[1] / r2, v[2] / r2];
        const dUdv: Vec3 = [
          common * g2LogDerivative * angular * angular * vHat[0] +
            common * angularDerivative * (u[0] * inverseR1R2 - (cosTheta * v[0]) / (r2 * r2)),
          common * g2LogDerivative * angular * angular * vHat[1] +
            common * angularDerivative * (u[1] * inverseR1R2 - (cosTheta * v[1]) / (r2 * r2)),
          common * g2LogDerivative * angular * angular * vHat[2] +
            common * angularDerivative * (u[2] * inverseR1R2 - (cosTheta * v[2]) / (r2 * r2)),
        ];

        const forceJ = forces[first.index]!;
        const forceK = forces[second.index]!;
        for (let axis = 0; axis < 3; axis++) {
          forceJ[axis]! -= dUdu[axis]!;
          forceK[axis]! -= dUdv[axis]!;
          forceI[axis]! += dUdu[axis]! + dUdv[axis]!;
        }
      }
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
    cutoffReduced: false,
    modelId: model.id,
    backend: "cpu",
  };
}

/** Potential energy only. */
export function computeSwPotentialEnergy(
  structure: Structure,
  model: SWModel,
  options: SWEvaluationOptions = {},
): number {
  assertAngstrom(structure);
  if (structure.sites.length === 0) throw new Error("Cannot evaluate an empty structure");
  const cutoff = assertCellSupportsCutoff(structure, model, options.cutoff ?? model.cutoff);
  assertElements(structure, model);
  const parameters = model.parameters;
  const n = structure.sites.length;
  const cutoff2 = cutoff * cutoff;

  const neighbours: Neighbour[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const vector = minimumImageVector(structure, i, j);
      const r2 = vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2];
      if (r2 > cutoff2 || r2 === 0) continue;
      neighbours[i]!.push({ index: j, vector, distance: Math.sqrt(r2) });
    }
  }

  let energy = 0;
  for (let i = 0; i < n; i++) {
    for (const neighbour of neighbours[i]!) {
      if (neighbour.index <= i) continue;
      energy += swPairPotential(neighbour.distance, parameters);
    }
  }
  const { epsilon, lambda, sigma, a, gamma, costheta0 } = parameters;
  for (let i = 0; i < n; i++) {
    const list = neighbours[i]!;
    for (let p1 = 0; p1 < list.length; p1++) {
      const first = list[p1]!;
      for (let p2 = p1 + 1; p2 < list.length; p2++) {
        const second = list[p2]!;
        const u = first.vector;
        const v = second.vector;
        const cosTheta =
          (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (first.distance * second.distance);
        energy +=
          lambda *
          epsilon *
          Math.exp((gamma * sigma) / (first.distance - a * sigma)) *
          Math.exp((gamma * sigma) / (second.distance - a * sigma)) *
          (cosTheta - costheta0) ** 2;
      }
    }
  }
  return energy;
}
