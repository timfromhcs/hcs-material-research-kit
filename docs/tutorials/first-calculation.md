# Tutorial: your first reproducible calculation

This walkthrough produces a real, exported research record. It takes about five minutes and
runs entirely in your browser.

## 1. Open the studio

```bash
npm install
npm run build
npm run dev        # http://localhost:5173
```

Choose the interface language (EN/DE/FR) in the top bar; both themes are available in Settings.

## 2. Create a structure

On the Dashboard, click **Argon (fcc, LJ reference)**. This builds a 3×3×3 fcc cell with
`a = 5.26 Å` (108 atoms). The supercell matters: a single conventional cell is smaller than
twice the pair cutoff, so the engine would have no interactions to evaluate.

Alternatively open **Structure Studio** and:

- pick a prototype (`diamond`, `rocksalt`, `perovskite`, …), lattice parameter and species;
- import a CIF/POSCAR/XYZ file, or drop it on the page;
- build a supercell, substitute a species, create a vacancy, add or move an atom.

Every edit re-runs validation. Read the checks — warnings are information, not decoration.

## 3. Run a calculation

Open **Simulation Workbench**:

1. Select the structure.
2. Choose a task. Start with **Single-point energy and forces**.
3. The model is fixed to the documented Lennard-Jones reference set. If your structure
   contains an element outside He/Ne/Ar/Kr/Xe, the run is disabled and explains why.
4. Press **Run calculation**.

The job runs in a Web Worker; progress and phase are shown. **Cancel** terminates the worker
and records a cancelled job without a result.

## 4. Read the result honestly

The result panel shows:

- **Fidelity** (`Classical model`) and method id;
- **Convergence**: converged or not, with the exact criterion and threshold;
- **Quantities** with units (energy in eV, forces in eV/Å, cutoff in Å);
- **Plots** with axes and units, plus a data table for screen readers;
- **Job warnings** such as `lj.cutoff_reduced` when the cell is too small for the requested
  cutoff;
- **Limitations**: the list of things this model cannot tell you.

A convergence badge means the stated criterion was met, not that the model is right.

## 5. Try molecular dynamics

Select **NVE molecular dynamics**, keep 200 steps, 2 fs, 60 K, and enable the trajectory.

- Total energy is conserved to ~10⁻⁷ eV/atom on this cell; the value is reported.
- Temperature oscillates because kinetic and potential energy exchange. A short run does not
  establish an equilibrated temperature, and the result says so.
- NVT/NPT is refused: no thermostat exists in this build.

Press **Compute MSD from trajectory** to fit the mean-square displacement. If the slope is not
positive, HCS reports no diffusion coefficient instead of inventing one.

## 6. Export and reproduce

- **Download reproducibility report** gives a self-contained HTML file with method, equations,
  parameters, hashes, units, convergence, warnings and limitations.
- **Dashboard → Export project** writes a `.hcsproj` including structures, job inputs, results,
  provenance and per-job reports plus checksums.
- Import that archive later (Dashboard or Data & Provenance). The app verifies every checksum
  and reports any mismatch. A tampered file is detected, not silently accepted.

Reproduce the run by re-importing the archive and re-running the same spec; the input hash and
structure hash in the report must match.

## 7. Continue

`STATUS.md` lists what is implemented. `docs/engines/engine-registry.md` lists what is not —
and how an engine has to be validated before it appears.
