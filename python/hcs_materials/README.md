# hcs-materials (Python)

Local-first structure validation, portable `.hcsproj` archives and MCP tools for the
**HCS Material Research Kit**.

> Made with love by hcsmedia and timfromhcs.

## What this package is, and is not

It **is**:

- a strict reader/writer for CIF (crystallographic subset), POSCAR/CONTCAR, XYZ/extXYZ
  and HCS JSON;
- a periodic-cell validator with explicit, inspectable checks;
- a portable project-archive implementation with checksums and path-traversal protection;
- a CLI that reports honestly what it can and cannot do;
- an MCP stdio server exposing only implemented tools.

It **is not** a simulation engine. The Lennard-Jones and heat-equation reference
kernels live in the TypeScript (`@hcs-materials/core`) and Rust (`hcs-compute-core`)
packages of this repository. No Python command produces scientific results in this
release, and none pretends to.

## Install (development)

```bash
cd python/hcs_materials
python scripts/../../scripts/sync-python-schemas.py  # copies /schemas into the package
uv venv && uv pip install -e ".[dev]"
.venv/Scripts/python -m pytest      # Windows
.venv/bin/python -m pytest          # Linux/macOS
```

## CLI

```bash
hcs-materials --json doctor
hcs-materials hardware
hcs-materials engines list --planned
hcs-materials engines inspect hcs.lj-reference
hcs-materials structure validate tests/fixtures/structures/silicon.cif
hcs-materials structure convert input.cif output.poscar
hcs-materials project create ./my-project --name "My project"
hcs-materials project validate ./my-project.hcsproj
hcs-materials report build ./my-project.hcsproj --out ./hcs-report
```

Exit codes: `0` success, `2` usage error, `3` validation/integrity failure,
`4` unsupported or unavailable capability. Every command supports `--json`.

## MCP server

```bash
pip install "hcs-materials[mcp]"
hcs-materials-mcp --root ./projects
```

Exposed tools: `engines_list`, `structures_validate`, `structures_convert`,
`project_validate`. Resources: `hcs://engine-registry`,
`hcs://science/fidelity-levels`. Prompts: `review_simulation_methodology`,
`diagnose_convergence_failure`. All project paths are confined to `--root`, and
there is no shell or arbitrary-Python tool.

## Scientific integrity

- Units are always explicit (angstrom, eV, u, ps, K).
- Unknown element symbols are reported, never guessed.
- A POSCAR without a species line becomes `X1`, `X2`, … with a warning.
- A CIF that names a space group without symmetry operations is read as P1 **and
  flagged**; HCS does not silently expand space groups.
- Validation never converts a warning into a success.

See `docs/science/` for the model documentation and `STATUS.md` for what is
implemented today.
