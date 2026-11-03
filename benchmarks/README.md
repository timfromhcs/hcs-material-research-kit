# Benchmark policy

A benchmark in this repository is a reproducible measurement, not marketing.

## Rules

1. **Correctness first.** A timing run aborts if the two implementations disagree beyond the
   documented tolerance. No correctness, no numbers.
2. **Record the environment.** CPU model, logical cores, memory, OS, Node version, code commit.
3. **Warm up.** At least three warm-up calls before sampling.
4. **Report dispersion.** Median, minimum, maximum and sample count — not a single run.
5. **State the workload.** Structure, model, cutoff, cell size, steps.
6. **No isolated speed-up claims.** Publish the raw timings (or a link to them) alongside any
   comparison.
7. **Single machine, single thread.** Unless stated otherwise, timings are single-threaded and
   do not generalise to other hardware.

## Running

```bash
npm run build:packages
node benchmarks/lj-benchmark.mjs
```

The script writes `benchmarks/results/latest.json` and prints a table. Re-running on different
hardware is expected; commit the result if you want to compare.

## What is measured

| Workload | Why |
|---|---|
| `energy.evaluate`, 108 and 500 atoms | Per-call cost and the O(N²) scaling of the reference kernel |
| `md.run`, 108 atoms, 100 steps | Per-step cost including buffer copies into WASM memory |
| `structure.relax`, 32 atoms, 200 steps | Repeated force evaluations in the minimiser |

## Interpretation notes

- The WASM path crosses the JS↔WASM boundary on every force evaluation and copies positions,
  parameters and forces. For small cells this overhead can dominate; the benchmark shows that
  honestly instead of hiding it.
- The CPU path is the TypeScript reference. It is the readability and correctness baseline, not
  an optimised production kernel.
- A future optimisation (reusable WASM buffers, batched steps) must be compared with the same
  script and the same correctness gate.
