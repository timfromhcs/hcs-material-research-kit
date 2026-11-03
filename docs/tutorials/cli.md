# hcs-sim (Node CLI)

Local simulation runner for the HCS Material Research Kit. It validates a structure and a
`SimulationSpec`, runs the job with the CPU or WASM kernel, and writes a reproducible record.

```bash
# from the repository
npm run build:packages
node packages/cli/dist/index.js inspect tests/fixtures/structures/silicon.cif

node packages/cli/dist/index.js run \
  --structure ar.json \
  --spec spec.json \
  --out ./run-001 \
  --backend auto
```

After `npm install`, the workspace binary is also available as `npx hcs-sim`.

## Commands

| Command | Purpose |
|---|---|
| `inspect <file> [--json]` | Formula, atom count, volume, density, structure hash, validation checks |
| `engines [--planned] [--json]` | Implemented engines; planned engines are listed but never runnable |
| `run --structure <file> --spec <spec.json> [--out <dir>] [--backend auto\|cpu\|wasm]` | Validate and execute one job |

Exit codes: `0` success, `2` usage error, `3` validation or run failure.

## What `run` writes

```text
<out>/
├── status.json       job lifecycle, events, warnings, resource metrics
├── result.json       quantities with units, series, convergence, limitations
├── provenance.json   input hash, structure hash, environment, units, assumptions
├── report.html       standalone reproducibility report
├── run.log           event log
├── trajectory.json   only when requested (MD)
└── structure.cif     only when the task returns a structure (relaxation)
```

The spec's `structure_ref.structure_hash` must match the structure file. A mismatch aborts
before any calculation (`exit 3`).

## Backends

- `auto` (default): use the WASM kernel when the asset loads, otherwise the TypeScript CPU
  kernel with a printed reason.
- `cpu`: always the TypeScript reference.
- `wasm`: fail if the WASM kernel cannot be loaded.

The result's `compute_backend` quantity and the provenance `environment.backend` state which
implementation produced the numbers.

## Example spec

```json
{
  "schema_version": "1.0.0",
  "task_id": "ar-md-1",
  "task_type": "md.run",
  "structure_ref": {
    "structure_id": "struct_example",
    "structure_hash": "<sha256 from `inspect`>"
  },
  "engine_id": "hcs.lj-reference",
  "model_id": "lj.noble-gases.v1",
  "fidelity_level": "classical_model",
  "parameters": { "steps": 200, "timestepPs": 0.002, "temperatureK": 60, "sampleInterval": 10 },
  "thermodynamic_conditions": { "ensemble": "NVE", "temperature": 60 },
  "seed": 2026,
  "requested_outputs": ["energy", "trajectory", "thermo"]
}
```

Only `NVE` is implemented; an `NVT`/`NPT` spec is rejected by the runner. The spec is validated
against the canonical JSON Schema before execution; unsupported engines, tasks or fidelity
levels fail with a specific message instead of running something else.
