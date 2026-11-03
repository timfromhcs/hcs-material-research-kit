/**
 * Internal re-export surface used by modules that need hashing/structure
 * helpers without creating import cycles through the package entry point.
 */
export { hashJson, canonicalJson, sha256Hex } from "./hash.js";
export {
  structureHash,
  compositionOf,
  validateStructure,
  cartesianPositions,
  cellVolume,
  formulaFromAmounts,
} from "./structure.js";
