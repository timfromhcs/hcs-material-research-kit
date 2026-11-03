import type { Site, Structure } from "./types.js";
import { SCHEMA_VERSION } from "./types.js";
import type { Mat3, Vec3 } from "./linalg.js";
import { det3 } from "./linalg.js";
import { baseSymbol } from "./elements.js";
import { compositionOf, newStructureId, validateStructure, wrapFractional } from "./structure.js";

export type CrystalPrototype =
  | "sc"
  | "bcc"
  | "fcc"
  | "hcp"
  | "diamond"
  | "rocksalt"
  | "cesiumchloride"
  | "perovskite"
  | "wurtzite";

export interface CrystalRequest {
  prototype: CrystalPrototype;
  /** Conventional lattice parameter a in angstrom. */
  a: number;
  /** c/a ratio helper: c in angstrom (hcp, wurtzite). */
  c?: number;
  /** Species placeholders, e.g. ["Na", "Cl"] or ["Sr", "Ti", "O"]. */
  species: string[];
  /** Internal parameter u for wurtzite (default 0.375). */
  u?: number;
  displayName?: string;
}

interface PrototypeDefinition {
  /** Human description of the conventional cell used here. */
  readonly description: string;
  readonly speciesCount: number;
  readonly needsC: boolean;
  readonly lattice: (request: Required<Pick<CrystalRequest, "a" | "c" | "u">>) => Mat3;
  readonly basis: (species: string[], u: number) => Array<{ species: string; f: Vec3 }>;
}

const cubic = (a: number): Mat3 => [
  [a, 0, 0],
  [0, a, 0],
  [0, 0, a],
];

