/**
 * XYZ and extended XYZ (extxyz) reader / writer.
 *
 * XYZ carries no cell. A non-periodic bounding box with vacuum padding is
 * created so the geometry routines work, and the structure is marked pbc=false.
 * extxyz `Lattice="..."` and `pbc="T T T"` are honoured when present.
 */

import type { Site, Structure } from "../types.js";
import { SCHEMA_VERSION } from "../types.js";
import type { Mat3, Vec3 } from "../linalg.js";
import { compositionOf, newStructureId, validateStructure } from "../structure.js";
import { baseSymbol } from "../elements.js";
import { parseNumeric } from "./number.js";

export interface XyzImportResult {
  structure: Structure;
  warnings: string[];
}

const VACUUM_PADDING = 10; // angstrom, only for cell-less XYZ molecules

export function readXyz(text: string, filename?: string): XyzImportResult {
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  const first = lines.find((line) => line.trim() !== "");
  if (!first) throw new Error("XYZ file is empty");
  const atomCount = parseNumeric(first.trim());
  if (!Number.isInteger(atomCount) || atomCount <= 0 || atomCount > 200_000) {
    throw new Error(`XYZ atom count '${first.trim()}' is not a positive integer`);
  }
  const startIndex = lines.indexOf(first);
  const comment = lines[startIndex + 1] ?? "";

  let lattice: Mat3 | null = null;
  let pbc: [boolean, boolean, boolean] = [false, false, false];

  const latticeMatch = /Lattice\s*=\s*"([^"]+)"/.exec(comment);
  if (latticeMatch) {
    const values = latticeMatch[1]!.trim().split(/\s+/).map(parseNumeric);
    if (values.length !== 9) throw new Error("extxyz Lattice must contain 9 numbers");
    lattice = [
      [values[0]!, values[1]!, values[2]!],
      [values[3]!, values[4]!, values[5]!],
      [values[6]!, values[7]!, values[8]!],
    ];
  }
  const pbcMatch = /pbc\s*=\s*"([^"]+)"/.exec(comment);
  if (pbcMatch) {
    const flags = pbcMatch[1]!.trim().split(/\s+/);
    const truthy = (value: string): boolean => /^(t|true|1)$/i.test(value);
    if (flags.length === 3) pbc = [truthy(flags[0]!), truthy(flags[1]!), truthy(flags[2]!)];
    else warnings.push(`extxyz pbc="${pbcMatch[1]}" is not three flags; using non-periodic.`);
  }

  const positions: Vec3[] = [];
  const species: string[] = [];
  for (let i = 0; i < atomCount; i++) {
    const line = lines[startIndex + 2 + i];
    if (line === undefined) throw new Error(`XYZ ends early: expected ${atomCount} atom lines`);
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) throw new Error(`XYZ atom line ${i + 1} is malformed`);
    const symbol = baseSymbol(parts[0]!.replace(/[^A-Za-z]/g, ""));
    if (!symbol) throw new Error(`XYZ atom line ${i + 1} has no element symbol`);
    species.push(symbol);
    positions.push([parseNumeric(parts[1]!), parseNumeric(parts[2]!), parseNumeric(parts[3]!)]);
  }

  if (!lattice) {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const p of positions) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, p[axis]!);
        max[axis] = Math.max(max[axis]!, p[axis]!);
      }
    }
    const lengths = [0, 1, 2].map((axis) =>
      Math.max(max[axis]! - min[axis]! + 2 * VACUUM_PADDING, 1),
    );
    lattice = [
      [lengths[0]!, 0, 0],
      [0, lengths[1]!, 0],
      [0, 0, lengths[2]!],
    ];
    warnings.push(
      `XYZ has no cell. Created a non-periodic ${lengths.map((l) => l.toFixed(1)).join(" x ")} Å ` +
        `bounding box with ${VACUUM_PADDING} Å padding; positions are unchanged.`,
    );
  }

  const inverse = inverseR(lattice);
  const sites: Site[] = positions.map((position, index) => ({
    species: species[index]!,
    label: `${species[index]}${index + 1}`,
    fractional_position: multiplyRow(position, inverse),
    cartesian_position: position,
    occupancy: 1,
  }));

  const structure: Structure = {
    schema_version: SCHEMA_VERSION,
    structure_id: newStructureId(),
    display_name: comment.trim() || filename?.replace(/\.xyz$/i, ""),
    length_unit: "angstrom",
    lattice: { vectors: lattice },
    pbc,
    sites,
    source: { format: "xyz", filename, notes: "Parsed XYZ/extxyz" },
    created_at: new Date().toISOString(),
  };
  const withMeta: Structure = {
    ...structure,
    composition: compositionOf(structure.sites),
    validation: validateStructure(structure),
  };
  return { structure: withMeta, warnings };
}

function inverseR(m: Mat3): Mat3 {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) throw new Error("XYZ lattice is singular");
  const inv = 1 / det;
  return [
    [(e * i - f * h) * inv, (c * h - b * i) * inv, (b * f - c * e) * inv],
    [(f * g - d * i) * inv, (a * i - c * g) * inv, (c * d - a * f) * inv],
    [(d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv],
  ];
}

function multiplyRow(v: Vec3, m: Mat3): Vec3 {
  return [
    v[0] * m[0][0] + v[1] * m[1][0] + v[2] * m[2][0],
    v[0] * m[0][1] + v[1] * m[1][1] + v[2] * m[2][1],
    v[0] * m[0][2] + v[1] * m[1][2] + v[2] * m[2][2],
  ];
}

export function writeXyz(structure: Structure, comment?: string): string {
  const m = structure.lattice.vectors;
  const latticeValue = m
    .flat()
    .map((x) => x.toFixed(10))
    .join(" ");
  const pbcValue = structure.pbc.map((p) => (p ? "T" : "F")).join(" ");
  const positions = structure.sites.map((site) => {
    const f = site.fractional_position;
    return [
      f[0] * m[0][0] + f[1] * m[1][0] + f[2] * m[2][0],
      f[0] * m[0][1] + f[1] * m[1][1] + f[2] * m[2][1],
      f[0] * m[0][2] + f[1] * m[1][2] + f[2] * m[2][2],
    ] as Vec3;
  });
  const header =
    comment ?? `Lattice="${latticeValue}" pbc="${pbcValue}" properties=species:S:1:pos:R:3`;
  const lines = [String(structure.sites.length), header];
  structure.sites.forEach((site, index) => {
    const p = positions[index]!;
    lines.push(`${site.species} ${p[0].toFixed(10)} ${p[1].toFixed(10)} ${p[2].toFixed(10)}`);
  });
  return `${lines.join("\n")}\n`;
}
