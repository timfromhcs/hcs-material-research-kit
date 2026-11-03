/**
 * VASP POSCAR / CONTCAR reader and writer.
 *
 * Supports: scale factor as single number, three numbers, or negative volume;
 * VASP 4 (no species line) and VASP 5 (species line); selective dynamics;
 * Direct/Cartesian coordinates.
 *
 * Limitation: VASP 4 files carry no element names. The reader assigns
 * "X1", "X2", ... pseudo-species and returns a warning; it never guesses
 * elements from counts.
 */

import type { Site, Structure } from "../types.js";
import { SCHEMA_VERSION } from "../types.js";
import type { Mat3, Vec3 } from "../linalg.js";
import { compositionOf, newStructureId, validateStructure } from "../structure.js";
import { parseNumeric } from "./number.js";

export interface PoscarImportResult {
  structure: Structure;
  warnings: string[];
}

export function readPoscar(text: string, filename?: string): PoscarImportResult {
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  if (lines.length < 8) throw new Error("POSCAR is too short to be valid");

  const comment = lines[0]!.trim();
  const scaleLine = lines[1]!.trim().split(/\s+/).map(parseNumeric);
  const rawLattice: Mat3 = [
    lines[2]!.trim().split(/\s+/).slice(0, 3).map(parseNumeric) as Vec3,
    lines[3]!.trim().split(/\s+/).slice(0, 3).map(parseNumeric) as Vec3,
    lines[4]!.trim().split(/\s+/).slice(0, 3).map(parseNumeric) as Vec3,
  ];

  if (scaleLine.length === 1) {
    const s = scaleLine[0]!;
    if (s === 0) throw new Error("POSCAR scale factor must not be zero");
    if (s < 0) {
      const targetVolume = Math.abs(s);
      const det = Math.abs(
        rawLattice[0]![0]! *
          (rawLattice[1]![1]! * rawLattice[2]![2]! - rawLattice[1]![2]! * rawLattice[2]![1]!) -
          rawLattice[0]![1]! *
            (rawLattice[1]![0]! * rawLattice[2]![2]! - rawLattice[1]![2]! * rawLattice[2]![0]!) +
          rawLattice[0]![2]! *
            (rawLattice[1]![0]! * rawLattice[2]![1]! - rawLattice[1]![1]! * rawLattice[2]![0]!),
      );
      if (det < 1e-12) throw new Error("POSCAR lattice is degenerate");
      const factor = Math.cbrt(targetVolume / det);
      for (const row of rawLattice) {
        row[0] *= factor;
        row[1] *= factor;
        row[2] *= factor;
      }
    } else {
      for (const row of rawLattice) {
        row[0] *= s;
        row[1] *= s;
        row[2] *= s;
      }
    }
  } else if (scaleLine.length === 3) {
    for (let i = 0; i < 3; i++) {
      const s = scaleLine[i]!;
      for (let j = 0; j < 3; j++) rawLattice[i]![j] = rawLattice[i]![j]! * s;
    }
  } else {
    throw new Error("POSCAR line 2 must contain one or three scale factors");
  }

  const line5 = lines[5]!.trim();
  const isCounts = /^[\d\s]+$/.test(line5);
  let speciesNames: string[] | null = null;
  let countLineIndex = 5;
  if (!isCounts) {
    speciesNames = line5.split(/\s+/).filter(Boolean);
    countLineIndex = 6;
  }
  const counts = lines[countLineIndex]!.trim().split(/\s+/).map((value) => {
    const count = parseNumeric(value);
    if (!Number.isInteger(count) || count < 0) throw new Error(`Invalid POSCAR atom count '${value}'`);
    return count;
  });
  if (speciesNames && speciesNames.length !== counts.length) {
    throw new Error(
      `POSCAR species line has ${speciesNames.length} names but ${counts.length} counts`,
    );
  }
  if (!speciesNames) {
    speciesNames = counts.map((_, index) => `X${index + 1}`);
    warnings.push(
      "POSCAR has no species line (VASP 4). Elements were named X1, X2, ... " +
        "Assign real species explicitly before any simulation; they were not guessed.",
    );
  }

  let cursor = countLineIndex + 1;
  let selective = false;
  if (/^s/i.test(lines[cursor]?.trim() ?? "")) {
    selective = true;
    cursor++;
  }
  const mode = (lines[cursor]?.trim() ?? "").toLowerCase();
  const direct = mode.startsWith("d");
  const cartesian = mode.startsWith("c") || mode.startsWith("k");
  if (!direct && !cartesian) {
    throw new Error("POSCAR coordinate mode must start with D (direct) or C/K (cartesian)");
  }
  cursor++;

  const totalAtoms = counts.reduce((a, b) => a + b, 0);
  const speciesPerAtom: string[] = [];
  counts.forEach((count, index) => {
    for (let i = 0; i < count; i++) speciesPerAtom.push(speciesNames![index]!);
  });

  const inverseRows = inverseR(rawLattice);
  const sites: Site[] = [];
  for (let i = 0; i < totalAtoms; i++) {
    const line = lines[cursor + i];
    if (line === undefined) throw new Error(`POSCAR ends early: expected ${totalAtoms} atom lines`);
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) throw new Error(`POSCAR atom line ${i + 1} is malformed`);
    const coords: Vec3 = [parseNumeric(parts[0]!), parseNumeric(parts[1]!), parseNumeric(parts[2]!)];
    let fractional: Vec3;
    if (direct) {
      fractional = coords;
    } else {
      const cart: Vec3 = [
        coords[0] * scaleLine[0]!,
        coords[1] * scaleLine[0]!,
        coords[2] * scaleLine[0]!,
      ];
      fractional = multiplyRow(cart, inverseRows);
    }
    const mobility = selective && parts.length >= 6
      ? [parts[3]!.toLowerCase().startsWith("t"), parts[4]!.toLowerCase().startsWith("t"), parts[5]!.toLowerCase().startsWith("t")]
      : undefined;
    sites.push({
      species: speciesPerAtom[i]!,
      label: `${speciesPerAtom[i]}${i + 1}`,
      fractional_position: fractional,
      occupancy: 1,
      ...(mobility ? { mobility } : {}),
    });
  }

  const structure: Structure = {
    schema_version: SCHEMA_VERSION,
    structure_id: newStructureId(),
    display_name: comment || filename?.replace(/\.(vasp|poscar|contcar)$/i, ""),
    length_unit: "angstrom",
    lattice: { vectors: rawLattice },
    pbc: [true, true, true],
    sites,
    source: { format: "poscar", filename, notes: "Parsed POSCAR/CONTCAR" },
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
  if (Math.abs(det) < 1e-12) throw new Error("POSCAR lattice is singular");
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

export function writePoscar(structure: Structure, options: { selective?: boolean } = {}): string {
  if (structure.length_unit !== "angstrom") {
    throw new Error("POSCAR export requires angstrom; convert the structure first");
  }
  const symbols: string[] = [];
  const groups = new Map<string, Site[]>();
  for (const site of structure.sites) {
    if (!groups.has(site.species)) {
      groups.set(site.species, []);
      symbols.push(site.species);
    }
    groups.get(site.species)!.push(site);
  }
  const counts = symbols.map((symbol) => groups.get(symbol)!.length);
  const lines: string[] = [];
  lines.push(structure.display_name ?? structure.structure_id);
  lines.push("1.0");
  for (const row of structure.lattice.vectors) {
    lines.push(row.map((x) => x.toFixed(12)).join(" "));
  }
  lines.push(symbols.join(" "));
  lines.push(counts.join(" "));
  if (options.selective) {
    lines.push("Selective dynamics");
  }
  lines.push("Direct");
  for (const symbol of symbols) {
    for (const site of groups.get(symbol)!) {
      const f = site.fractional_position;
      const mobility = options.selective
        ? ` ${site.mobility?.[0] === false ? "F" : "T"} ${site.mobility?.[1] === false ? "F" : "T"} ${site.mobility?.[2] === false ? "F" : "T"}`
        : "";
      lines.push(`${f[0].toFixed(12)} ${f[1].toFixed(12)} ${f[2].toFixed(12)}${mobility}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
