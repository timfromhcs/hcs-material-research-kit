/**
 * CIF reader for the crystallographic subset needed by HCS:
 * cell parameters, atom-site loop, and explicit symmetry operations.
 *
 * Deliberately not a full CIF implementation. It does not expand
 * space-group *symbols* (that requires full space-group tables); CIFs that only
 * give `_symmetry_space_group_name_H-M` without symop loops are read as P1 and
 * flagged. Always validate imported structures before simulation.
 */

import type { Site, Structure } from "../types.js";
import { SCHEMA_VERSION } from "../types.js";
import type { Mat3, Vec3 } from "../linalg.js";
import { compositionOf, newStructureId, validateStructure } from "../structure.js";
import { baseSymbol } from "../elements.js";
import { parseNumeric } from "./number.js";

interface LoopBlock {
  headers: string[];
  rows: string[][];
}

interface CifParseResult {
  tags: Record<string, string>;
  loops: LoopBlock[];
}

function stripComments(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith(";")) return line; // multiline field handled separately
      const index = findUnquoted(line, "#");
      return index >= 0 ? line.slice(0, index) : line;
    })
    .join("\n");
}

function findUnquoted(line: string, char: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'") inSingle = !inSingle;
    else if (c === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && c === char) return i;
  }
  return -1;
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith(";")) {
      // Multiline text field terminated by a line starting with ';'
      const parts: string[] = [line.slice(1)];
      i++;
      while (i < lines.length && !lines[i]!.startsWith(";")) {
        parts.push(lines[i]!);
        i++;
      }
      tokens.push(parts.join("\n"));
      continue;
    }
    let index = 0;
    while (index < line.length) {
      while (index < line.length && /\s/.test(line[index]!)) index++;
      if (index >= line.length) break;
      const c = line[index]!;
      if (c === "'" || c === '"') {
        const quote = c;
        let value = "";
        index++;
        while (index < line.length && line[index] !== quote) {
          value += line[index];
          index++;
        }
        index++;
        tokens.push(value);
      } else {
        let value = "";
        while (index < line.length && !/\s/.test(line[index]!)) {
          value += line[index];
          index++;
        }
        tokens.push(value);
      }
    }
  }
  return tokens;
}

function parseCif(text: string): CifParseResult {
  const tokens = tokenize(stripComments(text));
  const tags: Record<string, string> = {};
  const loops: LoopBlock[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    const lower = token.toLowerCase();
    if (lower.startsWith("data_") || lower === "stop_") {
      index++;
      continue;
    }
    if (lower === "loop_") {
      index++;
      const headers: string[] = [];
      while (index < tokens.length && tokens[index]!.startsWith("_")) {
        headers.push(tokens[index]!.toLowerCase());
        index++;
      }
      const values: string[] = [];
      while (index < tokens.length) {
        const value = tokens[index]!;
        const vLower = value.toLowerCase();
        if (vLower.startsWith("_") || vLower === "loop_" || vLower.startsWith("data_") || vLower === "stop_") {
          break;
        }
        values.push(value);
        index++;
      }
      if (headers.length > 0) {
        const rows: string[][] = [];
        for (let i = 0; i + headers.length <= values.length; i += headers.length) {
          rows.push(values.slice(i, i + headers.length));
        }
        loops.push({ headers, rows });
      }
      continue;
    }
    if (token.startsWith("_")) {
      const value = tokens[index + 1];
      if (value !== undefined) {
        tags[lower] = value;
        index += 2;
      } else {
        index++;
      }
      continue;
    }
    index++;
  }
  return { tags, loops };
}

