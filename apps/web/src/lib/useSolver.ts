import { useCallback, useEffect, useRef, useState } from "react";
import type { SimulationSpec, Structure } from "@hcs-materials/core";
import type { WorkerRequest, WorkerResponse, WorkerResult } from "../workers/solver.worker";

export interface SolverProgress {
  phase: string;
  fraction: number;
  message: string;
}

export interface SolverState {
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  progress: SolverProgress;
  requestId: string | null;
  error: string | null;
}

const IDLE_PROGRESS: SolverProgress = { phase: "idle", fraction: 0, message: "" };

/**
 * Runs one job in a dedicated worker. Each run gets a fresh worker so a hard
 * cancel (terminate) cannot leave a stale computation running.
 */
export function useSolver(): {
  state: SolverState;
  run: (spec: SimulationSpec, structure: Structure, projectId: string) => Promise<WorkerResult | null>;
  cancel: () => void;
  reset: () => void;
} {
  const [state, setState] = useState<SolverState>({
    status: "idle",
    progress: IDLE_PROGRESS,
    requestId: null,
    error: null,
  });
  const workerRef = useRef<Worker | null>(null);
  const resolveRef = useRef<((value: WorkerResult | null) => void) | null>(null);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      resolveRef.current?.(null);
      resolveRef.current = null;
    },
    [],
  );

  const cancel = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    worker.terminate();
    workerRef.current = null;
    setState((current) => ({
      ...current,
      status: current.status === "running" ? "cancelled" : current.status,
      progress: { ...current.progress, phase: "cancelled", message: "Cancelled" },
    }));
    resolveRef.current?.(null);
    resolveRef.current = null;
  }, []);

  const reset = useCallback(() => {
    setState({ status: "idle", progress: IDLE_PROGRESS, requestId: null, error: null });
  }, []);

  const run = useCallback(
    (spec: SimulationSpec, structure: Structure, projectId: string): Promise<WorkerResult | null> => {
      workerRef.current?.terminate();
      const requestId = `req_${Math.random().toString(36).slice(2, 10)}`;
      setState({
        status: "running",
        progress: { phase: "start", fraction: 0, message: "Starting worker" },
        requestId,
        error: null,
      });

      const worker = new Worker(new URL("../workers/solver.worker.ts", import.meta.url), {
        type: "module",
        name: "hcs-solver",
      });
      workerRef.current = worker;

      return new Promise<WorkerResult | null>((resolve) => {
        resolveRef.current = resolve;

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const message = event.data;
          if (message.type === "progress") {
            setState((current) => ({
              ...current,
              progress: { phase: message.phase, fraction: message.fraction, message: message.message },
            }));
            return;
          }
          if (message.type === "result") {
            const failed = Boolean(message.error) || message.job.state === "failed";
            const cancelled = message.job.state === "cancelled";
            setState((current) => ({
              ...current,
              status: failed ? "failed" : cancelled ? "cancelled" : "completed",
              progress: {
                phase: "done",
                fraction: 1,
                message: failed ? (message.error?.message ?? "Failed") : "Completed",
              },
              error: message.error?.message ?? null,
            }));
            resolve(message);
            resolveRef.current = null;
            return;
          }
          if (message.type === "error") {
            setState((current) => ({
              ...current,
              status: "failed",
              error: message.message,
              progress: { phase: "error", fraction: 0, message: message.message },
            }));
            resolve(null);
            resolveRef.current = null;
          }
        };

        worker.onerror = (event) => {
          setState((current) => ({
            ...current,
            status: "failed",
            error: event.message || "Worker crashed",
          }));
          resolve(null);
          resolveRef.current = null;
        };

        const request: WorkerRequest = { type: "run", requestId, projectId, spec, structure };
        worker.postMessage(request);
      });
    },
    [],
  );

  return { state, run, cancel, reset };
}
