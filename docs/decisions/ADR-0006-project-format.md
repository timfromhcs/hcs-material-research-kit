# ADR-0006: `.hcsproj` project format and archive safety

**Status:** accepted · 2026-11-03

## Context

A research project must be portable, verifiable and safe to open. A zip file is the pragmatic
choice: universally supported, inspectable, no database required. Zip archives are also a
classic attack surface (traversal, symlinks, zip bombs).

## Decision

Format version `1.0.0` of a zip container:

```text
manifest.json
project.json
structures/<structure_id>.json
simulations/<job_id>/input.json
simulations/<job_id>/status.json
simulations/<job_id>/result.json
simulations/<job_id>/provenance.json
simulations/<job_id>/logs/run.log
simulations/<job_id>/artifacts/<name>
reports/<job_id>.html
checksums.sha256
```

Safety rules, enforced identically in TypeScript and Python:

- reject absolute paths, drive letters (`C:`), backslashes and any `..` segment;
- reject empty path segments and NUL bytes;
- limit archive entries to 5 000 and uncompressed size to 256 MB (single file 64 MB);
- verify every checksum on read and report mismatches as warnings, never silently;
- never extract automatically to a user directory.

Checksums cover every file except `manifest.json`; the manifest itself records the checksum of
`checksums.sha256`, so a consistent archive is verifiable.

## Consequences

- Partial results are allowed (a job without `result.json`) and are reported as incomplete.
- The format is versioned independently of the application; future migrations must read the
  previous version.
- Model weights and restricted datasets are never embedded by default.

## Verification

- TypeScript: round-trip, tamper detection, traversal rejection (`packages/core/test/project.test.ts`).
- Python: round-trip, tamper detection, traversal rejection (`python/.../tests/test_project_cli.py`).

## Alternatives rejected

- **Single JSON file**: cannot carry trajectories or binary artefacts sensibly.
- **SQLite project**: great for scale, but opaque to users and harder to diff/archive.
