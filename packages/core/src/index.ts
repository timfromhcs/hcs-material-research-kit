/**
 * @hcs-materials/core — public API.
 *
 * Pure TypeScript: no DOM or Node dependency is required by any exported
 * kernel, so the same code runs in the browser, in workers and in Node.
 */

export * from "./types.js";
export * from "./linalg.js";
export * from "./elements.js";
export * from "./units.js";
export * from "./hash.js";
export * from "./structure.js";
export * from "./build.js";
export * from "./engines.js";
export * from "./capabilities.js";
export * from "./report.js";
export * from "./project.js";

export * from "./io/index.js";
export * from "./kernels/lj.js";
export * from "./kernels/sw.js";
export * from "./kernels/potential.js";
export * from "./kernels/relax.js";
export * from "./kernels/md.js";
export * from "./kernels/analysis.js";
export * from "./kernels/heat1d.js";

export * from "./jobs/state.js";
export * from "./jobs/provenance.js";
export * from "./jobs/runner.js";
export * from "./jobs/continuum.js";

export { validate as validateContract, isValid as isValidContract } from "@hcs-materials/contracts";
