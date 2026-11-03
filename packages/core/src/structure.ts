import {
  clamp,
  det3,
  dot,
  inverse3,
  matVec,
  norm,
  sub,
  vecMat,
  type Mat3,
  type Vec3,
} from "./linalg.js";
import { getElement, baseSymbol, isKnownElement } from "./elements.js";
import { hashJson } from "./hash.js";
import { fromAngstrom, toAngstrom } from "./units.js";
import {
  SCHEMA_VERSION,
  type Composition,
  type Site,
  type Structure,
  type ValidationReport,
} from "./types.js";

export const LENGTH_TOLERANCE_ANGSTROM = 1e-6;

/** Core kernels operate in angstrom; imports must convert before calling them. */
export function assertAngstrom(structure: Structure): void {
  if (structure.length_unit !== "angstrom") {
    throw new Error(
      `Structure '${structure.structure_id}' uses '${structure.length_unit}'. ` +
        `Convert to angstrom with convertLengthUnit() before using compute kernels.`,
    );
  }
}

/** Returns the cell vectors in angstrom, converting from the stored unit. */
export function latticeVectorsAngstrom(structure: Structure): Mat3 {
  const scaleFactor = toAngstrom(1, structure.length_unit);
  return structure.lattice.vectors.map((row) => row.map((x) => x * scaleFactor)) as Mat3;
}

export function convertLengthUnit(structure: Structure, unit: Structure["length_unit"]): Structure {
  const scale = toAngstrom(1, structure.length_unit) / toAngstrom(1, unit);
  const vectors = structure.lattice.vectors.map((row) => row.map((x) => x * scale)) as Mat3;
  return {
    ...structure,
    length_unit: unit,
    lattice: { vectors },
    sites: structure.sites.map((site) => ({
      ...site,
      cartesian_position: site.cartesian_position
        ? (site.cartesian_position.map((x) => x * scale) as Vec3)
        : undefined,
    })),
  };
}

/** Cell volume in Å³ (always positive). */
export function cellVolume(structure: Structure): number {
  return Math.abs(det3(latticeVectorsAngstrom(structure)));
}

export function fractionalToCartesian(structure: Structure, fractional: Vec3): Vec3 {
  return vecMat(fractional, latticeVectorsAngstrom(structure));
}

export function cartesianToFractional(structure: Structure, cartesian: Vec3): Vec3 {
  return vecMat(cartesian, inverse3(latticeVectorsAngstrom(structure)));
}

export function cartesianPositions(structure: Structure): Vec3[] {
  const m = latticeVectorsAngstrom(structure);
  return structure.sites.map((site) => vecMat(site.fractional_position, m));
}

/** Wraps fractional coordinates into [0, 1) for periodic directions. */
export function wrapFractional(structure: Structure): Structure {
  const sites = structure.sites.map((site) => {
    const f = site.fractional_position.map((value, axis) => {
      if (!structure.pbc[axis]) return value;
      const wrapped = value - Math.floor(value);
      return Object.is(wrapped, -0) ? 0 : wrapped;
    }) as Vec3;
    return { ...site, fractional_position: f, cartesian_position: undefined };
  });
  return { ...structure, sites };
}

/**
 * Minimum-image vector from `from` to `to` in a periodic cell.
 *
 * Uses the nearest-image search in fractional space, which is exact for cells
 * whose lattice vectors are not pathologically skewed relative to the cutoff.
 * validateStructure() reports strongly skewed cells.
 */
export function minimumImageVector(structure: Structure, from: Vec3, to: Vec3): Vec3 {
  const delta = sub(to, from);
  const fractional = cartesianToFractional(structure, delta);
  const wrapped: Vec3 = [
    structure.pbc[0] ? fractional[0] - Math.round(fractional[0]) : fractional[0],
    structure.pbc[1] ? fractional[1] - Math.round(fractional[1]) : fractional[1],
    structure.pbc[2] ? fractional[2] - Math.round(fractional[2]) : fractional[2],
  ];
  return fractionalToCartesian(structure, wrapped);
}

export function distanceBetween(structure: Structure, i: number, j: number): number {
  const positions = cartesianPositions(structure);
  const a = positions[i];
  const b = positions[j];
  if (!a || !b) throw new Error(`Site index out of range (${i}, ${j})`);
  return norm(minimumImageVector(structure, a, b));
}

export function compositionOf(sites: readonly Site[]): Composition {
  const amounts: Record<string, number> = {};
  for (const site of sites) {
    const symbol = baseSymbol(site.species);
    amounts[symbol] = (amounts[symbol] ?? 0) + (site.occupancy ?? 1);
  }
  const elements = Object.keys(amounts).sort();
  const reduced = reduceAmounts(amounts);
  return {
    reduced_formula: formulaFromAmounts(reduced),
    elements,
    amounts: roundAmounts(amounts),
    total_atoms: roundTo(
      sites.reduce((sum, s) => sum + (s.occupancy ?? 1), 0),
      6,
    ),
  };
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundAmounts(amounts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(amounts)) out[key] = roundTo(value, 6);
  return out;
}

