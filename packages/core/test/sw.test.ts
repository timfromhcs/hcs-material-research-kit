import { describe, expect, it } from "vitest";
import {
  computeSwEnergyForces,
  computeSwPotentialEnergy,
  getSWModel,
  swPairPotential,
  swPairPotentialDerivative,
  swThreeBodyTerm,
  SW_SILICON,
} from "../src/kernels/sw.js";
import { createCrystal, makeSupercell } from "../src/build.js";
import { setSitePosition } from "../src/build.js";
import { runMd } from "../src/kernels/md.js";
import type { Structure } from "../src/types.js";

/** 2×2×2 conventional diamond cell: the smallest cell that supports the SW cutoff. */
function siliconCell(a = 5.431): Structure {
  return makeSupercell(createCrystal({ prototype: "diamond", a, species: ["Si"] }), {
    na: 2,
    nb: 2,
    nc: 2,
  });
}

describe("Stillinger–Weber pair term", () => {
  it("matches the published closed form", () => {
    const p = SW_SILICON.parameters;
    for (const r of [2.1, 2.35, 2.8, 3.2, 3.6]) {
      const x = p.sigma / r;
      const expected =
        p.A * p.epsilon * (p.B * x ** p.p - x ** p.q) * Math.exp(p.sigma / (r - p.a * p.sigma));
      expect(swPairPotential(r, p)).toBeCloseTo(expected, 12);
    }
  });

  it("has an analytic derivative that matches central differences", () => {
    const p = SW_SILICON.parameters;
    const h = 1e-6;
    for (const r of [2.1, 2.35, 2.8, 3.2, 3.6]) {
      const numeric = (swPairPotential(r + h, p) - swPairPotential(r - h, p)) / (2 * h);
      expect(swPairPotentialDerivative(r, p)).toBeCloseTo(numeric, 6);
    }
  });

  it("vanishes at the model cutoff", () => {
    const p = SW_SILICON.parameters;
    expect(Math.abs(swPairPotential(p.a * p.sigma - 1e-6, p))).toBeLessThan(1e-6);
  });
});

describe("Stillinger–Weber three-body term", () => {
  it("matches an independently written expression", () => {
    const p = SW_SILICON.parameters;
    const r1 = 2.35;
    const r2 = 2.35;
    const cosTheta = Math.cos((109.47 * Math.PI) / 180);
    const expected =
      p.lambda *
      p.epsilon *
      (cosTheta - p.costheta0) ** 2 *
      Math.exp((p.gamma * p.sigma) / (r1 - p.a * p.sigma)) *
      Math.exp((p.gamma * p.sigma) / (r2 - p.a * p.sigma));
    expect(swThreeBodyTerm(r1, r2, cosTheta, p)).toBeCloseTo(expected, 12);
  });

  it("is zero at the preferred tetrahedral angle", () => {
    const p = SW_SILICON.parameters;
    expect(swThreeBodyTerm(2.35, 2.35, p.costheta0, p)).toBe(0);
  });
});

