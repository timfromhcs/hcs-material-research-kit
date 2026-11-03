/// <reference lib="webworker" />
/**
 * Solver worker. Runs the pure TypeScript reference kernels off the UI thread.
 *
 * Protocol (typed messages):
 *   main -> worker : { type: "run", requestId, spec, structure, projectId }
 *                     { type: "ping" }
 *   worker -> main : { type: "ready" } | { type: "progress", ... }
 *                     { type: "result", ... } | { type: "error", ... }
 *
 * Cancellation: the main thread terminates the worker (hard cancel) because the
 * kernels are synchronous; a partial result is never returned or stored.
 */

import {
  runJob,
  type JobRecord,
  type ProvenanceRecord,
  type ResultBundle,
  type SimulationSpec,
  type Structure,
} from "@hcs-materials/core";

export interface WorkerRunRequest {
  type: "run";
  requestId: string;
  projectId: string;
  spec: SimulationSpec;
  structure: Structure;
}

export interface WorkerPing {
  type: "ping";
}

export type WorkerRequest = WorkerRunRequest | WorkerPing;

export interface WorkerProgress {
  type: "progress";
  requestId: string;
  phase: string;
  fraction: number;
  message: string;
}

export interface WorkerResult {
  type: "result";
  requestId: string;
  job: JobRecord;
  result?: ResultBundle;
  provenance?: ProvenanceRecord;
  trajectory?: { step: number; timePs: number; positions: [number, number, number][] }[];
  error?: { code: string; message: string };
}

export interface WorkerFailure {
  type: "error";
  requestId: string;
  message: string;
}

export type WorkerResponse = WorkerProgress | WorkerResult | WorkerFailure | { type: "ready" };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "ping") {
    scope.postMessage({ type: "ready" } satisfies WorkerResponse);
    return;
  }
  if (request.type !== "run") return;

  try {
    const outcome = runJob({
      spec: request.spec,
      structure: request.structure,
      projectId: request.projectId,
      onProgress: (update) => {
        scope.postMessage({
          type: "progress",
          requestId: request.requestId,
          phase: update.phase,
          fraction: update.fraction,
          message: update.message,
        } satisfies WorkerProgress);
      },
    });
    scope.postMessage({
      type: "result",
      requestId: request.requestId,
      job: outcome.job,
      result: outcome.result,
      provenance: outcome.provenance,
      trajectory: outcome.trajectory?.map((frame) => ({
        step: frame.step,
        timePs: frame.timePs,
        positions: frame.positions.map((p) => [p[0], p[1], p[2]] as [number, number, number]),
      })),
      error: outcome.error,
    } satisfies WorkerResult);
  } catch (error) {
    scope.postMessage({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    } satisfies WorkerFailure);
  }
};
