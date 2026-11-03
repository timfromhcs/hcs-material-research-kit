import { describe, expect, it } from "vitest";
import {
  LJ_NOBLE_GASES,
  computeEnergyForces,
  computePotentialEnergy,
  createCrystal,
  cartesianToFractional,
  fractionalToCartesian,
  ljPairPotential,
  makeSupercell,
  relaxFire,
  resolvePair,
  structureHash,
  makeRng,
  type Structure,
} from "@hcs-materials/core";

const ARGON = LJ_NOBLE_GASES;

function argonCell(n = 2, a = 5.26): Structure {
  // fcc conventional cell repeated -> approximately the experimental Ar lattice.
  const fcc = createCrystal({ prototype: "fcc", a, species: ["Ar"] });
  return makeSupercell(fcc, { na: n, nb: n, nc: n });
}

describe("Lennard-Jones pair potential", () => {
  it("has its minimum at r = 2^(1/6) σ with depth -ε", () => {
    const epsilon = 0.01032;
    const sigma = 3.405;
    const rMin = 2 ** (1 / 6) * sigma;
    expect(ljPairPotential(epsilon, sigma, rMin)).toBeCloseTo(-epsilon, 12);
    expect(ljPairPotential(epsilon, sigma, 2 * sigma)).toBeLessThan(0);
    expect(ljPairPotential(epsilon, sigma, 3 * sigma)).toBeGreaterThan(-epsilon);
  });

  it("is repulsive well inside σ and vanishes at large r", () => {
    expect(ljPairPotential(1, 1, 0.5)).toBeGreaterThan(1000);
    expect(Math.abs(ljPairPotential(1, 1, 50))).toBeLessThan(1e-8);
  });

  it("throws at r = 0 instead of returning Infinity", () => {
    expect(() => ljPairPotential(1, 1, 0)).toThrow(/undefined/);
  });

  it("applies Lorentz-Berthelot mixing for unlike pairs", () => {
    const pair = resolvePair(ARGON, "Ar", "Kr");
    expect(pair.sigma).toBeCloseTo((3.405 + 3.65) / 2, 12);
    expect(pair.epsilon).toBeCloseTo(Math.sqrt(0.01032 * 0.01404), 14);
  });

  it("refuses unsupported elements instead of inventing parameters", () => {
    expect(() => resolvePair(ARGON, "Ar", "Fe")).toThrow(/no Lennard-Jones parameters/);
  });
});

describe("energy and forces", () => {
  it("makes forces equal the negative energy gradient", () => {
    const structure = argonCell(2, 5.3);
    const evaluated = computeEnergyForces(structure, ARGON);
    const h = 1e-5; // angstrom
    const m = structure.lattice.vectors;

    for (const atom of [0, 5, 17]) {
      for (let axis = 0; axis < 3; axis++) {
        const shiftedPlus = shiftAtom(structure, atom, axis, h);
        const shiftedMinus = shiftAtom(structure, atom, axis, -h);
        const numeric =
          -(
            computePotentialEnergy(shiftedPlus, ARGON) - computePotentialEnergy(shiftedMinus, ARGON)
          ) /
          (2 * h);
        const analytic = evaluated.forces[atom]![axis]!;
        expect(Math.abs(numeric - analytic)).toBeLessThan(1e-5 * Math.max(1, Math.abs(analytic)));
      }
    }
  });

  it("conserves energy under rigid translation", () => {
    const structure = argonCell(2, 5.3);
    const shifted: Structure = {
      ...structure,
      sites: structure.sites.map((site) => ({
        ...site,
        fractional_position: [
          site.fractional_position[0] + 0.137,
          site.fractional_position[1] - 0.211,
          site.fractional_position[2] + 0.089,
        ],
      })),
    };
    const before = computeEnergyForces(structure, ARGON).energy;
    const after = computeEnergyForces(shifted, ARGON).energy;
    expect(Math.abs(before - after)).toBeLessThan(1e-9);
  });

  it("has zero net force on a periodic cell", () => {
    const structure = argonCell(2, 5.4);
    const { forces } = computeEnergyForces(structure, ARGON);
    const total = forces.reduce(
      (sum, f) => [sum[0] + f[0], sum[1] + f[1], sum[2] + f[2]] as [number, number, number],
      [0, 0, 0] as [number, number, number],
    );
    expect(Math.hypot(...total)).toBeLessThan(1e-9);
  });

  it("gives the expected fcc cohesive energy range for argon", () => {
    const structure = argonCell(3, 5.26);
    const evaluated = computeEnergyForces(structure, ARGON);
    // Truncated pair sum (no tail correction), so the magnitude is smaller than
    // the -8.6 ε infinite-cutoff fcc value. The bracket is physics, not a number
    // copied from this implementation.
    expect(evaluated.cutoff).toBeGreaterThan(7);
    expect(evaluated.energyPerAtom / ARGON.species.Ar!.epsilon).toBeLessThan(-6.5);
    expect(evaluated.energyPerAtom / ARGON.species.Ar!.epsilon).toBeGreaterThan(-9);
  });

  it("is deterministic", () => {
    const a = computeEnergyForces(argonCell(2, 5.3), ARGON);
    const b = computeEnergyForces(argonCell(2, 5.3), ARGON);
    expect(a.energy).toBe(b.energy);
    expect(a.forces[3]).toEqual(b.forces[3]);
  });
});

