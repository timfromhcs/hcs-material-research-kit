#!/usr/bin/env node
/**
 * Reproducible CPU vs WASM benchmark for the Lennard-Jones reference kernel.
 *
 * Policy (docs/engines/benchmarks.md): a benchmark report records hardware, OS,
 * runtime, code state, workload, warm-up, sample count, dispersion and a
 * correctness comparison. This script does that and writes
 * benchmarks/results/latest.json. It never prints a speed-up without the raw
 * numbers beside it.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cpus, platform, release, arch, totalmem, availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LJ_NOBLE_GASES,
  computeEnergyForces,
  createCrystal,
  makeSupercell,
  relaxFire,
  runMd,
} from "../packages/core/dist/index.js";
import { instantiateWasmKernel } from "../packages/wasm/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmBytes = readFileSync(join(repoRoot, "packages/wasm/wasm/hcs_compute.wasm"));

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : 0.5 * (sorted[middle - 1] + sorted[middle]);
}

function measure(label, iterations, fn) {
  // Warm-up so JIT and module instantiation do not pollute the samples.
  for (let i = 0; i < 3; i++) fn();
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    samples.push(Number(end - start) / 1e6);
  }
  return {
    label,
    iterations,
    median_ms: median(samples),
    min_ms: Math.min(...samples),
    max_ms: Math.max(...samples),
  };
}

const kernel = await instantiateWasmKernel(wasmBytes);

const fcc = createCrystal({ prototype: "fcc", a: 5.26, species: ["Ar"] });
const cell108 = makeSupercell(fcc, { na: 3, nb: 3, nc: 3 });
const cell500 = makeSupercell(fcc, { na: 5, nb: 5, nc: 5 });

const cpuEnergy = (structure) => computeEnergyForces(structure, LJ_NOBLE_GASES);
const wasmEnergy = (structure) => kernel.energyForces(structure, LJ_NOBLE_GASES);

// Correctness gate before any timing is reported.
const reference = cpuEnergy(cell108);
const wasmReference = wasmEnergy(cell108);
const maxDeltaEv = Math.abs(reference.energy - wasmReference.energy);
const maxDeltaForce = Math.max(
  ...reference.forces.flatMap((force, index) =>
    force.map((value, axis) => Math.abs(value - wasmReference.forces[index][axis])),
  ),
);
if (maxDeltaEv > 1e-10 || maxDeltaForce > 1e-10) {
  console.error("[bench] parity check failed; refusing to publish timings", { maxDeltaEv, maxDeltaForce });
  process.exit(1);
}

const energy108 = [
  measure("energy.evaluate 108 atoms (CPU)", 40, () => cpuEnergy(cell108)),
  measure("energy.evaluate 108 atoms (WASM)", 40, () => wasmEnergy(cell108)),
];
const energy500 = [
  measure("energy.evaluate 500 atoms (CPU)", 15, () => cpuEnergy(cell500)),
  measure("energy.evaluate 500 atoms (WASM)", 15, () => wasmEnergy(cell500)),
];

const mdOptions = {
  steps: 100,
  timestep: 0.002,
  temperature: 60,
  seed: 42,
  sampleInterval: 10,
};
const md = [
  measure("md.run 108 atoms, 100 steps (CPU)", 3, () =>
    runMd(cell108, LJ_NOBLE_GASES, mdOptions),
  ),
  measure("md.run 108 atoms, 100 steps (WASM)", 3, () =>
    runMd(cell108, LJ_NOBLE_GASES, {
      ...mdOptions,
      energyKernel: wasmEnergy,
    }),
  ),
];

const relaxStart = makeSupercell(fcc, { na: 2, nb: 2, nc: 2 });
const relax = [
  measure("structure.relax 32 atoms, 200 steps (CPU)", 3, () =>
    relaxFire(relaxStart, LJ_NOBLE_GASES, { maxForceEvPerA: 0.05, maxSteps: 200 }),
  ),
  measure("structure.relax 32 atoms, 200 steps (WASM)", 3, () =>
    relaxFire(relaxStart, LJ_NOBLE_GASES, {
      maxForceEvPerA: 0.05,
      maxSteps: 200,
      energyKernel: wasmEnergy,
    }),
  ),
];

const report = {
  generated_at: new Date().toISOString(),
  commit: process.env.GIT_COMMIT ?? readCommit(),
  node: process.version,
  platform: `${platform()} ${release()} ${arch()}`,
  cpu: cpus()[0]?.model ?? "unknown",
  logical_cpus: availableParallelism(),
  memory_gb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
  workload: {
    structure: "fcc argon, a = 5.26 Å",
    model: LJ_NOBLE_GASES.id,
    cutoff: "model default, clamped by the cell",
    warmup: 3,
  },
  correctness: {
    max_delta_energy_ev: maxDeltaEv,
    max_delta_force_ev_per_a: maxDeltaForce,
    tolerance: 1e-10,
    passed: true,
  },
  timings: [...energy108, ...energy500, ...md, ...relax],
  notes: [
    "Single-threaded. Each WASM force evaluation copies buffers into linear memory; this is included in the timing.",
    "Timings are wall-clock samples from one machine and are not a general performance claim.",
  ],
};

function readCommit() {
  try {
    const head = readFileSync(join(repoRoot, ".git", "HEAD"), "utf8").trim();
    if (head.startsWith("ref: ")) {
      return readFileSync(join(repoRoot, ".git", head.slice(5)), "utf8").trim();
    }
    return head;
  } catch {
    return "unknown";
  }
}

mkdirSync(join(repoRoot, "benchmarks", "results"), { recursive: true });
writeFileSync(
  join(repoRoot, "benchmarks", "results", "latest.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

for (const entry of report.timings) {
  console.log(
    `${entry.label.padEnd(44)} median ${entry.median_ms.toFixed(2)} ms  (min ${entry.min_ms.toFixed(2)}, max ${entry.max_ms.toFixed(2)}, n=${entry.iterations})`,
  );
}
console.log(
  `parity: ΔE=${report.correctness.max_delta_energy_ev.toExponential(2)} eV, ` +
    `ΔF=${report.correctness.max_delta_force_ev_per_a.toExponential(2)} eV/Å`,
);
console.log("wrote benchmarks/results/latest.json");
