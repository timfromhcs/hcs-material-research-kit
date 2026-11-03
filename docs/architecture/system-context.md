# System context and boundaries

```text
┌───────────────────────────── User's machine ─────────────────────────────┐
│                                                                          │
│  Browser studio (apps/web, static Vite build, Vercel-hosted)              │
│   ├── React UI (EN/DE/FR, dark/light)                                     │
│   ├── IndexedDB  → project state, structures, job summaries               │
│   ├── OPFS       → MD trajectories (quota-preflighted, optional)          │
│   └── Web Worker → @hcs-materials/core kernels (float64 CPU)              │
│                                                                          │
│  Local tooling (this repository)                                         │
│   ├── hcs-materials CLI (Python)  → structure IO, archives, reports       │
│   ├── hcs-materials-mcp (stdio)   → 4 read/pure tools + resources         │
│   └── hcs-compute-core (Rust)     → parity-tested CPU kernel              │
└──────────────────────────────────────────────────────────────────────────┘

No simulation request, structure, coordinate or result leaves this box.
```

## Trust boundaries

| Boundary | What crosses it | Control |
|---|---|---|
| User file → parser | CIF/POSCAR/XYZ/JSON text | bounded size, explicit errors, no element guessing |
| Parser → structure model | validated document | JSON Schema + structural checks |
| UI → worker | `SimulationSpec` + `Structure` | schema validation, structure hash match |
| SOLVER → result | numbers + provenance | fidelity label, units, limitations, convergence |
| Archive → workspace | `.hcsproj` zip | checksum verification, path safety, size limits |
| MCP host → server | tool calls | 4 tools, workspace root confinement, no shell |
| Browser → network | **nothing by default** | no telemetry, no backend endpoint |

## Shared vs edition-specific

The browser and a future native edition share: schemas, structure model, file formats, job
lifecycle, result and provenance shapes, report layout. They do **not** share every solver:
DFT, LAMMPS, CALPHAD and ML potentials need native installations. `docs/engines/engine-registry.md`
is the authoritative capability matrix.

## Why the physics is separate from React

`packages/core` has no DOM or React dependency. Everything scientific can be imported in a
worker, in Node and in tests. The React layer formats and presents; it never computes a
scientific quantity on its own.
