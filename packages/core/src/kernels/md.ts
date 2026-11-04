/**
 * Velocity-Verlet molecular dynamics in the NVE ensemble.
 *
 * Only NVE is implemented. There is deliberately no thermostat: a correct
 * NVT integrator (Nosé–Hoover or a properly derived Langevin scheme) is a
 * separate, testable piece of physics, and HCS does not fake one. Requests for
 * NVT are rejected instead of silently rescaling velocities and calling it a
 * temperature.
 *
 * Units: length Å, energy eV, mass u, time ps.
 */

import { makeGaussian, makeRng, type Vec3 } from "../linalg.js";
import type { Structure } from "../types.js";
import type { PotentialModel } from "./potential.js";
import { evaluatePotential } from "./potential.js";
import type { EnergyForcesKernel } from "./relax.js";
import {
  cartesianToFractional,
  compositionOf,
  fractionalToCartesian,
  validateStructure,
} from "../structure.js";
import { atomicMass } from "../elements.js";
import {
  accelerationFromForce,
  KB_EV_PER_K,
  SQRT_EV_PER_U_TO_A_PER_PS,
  U_A2_PER_PS2_TO_EV,
} from "../units.js";

export interface MdOptions {
  /** Number of integration steps to perform in this call. */
  steps: number;
  /** Timestep in ps (1 fs = 0.001 ps). */
  timestep: number;
  /** Initial temperature in K (ignored when `initialState` is supplied). */
  temperature: number;
  seed?: number;
  /** Sample total energy every N steps; default 10. */
  sampleInterval?: number;
  /** Sample the full trajectory every N steps; 0 disables trajectory output. */
  trajectoryInterval?: number;
  /** Requested pair cutoff in angstrom; clamped to the cell minimum-image radius. */
  cutoff?: number;
  /** Optional alternative implementation (e.g. WASM); must match the CPU contract. */
  energyKernel?: EnergyForcesKernel;
  /**
   * Resume from a checkpoint instead of drawing fresh velocities. Positions and
   * velocities are Cartesian (Å and Å/ps); `step` is the number of steps already
   * completed, so time-series entries carry the correct absolute time.
   */
  initialState?: MdInitialState;
  /** Called after each sampled step; return false to cancel. */
  onStep?: (info: MdStepInfo) => boolean | void;
}

export interface MdInitialState {
  positionsCartesian: Vec3[];
  velocities: Vec3[];
  step: number;
}

/**
 * Portable MD checkpoint. It carries exactly the state a velocity-Verlet run
 * needs to continue bit-for-bit: positions, velocities and the absolute step.
 * The structure hash and timestep are recorded so a checkpoint can never be
 * applied to a different cell or a different time step.
 */
export interface MdCheckpoint {
  schema_version: "1.0.0";
  structure_hash: string;
  steps_completed: number;
  timestep_ps: number;
  seed: number;
  positions: Vec3[];
  velocities: Vec3[];
}

export interface MdStepInfo {
  step: number;
  timePs: number;
  kineticEv: number;
  potentialEv: number;
  totalEv: number;
  temperatureK: number;
}

export interface MdTrajectoryFrame {
  step: number;
  timePs: number;
  /** Cartesian positions in angstrom. */
  positions: Vec3[];
}

export interface MdResult {
  finalStructure: Structure;
  /** Cartesian positions at the end of the run (Å), for checkpoints. */
  finalPositions: Vec3[];
  /** Velocities at the end of the run (Å/ps), for checkpoints. */
  finalVelocities: Vec3[];
  /** Number of steps already completed before this call (0 for a fresh run). */
  initialStep: number;
  /** Absolute step index reached by this run. */
  finalStep: number;
  initialPotentialEv: number;
  finalPotentialEv: number;
  initialKineticEv: number;
  finalKineticEv: number;
  energyDriftEv: number;
  energyDriftEvPerAtom: number;
  relativeEnergyDrift: number;
  steps: number;
  timestepPs: number;
  initialTemperatureK: number;
  meanTemperatureK: number;
  temperatureSeries: { timePs: number[]; temperatureK: number[] };
  energySeries: { timePs: number[]; kineticEv: number[]; potentialEv: number[]; totalEv: number[] };
  trajectory: MdTrajectoryFrame[];
  /** Unwrapped cartesian positions per frame, for MSD. */
  unwrapped: Vec3[][];
  cancelled: boolean;
  thermostate: "NVE";
}