/** Divides all amounts by their greatest common divisor when they are integers. */
function reduceAmounts(amounts: Record<string, number>): Record<string, number> {
  const values = Object.values(amounts);
  const integers = values.map((v) => Math.round(v));
  const isInteger = values.every((v, i) => Math.abs(v - integers[i]!) < 1e-6);
  if (!isInteger) return amounts;
  let divisor = integers.reduce((a, b) => gcd(a, b));
  if (divisor < 1) divisor = 1;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(amounts)) out[key] = value / divisor;
  return out;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x;
}

/**
 * Conventional formula ordering used by materials databases:
 *   - if carbon is present: C first, H second, then the rest by increasing
 *     Pauling electronegativity;
 *   - otherwise: increasing electronegativity (electropositive element first);
 *   - elements without a tabulated electronegativity go last, alphabetically.
 * This is the ordering that yields NaCl, SiO2 and SrTiO3 rather than ClNa,
 * O2Si and O3SrTi.
 */
export function formulaFromAmounts(amounts: Record<string, number>): string {
  const symbols = Object.keys(amounts);
  if (symbols.length === 0) return "";

  const byElectronegativity = (a: string, b: string): number => {
    const ea = getElement(a)?.electronegativity ?? Number.POSITIVE_INFINITY;
    const eb = getElement(b)?.electronegativity ?? Number.POSITIVE_INFINITY;
    if (ea !== eb) return ea - eb;
    return a < b ? -1 : a > b ? 1 : 0;
  };

  let ordered: string[];
  if (symbols.includes("C")) {
    ordered = [
      "C",
      ...(symbols.includes("H") ? ["H"] : []),
      ...symbols.filter((s) => s !== "C" && s !== "H").sort(byElectronegativity),
    ];
  } else {
    ordered = [...symbols].sort(byElectronegativity);
  }

  return ordered
    .map((symbol) => {
      const amount = amounts[symbol]!;
      if (Math.abs(amount - 1) < 1e-9) return symbol;
      const rounded = roundTo(amount, 4);
      return `${symbol}${Number.isInteger(rounded) ? rounded : rounded.toFixed(4).replace(/0+$/, "")}`;
    })
    .join("");
}

export interface StructureValidationOptions {
  /** Distance below which two sites are reported as unphysical overlap (Å). */
  overlapThresholdAngstrom?: number;
}

