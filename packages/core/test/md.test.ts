import { describe, expect, it } from "vitest";
import {
  LJ_NOBLE_GASES,
  computeEnergyForces,
  createCrystal,
  initialVelocities,
  makeSupercell,
  runMd,
  totalMassAmu,
  U_A2_PER_PS2_TO_EV,
} from "@hcs-materials/core";

const ARGON = LJ_NOBLE_GASES;

function argon(n = 3, a = 5.26) {
  return makeSupercell(createCrystal({ prototype: "fcc", a, species: ["Ar"] }), {
    na: n,
    nb: n,
    nc: n,
  });
}

describe("initial velocities", () => {
  it("is reproducible for a fixed seed and differs for another seed", () => {
    const structure = argon(2);
    const a = initialVelocities(structure, 100, 7);
    const b = initialVelocities(structure, 100, 7);
    const c = initialVelocities(structure, 100, 8);
    expect(a.velocities).toEqual(b.velocities);
    expect(a.velocities).not.toEqual(c.velocities);
  });

  it("has zero net momentum", () => {
    const structure = argon(2);
    const { velocities } = initialVelocities(structure, 300, 1);
    const masses = structure.sites.map(() => 39.948);
    const p = [0, 0, 0];
    velocities.forEach((v, i) => {
      p[0]! += masses[i]! * v[0];
      p[1]! += masses[i]! * v[1];
      p[2]! += masses[i]! * v[2];
    });
    expect(Math.hypot(p[0]!, p[1]!, p[2]!)).toBeLessThan(1e-9);
  });

  it("produces the requested kinetic temperature within statistical error", () => {
    const structure = argon(4);
    const target = 200;
    const { velocities } = initialVelocities(structure, target, 3);
    const masses = structure.sites.map(() => 39.948);
    let kinetic = 0;
    velocities.forEach((v, i) => {
      kinetic += 0.5 * masses[i]! * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
    });
    const dof = 3 * structure.sites.length - 3;
    const temperature = (2 * kinetic * U_A2_PER_PS2_TO_EV) / (dof * 8.617333262e-5);
    // 256 atoms: statistical error on an instantaneous temperature is ~sqrt(2/dof) ≈ 9%
    expect(temperature).toBeGreaterThan(target * 0.8);
    expect(temperature).toBeLessThan(target * 1.2);
  });
});

describe("NVE molecular dynamics", () => {
  it("conserves total energy on a 108-atom argon cell", () => {
    const structure = argon(3, 5.3);
    const md = runMd(structure, ARGON, {
      steps: 400,
      timestep: 0.002,
      temperature: 60,
      seed: 42,
      sampleInterval: 10,
    });
    expect(md.thermostate).toBe("NVE");
    expect(md.steps).toBe(400);
    expect(Math.abs(md.energyDriftEvPerAtom)).toBeLessThan(1e-3);
    expect(md.relativeEnergyDrift).toBeLessThan(1e-3);
  });

  it("is deterministic for the same seed", () => {
    const structure = argon(2, 5.3);
    const a = runMd(structure, ARGON, { steps: 50, timestep: 0.001, temperature: 50, seed: 5 });
    const b = runMd(structure, ARGON, { steps: 50, timestep: 0.001, temperature: 50, seed: 5 });
    expect(a.finalPotentialEv).toBe(b.finalPotentialEv);
    expect(a.finalStructure.sites[0]!.fractional_position).toEqual(
      b.finalStructure.sites[0]!.fractional_position,
    );
  });

  it("records the requested trajectory frames", () => {
    const structure = argon(2, 5.3);
    const md = runMd(structure, ARGON, {
      steps: 100,
      timestep: 0.002,
      temperature: 80,
      seed: 11,
      sampleInterval: 10,
      trajectoryInterval: 25,
    });
    // frames at step 0, 25, 50, 75, 100
    expect(md.trajectory).toHaveLength(5);
    expect(md.unwrapped).toHaveLength(5);
    expect(md.trajectory[0]!.positions).toHaveLength(structure.sites.length);
    expect(md.trajectory[4]!.timePs).toBeCloseTo(0.2, 12);
    expect(md.energySeries.timePs).toHaveLength(11); // step 0 plus 10 samples
  });

  it("stops on the cancellation callback", () => {
    const structure = argon(2, 5.3);
    const md = runMd(structure, ARGON, {
      steps: 500,
      timestep: 0.001,
      temperature: 50,
      seed: 1,
      sampleInterval: 5,
      onStep: ({ step }) => step < 20,
    });
    expect(md.cancelled).toBe(true);
    expect(md.steps).toBeLessThanOrEqual(25);
  });

  it("refuses cells above the documented atom limit", () => {
    const big = argon(10, 5.26); // 4000 atoms: allowed
    expect(big.sites.length).toBe(4000);
    const structure = { ...big, sites: Array.from({ length: 5001 }, () => big.sites[0]!) };
    expect(() => runMd(structure, ARGON, { steps: 1, timestep: 0.001, temperature: 10 })).toThrow(
      /5000-atom limit/,
    );
  });

  it("has a physically sensible final temperature (no hidden thermostat)", () => {
    const structure = argon(2, 5.3);
    const md = runMd(structure, ARGON, {
      steps: 300,
      timestep: 0.001,
      temperature: 50,
      seed: 3,
      sampleInterval: 10,
    });
    // NVE conserves energy; the mean temperature must stay in a sane band
    // instead of drifting to zero (which a fake thermostat would mask).
    expect(md.meanTemperatureK).toBeGreaterThan(10);
    expect(md.meanTemperatureK).toBeLessThan(150);
    expect(totalMassAmu(structure)).toBeGreaterThan(0);
  });
});
