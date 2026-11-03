import { useEffect, useState } from "react";
import { detectHardware, type HardwareReport } from "@hcs-materials/core";

let cached: Promise<HardwareReport> | null = null;

export function useHardware(): { report: HardwareReport | null; error: string | null } {
  const [report, setReport] = useState<HardwareReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cached ??= detectHardware();
    cached
      .then((value) => {
        if (!cancelled) setReport(value);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { report, error };
}