export function validateStructure(
  structure: Structure,
  options: StructureValidationOptions = {},
): ValidationReport {
  const checks: ValidationReport["checks"] = [];
  const overlapThreshold = options.overlapThresholdAngstrom ?? 0.5;

  const add = (
    id: string,
    status: "pass" | "warning" | "fail",
    message: string,
    details?: Record<string, unknown>,
  ) => checks.push({ id, status, message, ...(details ? { details } : {}) });

  // 1. lattice present and finite
  const vectors = structure.lattice?.vectors;
  const latticeOk =
    Array.isArray(vectors) &&
    vectors.length === 3 &&
    vectors.every((row) => row.length === 3 && row.every((x) => Number.isFinite(x)));
  add(
    "lattice.finite",
    latticeOk ? "pass" : "fail",
    latticeOk ? "Lattice is a finite 3x3 matrix." : "Lattice must be a finite 3x3 matrix.",
  );

  // 2. volume
  let volume = 0;
  if (latticeOk) {
    volume = Math.abs(det3(vectors));
    if (volume < 1e-6) {
      add(
        "lattice.volume",
        "fail",
        `Cell volume is ${volume.toExponential(3)} Å³; must exceed 1e-6 Å³.`,
      );
    } else {
      add("lattice.volume", "pass", `Cell volume ${volume.toFixed(4)} Å³.`, { volume });
    }
  }

  // 3. sites present
  add(
    "sites.nonempty",
    structure.sites.length > 0 ? "pass" : "fail",
    structure.sites.length > 0
      ? `${structure.sites.length} site(s).`
      : "A structure needs at least one site.",
  );

  // 4. species known
  const unknown = [
    ...new Set(structure.sites.map((s) => s.species).filter((s) => !isKnownElement(s))),
  ];
  add(
    "sites.species",
    unknown.length === 0 ? "pass" : "warning",
    unknown.length === 0
      ? "All species map to known elements."
      : `Unknown element symbol(s): ${unknown.join(", ")}. Properties needing masses are unavailable.`,
    unknown.length ? { unknown } : undefined,
  );

  // 5. positions finite, occupancy in range
  const badPositions = structure.sites.filter(
    (s) =>
      !Array.isArray(s.fractional_position) ||
      s.fractional_position.length !== 3 ||
      !s.fractional_position.every((x) => Number.isFinite(x)),
  ).length;
  add(
    "sites.positions",
    badPositions === 0 ? "pass" : "fail",
    badPositions === 0
      ? "All fractional positions are finite."
      : `${badPositions} site(s) have non-finite or malformed fractional positions.`,
  );
  const badOccupancy = structure.sites.filter(
    (s) => s.occupancy !== undefined && (!(s.occupancy > 0) || s.occupancy > 1),
  ).length;
  add(
    "sites.occupancy",
    badOccupancy === 0 ? "pass" : "fail",
    badOccupancy === 0
      ? "Occupancies are within (0, 1]."
      : `${badOccupancy} site(s) have invalid occupancy.`,
  );

  // 6. pbc sanity
  if (!structure.pbc.some(Boolean)) {
    add(
      "cell.periodicity",
      "warning",
      "No periodic direction is active; the cell is treated as a finite cluster.",
    );
  } else {
    add(
      "cell.periodicity",
      "pass",
      `Periodic axes: ${structure.pbc.map((p) => (p ? "1" : "0")).join("")}.`,
    );
  }

  // 7. skew heuristic
  if (latticeOk && volume >= 1e-6) {
    const lengths = vectors.map((row) => norm(row as Vec3));
    const shortest = Math.min(...lengths);
    let worstAngle = 90;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const cos = dot(vectors[i]! as Vec3, vectors[j]! as Vec3) / (lengths[i]! * lengths[j]!);
        worstAngle = Math.min(
          worstAngle,
          (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI,
        );
      }
    }
    if (shortest < 1e-3) {
      add("cell.skew", "fail", "At least one lattice vector has (near) zero length.");
    } else if (worstAngle < 20 || worstAngle > 160) {
      add(
        "cell.skew",
        "warning",
        `Cell is strongly skewed (smallest lattice angle ${worstAngle.toFixed(1)}°). ` +
          "Minimum-image distances and cutoffs may be inaccurate; reduce the cell first.",
        { smallestAngleDegrees: worstAngle },
      );
    } else {
      add(
        "cell.skew",
        "pass",
        `Cell geometry acceptable (smallest lattice angle ${worstAngle.toFixed(1)}°).`,
      );
    }
  }

  // 8. overlaps: O(N²) by design, reported as a hard warning for user review
  if (latticeOk && volume >= 1e-6 && structure.sites.length > 1) {
    const positions = cartesianPositions(structure);
    let closest = Infinity;
    let closestPair: [number, number] | null = null;
    let overlapCount = 0;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const d = norm(minimumImageVector(structure, positions[i]!, positions[j]!));
        if (d < closest) {
          closest = d;
          closestPair = [i, j];
        }
        if (d < overlapThreshold) overlapCount++;
      }
    }
    if (overlapCount > 0) {
      add(
        "sites.overlap",
        "warning",
        `${overlapCount} pair(s) closer than ${overlapThreshold} Å (closest ${closest.toFixed(3)} Å). ` +
          "Check for duplicate sites or invalid fractional coordinates.",
        { overlapCount, closestAngstrom: closest, closestPair },
      );
    } else {
      add(
        "sites.overlap",
        "pass",
        `No unphysical overlaps below ${overlapThreshold} Å (closest pair ${closest.toFixed(3)} Å).`,
        { closestAngstrom: closest, closestPair },
      );
    }
  }

  const failed = checks.some((c) => c.status === "fail");
  const warned = checks.some((c) => c.status === "warning");
  return { status: failed ? "invalid" : warned ? "warning" : "valid", checks };
}

