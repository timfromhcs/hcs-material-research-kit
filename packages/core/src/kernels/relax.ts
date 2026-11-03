/**
 * FIRE relaxation (Bitzek, Koskinen, Gähler, Moseler, Gumbsch,
 * "Structural relaxation made simple", PRL 97, 170201 (2006)).
 *
 * A named, published minimiser — not a hand-waved "optimizer". The stopping
 * criterion is the maximum force magnitude per atom in eV/Å.
 *
 * Masses are set to 1 (unit-mass dynamics); this only affects the trajectory,
 * never the located minimum. Displacements are clamped to `maxStep` Å per
 * iteration so a bad starting geometry cannot explode into NaN.
 */

import type { Vec3 } from "../linalg.js";
import type { Structure } from "../types.js";
import type { LJModel } from "./lj.js";
import { computeEnergyForces } from "./lj.js";
import {
  cartesianToFractional,
  compositionOf,
  fractionalToCartesian,
  validateStructure,
} from "../structure.js";

export interface RelaxOptions {
  maxForceEvPerA?: number;
  maxSteps?: number;
  /** Maximum displacement of any atom per iteration, angstrom. */
  maxStep?: number;
  /** Requested pair cutoff in angstrom; clamped to the cell minimum-image radius. */
  cutoff?: number;
  /** Called after every evaluated step; return false to cancel. */
  onStep?: (info: RelaxStepInfo) => boolean | void;
}

export interface RelaxStepInfo {
  step: number;
  energy: number;
  maxForce: number;
}

export interface RelaxResult {
  structure: Structure;
  energy: number;
  energyPerAtom: number;
  maxForce: number;
  steps: number;
  converged: boolean;
  energyHistory: number[];
  maxForceHistory: number[];
  criterion: string;
  cancelled: boolean;
}

export function relaxFire(
  structure: Structure,
  model: LJModel,
  options: RelaxOptions = {},
): RelaxResult {
  const maxForceTarget = options.maxForceEvPerA ?? 0.01;
  if (!(maxForceTarget > 0)) throw new Error("maxForceEvPerA must be positive");
  const maxSteps = options.maxSteps ?? 2000;
  const maxStep = options.maxStep ?? 0.1;
  let dt = 0.05;
  const dtMax = 0.5;
  const fireInc = 1.1;
  const fireDec = 0.5;
  const alphaStart = 0.1;
  const fireAlpha = 0.99;

  const n = structure.sites.length;
  const positions = structure.sites.map((site) => fractionalToCartesian(structure, site.fractional_position));
  const velocities: Vec3[] = Array.from({ length: n }, () => [0, 0, 0] as Vec3);
  let alpha = alphaStart;
  let positiveSteps = 0;

  const energyHistory: number[] = [];
  const maxForceHistory: number[] = [];
  let converged = false;
  let cancelled = false;
  let step = 0;
  let energy = Number.NaN;
  let maxForce = Number.POSITIVE_INFINITY;

  const toStructure = (): Structure => {
    const sites = positions.map((position, index) => ({
      ...structure.sites[index]!,
      fractional_position: cartesianToFractional(structure, position),
      cartesian_position: undefined,
    }));
    const candidate: Structure = { ...structure, sites };
    return {
      ...candidate,
      composition: compositionOf(sites),
      validation: validateStructure(candidate),
      updated_at: new Date().toISOString(),
    };
  };

  for (step = 0; step < maxSteps; step++) {
    const displaced = toStructure();
    const evaluated = computeEnergyForces(displaced, model, { cutoff: options.cutoff });
    energy = evaluated.energy;
    maxForce = evaluated.maxForce;
    if (!Number.isFinite(energy) || !Number.isFinite(maxForce)) {
      throw new Error("Energy or force became non-finite; the geometry contains overlapping atoms");
    }
    energyHistory.push(energy);
    maxForceHistory.push(maxForce);

    if (options.onStep && options.onStep({ step, energy, maxForce }) === false) {
      cancelled = true;
      break;
    }
    if (maxForce <= maxForceTarget) {
      converged = true;
      break;
    }

    // Power P = F · v
    let power = 0;
    let v2 = 0;
    let f2 = 0;
    for (let i = 0; i < n; i++) {
      const f = evaluated.forces[i]!;
      const v = velocities[i]!;
      power += f[0] * v[0] + f[1] * v[1] + f[2] * v[2];
      v2 += v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      f2 += f[0] * f[0] + f[1] * f[1] + f[2] * f[2];
    }
    const vNorm = Math.sqrt(v2);
    const fNorm = Math.sqrt(f2);

    if (fNorm > 0) {
      for (let i = 0; i < n; i++) {
        const f = evaluated.forces[i]!;
        const v = velocities[i]!;
        v[0] = (1 - alpha) * v[0] + alpha * (f[0] / fNorm) * vNorm;
        v[1] = (1 - alpha) * v[1] + alpha * (f[1] / fNorm) * vNorm;
        v[2] = (1 - alpha) * v[2] + alpha * (f[2] / fNorm) * vNorm;
      }
    }

    if (power > 0) {
      positiveSteps++;
      if (positiveSteps > 5) {
        dt = Math.min(dt * fireInc, dtMax);
        alpha *= fireAlpha;
      }
    } else {
      positiveSteps = 0;
      dt = Math.max(dt * fireDec, 1e-6);
      alpha = alphaStart;
      for (const v of velocities) {
        v[0] = 0;
        v[1] = 0;
        v[2] = 0;
      }
    }

    for (let i = 0; i < n; i++) {
      const f = evaluated.forces[i]!;
      const v = velocities[i]!;
      v[0] += dt * f[0];
      v[1] += dt * f[1];
      v[2] += dt * f[2];
      const displacement: Vec3 = [dt * v[0], dt * v[1], dt * v[2]];
      const magnitude = Math.hypot(displacement[0], displacement[1], displacement[2]);
      if (magnitude > maxStep) {
        const scale = maxStep / magnitude;
        displacement[0] *= scale;
        displacement[1] *= scale;
        displacement[2] *= scale;
        v[0] *= scale;
        v[1] *= scale;
        v[2] *= scale;
      }
      const p = positions[i]!;
      p[0] += displacement[0];
      p[1] += displacement[1];
      p[2] += displacement[2];
    }
  }

  const finalStructure = toStructure();
  const final = computeEnergyForces(finalStructure, model, { cutoff: options.cutoff });
  return {
    structure: finalStructure,
    energy: final.energy,
    energyPerAtom: final.energyPerAtom,
    maxForce: final.maxForce,
    steps: step,
    converged,
    energyHistory,
    maxForceHistory,
    criterion: `max force magnitude <= ${maxForceTarget} eV/Å (FIRE, max ${maxSteps} steps)`,
    cancelled,
  };
}