function cellFromParameters(
  a: number,
  b: number,
  c: number,
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
): Mat3 {
  const rad = Math.PI / 180;
  const alpha = alphaDeg * rad;
  const beta = betaDeg * rad;
  const gamma = gammaDeg * rad;
  const sinGamma = Math.sin(gamma);
  if (Math.abs(sinGamma) < 1e-9) throw new Error("CIF cell is degenerate: gamma is 0 or 180 degrees");
  const cosAlpha = Math.cos(alpha);
  const cosBeta = Math.cos(beta);
  const cosGamma = Math.cos(gamma);
  const cx = c * cosBeta;
  const cy = (c * (cosAlpha - cosBeta * cosGamma)) / sinGamma;
  const czSquared = c * c - cx * cx - cy * cy;
  if (czSquared <= 0) throw new Error("CIF cell parameters do not form a valid cell");
  return [
    [a, 0, 0],
    [b * cosGamma, b * sinGamma, 0],
    [cx, cy, Math.sqrt(czSquared)],
  ];
}

type SymOp = (f: Vec3) => Vec3;

/** Parses e.g. "-x+1/2,y,-z" or "x-y, x, z+1/2". */
export function parseSymmetryOperation(expression: string): SymOp {
  const components = expression
    .toLowerCase()
    .replace(/\s+/g, "")
    .split(",");
  if (components.length !== 3) {
    throw new Error(`Invalid symmetry operation '${expression}': expected three components`);
  }
  const parsed = components.map((component) => {
    const normalized = component.startsWith("+") || component.startsWith("-") ? component : `+${component}`;
    const terms = normalized.match(/[+-][^+-]+/g);
    if (!terms) throw new Error(`Invalid symmetry component '${component}'`);
    let x = 0;
    let y = 0;
    let z = 0;
    let constant = 0;
    for (const term of terms) {
      const sign = term.startsWith("-") ? -1 : 1;
      const body = term.slice(1);
      if (body === "") throw new Error(`Invalid symmetry component '${component}'`);
      const variable = /[xyz]/.exec(body);
      if (variable) {
        const coefficientText = body.slice(0, variable.index);
        const coefficient =
          coefficientText === "" ? 1 : coefficientText.includes("/")
            ? ratio(coefficientText)
            : Number(coefficientText);
        if (!Number.isFinite(coefficient)) throw new Error(`Invalid coefficient in '${component}'`);
        if (variable[0] === "x") x += sign * coefficient;
        else if (variable[0] === "y") y += sign * coefficient;
        else z += sign * coefficient;
      } else {
        constant += sign * ratio(body);
      }
    }
    return { x, y, z, constant };
  });
  return (f: Vec3): Vec3 => {
    const out: Vec3 = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const term = parsed[i]!;
      out[i] = term.x * f[0] + term.y * f[1] + term.z * f[2] + term.constant;
    }
    return out;
  };
}

function ratio(text: string): number {
  if (text.includes("/")) {
    const [num, den] = text.split("/");
    const value = Number(num) / Number(den);
    if (!Number.isFinite(value)) throw new Error(`Invalid fraction '${text}'`);
    return value;
  }
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`Invalid number '${text}'`);
  return value;
}

export interface CifImportResult {
  structure: Structure;
  warnings: string[];
  spaceGroupSymbol?: string;
  symmetryOperationsApplied: number;
}

