import {
  runMd,
  computeEnergyForces,
  LJ_NOBLE_GASES,
  createCrystal,
  structureHash,
  makeSupercell,
} from "@hcs-materials/core";

// Two argon atoms in a big cell, displaced so forces are non-zero.
const base = createCrystal({ prototype: "sc", a: 12, species: ["Ar"] });
const two = {
  ...base,
  sites: [
    { species: "Ar", label: "Ar1", fractional_position: [0.5, 0.5, 0.5] as [number, number, number], occupancy: 1 },
    { species: "Ar", label: "Ar2", fractional_position: [0.5 + 3.6 / 12, 0.5, 0.5] as [number, number, number], occupancy: 1 },
  ],
};
console.log("two-atom E", computeEnergyForces(two, LJ_NOBLE_GASES).energy, "F", computeEnergyForces(two, LJ_NOBLE_GASES).forces);

for (const dt of [0.002, 0.001, 0.0005, 0.00025]) {
  const md = runMd(two, LJ_NOBLE_GASES, { steps: 200, timestep: dt, temperature: 60, seed: 1, sampleInterval: 20 });
  console.log("two-atom dt", dt, "drift/atom", md.energyDriftEvPerAtom.toExponential(3), "T", md.meanTemperatureK.toFixed(1), "PE", md.initialPotentialEv.toExponential(4), "->", md.finalPotentialEv.toExponential(4));
}

const big = makeSupercell(createCrystal({ prototype: "fcc", a: 5.26, species: ["Ar"] }), { na: 3, nb: 3, nc: 3 });
for (const dt of [0.002, 0.001, 0.0005]) {
  const md = runMd(big, LJ_NOBLE_GASES, { steps: 200, timestep: dt, temperature: 60, seed: 42, sampleInterval: 20 });
  console.log("fcc dt", dt, "drift/atom", md.energyDriftEvPerAtom.toExponential(3), "T", md.meanTemperatureK.toFixed(1));
}
console.log("hash before", structureHash(big));
