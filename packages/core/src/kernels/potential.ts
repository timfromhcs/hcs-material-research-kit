/**
 * Potential-model registry and dispatcher.
 *
 * HCS has more than one classical potential. The job layer must not care which
 * one produced a number, but it must be impossible to hand a silicon model to
 * the Lennard-Jones kernel (or a WASM kernel built for Lennard-Jones) and get a
 * plausible-looking answer. This module is the single place where a model id
 * becomes a concrete kernel.
 */

import type { Structure } from "../types.js";
import { baseSymbol } from "../elements.js";
import {
  computeEnergyForces,
  LJ_MODELS,
  type EnergyForces,
  type LJEvaluationOptions,
  type LJModel,
} from "./lj.js";
import { computeSwEnergyForces, SW_MODELS, type SWEvaluationOptions, type SWModel } from "./sw.js";
import type { EnergyForcesKernel } from "./relax.js";

export type PotentialModel = LJModel | SWModel;
export type PotentialEvaluationOptions = LJEvaluationOptions & SWEvaluationOptions;

export function isLJModel(model: PotentialModel): model is LJModel {
  return model.kind === "lj";
}

export function isSWModel(model: PotentialModel): model is SWModel {
  return model.kind === "sw";
}

/** All model ids known to this build. */
export function listModelIds(): string[] {
  return [...Object.keys(LJ_MODELS), ...Object.keys(SW_MODELS)];
}

export function getPotentialModel(id: string): PotentialModel {
  const lj = LJ_MODELS[id];
  if (lj) return lj;
  const sw = SW_MODELS[id];
  if (sw) return sw;
  throw new Error(`Unknown potential model '${id}'. Available: ${listModelIds().join(", ")}`);
}

export function getPotentialModelForEngine(engineId: string, modelId?: string): PotentialModel {
  if (modelId) return getPotentialModel(modelId);
  if (engineId === "hcs.sw-silicon") return getPotentialModel("sw.silicon.v1");
  return getPotentialModel("lj.noble-gases.v1");
}

/** Elements a model can actually evaluate, in registry order. */
export function supportedElements(model: PotentialModel): string[] {
  return isLJModel(model) ? Object.keys(model.species) : [...model.elements];
}

/** Elements in the structure that the model has no parameters for. */
export function missingElements(model: PotentialModel, structure: Structure): string[] {
  const allowed = new Set(supportedElements(model));
  const missing = new Set<string>();
  for (const site of structure.sites) {
    const symbol = baseSymbol(site.species);
    if (!allowed.has(symbol)) missing.add(symbol);
  }
  return [...missing].sort();
}

/**
 * Evaluates energy and forces with the CPU reference kernel for the model's
 * own potential. The dispatch is explicit so a new model cannot silently run
 * through the wrong physics.
 */
export function evaluatePotential(
  structure: Structure,
  model: PotentialModel,
  options: PotentialEvaluationOptions = {},
): EnergyForces {
  if (isLJModel(model)) return computeEnergyForces(structure, model, options);
  return computeSwEnergyForces(structure, model, options);
}

export type { EnergyForces, LJModel, SWModel };

/**
 * Adapts a Lennard-Jones-only accelerator (the WASM kernel) to the generic
 * kernel contract. It refuses a many-body model loudly instead of evaluating
 * silicon with pair physics.
 */
export function asLennardJonesKernel(
  kernel: (structure: Structure, model: LJModel, options?: LJEvaluationOptions) => EnergyForces,
): EnergyForcesKernel {
  return (structure, model, options) => {
    if (!isLJModel(model)) {
      throw new Error(
        `This kernel implements Lennard-Jones only; model '${model.id}' cannot run on it. ` +
          "Use the CPU reference kernel for many-body potentials.",
      );
    }
    return kernel(structure, model, options);
  };
}
