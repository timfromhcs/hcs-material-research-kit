import {
  computeEnergyForces,
  createCrystal,
  exportStructure,
  makeSupercell,
  readCif,
  relaxFire,
  runMd,
  structureHash,
  LJ_NOBLE_GASES,
  totalMassAmu,
  cellVolume,
} from "@hcs-materials/core";

const argon = (n: number, a: number) =>
  makeSupercell(createCrystal({ prototype: "fcc", a, species: ["Ar"] }), { na: n, nb: n, nc: n });

// --- CIF roundtrip
const nacl = createCrystal({ prototype: "rocksalt", a: 5.64, species: ["Na", "Cl"] });
const cif = exportStructure(nacl, "cif");
const again = readCif(cif).structure;
console.log("roundtrip hash equal:", structureHash(again) === structureHash(nacl));
console.log("hashes", structureHash(nacl), structureHash(again));
for (let i = 0; i < 3; i++) {
  console.log("lattice orig", nacl.lattice.vectors[i], "new", again.lattice.vectors[i]);
}
console.log("sites equal count", nacl.sites.length, again.sites.length);
console.log("first mismatch sites:", JSON.stringify(nacl.sites.find((s, i) => JSON.stringify(s) !== JSON.stringify(again.sites[i]))));

// --- relax
const strained = argon(3, 6.2);
const e0 = computeEnergyForces(strained, LJ_NOBLE_GASES);
console.log("strained E/atom", e0.energyPerAtom, "maxF", e0.maxForce, "cutoff", e0.cutoff, "pairs", e0.pairCount);
const relaxed = relaxFire(strained, LJ_NOBLE_GASES, { maxForceEvPerA: 0.02, maxSteps: 1500 });
console.log("relax:", { converged: relaxed.converged, steps: relaxed.steps, energy: relaxed.energy, maxForce: relaxed.maxForce, cancelled: relaxed.cancelled, history: relaxed.energyHistory.slice(0, 5) });

// --- MD drift
const cell = argon(3, 5.3);
const md = runMd(cell, LJ_NOBLE_GASES, { steps: 400, timestep: 0.002, temperature: 60, seed: 42, sampleInterval: 10 });
console.log("md totals", md.energySeries.totalEv.slice(0, 6), "...", md.energySeries.totalEv.slice(-3));
console.log("md drift/atom", md.energyDriftEvPerAtom, "rel", md.relativeEnergyDrift, "T", md.meanTemperatureK);
console.log("mass", totalMassAmu(cell), "volume", cellVolume(cell));
