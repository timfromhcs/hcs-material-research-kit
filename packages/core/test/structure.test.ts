import { describe, expect, it } from "vitest";
import {
  accelerationFromForce,
  cellVolume,
  compositionOf,
  createCrystal,
  densityGPerCm3,
  EV_PER_A_PER_AMU_TO_A_PER_PS2,
  measureSites,
  structureHash,
  totalMassAmu,
  validateStructure,
} from "@hcs-materials/core";
import { validate } from "@hcs-materials/contracts";

describe("crystal prototypes", () => {
  it("builds diamond silicon with the documented conventional cell", () => {
    const si = createCrystal({ prototype: "diamond", a: 5.431, species: ["Si"] });
    expect(si.sites).toHaveLength(8);
    // a³ / 8 atoms for diamond conventional cell
    expect(cellVolume(si)).toBeCloseTo(5.431 ** 3, 6);
    for (const row of si.lattice.vectors) expect(row).toHaveLength(3);
  });

  it("reproduces the density of silicon within 1%", () => {
    const si = createCrystal({ prototype: "diamond", a: 5.431, species: ["Si"] });
    const density = densityGPerCm3(totalMassAmu(si), cellVolume(si));
    // Reference: 2.3290 g/cm³ at 300 K
    expect(density).toBeGreaterThan(2.329 * 0.99);
    expect(density).toBeLessThan(2.329 * 1.01);
  });

  it("reproduces the density of rock-salt NaCl within 1.5%", () => {
    const nacl = createCrystal({ prototype: "rocksalt", a: 5.64, species: ["Na", "Cl"] });
    const density = densityGPerCm3(totalMassAmu(nacl), cellVolume(nacl));
    // Reference: 2.165 g/cm³
    expect(density).toBeGreaterThan(2.165 * 0.985);
    expect(density).toBeLessThan(2.165 * 1.015);
  });

  it("builds hcp with the ideal c/a ratio", () => {
    const mg = createCrystal({ prototype: "hcp", a: 3.209, species: ["Mg"] });
    expect(mg.sites).toHaveLength(2);
    const c = mg.lattice.vectors[2][2];
    expect(c).toBeCloseTo(3.209 * Math.sqrt(8 / 3), 6);
    // hcp ideal cell volume = sqrt(3)/2 a² c
    expect(cellVolume(mg)).toBeCloseTo((Math.sqrt(3) / 2) * 3.209 ** 2 * c, 6);
  });

  it("builds perovskite ABO3 with five atoms", () => {
    const sto = createCrystal({ prototype: "perovskite", a: 3.905, species: ["Sr", "Ti", "O"] });
    expect(sto.sites).toHaveLength(5);
    expect(compositionOf(sto.sites).reduced_formula).toBe("SrTiO3");
  });

  it("rejects a missing species list entry instead of guessing", () => {
    expect(() => createCrystal({ prototype: "rocksalt", a: 5.64, species: ["Na"] })).toThrow(
      /needs 2 species/,
    );
  });

  it("rejects a non-positive lattice parameter", () => {
    expect(() => createCrystal({ prototype: "fcc", a: 0, species: ["Cu"] })).toThrow(/positive/);
  });
});

describe("structure identity", () => {
  it("is independent of site order but sensitive to species", () => {
    const fcc = createCrystal({ prototype: "fcc", a: 3.615, species: ["Cu"] });
    const reordered = { ...fcc, sites: [...fcc.sites].reverse() };
    expect(structureHash(reordered)).toBe(structureHash(fcc));

    const substituted = {
      ...fcc,
      sites: fcc.sites.map((s, i) => (i === 0 ? { ...s, species: "Ag" } : s)),
    };
    expect(structureHash(substituted)).not.toBe(structureHash(fcc));
  });

  it("is insensitive to float noise below 1e-6 fractional units", () => {
    const fcc = createCrystal({ prototype: "fcc", a: 3.615, species: ["Cu"] });
    const noisy = {
      ...fcc,
      sites: fcc.sites.map((s) => ({
        ...s,
        fractional_position: s.fractional_position.map((x) => x + 1e-9) as [number, number, number],
      })),
    };
    expect(structureHash(noisy)).toBe(structureHash(fcc));
  });

  it("produces a schema-valid structure document", () => {
    const fcc = createCrystal({ prototype: "fcc", a: 3.615, species: ["Cu"] });
    const errors = validate("structure", fcc);
    expect(errors).toEqual([]);
  });
});

describe("unit conversions", () => {
  it("converts eV/Å/amu to Å/ps² with the LAMMPS metal constant", () => {
    // 1 eV/Å/amu = 9648.53 Å/ps²
    expect(EV_PER_A_PER_AMU_TO_A_PER_PS2).toBeCloseTo(9648.53, 1);
    expect(accelerationFromForce(1, 1)).toBeCloseTo(9648.53, 1);
    expect(accelerationFromForce(0, 1)).toBe(0);
    expect(() => accelerationFromForce(1, 0)).toThrow(/positive/);
  });
});

