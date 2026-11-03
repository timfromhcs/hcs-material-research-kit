# ADR-0002: Browser execution profile

**Status:** accepted · 2026-11-03

## Context

The web edition must run real computations locally, without a server backend, and must stay
honest about what a browser can and cannot do.

## Decision

- All computation runs in a dedicated Web Worker (`solver.worker.ts`) created per job.
- The kernels are pure TypeScript with `float64`, executed on the CPU. No WebGPU/WGSL kernel is
  claimed because none has been written and parity-tested.
- WebGPU is probed and reported (`detectHardware`) but the UI states that kernels use the CPU
  path. The 3D viewer uses Three.js `WebGLRenderer`; a WebGPU renderer is not implemented.
- The static Vite build is deployed to Vercel; there is no server-side simulation endpoint.
- Long inputs are transferred by structured clone; no attempt is made to share memory yet.

## Consequences

- Browser performance is CPU-bound and O(N²) for the pair loop; the UI limits atom counts
  (20 000 for supercells, 5 000 for MD) and says so.
- The capability matrix is truthful: the browser can run the classical reference engines, not
  DFT or external MD packages.
- When WASM and WebGPU kernels are added, they must land with parity tests against this CPU
  reference and a declared tolerance, plus a device-loss fallback.

## Alternatives rejected

- **Server-side simulation on Vercel Functions**: violates local-first privacy and the
  documented function limits.
- **Pyodide-only browser compute**: large download, and no guarantee that scientific Python
  dependencies work, so it cannot be the primary path.