export function readCif(text: string, filename?: string): CifImportResult {
  const { tags, loops } = parseCif(text);
  const warnings: string[] = [];

  const getNumber = (tag: string): number | undefined => {
    const raw = tags[tag];
    if (raw === undefined) return undefined;
    return parseNumeric(raw);
  };

  const a = getNumber("_cell_length_a");
  const b = getNumber("_cell_length_b");
  const c = getNumber("_cell_length_c");
  const alpha = getNumber("_cell_angle_alpha");
  const beta = getNumber("_cell_angle_beta");
  const gamma = getNumber("_cell_angle_gamma");
  if (a === undefined || b === undefined || c === undefined) {
    throw new Error("CIF is missing _cell_length_a/b/c; only crystallographic CIFs are supported");
  }
  const vectors = cellFromParameters(
    a,
    b,
    c,
    alpha ?? 90,
    beta ?? 90,
    gamma ?? 90,
  );

  const atomLoop = loops.find((loop) =>
    loop.headers.some((h) => h === "_atom_site_fract_x" || h === "_atom_site_cartn_x"),
  );
  if (!atomLoop) throw new Error("CIF contains no _atom_site loop with coordinates");

  const column = (header: string): number => atomLoop.headers.indexOf(header);
  const idxLabel = column("_atom_site_label");
  const idxType = column("_atom_site_type_symbol");
  const idxFx = column("_atom_site_fract_x");
  const idxFy = column("_atom_site_fract_y");
  const idxFz = column("_atom_site_fract_z");
  const idxCx = column("_atom_site_cartn_x");
  const idxCy = column("_atom_site_cartn_y");
  const idxCz = column("_atom_site_cartn_z");
  const idxOcc = column("_atom_site_occupancy");

  const fractional = idxFx >= 0 && idxFy >= 0 && idxFz >= 0;
  const cartesian = idxCx >= 0 && idxCy >= 0 && idxCz >= 0;
  if (!fractional && !cartesian) {
    throw new Error("CIF _atom_site loop has no complete fractional or cartesian coordinates");
  }

  const inverse = inverseRows(vectors);

  const baseSites: Site[] = atomLoop.rows.map((row, i) => {
    const rawSpecies = (idxType >= 0 ? row[idxType] : undefined) ?? (idxLabel >= 0 ? row[idxLabel] : "");
    const species = baseSymbol(rawSpecies!.replace(/[^A-Za-z]/g, ""));
    if (!species) throw new Error(`CIF atom site ${i + 1} has no parsable element symbol`);
    let position: Vec3;
    if (fractional) {
      position = [
        parseNumeric(row[idxFx]!),
        parseNumeric(row[idxFy]!),
        parseNumeric(row[idxFz]!),
      ];
    } else {
      const cart: Vec3 = [
        parseNumeric(row[idxCx]!),
        parseNumeric(row[idxCy]!),
        parseNumeric(row[idxCz]!),
      ];
      position = multiplyRow(cart, inverse);
    }
    if (position.some((x) => !Number.isFinite(x))) {
      throw new Error(`CIF atom site ${i + 1} has non-numeric coordinates`);
    }
    const occupancy = idxOcc >= 0 ? parseNumeric(row[idxOcc]!) : NaN;
    return {
      species,
      label: idxLabel >= 0 ? row[idxLabel] : `${species}${i + 1}`,
      fractional_position: position,
      occupancy: Number.isFinite(occupancy) ? occupancy : 1,
    };
  });

  // Symmetry operations: explicit loops only.
  const symopLoop = loops.find((loop) =>
    loop.headers.some((h) => h.includes("symop_operation_xyz") || h.includes("_symmetry_equiv_pos_as_xyz")),
  );
  let operations: string[] = [];
  if (symopLoop) {
    const headerIndex = symopLoop.headers.findIndex(
      (h) => h.includes("symop_operation_xyz") || h.includes("_symmetry_equiv_pos_as_xyz"),
    );
    operations = symopLoop.rows.map((row) => row[headerIndex]!).filter(Boolean);
  } else {
    for (const key of Object.keys(tags)) {
      if (key.includes("symop_operation_xyz") || key.includes("_symmetry_equiv_pos_as_xyz")) {
        operations.push(tags[key]!);
      }
    }
  }

  const spaceGroupSymbol =
    tags["_symmetry_space_group_name_h-m"] ?? tags["_space_group_name_h-m_alt"] ?? undefined;

  let sites = baseSites;
  let applied = 0;
  if (operations.length > 0) {
    const functions = operations.map(parseSymmetryOperation);
    const generated: Site[] = [];
    const tolerance = 1e-4;
    const seen = new Set<string>();
    for (const symop of functions) {
      for (const site of baseSites) {
        const f = symop(site.fractional_position).map((value) => {
          const wrapped = value - Math.floor(value);
          return Math.abs(wrapped - 1) < tolerance ? 0 : wrapped;
        }) as Vec3;
        const key = `${site.species}|${f.map((x) => Math.round(x / tolerance)).join(",")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        generated.push({ ...site, fractional_position: f });
      }
    }
    sites = generated;
    applied = operations.length;
  } else if (spaceGroupSymbol && !/^\s*(p\s*1|p1)\s*$/i.test(spaceGroupSymbol)) {
    warnings.push(
      `CIF declares space group '${spaceGroupSymbol}' but provides no symmetry operations. ` +
        "Read as P1 with the listed sites only; verify against the source.",
    );
  }

  const structure: Structure = {
    schema_version: SCHEMA_VERSION,
    structure_id: newStructureId(),
    display_name: filename?.replace(/\.cif$/i, ""),
    length_unit: "angstrom",
    lattice: { vectors },
    pbc: [true, true, true],
    sites,
    ...(spaceGroupSymbol ? { space_group: { symbol: spaceGroupSymbol } } : {}),
    source: { format: "cif", filename, notes: "Parsed CIF cell and atom sites" },
    created_at: new Date().toISOString(),
  };
  const withMeta: Structure = {
    ...structure,
    composition: compositionOf(structure.sites),
    validation: validateStructure(structure),
  };
  if (withMeta.validation?.status === "invalid") {
    warnings.push("Imported CIF structure failed structural validation; inspect the validation report.");
  }
  return {
    structure: withMeta,
    warnings,
    ...(spaceGroupSymbol ? { spaceGroupSymbol } : {}),
    symmetryOperationsApplied: applied,
  };
}

function inverseRows(m: Mat3): Mat3 {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) throw new Error("CIF cell is singular");
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

export function writeCif(structure: Structure): string {
  if (structure.length_unit !== "angstrom") {
    throw new Error("CIF export requires angstrom; convert the structure first");
  }
  const m = structure.lattice.vectors;
  const lengths = m.map((row) => Math.hypot(row[0], row[1], row[2]));
  const angle = (u: Vec3, v: Vec3): number => {
    const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const cos = dot / (Math.hypot(...u) * Math.hypot(...v));
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  };
  const alpha = angle(m[1], m[2]);
  const beta = angle(m[0], m[2]);
  const gamma = angle(m[0], m[1]);

  const lines = [
    `data_${(structure.display_name ?? structure.structure_id).replace(/[^A-Za-z0-9_.-]/g, "_")}`,
    `_audit_creation_method 'HCS Material Research Kit'`,
    `_audit_creation_date ${new Date().toISOString()}`,
    `_cell_length_a ${lengths[0]!.toFixed(6)}`,
    `_cell_length_b ${lengths[1]!.toFixed(6)}`,
    `_cell_length_c ${lengths[2]!.toFixed(6)}`,
    `_cell_angle_alpha ${alpha.toFixed(6)}`,
    `_cell_angle_beta ${beta.toFixed(6)}`,
    `_cell_angle_gamma ${gamma.toFixed(6)}`,
    `_cell_volume ${Math.abs(
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]),
    ).toFixed(6)}`,
    `_symmetry_space_group_name_H-M 'P 1'`,
    `_symmetry_Int_Tables_number 1`,
    `loop_`,
    `_symmetry_equiv_pos_as_xyz`,
    `'x, y, z'`,
    `loop_`,
    `_atom_site_label`,
    `_atom_site_type_symbol`,
    `_atom_site_fract_x`,
    `_atom_site_fract_y`,
    `_atom_site_fract_z`,
    `_atom_site_occupancy`,
  ];
  structure.sites.forEach((site, index) => {
    const f = site.fractional_position;
    const label = (site.label ?? `${site.species}${index + 1}`).replace(/\s+/g, "_");
    lines.push(
      `${label} ${site.species} ${f[0].toFixed(8)} ${f[1].toFixed(8)} ${f[2].toFixed(8)} ${(site.occupancy ?? 1).toFixed(4)}`,
    );
  });
  return `${lines.join("\n")}\n`;
}
