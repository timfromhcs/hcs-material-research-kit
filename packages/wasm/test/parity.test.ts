import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LJ_NOBLE_GASES,
  baseSymbol,
  computeEnergyForces,
  createCrystal,
  makeRng,
  makeSupercell,
  type Structure,
} from "@hcs-materials/core";
import { instantiateWasmKernel, WASM_ABI_VERSION, type WasmKernel } from "@hcs-materials/wasm";

const wasmBytes = readFileSync(new URL("../wasm/hcs_compute.wasm", import.meta.url));

let kernelPromise: Promise<WasmKernel> | null = null;
function kernel(): Promise<WasmKernel> {
  kernelPromise ??= instantiateWasmKernel(wasmBytes);
  return kernelPromise;
}

function argon(n = 2, a = 5.26, perturbation = 0.03): Structure {
  const base = makeSupercell(createCrystal({ prototype: "fcc", a, species: ["Ar"] }), {
    na: n,
    nb: n,
    nc: n,
  });
  const rng = makeRng(2026);
  return {
    ...base,
    sites: base.sites.map((site) => ({
      ...site,
      fractional_position: site.fractional_position.map(
        (value) => value + (rng() - 0.5) * perturbation,
      ) as [number, number, number],
    })),
  };
}

function mixedArgonKrypton(n = 2, a = 5.3): Structure {
  const base = makeSupercell(createCrystal({ prototype: "fcc", a, species: ["Ar"] }), {
    na: n,
    nb: n,
    nc: n,
  });
  const rng = makeRng(99);
  return {
    ...base,
    sites: base.sites.map((site, index) => ({
      ...site,
      species: index % 3 === 0 ? "Kr" : "Ar",
      fractional_position: site.fractional_position.map(
        (value) => value + (rng() - 0.5) * 0.02,
      ) as [number, number, number],
    })),
  };
}

describe("WASM kernel", () => {
  it("exports the expected ABI and loads without imports", async () => {
    const wasm = await kernel();
    expect(wasm.abiVersion).toBe(WASM_ABI_VERSION);
    expect(wasm.moduleBytes).toBeGreaterThan(10_000);
  });

  it("matches the TypeScript reference on argon within 1e-10 eV", async () => {
    const wasm = await kernel();
    const structure = argon(2, 5.26);
    const reference = computeEnergyForces(structure, LJ_NOBLE_GASES);
    const actual = wasm.energyForces(structure, LJ_NOBLE_GASES);

    expect(actual.backend).toBe("wasm");
    expect(reference.backend).toBe("cpu");
    expect(Math.abs(actual.energy - reference.energy)).toBeLessThan(1e-10);
    expect(Math.abs(actual.energyPerAtom - reference.energyPerAtom)).toBeLessThan(1e-12);
    expect(Math.abs(actual.maxForce - reference.maxForce)).toBeLessThan(1e-10);
    expect(actual.pairCount).toBe(reference.pairCount);
    expect(actual.cutoff).toBeCloseTo(reference.cutoff, 12);
    expect(actual.forces).toHaveLength(reference.forces.length);
    for (let i = 0; i < reference.forces.length; i++) {
      for (let axis = 0; axis < 3; axis++) {
        expect(Math.abs(actual.forces[i]![axis]! - reference.forces[i]![axis]!)).toBeLessThan(
          1e-10,
        );
      }
    }
  });

  it("matches the reference on a mixed Ar/Kr cell (Lorentz–Berthelot mixing)", async () => {
    const wasm = await kernel();
    const structure = mixedArgonKrypton();
    const reference = computeEnergyForces(structure, LJ_NOBLE_GASES);
    const actual = wasm.energyForces(structure, LJ_NOBLE_GASES);
    expect(Math.abs(actual.energy - reference.energy)).toBeLessThan(1e-10);
    expect(Math.abs(actual.maxForce - reference.maxForce)).toBeLessThan(1e-10);
    expect(actual.pairCount).toBe(reference.pairCount);
  });

  it("clamps the cutoff to the cell exactly like the reference", async () => {
    const wasm = await kernel();
    const structure = argon(1, 5.26);
    const reference = computeEnergyForces(structure, LJ_NOBLE_GASES);
    const actual = wasm.energyForces(structure, LJ_NOBLE_GASES);
    expect(actual.cutoff).toBeCloseTo(reference.cutoff, 12);
    expect(actual.cutoffReduced).toBe(true);
    expect(reference.cutoffReduced).toBe(true);
  });

  it("honours an explicit cutoff", async () => {
    const wasm = await kernel();
    const structure = argon(3, 5.26);
    const reference = computeEnergyForces(structure, LJ_NOBLE_GASES, { cutoff: 6 });
    const actual = wasm.energyForces(structure, LJ_NOBLE_GASES, { cutoff: 6 });
    expect(actual.cutoff).toBeCloseTo(6, 12);
    expect(Math.abs(actual.energy - reference.energy)).toBeLessThan(1e-10);
  });

  it("returns no interactions for a single fcc cell, like the reference", async () => {
    const wasm = await kernel();
    const structure = argon(1, 5.26);
    const reference = computeEnergyForces(structure, LJ_NOBLE_GASES);
    const actual = wasm.energyForces(structure, LJ_NOBLE_GASES);
    expect(reference.pairCount).toBe(0);
    expect(actual.pairCount).toBe(0);
    expect(actual.energy).toBe(0);
  });

  it("rejects a degenerate cell instead of returning numbers", async () => {
    const wasm = await kernel();
    const structure = argon(1);
    const collapsed: Structure = {
      ...structure,
      lattice: {
        vectors: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
      },
    };
    expect(() => wasm.energyForces(collapsed, LJ_NOBLE_GASES)).toThrow(/minimum-image|cell/i);
  });

  it("refuses an element without parameters, like the reference", async () => {
    const wasm = await kernel();
    const structure = argon(2);
    const withIron: Structure = {
      ...structure,
      sites: structure.sites.map((site, index) =>
        index === 0 ? { ...site, species: "Fe" } : site,
      ),
    };
    expect(() => wasm.energyForces(withIron, LJ_NOBLE_GASES)).toThrow(
      /no Lennard-Jones parameters/i,
    );
    expect(baseSymbol(withIron.sites[0]!.species)).toBe("Fe");
  });
});
