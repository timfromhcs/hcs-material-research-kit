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
 *
 * Cross-implementation check: for single-point evaluations the worker also
 * evaluates the same cell with the Rust→WASM kernel and reports the deviation.
 * This is a real second implementation in the browser, not a display badge; if
 * the WASM asset cannot load, the job still completes and the check reports why.
 */

import {
  computeEnergyForces,
  getLJModel,
  runJob,
  type JobRecord,
  type ProvenanceRecord,
  type ResultBundle,
  type SimulationSpec,
  type Structure,
} from "@hcs-materials/core";
import { instantiateWasmKernel, type WasmKernel } from "@hcs-materials/wasm";
import wasmUrl from "@hcs-materials/wasm/hcs_compute.wasm?url";

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

export interface CrossCheck {
  backend: "wasm";
  tolerance: number;
  maxDeltaEnergyEv: number;
  maxDeltaForceEvPerA: number;
  wasmEnergyEv: number;
  pairCount: number;
  passed: boolean;
}

export interface WorkerResult {
  type: "result";
  requestId: string;
  job: JobRecord;
  result?: ResultBundle;
  provenance?: ProvenanceRecord;
  trajectory?: { step: number; timePs: number; positions: [number, number, number][] }[];
  crossCheck?: CrossCheck;
  crossCheckError?: string;
  wasmError?: string;
  error?: { code: string; message: string };
}

export interface WorkerFailure {
  type: "error";
  requestId: string;
  message: string;
}

export type WorkerResponse = WorkerProgress | WorkerResult | WorkerFailure | { type: "ready" };

const scope = self as unknown as DedicatedWorkerGlobalScope;

let kernelPromise: Promise<WasmKernel> | null = null;

function wasmKernel(): Promise<WasmKernel> {
  kernelPromise ??= (async () => {
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error(`WASM asset request failed (${response.status})`);
    const bytes = await response.arrayBuffer();
    return instantiateWasmKernel(bytes);
  })();
  return kernelPromise;
}

async function crossCheckEnergy(
  structure: Structure,
  spec: SimulationSpec,
  result: ResultBundle,
): Promise<{ check?: CrossCheck; error?: string }> {
  try {
    const model = getLJModel(spec.model_id ?? "lj.noble-gases.v1");
    const cutoffQuantity = result.quantities.find((quantity) => quantity.name === "cutoff");
    const cutoff = typeof cutoffQuantity?.value === "number" ? cutoffQuantity.value : model.cutoff;
    const kernel = await wasmKernel();
    const wasm = kernel.energyForces(structure, model, { cutoff });
    const cpu = computeEnergyForces(structure, model, { cutoff });

    let maxDeltaForce = 0;
    for (let i = 0; i < cpu.forces.length; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const delta = Math.abs(cpu.forces[i]![axis]! - wasm.forces[i]![axis]!);
        if (delta > maxDeltaForce) maxDeltaForce = delta;
      }
    }
    const tolerance = 1e-8;
    const maxDeltaEnergy = Math.abs(cpu.energy - wasm.energy);
    return {
      check: {
        backend: "wasm",
        tolerance,
        maxDeltaEnergyEv: maxDeltaEnergy,
        maxDeltaForceEvPerA: maxDeltaForce,
        wasmEnergyEv: wasm.energy,
        pairCount: wasm.pairCount,
        passed: maxDeltaEnergy <= tolerance && maxDeltaForce <= tolerance,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data);
};

async function handle(request: WorkerRequest): Promise<void> {
  if (request.type === "ping") {
    scope.postMessage({ type: "ready" } satisfies WorkerResponse);
    return;
  }
  if (request.type !== "run") return;

  try {
    // Prefer the WASM kernel for LJ tasks; fall back to the TypeScript CPU
    // implementation if the asset cannot be instantiated. The fallback is
    // reported, never hidden.
    let kernel: WasmKernel | null = null;
    let wasmError: string | undefined;
    try {
      kernel = await wasmKernel();
    } catch (error) {
      wasmError = error instanceof Error ? error.message : String(error);
    }

    const outcome = runJob({
      spec: request.spec,
      structure: request.structure,
      projectId: request.projectId,
      ...(kernel ? { energyKernel: kernel.energyForces.bind(kernel) } : {}),
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

    let crossCheck: CrossCheck | undefined;
    let crossCheckError: string | undefined;
    if (
      outcome.job.state === "completed" &&
      outcome.result &&
      request.spec.task_type === "energy.evaluate"
    ) {
      const check = await crossCheckEnergy(request.structure, request.spec, outcome.result);
      crossCheck = check.check;
      crossCheckError = check.error;
    }

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
      crossCheck,
      crossCheckError,
      wasmError,
      error: outcome.error,
    } satisfies WorkerResult);
  } catch (error) {
    scope.postMessage({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    } satisfies WorkerFailure);
  }
}