describe("site measurements", () => {
  it("measures the fcc nearest-neighbour distance with a minimum image", () => {
    const fcc = createCrystal({ prototype: "fcc", a: 4.05, species: ["Al"] });
    // Sites 0 and 1 are (0,0,0) and (0,1/2,1/2): nearest neighbours.
    const measurement = measureSites(fcc, [0, 1]);
    expect(measurement.distances).toHaveLength(1);
    expect(measurement.distances[0]!).toBeCloseTo(4.05 / Math.sqrt(2), 10);
    expect(measurement.angleDegrees).toBeUndefined();
  });

  it("wraps across the periodic boundary and says so", () => {
    const structure = createCrystal({ prototype: "sc", a: 4, species: ["Cu"] });
    const nearBoundary = {
      ...structure,
      sites: [
        { species: "Cu", fractional_position: [0.02, 0, 0] as [number, number, number] },
        { species: "Cu", fractional_position: [0.98, 0, 0] as [number, number, number] },
      ],
    };
    const measurement = measureSites(nearBoundary, [0, 1]);
    expect(measurement.distances[0]!).toBeCloseTo(0.16, 10);
    expect(measurement.wrapped).toBe(true);
  });

  it("computes the angle at the second selected site", () => {
    const structure = createCrystal({ prototype: "sc", a: 10, species: ["Ar"] });
    const rightAngle = {
      ...structure,
      sites: [
        { species: "Ar", fractional_position: [0.5, 0.5, 0.5] as [number, number, number] },
        { species: "Ar", fractional_position: [0.6, 0.5, 0.5] as [number, number, number] },
        { species: "Ar", fractional_position: [0.6, 0.6, 0.5] as [number, number, number] },
      ],
    };
    const measurement = measureSites(rightAngle, [0, 1, 2]);
    expect(measurement.angleDegrees!).toBeCloseTo(90, 8);
    expect(measurement.distances).toHaveLength(2);
  });

  it("rejects out-of-range and duplicate selections", () => {
    const structure = createCrystal({ prototype: "sc", a: 4, species: ["Cu"] });
    expect(() => measureSites(structure, [])).toThrow(/at least one/i);
    expect(() => measureSites(structure, [0, 9])).toThrow(/out of range/i);
    const duplicate = measureSites(structure, [0, 0]);
    expect(duplicate.indices).toEqual([0]);
  });
});

describe("validation", () => {
  it("flags a zero-volume cell as invalid", () => {
    const structure = createCrystal({ prototype: "sc", a: 3, species: ["Cu"] });
    const collapsed = {
      ...structure,
      lattice: {
        vectors: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ] as [[number, number, number], [number, number, number], [number, number, number]],
      },
    };
    const report = validateStructure(collapsed);
    expect(report.status).toBe("invalid");
    expect(report.checks.find((c) => c.id === "lattice.volume")?.status).toBe("fail");
  });

  it("flags overlapping atoms as a warning, not silent success", () => {
    const structure = createCrystal({ prototype: "sc", a: 4, species: ["Ar"] });
    const overlapping = {
      ...structure,
      sites: [
        { species: "Ar", fractional_position: [0, 0, 0], label: "Ar1" },
        { species: "Ar", fractional_position: [0.01, 0, 0], label: "Ar2" },
      ] as typeof structure.sites,
    };
    const report = validateStructure(overlapping);
    expect(report.status).toBe("warning");
    expect(report.checks.find((c) => c.id === "sites.overlap")?.status).toBe("warning");
  });

  it("warns about strongly skewed cells", () => {
    const skewed = {
      ...createCrystal({ prototype: "sc", a: 4, species: ["Cu"] }),
      lattice: {
        vectors: [
          [4, 0, 0],
          [3.9, 0.5, 0],
          [0, 0, 4],
        ] as [[number, number, number], [number, number, number], [number, number, number]],
      },
    };
    const report = validateStructure(skewed);
    expect(report.checks.find((c) => c.id === "cell.skew")?.status).toBe("warning");
  });
});

describe("composition", () => {
  it("reduces integer counts and orders by Hill system", () => {
    const sites = [
      ...Array.from({ length: 4 }, () => ({
        species: "Na",
        fractional_position: [0, 0, 0] as [number, number, number],
      })),
      ...Array.from({ length: 4 }, () => ({
        species: "Cl",
        fractional_position: [0, 0, 0] as [number, number, number],
      })),
    ];
    expect(compositionOf(sites).reduced_formula).toBe("NaCl");
    expect(compositionOf(sites).total_atoms).toBe(8);
  });

  it("honours partial occupancy", () => {
    const composition = compositionOf([
      { species: "Li", fractional_position: [0, 0, 0], occupancy: 0.5 },
      { species: "Co", fractional_position: [0, 0, 0], occupancy: 1 },
    ]);
    expect(composition.amounts.Li).toBe(0.5);
    expect(composition.total_atoms).toBe(1.5);
  });
});
