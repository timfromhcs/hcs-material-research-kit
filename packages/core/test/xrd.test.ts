import { describe, expect, it } from "vitest";
import {
  computeXrdPattern,
  createCrystal,
  CU_KA1_ANGSTROM,
  xrdPeaksToCsv,
  type XrdPattern,
} from "@hcs-materials/core";

function silicon() {
  return createCrystal({ prototype: "diamond", a: 5.431, species: ["Si"] });
}

function rockSalt() {
  return createCrystal({ prototype: "rocksalt", a: 5.6402, species: ["Na", "Cl"] });
}

describe("powder XRD", () => {
  const findAngle = (pattern: XrdPattern, twoTheta: number) =>
    pattern.peaks.find((peak) => Math.abs(peak.twoThetaDeg - twoTheta) < 0.2);
  it("places the silicon 111, 220 and 311 reflections at the reference angles", () => {
    const pattern = computeXrdPattern(silicon(), {
      wavelengthAngstrom: CU_KA1_ANGSTROM,
      twoThetaMaxDeg: 80,
    });
    expect(findAngle(pattern, 28.44)?.multiplicity).toBe(8);
    expect(findAngle(pattern, 47.3)?.multiplicity).toBe(12);
    expect(findAngle(pattern, 56.12)?.multiplicity).toBe(24);
    expect(pattern.peaks[0]!.twoThetaDeg).toBeCloseTo(28.44, 1);
  });

  it("omits the diamond-forbidden 200 reflection", () => {
    const pattern = computeXrdPattern(silicon(), { twoThetaMaxDeg: 80 });
    expect(findAngle(pattern, 32.95)).toBeUndefined();
  });

  it("reproduces the rock-salt 200 and 220 positions", () => {
    const pattern = computeXrdPattern(rockSalt(), { twoThetaMaxDeg: 70 });
    expect(findAngle(pattern, 31.7)).toBeDefined();
    expect(findAngle(pattern, 45.45)).toBeDefined();
  });

  it("handles a hexagonal cell (wurtzite ZnO 002)", () => {
    const zno = createCrystal({
      prototype: "wurtzite",
      a: 3.2495,
      c: 5.2069,
      species: ["Zn", "O"],
      u: 0.3819,
    });
    const pattern = computeXrdPattern(zno, { twoThetaMaxDeg: 50 });
    const peak = findAngle(pattern, 34.42);
    expect(peak).toBeDefined();
    expect(peak!.twoThetaDeg).toBeCloseTo(34.42, 1);
  });

  it("normalises the strongest peak to 100 and keeps intensities positive", () => {
    const pattern = computeXrdPattern(silicon());
    const maximum = Math.max(...pattern.peaks.map((peak) => peak.intensity));
    expect(maximum).toBeCloseTo(100, 6);
    expect(pattern.peaks.every((peak) => peak.intensity >= 0)).toBe(true);
    expect(pattern.twoThetaDeg.length).toBe(pattern.intensity.length);
  });

  it("is deterministic and reports its method and limits", () => {
    const a = computeXrdPattern(silicon());
    const b = computeXrdPattern(silicon());
    expect(a.peaks).toEqual(b.peaks);
    expect(a.wavelengthAngstrom).toBe(CU_KA1_ANGSTROM);
    expect(a.method).toContain("Kinematic");
    expect(a.limitations.join(" ")).toContain("Debye");
  });

  it("exports a CSV peak table", () => {
    const csv = xrdPeaksToCsv(computeXrdPattern(silicon()));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("two_theta_deg");
    expect(lines.length).toBeGreaterThan(2);
  });

  it("refuses an empty or degenerate structure", () => {
    const empty = { ...silicon(), sites: [] };
    expect(() => computeXrdPattern(empty)).toThrow(/empty structure/);
    const degenerate = {
      ...silicon(),
      lattice: {
        vectors: [
          [1, 0, 0],
          [2, 0, 0],
          [0, 0, 1],
        ] as [number[], number[], number[]],
      },
    };
    expect(() => computeXrdPattern(degenerate as never)).toThrow(/degenerate/);
  });
});
