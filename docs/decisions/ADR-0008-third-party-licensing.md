# ADR-0008: Third-party licensing and model parameters

**Status:** accepted · 2026-11-03

## Context

The research brief mixes code licenses, model-weight licenses, training-data terms and
redistribution constraints. Treating "the repository is MIT" as covering a downloaded
checkpoint or a tabulated potential would be a licensing error with scientific consequences.

## Decision

- HCS code is MIT.
- Every engine record carries a `license` field that distinguishes code from parameters,
  weights and data.
- Model parameters ship only with a reference note and a stated domain; unsupported elements
  are refused rather than filled with guessed values.
- No third-party weights, datasets or executables are bundled in this release.
- Adding an engine requires: official repository, license audit per artefact, model card,
  supported domain, checkpoint hash, platform matrix and a reproducible example.

## Consequences

- Optional engines will be installed by an engine manager with explicit license acceptance and
  disk-space estimates — not as base dependencies.
- Benchmarks and datasets (for example Matbench Discovery) will be optional downloads with
  attribution, not repository content.
- The Lennard-Jones parameters in this build are documented as literature estimates with an
  explicit "not transferable" limitation.

## Verification

- `docs/engines/engine-registry.md` lists every engine, its state and its license note.
- The UI renders `known_limits` and the parameter reference in Data & Provenance.
