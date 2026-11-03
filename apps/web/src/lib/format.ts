/** Formatting helpers: explicit units, tabular numbers, no hidden precision. */

export function formatNumber(value: number | string | boolean | undefined, digits = 4): string {
  if (value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 1e-3 || magnitude >= 1e5)) return value.toExponential(3);
  return value.toFixed(digits).replace(/\.?0+$/, "") || "0";
}

export function formatSigned(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  const formatted = formatNumber(value, digits);
  return value > 0 ? `+${formatted}` : formatted;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export function shortHash(hash: string | undefined, length = 12): string {
  if (!hash) return "—";
  return hash.slice(0, length);
}

export function stateTone(state: string): "ok" | "warn" | "err" | "info" | "neutral" {
  if (state === "completed") return "ok";
  if (state === "failed") return "err";
  if (state === "cancelled" || state === "interrupted") return "warn";
  if (state === "running" || state === "preparing" || state === "queued") return "info";
  return "neutral";
}

export function validationTone(status: string | undefined): "ok" | "warn" | "err" | "neutral" {
  if (status === "valid") return "ok";
  if (status === "warning") return "warn";
  if (status === "invalid") return "err";
  return "neutral";
}
