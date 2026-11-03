import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LJ_NOBLE_GASES,
  computeEnergyForces,
  createCrystal,
  makeRng,
  makeSupercell,
  relaxFire,
  runMd,
  type Structure,
} from "@hcs-materials/core";
import { instantiateWasmKernel, type WasmKernel } from "@hcs-materials/wasm";

const bytes = readFileSync(new URL("../wasm/hcs_compute.wasm", import.meta.url));
let kernelPromise: Promise<WasmKernel> | null = null;
const kernel = (): Promise<WasmKernel> => (kernelPromise ??= instantiateWasmKernel(bytes));

function perturbedArgon(n = 2, a = 5.3, amplitude = 0.06): Structure {
  const base = makeSupercell(createCrystal({ prototype: "fcc", a, species: ["Ar"] }), {
    na: n,
    nb: n,
    nc: n,
  });
  const rng = makeRng(11);
  return {
    ...base,
    sites: base.sites.map((site) => ({
      ...site,
      fractional_position: site.fractional_position.map(
        (value) => value + (rng() - 0.5) * amplitude,
      ) as [number, number, number],
    })),
  };
}

describe("WASM kernel in the solvers", () => {
  it("relaxes to the same minimum as the TypeScript kernel", async () => {
    const wasm = await kernel();
    const start = perturbedArgon();
    const cpu = relaxFire(start, LJ_NOBLE_GASES, { maxForceEvPerA: 0.02, maxSteps: 1200 });
    const gpuish = relaxFire(start, LJ_NOBLE_GASES, {
      maxForceEvPerA: 0.02,
      maxSteps: 1200,
      energyKernel: wasm.energyForces.bind(wasm),
    });

    expect(cpu.converged).toBe(true);
    expect(gpuish.converged).toBe(true);
    expect(Math.abs(cpu.energy - gpuish.energy)).toBeLessThan(1e-8);
    expect(Math.abs(cpu.maxForce - gpuish.maxForce)).toBeLessThan(1e-8);
  });

  it("takes the same first MD step as the TypeScript kernel", async () => {
    const wasm = await kernel();
    const start = perturbedArgon(2, 5.3, 0.02);
    const options = {
      steps: 1,
      timestep: 0.001,
      temperature: 80,
      seed: 7,
      sampleInterval: 1,
    } as const;
    const cpu = runMd(start, LJ_NOBLE_GASES, options);
    const wasmRun = runMd(start, LJ_NOBLE_GASES, {
      ...options,
      energyKernel: wasm.energyForces.bind(wasm),
    });

    expect(Math.abs(cpu.finalPotentialEv - wasmRun.finalPotentialEv)).toBeLessThan(1e-10);
    for (let i = 0; i < start.sites.length; i++) {
      for (let axis = 0; axis < 3; axis++) {
        expect(
          Math.abs(
            cpu.finalStructure.sites[i]!.fractional_position[axis]! -
              wasmRun.finalStructure.sites[i]!.fractional_position[axis]!,
          ),
        ).toBeLessThan(1e-10);
      }
    }
  });

  it("conserves energy when WASM drives a longer NVE run", async () => {
    const wasm = await kernel();
    const start = makeSupercell(createCrystal({ prototype: "fcc", a: 5.3, species: ["Ar"] }), {
      na: 3,
      nb: 3,
      nc: 3,
    });
    const md = runMd(start, LJ_NOBLE_GASES, {
      steps: 200,
      timestep: 0.002,
      temperature: 60,
      seed: 3,
      sampleInterval: 10,
      energyKernel: wasm.energyForces.bind(wasm),
    });
    expect(Math.abs(md.energyDriftEvPerAtom)).toBeLessThan(1e-3);
    const quantities = computeEnergyForces(start, LJ_NOBLE_GASES);
    expect(quantities.backend).toBe("cpu");
  });
});
