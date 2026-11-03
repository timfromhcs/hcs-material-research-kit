import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LJ_NOBLE_GASES,
  computeEnergyForces,
  createCrystal,
  makeSupercell,
  type Structure,
} from "@hcs-materials/core";
import { instantiateWasmKernel, type WasmKernel } from "@hcs-materials/wasm";

const wasmBytes = readFileSync(new URL("../wasm/hcs_compute.wasm", import.meta.url));

const freshKernel = (): Promise<WasmKernel> => instantiateWasmKernel(wasmBytes);

function argon(cells: number): Structure {
  const base = createCrystal({ prototype: "fcc", a: 5.26, species: ["Ar"] });
  return makeSupercell(base, { na: cells, nb: cells, nc: cells });
}

function maxForceDelta(a: Float64Array | number[], b: Float64Array | number[]): number {
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
  return worst;
}

describe("WASM buffer arena", () => {
  it("reuses the buffers for repeated calls of the same size", async () => {
    const kernel = await freshKernel();
    const structure = argon(2);
    const first = kernel.energyForces(structure, LJ_NOBLE_GASES);
    const allocationsAfterFirst = kernel.arenaAllocations;

    expect(kernel.arenaCapacityAtoms).toBe(structure.sites.length);
    expect(allocationsAfterFirst).toBe(1);

    for (let repeat = 0; repeat < 10; repeat++) {
      const again = kernel.energyForces(structure, LJ_NOBLE_GASES);
      expect(again.energy).toBe(first.energy);
      expect(again.pairCount).toBe(first.pairCount);
    }
    expect(kernel.arenaAllocations).toBe(allocationsAfterFirst);
    kernel.dispose();
  });

  it("grows once for a larger structure and stays correct afterwards", async () => {
    const kernel = await freshKernel();
    const small = argon(2);
    const large = argon(3);

    const smallReference = computeEnergyForces(small, LJ_NOBLE_GASES);
    const first = kernel.energyForces(small, LJ_NOBLE_GASES);
    expect(Math.abs(first.energy - smallReference.energy)).toBeLessThan(1e-10);

    const largeReference = computeEnergyForces(large, LJ_NOBLE_GASES);
    const grown = kernel.energyForces(large, LJ_NOBLE_GASES);
    expect(kernel.arenaAllocations).toBe(2);
    expect(kernel.arenaCapacityAtoms).toBeGreaterThanOrEqual(large.sites.length);
    expect(Math.abs(grown.energy - largeReference.energy)).toBeLessThan(1e-10);
    expect(Math.abs(grown.maxForce - largeReference.maxForce)).toBeLessThan(1e-10);
    for (let i = 0; i < large.sites.length; i++) {
      expect(
        maxForceDelta(grown.forces[i]!, largeReference.forces[i]!),
      ).toBeLessThan(1e-10);
    }

    // A smaller structure after growth reuses the larger arena.
    const allocationsAfterGrowth = kernel.arenaAllocations;
    const back = kernel.energyForces(small, LJ_NOBLE_GASES);
    expect(kernel.arenaAllocations).toBe(allocationsAfterGrowth);
    expect(Math.abs(back.energy - smallReference.energy)).toBeLessThan(1e-10);
    kernel.dispose();
  });

  it("does not leak species parameters between calls", async () => {
    const kernel = await freshKernel();
    const argonCell = argon(2);
    const kryptonCell: Structure = {
      ...argonCell,
      sites: argonCell.sites.map((site) => ({ ...site, species: "Kr" })),
    };

    const argonResult = kernel.energyForces(argonCell, LJ_NOBLE_GASES);
    const kryptonResult = kernel.energyForces(kryptonCell, LJ_NOBLE_GASES);
    const kryptonReference = computeEnergyForces(kryptonCell, LJ_NOBLE_GASES);
    const argonAgain = kernel.energyForces(argonCell, LJ_NOBLE_GASES);

    expect(Math.abs(kryptonResult.energy - kryptonReference.energy)).toBeLessThan(1e-10);
    expect(argonAgain.energy).toBe(argonResult.energy);
    expect(kryptonResult.energy).not.toBe(argonResult.energy);
    kernel.dispose();
  });

  it("frees the arena and refuses further calls after dispose", async () => {
    const kernel = await freshKernel();
    kernel.energyForces(argon(1), LJ_NOBLE_GASES);
    expect(kernel.arenaCapacityAtoms).toBeGreaterThan(0);

    kernel.dispose();
    expect(kernel.arenaCapacityAtoms).toBe(0);
    expect(() => kernel.energyForces(argon(1), LJ_NOBLE_GASES)).toThrow(/disposed/i);
    // Disposing twice is a no-op, not a crash.
    expect(() => kernel.dispose()).not.toThrow();
  });

  it("keeps the TypeScript parity contract across mixed sizes", async () => {
    const kernel = await freshKernel();
    for (const cells of [1, 2, 3]) {
      const structure = argon(cells);
      const reference = computeEnergyForces(structure, LJ_NOBLE_GASES);
      const actual = kernel.energyForces(structure, LJ_NOBLE_GASES);
      expect(actual.pairCount).toBe(reference.pairCount);
      expect(Math.abs(actual.energy - reference.energy)).toBeLessThan(1e-10);
      expect(Math.abs(actual.maxForce - reference.maxForce)).toBeLessThan(1e-10);
    }
    kernel.dispose();
  });
});
