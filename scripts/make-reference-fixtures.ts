/**
 * Generates the cross-implementation reference fixture consumed by
 * crates/compute-core. The TypeScript implementation is the reference; the
 * Rust kernel must reproduce its energy and forces within 1e-10 eV.
 *
 * Run: npx tsx scripts/make-reference-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  cellVolume,
  computeEnergyForces,
  createCrystal,
  densityGPerCm3,
  LJ_NOBLE_GASES,
  makeRng,
  makeSupercell,
  structureHash,
  totalMassAmu,
} from "@hcs-materials/core";

const base = makeSupercell(createCrystal({ prototype: "fcc", a: 5.26, species: ["Ar"] }), {
  na: 2,
  nb: 2,
  nc: 2,
});

const rng = makeRng(2026);
const structure = {
  ...base,
  sites: base.sites.map((site) => ({
    ...site,
    fractional_position: site.fractional_position.map(
      (x) => x + (rng() - 0.5) * 0.04,
    ) as [number, number, number],
  })),
};

const cutoff = 7.0;
const evaluated = computeEnergyForces(structure, LJ_NOBLE_GASES, { cutoff });

const fixture = {
  _comment:
    "Reference output of the TypeScript reference engine (@hcs-materials/core 0.1.0). " +
    "The Rust CPU parity test must match it within 1e-10 eV and 1e-10 eV/A.",
  model: {
    id: LJ_NOBLE_GASES.id,
    cutoff,
    switch_on_fraction: 0.9,
    epsilon_ev: LJ_NOBLE_GASES.species.Ar.epsilon,
    sigma_angstrom: LJ_NOBLE_GASES.species.Ar.sigma,
    mixing_rule: "lorentz-berthelot",
  },
  structure: {
    lattice: structure.lattice.vectors,
    pbc: structure.pbc,
    sites: structure.sites.map((site) => ({
      species: site.species,
      fractional_position: site.fractional_position,
    })),
  },
  expected: {
    energy_ev: evaluated.energy,
    energy_per_atom_ev: evaluated.energyPerAtom,
    max_force_ev_per_angstrom: evaluated.maxForce,
    pair_count: evaluated.pairCount,
    cutoff_used: evaluated.cutoff,
    forces: evaluated.forces,
  },
};

mkdirSync("tests/fixtures/reference", { recursive: true });
writeFileSync("tests/fixtures/reference/lj-argon-32.json", `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  `wrote tests/fixtures/reference/lj-argon-32.json: E=${evaluated.energy.toFixed(9)} eV, Fmax=${evaluated.maxForce.toFixed(9)} eV/A, pairs=${evaluated.pairCount}`,
);

// --- Cross-language identity fixture ---------------------------------------
// The identity fixture must be byte-stable: ids and timestamps are pinned so a
// regeneration in CI cannot produce a spurious diff.
const rocksalt = {
  ...createCrystal({ prototype: "rocksalt", a: 5.64, species: ["Na", "Cl"] }),
  structure_id: "struct_reference_nacl",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};
const identity = {
  _comment:
    "Canonical structure identity produced by @hcs-materials/core. The Python package " +
    "must reproduce structure_hash, formula, volume and density exactly/in tolerance.",
  structure: JSON.parse(JSON.stringify(rocksalt)),
  expected: {
    structure_hash: structureHash(rocksalt),
    reduced_formula: rocksalt.composition?.reduced_formula,
    total_atoms: rocksalt.composition?.total_atoms,
    cell_volume_angstrom3: cellVolume(rocksalt),
    density_g_per_cm3: densityGPerCm3(totalMassAmu(rocksalt), cellVolume(rocksalt)),
  },
};
writeFileSync("tests/fixtures/reference/structure-identity.json", `${JSON.stringify(identity, null, 2)}\n`);
console.log(`wrote tests/fixtures/reference/structure-identity.json: ${identity.expected.structure_hash}`);
