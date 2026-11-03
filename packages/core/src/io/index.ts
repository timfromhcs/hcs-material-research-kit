import type { Structure } from "../types.js";
import { readCif, writeCif } from "./cif.js";
import { readPoscar, writePoscar } from "./poscar.js";
import { readXyz, writeXyz } from "./xyz.js";
import { structureHash } from "../structure.js";

export type StructureFormat = "cif" | "poscar" | "xyz" | "hcs-json";

export interface ImportResult {
  structure: Structure;
  format: StructureFormat;
  warnings: string[];
}

export function detectFormat(text: string, filename?: string): StructureFormat {
  const lower = filename?.toLowerCase() ?? "";
  if (lower.endsWith(".cif")) return "cif";
  if (lower.endsWith(".vasp") || lower.endsWith(".poscar") || lower.endsWith(".contcar")) {
    return "poscar";
  }
  if (lower.endsWith(".xyz")) return "xyz";
  if (lower.endsWith(".json") || lower.endsWith(".hcs.json")) return "hcs-json";

  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) return "hcs-json";
  if (/^data_/i.test(trimmed) || /_cell_length_a/i.test(text)) return "cif";

  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length >= 6) {
    const scaleLike = /^[-+]?\d*\.?\d+([eE][-+]?\d+)?(\s+[-+]?\d*\.?\d+([eE][-+]?\d+)?){0,2}$/.test(
      lines[1]!.trim(),
    );
    const latticeLike = [2, 3, 4].every((index) => {
      const parts = lines[index]?.trim().split(/\s+/) ?? [];
      return parts.length === 3 && parts.every((p) => /^[-+]?\d*\.?\d+([eE][-+]?\d+)?$/.test(p));
    });
    if (scaleLike && latticeLike) return "poscar";
  }
  return "xyz";
}

export function importStructure(text: string, filename?: string): ImportResult {
  const format = detectFormat(text, filename);
  if (format === "cif") {
    const result = readCif(text, filename);
    return { structure: result.structure, format, warnings: result.warnings };
  }
  if (format === "poscar") {
    const result = readPoscar(text, filename);
    return { structure: result.structure, format, warnings: result.warnings };
  }
  if (format === "hcs-json") {
    return { structure: readStructureJson(text), format, warnings: [] };
  }
  const result = readXyz(text, filename);
  return { structure: result.structure, format, warnings: result.warnings };
}

export function readStructureJson(text: string): Structure {
  const parsed = JSON.parse(text) as Structure;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sites)) {
    throw new Error("Not a structure JSON document: missing 'sites'");
  }
  if (!parsed.lattice || !Array.isArray(parsed.lattice.vectors)) {
    throw new Error("Not a structure JSON document: missing 'lattice.vectors'");
  }
  if (!parsed.length_unit) throw new Error("Not a structure JSON document: missing 'length_unit'");
  return parsed;
}

export function exportStructure(structure: Structure, format: StructureFormat): string {
  switch (format) {
    case "cif":
      return writeCif(structure);
    case "poscar":
      return writePoscar(structure);
    case "xyz":
      return writeXyz(structure);
    case "hcs-json":
      return `${JSON.stringify(structure, null, 2)}\n`;
    default:
      throw new Error(`Unsupported export format '${format}'`);
  }
}

export interface FileIdentity {
  filename: string;
  format: StructureFormat;
  structure_hash: string;
  atoms: number;
}

export function describeStructureFile(structure: Structure, filename: string): FileIdentity {
  return {
    filename,
    format: detectFormat("", filename),
    structure_hash: structureHash(structure),
    atoms: structure.sites.length,
  };
}

export { readCif, writeCif } from "./cif.js";
export { readPoscar, writePoscar } from "./poscar.js";
export { readXyz, writeXyz } from "./xyz.js";
