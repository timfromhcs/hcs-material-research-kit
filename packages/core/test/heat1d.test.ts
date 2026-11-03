import { describe, expect, it } from "vitest";
import { analyticSineMode, maxAbsError, solveHeat1D } from "@hcs-materials/core";

const LENGTH = 1;
const ALPHA = 1e-5; // m²/s

describe("1D heat equation reference solver", () => {
  it("reproduces the analytic decay of the lowest Fourier mode", () => {
    const nodes = 51;
    const dx = LENGTH / (nodes - 1);
    const dt = (0.4 * (dx * dx)) / ALPHA;
    const steps = 200;
    const result = solveHeat1D({
      length: LENGTH,
      alpha: ALPHA,
      nodes,
      steps,
      dt,
      left: 0,
      right: 0,
      initial: (x) => Math.sin((Math.PI * x) / LENGTH),
    });
    expect(result.stable).toBe(true);
    expect(result.courant).toBeCloseTo(0.4, 12);
    const finalTime = result.times[result.times.length - 1]!;
    expect(finalTime).toBeCloseTo(steps * dt, 12);
    const finalField = result.fields[result.fields.length - 1]!;
    const error = maxAbsError(finalField, finalTime, { length: LENGTH, alpha: ALPHA });
    expect(error).toBeLessThan(5e-4);
    // The mode must have decayed, not grown.
    const mid = finalField[Math.floor(nodes / 2)]!;
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
  });

  it("rejects a Courant number above the stability limit", () => {
    expect(() =>
      solveHeat1D({
        length: LENGTH,
        alpha: ALPHA,
        nodes: 21,
        steps: 10,
        dt: 1000, // far too large
        left: 0,
        right: 0,
        initial: () => 0,
      }),
    ).toThrow(/unstable/);
  });

  it("keeps Dirichlet boundaries fixed", () => {
    const result = solveHeat1D({
      length: LENGTH,
      alpha: ALPHA,
      nodes: 21,
      steps: 50,
      left: 300,
      right: 400,
      initial: () => 0,
    });
    for (const field of result.fields) {
      expect(field[0]).toBe(300);
      expect(field[field.length - 1]).toBe(400);
    }
  });

  it("reaches the linear steady state for constant boundaries", () => {
    const result = solveHeat1D({
      length: LENGTH,
      alpha: ALPHA,
      nodes: 41,
      steps: 20000,
      left: 0,
      right: 100,
      initial: () => 0,
      saveInterval: 20000,
    });
    const field = result.fields[result.fields.length - 1]!;
    const mid = field[Math.floor(field.length / 2)]!;
    expect(mid).toBeCloseTo(50, 0);
  });

  it("refuses invalid inputs instead of returning NaNs", () => {
    expect(() =>
      solveHeat1D({
        length: -1,
        alpha: ALPHA,
        nodes: 11,
        steps: 1,
        left: 0,
        right: 0,
        initial: () => 0,
      }),
    ).toThrow(/length/);
    expect(() =>
      solveHeat1D({
        length: 1,
        alpha: 0,
        nodes: 11,
        steps: 1,
        left: 0,
        right: 0,
        initial: () => 0,
      }),
    ).toThrow(/diffusivity/);
    expect(() =>
      solveHeat1D({
        length: 1,
        alpha: ALPHA,
        nodes: 2,
        steps: 1,
        left: 0,
        right: 0,
        initial: () => 0,
      }),
    ).toThrow(/nodes/);
  });

  it("matches the analytic helper itself", () => {
    expect(analyticSineMode(0.5, 0, 1, ALPHA)).toBeCloseTo(1, 12);
    expect(analyticSineMode(0, 1, 1, ALPHA)).toBeCloseTo(0, 12);
  });
});
