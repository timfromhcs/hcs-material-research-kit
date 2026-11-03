# ADR-0009: Honest failure instead of silent clamping

**Status:** accepted · 2026-11-03

## Context

Two failure modes appeared during development that looked like results:

1. A pair cutoff larger than the minimum-image radius silently counted interactions with the
   wrong periodic image.
2. A cell with four atoms and a clamped 2.63 Å cutoff had **no** interacting pair, so every
   energy was exactly `0`.

Both are more dangerous than an error message, because the numbers look plausible.

## Decision

- The cutoff is clamped to the largest radius the cell supports — half the smallest
  inter-planar spacing, `0.5 · min(V/|a_j × a_k|)` — and the used value is recorded in the
  result. When clamping occurs the job carries a `lj.cutoff_reduced` warning.
- If the effective cutoff reaches **no** pair, the job fails with `lj.no_interactions` and
  guidance to build a supercell.
- If the effective cutoff is below 0.9 Å, the job fails rather than evaluating a meaningless
  sum.
- Average and per-atom quantities are always reported with units; nothing is unitless by
  omission.

## Consequences

- The quick-start "Argon" builds a 3×3×3 supercell so the default workflow has real
  interactions.
- Users of very small cells get an explanation instead of a zero.
- The clamp is visible in provenance (`cutoff` quantity) and in job warnings, so a reviewer can
  see it without reading the source.

## Verification

- `packages/core/test/jobs.test.ts::refuses a cell in which the model has no interactions`
- `packages/core/test/lj.test.ts` (cutoff and cohesive-energy bracket)
- `crates/compute-core` `rejects_a_cell_that_is_too_small`