export function initialVelocities(
  structure: Structure,
  temperatureK: number,
  seed: number,
): { velocities: Vec3[]; kineticEv: number } {
  const rng = makeRng(seed);
  const gaussian = makeGaussian(rng);
  const masses = structure.sites.map((site) => atomicMass(site.species) * (site.occupancy ?? 1));
  const velocities: Vec3[] = masses.map((mass) => {
    const sigma = Math.sqrt((KB_EV_PER_K * temperatureK) / mass) * SQRT_EV_PER_U_TO_A_PER_PS;
    return [gaussian() * sigma, gaussian() * sigma, gaussian() * sigma] as Vec3;
  });
  // Remove net momentum so the cell does not drift.
  let px = 0;
  let py = 0;
  let pz = 0;
  let totalMass = 0;
  for (let i = 0; i < masses.length; i++) {
    const m = masses[i]!;
    const v = velocities[i]!;
    px += m * v[0];
    py += m * v[1];
    pz += m * v[2];
    totalMass += m;
  }
  for (let i = 0; i < velocities.length; i++) {
    const v = velocities[i]!;
    v[0] -= px / totalMass;
    v[1] -= py / totalMass;
    v[2] -= pz / totalMass;
  }
  let kinetic = 0;
  for (let i = 0; i < velocities.length; i++) {
    const v = velocities[i]!;
    kinetic += 0.5 * masses[i]! * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  }
  return { velocities, kineticEv: kinetic * U_A2_PER_PS2_TO_EV };
}

/**
 * Runs NVE molecular dynamics.
 *
 * `thermostat` is intentionally absent: pass no ensemble, get NVE. The caller
 * (job layer) rejects NVT requests with an explicit unsupported message.
 */