describe("FIRE relaxation", () => {
  /**
   * A perfect crystal has exactly zero net force on every atom by symmetry, so
   * atom-position relaxation cannot lower its energy. Real relaxation tests
   * therefore start from a perturbed geometry.
   */
  function perturbed(n: number, a: number, amplitude: number) {
    const base = argonCell(n, a);
    const rng = makeRng(7);
    return {
      ...base,
      sites: base.sites.map((site) => ({
        ...site,
        fractional_position: site.fractional_position.map((x) => x + (rng() - 0.5) * amplitude) as [
          number,
          number,
          number,
        ],
      })),
    };
  }

  it("lowers the energy and reaches the force target", () => {
    const start = perturbed(2, 5.3, 0.06);
    const initial = computeEnergyForces(start, ARGON);
    expect(initial.maxForce).toBeGreaterThan(0.05);
    const result = relaxFire(start, ARGON, { maxForceEvPerA: 0.02, maxSteps: 1500 });
    expect(result.energy).toBeLessThan(initial.energy);
    expect(result.maxForce).toBeLessThanOrEqual(0.02);
    expect(result.converged).toBe(true);
    expect(result.energyHistory.length).toBeGreaterThan(1);
    expect(result.structure.sites).toHaveLength(start.sites.length);
  });

  it("leaves a perfect crystal untouched (zero-force symmetry)", () => {
    const perfect = argonCell(2, 5.3);
    const evaluated = computeEnergyForces(perfect, ARGON);
    expect(evaluated.maxForce).toBeLessThan(1e-12);
    const result = relaxFire(perfect, ARGON, { maxForceEvPerA: 1e-6, maxSteps: 10 });
    expect(result.converged).toBe(true);
    expect(result.steps).toBe(0);
  });

  it("stops when the callback cancels and reports it", () => {
    const start = perturbed(2, 5.3, 0.06);
    const result = relaxFire(start, ARGON, {
      maxForceEvPerA: 1e-6,
      maxSteps: 500,
      onStep: ({ step }) => step < 3,
    });
    expect(result.cancelled).toBe(true);
    expect(result.converged).toBe(false);
    expect(result.steps).toBeLessThan(5);
  });

  it("yields a structure with a different hash from the perturbed input", () => {
    const start = perturbed(2, 5.3, 0.06);
    const result = relaxFire(start, ARGON, { maxForceEvPerA: 0.05, maxSteps: 500 });
    expect(result.converged).toBe(true);
    expect(structureHash(result.structure)).not.toBe(structureHash(start));
  });
});

function shiftAtom(
  structure: Structure,
  atom: number,
  axis: number,
  deltaAngstrom: number,
): Structure {
  const cartesian = fractionalToCartesian(structure, structure.sites[atom]!.fractional_position);
  const target = [...cartesian] as [number, number, number];
  target[axis] += deltaAngstrom;
  const fractional = cartesianToFractional(structure, target);
  const sites = structure.sites.map((site, index) =>
    index === atom ? { ...site, fractional_position: fractional } : site,
  );
  return { ...structure, sites };
}
