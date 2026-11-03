import {
  computeEnergyForces,
  createCrystal,
  makeSupercell,
  runMd,
  LJ_NOBLE_GASES,
  accelerationFromForce,
  initialVelocities,
} from "@hcs-materials/core";

const argon = makeSupercell(createCrystal({ prototype: "fcc", a: 5.3, species: ["Ar"] }), {
  na: 3,
  nb: 3,
  nc: 3,
});

const e = computeEnergyForces(argon, LJ_NOBLE_GASES);
console.log("E/atom", e.energyPerAtom, "maxF", e.maxForce, "cutoff", e.cutoff, "pairs", e.pairCount);

const v0 = initialVelocities(argon, 60, 42);
console.log("KE0", v0.kineticEv, "expected", 1.5 * 8.617333262e-5 * 60 * argon.sites.length);
console.log("first velocity", v0.velocities[0], "accel test", accelerationFromForce(0.01, 39.948));

const md = runMd(argon, LJ_NOBLE_GASES, { steps: 200, timestep: 0.002, temperature: 60, seed: 42, sampleInterval: 10 });
console.log("KE", md.energySeries.kineticEv.slice(0, 8).map((x) => x.toFixed(4)).join(" "));
console.log("PE", md.energySeries.potentialEv.slice(0, 8).map((x) => x.toFixed(4)).join(" "));
console.log("ET", md.energySeries.totalEv.slice(0, 8).map((x) => x.toFixed(4)).join(" "));
console.log("T ", md.temperatureSeries.temperatureK.slice(0, 8).map((x) => x.toFixed(1)).join(" "));
console.log("drift/atom", md.energyDriftEvPerAtom);
