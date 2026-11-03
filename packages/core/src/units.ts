/**
 * Explicit unit handling.
 *
 * Canonical internal units: length in angstrom, energy in electron-volt,
 * time in picosecond, mass in unified atomic mass unit, temperature in kelvin.
 * Every public number carries its unit; conversions happen only here.
 */

export const LENGTH_TO_ANGSTROM = {
  angstrom: 1,
  nanometer: 10,
  bohr: 0.529177210903,
} as const;

export type LengthUnit = keyof typeof LENGTH_TO_ANGSTROM;

export function toAngstrom(value: number, unit: LengthUnit): number {
  return value * LENGTH_TO_ANGSTROM[unit];
}

export function fromAngstrom(value: number, unit: LengthUnit): number {
  return value / LENGTH_TO_ANGSTROM[unit];
}

/** Boltzmann constant in eV/K (CODATA 2018). */
export const KB_EV_PER_K = 8.617333262e-5;
/** Avogadro constant, 1/mol (CODATA 2018). */
export const AVOGADRO = 6.02214076e23;
/** Electronvolt in joule (exact SI definition). */
export const EV_IN_JOULE = 1.602176634e-19;
/** Unified atomic mass unit in kilogram (CODATA 2018). */
export const AMU_IN_KG = 1.6605390666e-27;
/** 1 eV/Å/amu expressed in Å/ps². */
export const EV_PER_A_PER_AMU_TO_A_PER_PS2 = (EV_IN_JOULE / 1e-10 / AMU_IN_KG) * 1e-14;

/**
 * 1 sqrt(eV/u) expressed in Å/ps. Thermal velocities sampled as
 * sqrt(k_B T / m) are in sqrt(eV/u) and must be multiplied by this factor
 * before integration, because acceleration is handled in Å/ps².
 */
export const SQRT_EV_PER_U_TO_A_PER_PS = Math.sqrt(EV_IN_JOULE / AMU_IN_KG) * 1e-2;

/**
 * 1 u·Å²/ps² expressed in eV. Used to turn a kinetic energy computed from
 * u, Å and ps into eV without mixing unit systems.
 */
export const U_A2_PER_PS2_TO_EV = (AMU_IN_KG * 1e-20) / 1e-24 / EV_IN_JOULE;

/** Converts a force in eV/angstrom to an acceleration in angstrom/ps². */
export function accelerationFromForce(forceEvPerA: number, massAmu: number): number {
  if (massAmu <= 0) throw new Error("Mass must be positive");
  return (forceEvPerA / massAmu) * EV_PER_A_PER_AMU_TO_A_PER_PS2;
}

/** Converts temperature to kinetic energy per degree of freedom (eV). */
export function thermalEnergy(temperatureK: number): number {
  if (temperatureK < 0) throw new Error("Temperature must be non-negative");
  return 1.5 * KB_EV_PER_K * temperatureK;
}

/** Mass density in g/cm³ from a cell volume in Å³ and a total mass in u. */
export function densityGPerCm3(totalMassAmu: number, volumeAngstrom3: number): number {
  if (volumeAngstrom3 <= 0) throw new Error("Volume must be positive");
  return (totalMassAmu * AMU_IN_KG) / (volumeAngstrom3 * 1e-30) / 1000;
}

export interface UnitLabel {
  readonly energy: string;
  readonly length: string;
  readonly force: string;
  readonly time: string;
  readonly temperature: string;
  readonly mass: string;
}

/** The one unit system used by HCS kernels and results. */
export const CANONICAL_UNITS: UnitLabel = {
  energy: "eV",
  length: "angstrom",
  force: "eV/angstrom",
  time: "ps",
  temperature: "K",
  mass: "u",
};
