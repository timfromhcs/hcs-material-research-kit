# ADR-0007: MCP surface limited to implemented tools

**Status:** accepted · 2026-11-03

## Context

MCP hosts will call whatever the server advertises. Advertising a simulation tool before the
job API is stable, quota-controlled and approval-gated would let an agent start unattended
compute — exactly what the operating contract forbids.

## Decision

The MCP server exposes only operations that are implemented, tested and side-effect bounded:

| Tool                        | Effect                                                                      |
| --------------------------- | --------------------------------------------------------------------------- |
| `engines_list`              | read-only                                                                   |
| `structures_validate`       | pure function, no filesystem                                                |
| `structures_convert`        | pure function, returns text                                                 |
| `project_validate`          | reads one archive inside the configured root                                |
| `simulations_validate_spec` | validates spec + structure against registry/rules; starts nothing           |
| `results_summarize`         | reads recorded quantities/provenance from an archive in the configured root |

Resources: `hcs://engine-registry`, `hcs://science/fidelity-levels`.
Prompts: `review_simulation_methodology`, `diagnose_convergence_failure`.

There is **no** shell tool, no arbitrary Python tool, no file write tool and no simulation tool
in this release. Project paths are resolved against `--root` and rejected if they escape it.
Transport is stdio only; loopback HTTP is not implemented and therefore not offered.

`simulations_validate_spec` performs no computation: it checks engine availability, supported
task, declared fidelity, supported elements, structure validation and the structure hash, and
returns every blocking issue so an agent can correct the input. `results_summarize` is read-only
and reports missing fields as missing.

## Consequences

- Agents can inspect and validate but cannot consume compute yet. This is intentional.
- When simulation tools are added they need: job ids, progress resources, cancellation,
  per-job limits, explicit approval for expensive runs and an audit log.
- Tool names use snake_case because the SDK derives them from function names; the documentation
  maps them to the dotted domain names used elsewhere.

## Verification

`python/hcs_materials/tests/test_mcp.py` connects with the official `mcp` v2 client in-process,
lists tools, calls each implemented tool, reads a resource and checks workspace confinement.

## Alternatives rejected

- **Expose `simulations.run` now**: no approval gate, no resource limits, no audit trail.
- **Generic `run_command`**: violates the operating contract outright.
