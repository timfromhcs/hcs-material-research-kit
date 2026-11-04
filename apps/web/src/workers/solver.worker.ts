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
  asLennardJonesKernel,
  computeEnergyForces,
  getPotentialModel,
  isLJModel,
  runJob,
  type EnergyForces,
  type EnergyForcesKernel,
  type JobRecord,
  type ProvenanceRecord,
  type ResultBundle,
  type SimulationSpec,
  type Structure,
} from "@hcs-materials/core";
import { instantiateWasmKernel, type WasmKernel } from "@hcs-materials/wasm";
import { createWebGpuKernel, type WebGpuKernel } from "@hcs-materials/webgpu";
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
  backend: "wasm" | "webgpu";
  tolerance: number;
  maxDeltaEnergyEv: number;
  maxDeltaForceEvPerA: number;
  referenceEnergyEv: number;
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
  webgpuError?: string;
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
  accelerated?: EnergyForces,
): Promise<{ check?: CrossCheck; error?: string }> {
  try {
    const model = getPotentialModel(spec.model_id ?? "lj.noble-gases.v1");
    if (!isLJModel(model)) {
      return {};
    }
    const cutoffQuantity = result.quantities.find((quantity) => quantity.name === "cutoff");
    const cutoff = typeof cutoffQuantity?.value === "number" ? cutoffQuantity.value : model.cutoff;
    const cpu = computeEnergyForces(structure, model, { cutoff });

    let reference: EnergyForces;
    let backend: "wasm" | "webgpu";
    let tolerance: number;
    if (accelerated) {
      reference = accelerated;
      backend = "webgpu";
      // f32 GPU arithmetic: documented, tested tolerance, not bit equality.
      tolerance = 1e-3;
    } else {
      const kernel = await wasmKernel();
      reference = kernel.energyForces(structure, model, { cutoff });
      backend = "wasm";
      tolerance = 1e-8;
    }

    let maxDeltaForce = 0;
    for (let i = 0; i < cpu.forces.length; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const delta = Math.abs(cpu.forces[i]![axis]! - reference.forces[i]![axis]!);
        if (delta > maxDeltaForce) maxDeltaForce = delta;
      }
    }
    const maxDeltaEnergy = Math.abs(cpu.energy - reference.energy);
    const forceTolerance = backend === "webgpu" ? 1e-2 : tolerance;
    return {
      check: {
        backend,
        tolerance,
        maxDeltaEnergyEv: maxDeltaEnergy,
        maxDeltaForceEvPerA: maxDeltaForce,
        referenceEnergyEv: reference.energy,
        pairCount: reference.pairCount,
        passed: maxDeltaEnergy <= tolerance && maxDeltaForce <= forceTolerance,
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
    let kernel: WasmKernel | null = null;
    let wasmError: string | undefined;
    let gpuKernel: WebGpuKernel | null = null;
    let webgpuError: string | undefined;
    let gpuResult: EnergyForces | undefined;

    const requestedBackend = request.spec.compute_policy?.backend ?? "auto";
    const wantsGpu =
      request.spec.task_type === "energy.evaluate" &&
      (requestedBackend === "auto" || requestedBackend === "webgpu");

    if (wantsGpu) {
      try {
        const model = getPotentialModel(request.spec.model_id ?? "lj.noble-gases.v1");
        if (isLJModel(model)) {
          gpuKernel = await createWebGpuKernel();
          const cutoffParam = request.spec.parameters.cutoff;
          gpuResult = await gpuKernel.energyForces(
            request.structure,
            model,
            typeof cutoffParam === "number" ? { cutoff: cutoffParam } : {},
          );
        }
      } catch (error) {
        if (requestedBackend === "webgpu") {
          webgpuError = error instanceof Error ? error.message : String(error);
        }
        gpuKernel?.dispose();
        gpuKernel = null;
        gpuResult = undefined;
      }
    }

    if (requestedBackend === "webgpu" && !gpuResult) {
      scope.postMessage({
        type: "error",
        requestId: request.requestId,
        message: `WebGPU was requested but is unavailable: ${webgpuError ?? "no result"}`,
      } satisfies WorkerFailure);
      return;
    }

    // WASM is the fallback and the second implementation for the cross-check.
    if (!gpuResult) {
      try {
        kernel = await wasmKernel();
      } catch (error) {
        wasmError = error instanceof Error ? error.message : String(error);
      }
    }

    const precomputedKernel: EnergyForcesKernel | undefined = gpuResult
      ? (candidate) => {
          if (candidate.structure_id !== request.structure.structure_id) {
            throw new Error(
              "A WebGPU single-point result is only valid for the submitted structure",
            );
          }
          return gpuResult!;
        }
      : undefined;

    const outcome = runJob({
      spec: request.spec,
      structure: request.structure,
      projectId: request.projectId,
      ...(precomputedKernel
        ? { energyKernel: precomputedKernel }
        : kernel
          ? { energyKernel: asLennardJonesKernel(kernel.energyForces.bind(kernel)) }
          : {}),
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
      const check = await crossCheckEnergy(
        request.structure,
        request.spec,
        outcome.result,
        gpuResult,
      );
      crossCheck = check.check;
      crossCheckError = check.error;
    }
    gpuKernel?.dispose();

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
      webgpuError,
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
