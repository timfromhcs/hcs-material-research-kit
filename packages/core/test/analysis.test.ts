import { describe, expect, it } from "vitest";
import {
  computeEnergyForces,
  computeMsd,
  computeRdf,
  createCrystal,
  makeSupercell,
  makeRng,
  makeGaussian,
  LJ_NOBLE_GASES,
  type Vec3,
} from "@hcs-materials/core";

function argonFcc(n: number, a = 5.26) {
  return makeSupercell(createCrystal({ prototype: "fcc", a, species: ["Ar"] }), {
    na: n,
    nb: n,
    nc: n,
  });
}

describe("radial distribution function", () => {
  it("finds the fcc first-neighbour shell at a/sqrt(2)", () => {
    const a = 5.26;
    const structure = argonFcc(2, a);
    const rdf = computeRdf(structure, { cutoff: 4.6, bins: 92 });
    const peakIndex = rdf.g.reduce((best, value, index) => (value > rdf.g[best]! ? index : best), 0);
    expect(rdf.r[peakIndex]!).toBeCloseTo(a / Math.sqrt(2), 1);
    expect(rdf.normalization).toBe("periodic-bulk");
    expect(rdf.pairsCounted).toBeGreaterThan(0);
  });

  it("gives coordination number 12 for the first fcc shell", () => {
    const structure = argonFcc(2, 5.26);
    const rdf = computeRdf(structure, { cutoff: 4.6, bins: 92 });
    // Integrate up to just past the first shell (~4.0 Å).
    let index = 0;
    while (rdf.r[index]! < 4.05) index++;
    expect(rdf.coordinationNumber[index]!).toBeGreaterThan(11.5);
    expect(rdf.coordinationNumber[index]!).toBeLessThan(12.5);
  });

  it("refuses a cutoff beyond half the shortest cell vector", () => {
    const structure = argonFcc(1, 5.26);
    expect(() => computeRdf(structure, { cutoff: 4 })).toThrow(/half the shortest lattice vector/);
  });

  it("flags a non-periodic cluster in its normalization", () => {
    const structure = {
      ...argonFcc(2, 5.26),
      pbc: [false, false, false] as [boolean, boolean, boolean],
    };
    const rdf = computeRdf(structure, { cutoff: 4 });
    expect(rdf.normalization).toBe("finite-cluster");
    expect(rdf.warnings.join(" ")).toMatch(/must not be read as a bulk RDF/);
  });
});

describe("mean-square displacement", () => {
  it("reproduces a known constant displacement", () => {
    const frames: Vec3[][] = [
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
      [
        [1, 0, 0],
        [1, 0, 0],
      ],
      [
        [2, 0, 0],
        [2, 0, 0],
      ],
      [
        [3, 0, 0],
        [3, 0, 0],
      ],
      [
        [4, 0, 0],
        [4, 0, 0],
      ],
    ];
    const msd = computeMsd(frames, { frameTimePs: 0.001, maxLag: 4, fitFrom: 1, fitTo: 4 });
    expect(msd.msd[0]!).toBeCloseTo(1, 12);
    expect(msd.msd[1]!).toBeCloseTo(4, 12);
    expect(msd.msd[3]!).toBeCloseTo(16, 12);
    expect(msd.atomsCounted).toBe(2);
  });

  it("reports a non-positive slope warning for a frozen system", () => {
    const frozen: Vec3[][] = Array.from({ length: 6 }, () => [
      [0, 0, 0],
      [1, 1, 1],
    ]);
    const msd = computeMsd(frozen, { frameTimePs: 0.001 });
    expect(msd.msd.every((v) => v === 0)).toBe(true);
    expect(msd.warnings.join(" ")).toMatch(/no diffusion coefficient is reported/i);
  });

  it("converts a fitted slope to cm²/s with the 3D Einstein relation", () => {
    // Brownian trajectories with per-axis variance 2D·Δt and D = 0.1 Å²/ps
    // (= 1e-5 cm²/s). The fitted slope must reproduce 6D within statistics.
    const D = 0.1; // Å²/ps
    const frameTime = 0.01;
    const atoms = 300;
    const steps = 200;
    const rng = makeRng(123);
    const gaussian = makeGaussian(rng);
    const sigma = Math.sqrt(2 * D * frameTime);
    const frames: Vec3[][] = [];
    const current: Vec3[] = Array.from({ length: atoms }, () => [0, 0, 0] as Vec3);
    frames.push(current.map((p) => [...p] as Vec3));
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < atoms; i++) {
        const p = current[i]!;
        p[0] += gaussian() * sigma;
        p[1] += gaussian() * sigma;
        p[2] += gaussian() * sigma;
      }
      frames.push(current.map((p) => [...p] as Vec3));
    }
    const msd = computeMsd(frames, { frameTimePs: frameTime, fitFrom: 20, fitTo: 180 });
    expect(msd.diffusionCm2PerS / 1e-5).toBeGreaterThan(0.85);
    expect(msd.diffusionCm2PerS / 1e-5).toBeLessThan(1.15);
  });

  it("rejects frame sets with inconsistent atom counts", () => {
    expect(() =>
      computeMsd([[[0, 0, 0]], [[0, 0, 0], [1, 1, 1]]], { frameTimePs: 0.001 }),
    ).toThrow(/same number of atoms/);
  });
});

describe("energy reference", () => {
  it("has a negative potential energy for a bound argon cell", () => {
    const structure = argonFcc(2);
    const { energy } = computeEnergyForces(structure, LJ_NOBLE_GASES);
    expect(energy).toBeLessThan(0);
  });
});