export function runMd(structure: Structure, model: PotentialModel, options: MdOptions): MdResult {
  if (!Number.isInteger(options.steps) || options.steps <= 0) {
    throw new Error("steps must be a positive integer");
  }
  if (!(options.timestep > 0)) throw new Error("timestep must be positive");
  const sampleInterval = Math.max(1, options.sampleInterval ?? 10);
  const trajectoryInterval = Math.max(0, options.trajectoryInterval ?? 0);
  const seed = options.seed ?? 12345;

  if (structure.sites.length > 5000) {
    throw new Error(
      `NVE run refused: ${structure.sites.length} atoms exceeds the 5000-atom limit of the O(N²) reference kernel.`,
    );
  }

  const masses = structure.sites.map((site) => atomicMass(site.species) * (site.occupancy ?? 1));
  const resumed = options.initialState;
  if (resumed) {
    if (resumed.positionsCartesian.length !== structure.sites.length) {
      throw new Error(
        `Checkpoint carries ${resumed.positionsCartesian.length} positions but the structure has ` +
          `${structure.sites.length} sites; refusing to mix two structures.`,
      );
    }
    if (resumed.velocities.length !== structure.sites.length) {
      throw new Error(
        `Checkpoint carries ${resumed.velocities.length} velocities but the structure has ` +
          `${structure.sites.length} sites; refusing to mix two structures.`,
      );
    }
    if (!Number.isInteger(resumed.step) || resumed.step < 0) {
      throw new Error("Checkpoint step must be a non-negative integer");
    }
  }
  const positions = resumed
    ? resumed.positionsCartesian.map((position) => [...position] as Vec3)
    : structure.sites.map((site) => fractionalToCartesian(structure, site.fractional_position));
  const velocities = resumed
    ? resumed.velocities.map((velocity) => [...velocity] as Vec3)
    : initialVelocities(structure, options.temperature, seed).velocities;
  const initialStep = resumed?.step ?? 0;

  const kineticOf = (vel: Vec3[]): number => {
    let kinetic = 0;
    for (let i = 0; i < vel.length; i++) {
      const v = vel[i]!;
      kinetic += 0.5 * masses[i]! * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    }
    return kinetic * U_A2_PER_PS2_TO_EV;
  };

  const toStructure = (pos: Vec3[]): Structure => {
    const sites = pos.map((position, index) => ({
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

  const evaluate: EnergyForcesKernel =
    options.energyKernel ??
    ((candidate, candidateModel, evaluation) =>
      evaluatePotential(candidate, candidateModel, evaluation ?? { cutoff: options.cutoff }));

  let current = toStructure(positions);
  let evaluated = evaluate(current, model, { cutoff: options.cutoff });
  const initialPotentialEv = evaluated.energy;
  const initialKineticEv = kineticOf(velocities);
  const initialTotal = initialPotentialEv + initialKineticEv;

  const temperatureSeries = { timePs: [] as number[], temperatureK: [] as number[] };
  const energySeries = {
    timePs: [] as number[],
    kineticEv: [] as number[],
    potentialEv: [] as number[],
    totalEv: [] as number[],
  };
  const trajectory: MdTrajectoryFrame[] = [];
  const unwrapped: Vec3[][] = [];
  let cancelled = false;
  let step = initialStep;
  const targetStep = initialStep + options.steps;

  const record = (stepIndex: number, kinetic: number, potential: number): void => {
    const timePs = stepIndex * options.timestep;
    const degreesOfFreedom = Math.max(1, 3 * positions.length - 3);
    const temperatureK = (2 * kinetic) / (degreesOfFreedom * KB_EV_PER_K);
    temperatureSeries.timePs.push(timePs);
    temperatureSeries.temperatureK.push(temperatureK);
    energySeries.timePs.push(timePs);
    energySeries.kineticEv.push(kinetic);
    energySeries.potentialEv.push(potential);
    energySeries.totalEv.push(kinetic + potential);
  };

  record(initialStep, initialKineticEv, initialPotentialEv);
  if (trajectoryInterval > 0) {
    trajectory.push({
      step: initialStep,
      timePs: initialStep * options.timestep,
      positions: positions.map((p) => [...p] as Vec3),
    });
    unwrapped.push(positions.map((p) => [...p] as Vec3));
  }

  const dt = options.timestep;
  let forces = evaluated.forces;

  while (step < targetStep) {
    step++;
    // Half-kick with the current forces, then drift.
    for (let i = 0; i < positions.length; i++) {
      const v = velocities[i]!;
      const f = forces[i]!;
      const m = masses[i]!;
      v[0] += 0.5 * dt * accelerationFromForce(f[0], m);
      v[1] += 0.5 * dt * accelerationFromForce(f[1], m);
      v[2] += 0.5 * dt * accelerationFromForce(f[2], m);
      const p = positions[i]!;
      p[0] += v[0] * dt;
      p[1] += v[1] * dt;
      p[2] += v[2] * dt;
    }

    current = toStructure(positions);
    evaluated = evaluate(current, model, { cutoff: options.cutoff });
    forces = evaluated.forces;

    for (let i = 0; i < positions.length; i++) {
      const v = velocities[i]!;
      const f = evaluated.forces[i]!;
      const m = masses[i]!;
      v[0] += 0.5 * dt * accelerationFromForce(f[0], m);
      v[1] += 0.5 * dt * accelerationFromForce(f[1], m);
      v[2] += 0.5 * dt * accelerationFromForce(f[2], m);
    }

    // Cartesian positions are never wrapped during the run, so they remain
    // continuous coordinates suitable for mean-square displacement.

    const kinetic = kineticOf(velocities);
    if (step % sampleInterval === 0 || step === targetStep) {
      record(step, kinetic, evaluated.energy);
      if (options.onStep) {
        const keep = options.onStep({
          step,
          timePs: step * dt,
          kineticEv: kinetic,
          potentialEv: evaluated.energy,
          totalEv: kinetic + evaluated.energy,
          temperatureK: (2 * kinetic) / (Math.max(1, 3 * positions.length - 3) * KB_EV_PER_K),
        });
        if (keep === false) {
          cancelled = true;
          break;
        }
      }
    }
    if (trajectoryInterval > 0 && step % trajectoryInterval === 0) {
      trajectory.push({
        step,
        timePs: step * dt,
        positions: positions.map((p) => [...p] as Vec3),
      });
      unwrapped.push(positions.map((p) => [...p] as Vec3));
    }
  }

  const finalStructure = toStructure(positions);
  const finalEvaluated = evaluate(finalStructure, model, { cutoff: options.cutoff });
  const finalKinetic = kineticOf(velocities);
  const finalTotal = finalEvaluated.energy + finalKinetic;
  const drift = finalTotal - initialTotal;
  const temperatures = temperatureSeries.temperatureK.slice(1);
  const meanTemperature = temperatures.length
    ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length
    : options.temperature;
  const initialTemperatureK = resumed
    ? (2 * initialKineticEv) / (Math.max(1, 3 * positions.length - 3) * KB_EV_PER_K)
    : options.temperature;

  return {
    finalStructure,
    finalPositions: positions.map((position) => [...position] as Vec3),
    finalVelocities: velocities.map((velocity) => [...velocity] as Vec3),
    initialStep,
    finalStep: step,
    initialPotentialEv,
    finalPotentialEv: finalEvaluated.energy,
    initialKineticEv,
    finalKineticEv: finalKinetic,
    energyDriftEv: drift,
    energyDriftEvPerAtom: drift / positions.length,
    relativeEnergyDrift: Math.abs(initialTotal) > 0 ? drift / Math.abs(initialTotal) : Number.NaN,
    steps: step - initialStep,
    timestepPs: dt,
    initialTemperatureK,
    meanTemperatureK: meanTemperature,
    temperatureSeries,
    energySeries,
    trajectory,
    unwrapped,
    cancelled,
    thermostate: "NVE",
  };
}