describe("Stillinger–Weber silicon energy and forces", () => {
  it("refuses a cell that cannot support the full cutoff", () => {
    const conventional = createCrystal({ prototype: "diamond", a: 5.431, species: ["Si"] });
    expect(() => computeSwEnergyForces(conventional, SW_SILICON)).toThrow(/minimum-image radius/);
  });

  it("refuses elements without published parameters", () => {
    const structure = siliconCell();
    const withCarbon = setSitePosition(structure, 0, [0.1, 0.1, 0.1]);
    const mixed: Structure = {
      ...withCarbon,
      sites: withCarbon.sites.map((site, index) =>
        index === 0 ? { ...site, species: "C" } : site,
      ),
    };
    expect(() => computeSwEnergyForces(mixed, SW_SILICON)).toThrow(/no parameters for: C/);
  });

  it("has forces equal to the negative numerical gradient", () => {
    const structure = siliconCell();
    // Break the symmetry so every force component is non-trivial.
    let displaced = structure;
    for (let index = 0; index < 6; index++) {
      const site = displaced.sites[index]!;
      displaced = setSitePosition(displaced, index, [
        site.fractional_position[0] + 0.003 * (index + 1),
        site.fractional_position[1] - 0.002 * (index + 1),
        site.fractional_position[2] + 0.001 * (index + 1),
      ]);
    }
    const evaluated = computeSwEnergyForces(displaced, SW_SILICON);
    // h is a fractional displacement; convert the finite-difference step to
    // Cartesian length before comparing with a force in eV/Å.
    const h = 1e-4;
    const lattice = displaced.lattice.vectors;
    let worst = 0;
    for (let atom = 0; atom < 8; atom++) {
      for (let axis = 0; axis < 3; axis++) {
        const original = displaced.sites[atom]!.fractional_position;
        const plus = [...original] as [number, number, number];
        plus[axis] += h;
        const minus = [...original] as [number, number, number];
        minus[axis] -= h;
        const ePlus = computeSwPotentialEnergy(setSitePosition(displaced, atom, plus), SW_SILICON);
        const eMinus = computeSwPotentialEnergy(
          setSitePosition(displaced, atom, minus),
          SW_SILICON,
        );
        const axisLength = Math.hypot(lattice[0][axis]!, lattice[1][axis]!, lattice[2][axis]!);
        const numeric = -(ePlus - eMinus) / (2 * h * axisLength);
        const analytic = evaluated.forces[atom]![axis]!;
        worst = Math.max(worst, Math.abs(numeric - analytic));
      }
    }
    expect(worst).toBeLessThan(1e-5);
  });

  it("is translation invariant and has zero net force", () => {
    const structure = siliconCell();
    const base = computeSwEnergyForces(structure, SW_SILICON);
    const translated: Structure = {
      ...structure,
      sites: structure.sites.map((site) => ({
        ...site,
        fractional_position: [
          site.fractional_position[0] + 0.25,
          site.fractional_position[1] + 0.125,
          site.fractional_position[2] + 0.375,
        ] as [number, number, number],
      })),
    };
    const moved = computeSwEnergyForces(translated, SW_SILICON);
    expect(Math.abs(base.energy - moved.energy)).toBeLessThan(1e-9);
    let net: [number, number, number] = [0, 0, 0];
    for (const force of base.forces) {
      net = [net[0] + force[0], net[1] + force[1], net[2] + force[2]];
    }
    expect(Math.hypot(...net)).toBeLessThan(1e-9);
  });

  it("places the diamond minimum at the silicon lattice constant", () => {
    const samples = [5.35, 5.38, 5.4, 5.42, 5.431, 5.45, 5.48, 5.51, 5.55, 5.6].map((a) => {
      const structure = siliconCell(a);
      return { a, perAtom: computeSwEnergyForces(structure, SW_SILICON).energyPerAtom };
    });
    const best = samples.reduce((lowest, sample) =>
      sample.perAtom < lowest.perAtom ? sample : lowest,
    );
    expect(best.a).toBeGreaterThan(5.38);
    expect(best.a).toBeLessThan(5.5);
    // The published SW silicon cohesive energy is about −4.34 eV/atom.
    expect(best.perAtom).toBeGreaterThan(-5.5);
    expect(best.perAtom).toBeLessThan(-4.0);
  });

  it("conserves total energy in NVE dynamics", () => {
    const structure = siliconCell();
    const result = runMd(structure, SW_SILICON, {
      steps: 200,
      timestep: 0.001,
      temperature: 300,
      seed: 7,
      sampleInterval: 10,
    });
    expect(Math.abs(result.energyDriftEvPerAtom)).toBeLessThan(1e-3);
    // Starting from the potential minimum with velocities drawn at 300 K leaves
    // the harmonic solid at roughly half that temperature once the energy is
    // partitioned; NVE has no setpoint. The drift is the physics assertion.
    expect(result.meanTemperatureK).toBeGreaterThan(80);
    expect(result.meanTemperatureK).toBeLessThan(400);
  });

  it("reports the full cutoff and never a reduced one", () => {
    const evaluated = computeSwEnergyForces(siliconCell(), SW_SILICON);
    expect(evaluated.cutoff).toBeCloseTo(SW_SILICON.cutoff, 12);
    expect(evaluated.cutoffReduced).toBe(false);
    expect(evaluated.backend).toBe("cpu");
    expect(evaluated.modelId).toBe("sw.silicon.v1");
  });

  it("resolves the model by id", () => {
    expect(getSWModel("sw.silicon.v1").elements).toEqual(["Si"]);
    expect(() => getSWModel("sw.nope")).toThrow(/Unknown Stillinger–Weber model/);
  });
});
