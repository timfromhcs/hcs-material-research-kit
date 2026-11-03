/** Numeric parsing for scientific text formats. */

/**
 * Parses a numeric value, tolerating crystallographic estimated standard
 * deviations such as "5.431(2)", unicode minus signs and trailing junk-free
 * decimals. Throws on non-numeric input instead of returning NaN.
 */
export function parseNumeric(raw: string): number {
  if (raw === undefined || raw === null) throw new Error("Missing numeric value");
  const trimmed = String(raw)
    .trim()
    .replace(/\u2212/g, "-")
    .replace(/^\+/, "");
  if (trimmed === "" || trimmed === "." || trimmed === "?" || trimmed === "-") {
    throw new Error(`Not a number: '${raw}'`);
  }
  const match = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(trimmed);
  if (!match) throw new Error(`Not a number: '${raw}'`);
  const value = Number(match[0]);
  if (!Number.isFinite(value)) throw new Error(`Not a finite number: '${raw}'`);
  return value;
}

/** Returns a finite number or the fallback, never NaN. */
export function parseNumericOr(raw: string | undefined, fallback: number): number {
  try {
    return parseNumeric(raw ?? "");
  } catch {
    return fallback;
  }
}
