# ADR-0001: JSON Schema as the single contract

**Status:** accepted · 2026-11-03

## Context

Structures, simulation specs, job records, results and provenance are consumed by TypeScript
(browser and packages), Rust (kernels) and Python (CLI, MCP). Maintaining three hand-written
models guarantees drift, and drift in a scientific tool means silently different results.

## Decision

`/schemas/*.schema.json` is the only definition. `packages/contracts` embeds the schemas at
build time (generated module) and validates with Ajv 2020-12. The Python package ships the same
files and validates with `jsonschema`. Hand-written TypeScript interfaces mirror the schema and
are checked by tests that validate real documents.

## Consequences

- Changing a contract requires regenerating the embedded copy (`node scripts/sync-schemas.mjs`,
  `python scripts/sync-python-schemas.py`) and updating fixtures.
- A schema change is a versioned event; `schema_version` is part of every document.
- We accept a small duplication between JSON Schema and TypeScript interfaces because full
  code generation adds a build dependency that is not justified yet. A test validates
  representative documents against both.

## Alternatives rejected

- **Pydantic as source of truth**: excludes Rust and TypeScript.
- **Protobuf/FlatBuffers**: excellent for binary transport, poor for human-readable research
  records that users inspect and archive.
- **Generated types via `json-schema-to-typescript`**: deferred; revisit when the schemas
  stabilise.