const FCC_BASIS: Vec3[] = [
  [0, 0, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
  [0.5, 0.5, 0],
];

const PROTOTYPES: Record<CrystalPrototype, PrototypeDefinition> = {
  sc: {
    description: "Simple cubic, 1 atom per conventional cell.",
    speciesCount: 1,
    needsC: false,
    lattice: ({ a }) => cubic(a),
    basis: ([xs]) => [{ species: xs!, f: [0, 0, 0] }],
  },
  bcc: {
    description: "Body-centred cubic, 2 atoms per conventional cell.",
    speciesCount: 1,
    needsC: false,
    lattice: ({ a }) => cubic(a),
    basis: ([xs]) => [
      { species: xs!, f: [0, 0, 0] },
      { species: xs!, f: [0.5, 0.5, 0.5] },
    ],
  },
  fcc: {
    description: "Face-centred cubic, 4 atoms per conventional cell.",
    speciesCount: 1,
    needsC: false,
    lattice: ({ a }) => cubic(a),
    basis: ([xs]) => FCC_BASIS.map((f) => ({ species: xs!, f })),
  },
  hcp: {
    description:
      "Hexagonal close packed, 2 atoms per hexagonal cell; ideal c/a = sqrt(8/3) unless specified.",
    speciesCount: 1,
    needsC: true,
    lattice: ({ a, c }) => [
      [a, 0, 0],
      [-a / 2, (a * Math.sqrt(3)) / 2, 0],
      [0, 0, c],
    ],
    basis: ([xs]) => [
      { species: xs!, f: [1 / 3, 2 / 3, 0.25] },
      { species: xs!, f: [2 / 3, 1 / 3, 0.75] },
    ],
  },
  diamond: {
    description:
      "Diamond cubic (fcc plus two-atom basis), 8 atoms per conventional cell. a for Si is 5.431 Å.",
    speciesCount: 1,
    needsC: false,
    lattice: ({ a }) => cubic(a),
    basis: ([xs]) => [
      ...FCC_BASIS.map((f) => ({ species: xs!, f })),
      ...FCC_BASIS.map((f) => ({
        species: xs!,
        f: [f[0] + 0.25, f[1] + 0.25, f[2] + 0.25] as Vec3,
      })),
    ],
  },
  rocksalt: {
    description:
      "Rock-salt (NaCl-type), 8 atoms per conventional cell: two interpenetrating fcc lattices.",
    speciesCount: 2,
    needsC: false,
    lattice: ({ a }) => cubic(a),
    basis: ([anion, cation]) => [
      ...FCC_BASIS.map((f) => ({ species: anion!, f })),
      ...FCC_BASIS.map((f) => ({ species: cation!, f: [f[0] + 0.5, f[1], f[2]] as Vec3 })),
    ],
  },
  cesiumchloride: {
    description: "Caesium-chloride type, 2 atoms per conventional cell (simple cubic lattice).",
    speciesCount: 2,
    needsC: false,
    lattice: ({ a }) => cubic(a),
    basis: ([anion, cation]) => [
      { species: anion!, f: [0, 0, 0] },
      { species: cation!, f: [0.5, 0.5, 0.5] },
    ],
  },
  perovskite: {
    description:
      "Cubic ABO3 perovskite: A at corners, B at body centre, O at face centres (5 atoms).",
    speciesCount: 3,
    needsC: false,
    lattice: ({ a }) => cubic(a),
    basis: ([aSpecies, bSpecies, oSpecies]) => [
      { species: aSpecies!, f: [0, 0, 0] },
      { species: bSpecies!, f: [0.5, 0.5, 0.5] },
      { species: oSpecies!, f: [0.5, 0.5, 0] },
      { species: oSpecies!, f: [0.5, 0, 0.5] },
      { species: oSpecies!, f: [0, 0.5, 0.5] },
    ],
  },
  wurtzite: {
    description:
      "Wurtzite (ZnS-type), 4 atoms per hexagonal cell with internal parameter u (default 0.375).",
    speciesCount: 2,
    needsC: true,
    lattice: ({ a, c }) => [
      [a, 0, 0],
      [-a / 2, (a * Math.sqrt(3)) / 2, 0],
      [0, 0, c],
    ],
    basis: ([anion, cation], u) => [
      { species: anion!, f: [1 / 3, 2 / 3, 0] },
      { species: anion!, f: [2 / 3, 1 / 3, 0.5] },
      { species: cation!, f: [1 / 3, 2 / 3, u] },
      { species: cation!, f: [2 / 3, 1 / 3, u + 0.5] },
    ],
  },
};

export function prototypeInfo(prototype: CrystalPrototype): {
  description: string;
  speciesCount: number;
  needsC: boolean;
  defaultCA: number | null;
} {
  const def = PROTOTYPES[prototype];
  return {
    description: def.description,
    speciesCount: def.speciesCount,
    needsC: def.needsC,
    defaultCA: def.needsC ? Math.sqrt(8 / 3) : null,
  };
}

export function createCrystal(request: CrystalRequest): Structure {
  const def = PROTOTYPES[request.prototype];
  if (!def) throw new Error(`Unknown crystal prototype '${request.prototype}'`);
  if (!(request.a > 0)) throw new Error("Lattice parameter a must be positive");
  if (request.species.length < def.speciesCount) {
    throw new Error(
      `Prototype '${request.prototype}' needs ${def.speciesCount} species, got ${request.species.length}`,
    );
  }
  const c = request.c ?? request.a * Math.sqrt(8 / 3);
  if (def.needsC && !(c > 0)) throw new Error("Lattice parameter c must be positive");
  const u = request.u ?? 0.375;

  const vectors = def.lattice({ a: request.a, c, u });
  if (!(Math.abs(det3(vectors)) > 1e-8)) {
    throw new Error("Generated lattice is degenerate; check a and c");
  }

  const sites: Site[] = def.basis(request.species, u).map((entry, index) => ({
    species: baseSymbol(entry.species),
    label: `${baseSymbol(entry.species)}${index + 1}`,
    fractional_position: entry.f as Vec3,
    occupancy: 1,
  }));

  const structure: Structure = {
    schema_version: SCHEMA_VERSION,
    structure_id: newStructureId(),
    display_name: request.displayName ?? `${request.species.join("")} (${request.prototype})`,
    length_unit: "angstrom",
    lattice: { vectors },
    pbc: [true, true, true],
    sites,
    source: { format: "generated", notes: `Prototype ${request.prototype}` },
    created_at: new Date().toISOString(),
  };
  const withMeta: Structure = {
    ...structure,
    composition: compositionOf(structure.sites),
    validation: validateStructure(structure),
  };
  // Equivalent periodic images must not change the structure identity.
  return wrapFractional(withMeta);
}

export interface SupercellRequest {
  na: number;
  nb: number;
  nc: number;
}

/** Repeats the cell na x nb x nc, keeping fractional coordinates in [0,1). */
export function makeSupercell(structure: Structure, request: SupercellRequest): Structure {
  const { na, nb, nc } = request;
  for (const [label, value] of [
    ["na", na],
    ["nb", nb],
    ["nc", nc],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 20) {
      throw new Error(
        `Supercell repetition ${label} must be an integer between 1 and 20, got ${value}`,
      );
    }
  }
  const total = na * nb * nc * structure.sites.length;
  if (total > 20_000) {
    throw new Error(
      `Supercell would contain ${total} atoms; the current O(N²) reference kernels support at most 20000.`,
    );
  }
  const m = structure.lattice.vectors;
  const vectors: Mat3 = [
    [m[0][0] * na, m[0][1] * na, m[0][2] * na],
    [m[1][0] * nb, m[1][1] * nb, m[1][2] * nb],
    [m[2][0] * nc, m[2][1] * nc, m[2][2] * nc],
  ];
  const sites: Site[] = [];
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nb; j++) {
      for (let k = 0; k < nc; k++) {
        for (const site of structure.sites) {
          const f = site.fractional_position;
          const position: Vec3 = [(f[0] + i) / na, (f[1] + j) / nb, (f[2] + k) / nc];
          sites.push({
            ...site,
            label: `${site.label ?? site.species}_${i}${j}${k}`,
            fractional_position: position,
            cartesian_position: undefined,
          });
        }
      }
    }
  }
  const next = wrapFractional({
    ...structure,
    structure_id: newStructureId(),
    display_name: `${structure.display_name ?? structure.structure_id} ${na}x${nb}x${nc}`,
    lattice: { vectors },
    sites,
    source: {
      format: "generated",
      notes: `Supercell ${na}x${nb}x${nc} of ${structure.structure_id}`,
    },
    updated_at: new Date().toISOString(),
  });
  return { ...next, composition: compositionOf(next.sites), validation: validateStructure(next) };
}

