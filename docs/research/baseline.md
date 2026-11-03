# Research baseline

The two governing documents are kept at the repository root:

- `HCS-Material-Research-Kit-AGENTS.md` — operating contract, architecture, phases and gates.
- `HCS-Material-Research-Kit-RESEARCH.md` — landscape, engines, databases, browser constraints.

This file records what was **verified in this workspace** versus what remains an unverified
claim from the brief. That distinction matters: the brief itself asks for verification before
implementation.

## Verified during this build

| Item | How | Result |
|---|---|---|
| MCP Python SDK v2 exists and is current | `pypi.org/pypi/mcp/json` → 2.3.0, requires Python ≥3.10 | used for the server; official client used in tests |
| MCP server API surface (`MCPServer`, decorators) | installed package introspection | `create_server` builds tools/resources/prompts |
| MCP client can run a server in-process | `python/.../tests/test_mcp.py` | 6 tests pass |
| Node 22, npm 10, Rust 1.96, Python 3.14 availability | local toolchain inspection | used for the build |
| Ajv 2020-12 supports the schemas | build + validation tests | passes with `ajv/dist/2020` |
| fflate can write/read `.hcsproj` zips | tests | round-trip, tamper detection |
| Vite 6 builds worker + three.js bundle | production build | succeeds |

## Not verified here (do not claim)

- Package name availability for `hcs-materials` (PyPI) and `@hcs-materials/*` (npm).
- Trademark or domain availability for the product name.
- Current upstream details of Quantum ESPRESSO, CP2K, LAMMPS, MACE, MatterSim, MatGL,
  CHGNet, ORB, pycalphad, MOOSE, FiPy, OpenPhase, OPTIMADE providers, Materials Project API,
  OQMD, AFLOW, Materials Cloud, NOMAD — no connector or adapter exists yet, so no claim is made.
- The MADE (ICML 2026), MatToolBench and Matbench Discovery statements in the brief; they are
  recorded as research context, not as verified local evidence.
- Vercel function limits or deployment behaviour from this workspace (no deployment performed).
- Tauri 2 installer behaviour (no Tauri app exists yet).

## Engine selection stance

The brief's guidance is followed: integrate mature engines rather than forking them, keep them
optional, and never let a browser claim parity with a native DFT code. This build therefore
implements exactly one classical atomistic model and one continuum reference model, both
analytically verifiable, and refuses to expose anything else.

## Open scientific questions to resolve before broadening scope

1. Which ML potential family gives a defensible element/domain matrix for the first plugin, and
   under which weight license?
2. Which reference hull and energy corrections are compatible with a chosen screening metric?
3. How should uncertainty be reported when a model provides none (currently: no number rather
   than a fabricated interval)?
4. Which validation fixtures can be redistributed, and under which license?
5. What is the smallest honest browser subset of phase-field/thermodynamics work?

These are recorded so that future phases start from questions, not assumptions.
