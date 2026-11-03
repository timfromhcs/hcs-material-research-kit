import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cellVolume,
  createCrystal,
  detectFormat,
  exportStructure,
  importStructure,
  readCif,
  readPoscar,
  structureHash,
  validateStructure,
} from "@hcs-materials/core";
import { validate } from "@hcs-materials/contracts";

const fixtures = join(__dirname, "..", "..", "..", "tests", "fixtures", "structures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

describe("format detection", () => {
  it("detects CIF, POSCAR, XYZ and JSON from content", () => {
    expect(detectFormat(read("silicon.cif"))).toBe("cif");
    expect(detectFormat(read("nacl.poscar"))).toBe("poscar");
    expect(detectFormat(read("water.xyz"))).toBe("xyz");
    const json = JSON.stringify(createCrystal({ prototype: "sc", a: 3, species: ["Cu"] }));
    expect(detectFormat(json)).toBe("hcs-json");
  });

  it("prefers the filename extension for ambiguous content", () => {
    expect(detectFormat("1\ncomment\nC 0 0 0", "molecule.xyz")).toBe("xyz");
  });
});

describe("CIF", () => {
  it("reads the diamond silicon conventional cell", () => {
    const { structure, warnings } = readCif(read("silicon.cif"), "silicon.cif");
    expect(structure.sites).toHaveLength(8);
    expect(cellVolume(structure)).toBeCloseTo(5.431 ** 3, 5);
    expect(structure.sites.every((s) => s.species === "Si")).toBe(true);
    // The file names a space group but provides no operations; that must be
    // reported rather than silently assumed to be complete.
    expect(warnings.join(" ")).toMatch(/no symmetry operations/i);
    expect(validate("structure", structure)).toEqual([]);
  });

  it("expands explicit symmetry operations without duplicating atoms", () => {
    const result = readCif(read("inversion.cif"), "inversion.cif");
    expect(result.symmetryOperationsApplied).toBe(2);
    expect(result.structure.sites).toHaveLength(4); // Na + its image, Cl + its image
    expect(result.structure.sites.filter((s) => s.species === "Na")).toHaveLength(2);
    expect(result.structure.sites.filter((s) => s.species === "Cl")).toHaveLength(2);
    // The inversion image of 0.25 must be 0.75, not -0.25.
    const fractions = result.structure.sites
      .filter((s) => s.species === "Na")
      .map((s) => s.fractional_position[0])
      .sort();
    expect(fractions).toEqual([0.25, 0.75]);
  });

  it("warns instead of silently expanding a space-group symbol", () => {
    const cif = read("silicon.cif").replace(/F d -3 m/, "F m -3 m");
    const result = readCif(cif, "no-symops.cif");
    expect(result.warnings.join(" ")).toMatch(/no symmetry operations/i);
  });

  it("strips estimated standard deviations from cell parameters", () => {
    const cif = read("silicon.cif").replace("_cell_length_a 5.431", "_cell_length_a 5.431(2)");
    const result = readCif(cif);
    expect(cellVolume(result.structure)).toBeCloseTo(5.431 ** 3, 4);
  });

  it("throws on a CIF without cell parameters", () => {
    expect(() => readCif("data_x\nloop_\n_atom_site_fract_x\n0\n")).toThrow(/cell_length/i);
  });

  it("round-trips through the CIF writer", () => {
    const original = createCrystal({ prototype: "rocksalt", a: 5.64, species: ["Na", "Cl"] });
    const again = readCif(exportStructure(original, "cif")).structure;
    expect(structureHash(again)).toBe(structureHash(original));
  });
});

describe("POSCAR", () => {
  it("reads species, counts and direct coordinates", () => {
    const { structure, warnings } = readPoscar(read("nacl.poscar"), "nacl.poscar");
    expect(structure.sites).toHaveLength(8);
    expect(warnings).toHaveLength(0);
    expect([...new Set(structure.sites.map((s) => s.species))].sort()).toEqual(["Cl", "Na"]);
  });

  it("round-trips structures through the writer", () => {
    const original = createCrystal({ prototype: "perovskite", a: 3.905, species: ["Sr", "Ti", "O"] });
    const again = readPoscar(exportStructure(original, "poscar")).structure;
    expect(structureHash(again)).toBe(structureHash(original));
  });

  it("honours a negative scale factor as a target volume", () => {
    const poscar = `volume scaled
-1000.0
1.0 0.0 0.0
0.0 1.0 0.0
0.0 0.0 1.0
Cu
1
Direct
0.0 0.0 0.0
`;
    const { structure } = readPoscar(poscar);
    expect(cellVolume(structure)).toBeCloseTo(1000, 6);
  });

  it("warns instead of guessing elements for VASP 4 files", () => {
    const poscar = `vasp4
1.0
3.0 0.0 0.0
0.0 3.0 0.0
0.0 0.0 3.0
1
Direct
0.0 0.0 0.0
`;
    const { structure, warnings } = readPoscar(poscar);
    expect(structure.sites[0]?.species).toBe("X1");
    expect(warnings.join(" ")).toMatch(/no species line/i);
    expect(validateStructure(structure).status).toBe("warning");
  });

  it("rejects a coordinate mode that is neither Direct nor Cartesian", () => {
    const poscar = read("nacl.poscar").replace("Direct", "Fractional");
    expect(() => readPoscar(poscar)).toThrow(/coordinate mode/i);
  });
});

describe("XYZ", () => {
  it("reads a non-periodic molecule and creates a padded box", () => {
    const { structure, warnings } = readXyzFixture("water.xyz");
    expect(structure.sites).toHaveLength(3);
    expect(structure.pbc).toEqual([false, false, false]);
    expect(warnings.join(" ")).toMatch(/no cell/i);
    // O-H distance in the fixture is 0.9572 Å
    const o = structure.sites[0]!.fractional_position;
    const h = structure.sites[1]!.fractional_position;
    const m = structure.lattice.vectors;
    const dx = (h[0] - o[0]) * m[0][0] + (h[1] - o[1]) * m[1][0] + (h[2] - o[2]) * m[2][0];
    const dy = (h[0] - o[0]) * m[0][1] + (h[1] - o[1]) * m[1][1] + (h[2] - o[2]) * m[2][1];
    const dz = (h[0] - o[0]) * m[0][2] + (h[1] - o[1]) * m[1][2] + (h[2] - o[2]) * m[2][2];
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(0.9572, 3);    expect(validate("structure", structure)).toEqual([]);
  });

  it("honours an extxyz Lattice and pbc flags", () => {
    const result = importStructure(read("nacl_ext.xyz"), "nacl_ext.xyz");
    expect(result.format).toBe("xyz");
    expect(result.structure.pbc).toEqual([true, true, true]);
    expect(cellVolume(result.structure)).toBeCloseTo(64, 6);
    expect(result.structure.sites).toHaveLength(4);
  });

  it("round-trips through the extxyz writer", () => {
    const original = createCrystal({ prototype: "bcc", a: 2.866, species: ["Fe"] });
    const text = exportStructure(original, "xyz");
    const again = importStructure(text, "roundtrip.xyz").structure;
    expect(again.sites).toHaveLength(2);
    expect(again.pbc).toEqual([true, true, true]);
    expect(cellVolume(again)).toBeCloseTo(cellVolume(original), 6);
  });

  it("rejects a truncated file", () => {
    expect(() => importStructure("5\ncomment\nC 0 0 0\n", "bad.xyz")).toThrow(/ends early|malformed/i);
  });
});

function readXyzFixture(name: string) {
  const result = importStructure(read(name), name);
  return { structure: result.structure, warnings: result.warnings };
}