/** Rounds coordinates for hashing so float noise cannot change identity. */
function rounded(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Stable structure identity hash.
 *
 * Site order is normalized away; species labels and fractional coordinates are
 * rounded to 1e-6 fractional units. Two structures with the same hash have the
 * same cell, periodicity and site set within that precision.
 */
export function structureHash(structure: Structure): string {
  const vectors = latticeVectorsAngstrom(structure).map((row) => row.map((x) => rounded(x)));
  const sites = structure.sites
    .map((site) => ({
      species: baseSymbol(site.species),
      // Equivalent periodic images (x and x+1) are the same structure.
      position: site.fractional_position.map((x, axis) => {
        const wrapped = structure.pbc[axis] ? x - Math.floor(x) : x;
        return rounded(wrapped);
      }),
      occupancy: site.occupancy === undefined ? 1 : rounded(site.occupancy),
    }))
    .sort((a, b) => {
      if (a.species !== b.species) return a.species < b.species ? -1 : 1;
      for (let i = 0; i < 3; i++) {
        const delta = a.position[i]! - b.position[i]!;
        if (Math.abs(delta) > 1e-9) return delta;
      }
      return a.occupancy - b.occupancy;
    });
  return hashJson({ schema: "structure-hash/1", vectors, pbc: structure.pbc, sites });
}

export function structureHashShort(structure: Structure): string {
  return structureHash(structure).slice(0, 12);
}

export function withDerivedFields(structure: Structure): Structure {
  return {
    ...structure,
    composition: compositionOf(structure.sites),
    validation: validateStructure(structure),
    updated_at: new Date().toISOString(),
  };
}

let counter = 0;

/** Predictable, human-readable IDs. Uniqueness is provided by the timestamp+counter. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1e6;
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}${counter.toString(36)}${random}`;
}

export function newStructureId(): string {
  return newId("struct");
}

export function emptyStructure(name = "New structure"): Structure {
  return {
    schema_version: SCHEMA_VERSION,
    structure_id: newStructureId(),
    display_name: name,
    length_unit: "angstrom",
    lattice: {
      vectors: [
        [5, 0, 0],
        [0, 5, 0],
        [0, 0, 5],
      ],
    },
    pbc: [true, true, true],
    sites: [{ species: "Si", fractional_position: [0, 0, 0], label: "Si1", occupancy: 1 }],
  };
}

/** Number of atoms weighted by occupancy (used for per-atom normalisation). */
export function effectiveAtomCount(structure: Structure): number {
  return structure.sites.reduce((sum, site) => sum + (site.occupancy ?? 1), 0);
}

export function totalMassAmu(structure: Structure): number {
  let total = 0;
  for (const site of structure.sites) {
    const element = getElement(site.species);
    if (!element) throw new Error(`Unknown element '${site.species}'`);
    total += element.mass * (site.occupancy ?? 1);
  }
  return total;
}

export function latticeLengthsAngstrom(structure: Structure): Vec3 {
  const m = latticeVectorsAngstrom(structure);
  return [norm(m[0]), norm(m[1]), norm(m[2])];
}

/** Convenience: cartesian positions of the eight cell corners for visualisation. */
export function cellCorners(structure: Structure): Vec3[] {
  const m = latticeVectorsAngstrom(structure);
  const corners: Vec3[] = [];
  for (let i = 0; i < 8; i++) {
    const f: Vec3 = [i & 1 ? 1 : 0, i & 2 ? 1 : 0, i & 4 ? 1 : 0];
    corners.push(matVec(m, f));
  }
  return corners;
}

export interface SiteMeasurement {
  /** Indices that were measured, in the given order. */
  indices: number[];
  /** Pairwise distances in Å using minimum images (length = indices-1 for a chain). */
  distances: number[];
  /** Vector from the first to the second site in Å (minimum image). */
  vector?: Vec3;
  /** Angle at the second site between first→second and third→second, in degrees. */
  angleDegrees?: number;
  /** True when at least one pair crosses a periodic boundary. */
  wrapped: boolean;
}

/**
 * Measures distances (2 sites) and an angle (3 sites) using minimum-image
 * vectors. The result says whether periodic wrapping was involved, because a
 * distance across a boundary is not the distance a viewer might suggest.
 */
export function measureSites(structure: Structure, indices: number[]): SiteMeasurement {
  const unique = indices.filter((index, position) => indices.indexOf(index) === position);
  if (unique.length < 1) throw new Error("Select at least one site to measure");
  for (const index of unique) {
    if (index < 0 || index >= structure.sites.length) {
      throw new Error(`Site index ${index} is out of range`);
    }
  }
  const positions = cartesianPositions(structure);
  const distances: number[] = [];
  let wrapped = false;
  let vector: Vec3 | undefined;
  for (let i = 1; i < unique.length; i++) {
    const delta = minimumImageVector(structure, positions[unique[i - 1]!]!, positions[unique[i]!]!);
    const distance = norm(delta);
    if (distance <= 0) throw new Error("Selected sites coincide");
    const direct = norm(sub(positions[unique[i]!]!, positions[unique[i - 1]!]!));
    if (Math.abs(direct - distance) > 1e-6) wrapped = true;
    distances.push(distance);
    if (i === 1) vector = delta;
  }

  let angleDegrees: number | undefined;
  if (unique.length >= 3) {
    const a = minimumImageVector(structure, positions[unique[1]!]!, positions[unique[0]!]!);
    const b = minimumImageVector(structure, positions[unique[1]!]!, positions[unique[2]!]!);
    const norms = norm(a) * norm(b);
    if (norms > 0) {
      const cosine = clamp(dot(a, b) / norms, -1, 1);
      angleDegrees = (Math.acos(cosine) * 180) / Math.PI;
    }
  }

  return {
    indices: unique,
    distances,
    ...(vector ? { vector } : {}),
    ...(angleDegrees !== undefined ? { angleDegrees } : {}),
    wrapped,
  };
}