export function substituteSpecies(
  structure: Structure,
  indices: number[],
  species: string,
): Structure {
  if (indices.length === 0) throw new Error("No sites selected for substitution");
  const target = baseSymbol(species);
  const set = new Set(indices);
  for (const index of set) {
    if (index < 0 || index >= structure.sites.length)
      throw new Error(`Site index ${index} out of range`);
  }
  const sites = structure.sites.map((site, index) =>
    set.has(index)
      ? { ...site, species: target, label: `${target}${index + 1}`, charge: undefined }
      : site,
  );
  return withDerived(structure, sites, `Substitute ${set.size} site(s) with ${target}`);
}

export function createVacancy(structure: Structure, indices: number[]): Structure {
  const set = new Set(indices);
  if (set.size === 0) throw new Error("No sites selected for vacancy creation");
  if (set.size >= structure.sites.length) {
    throw new Error("Cannot remove every atom; a structure needs at least one site");
  }
  const sites = structure.sites.filter((_, index) => !set.has(index));
  return withDerived(structure, sites, `Removed ${set.size} site(s)`);
}

export function addAtom(structure: Structure, species: string, fractional: Vec3): Structure {
  if (fractional.some((x) => !Number.isFinite(x))) {
    throw new Error("Fractional coordinates must be finite numbers");
  }
  const symbol = baseSymbol(species);
  const sites = [
    ...structure.sites,
    {
      species: symbol,
      label: `${symbol}${structure.sites.length + 1}`,
      fractional_position: fractional,
      occupancy: 1,
    } satisfies Site,
  ];
  return withDerived(structure, sites, `Added ${symbol}`);
}

export function setSitePosition(structure: Structure, index: number, fractional: Vec3): Structure {
  const site = structure.sites[index];
  if (!site) throw new Error(`Site index ${index} out of range`);
  const sites = structure.sites.map((current, i) =>
    i === index
      ? { ...current, fractional_position: fractional as Vec3, cartesian_position: undefined }
      : current,
  );
  return withDerived(structure, sites, `Moved site ${index}`);
}

function withDerived(structure: Structure, sites: Site[], note: string): Structure {
  const next = wrapFractional({
    ...structure,
    structure_id: newStructureId(),
    sites,
    source: { format: "generated", notes: note },
    updated_at: new Date().toISOString(),
  });
  return { ...next, composition: compositionOf(next.sites), validation: validateStructure(next) };
}
