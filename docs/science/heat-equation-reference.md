# 1D heat / diffusion reference solver

**Engine id:** `hcs.heat1d-reference` · **Model id:** `heat1d.ftcs.v1` ·
**Fidelity:** `continuum_model`

## Equations

```text
∂u/∂t = α ∂²u/∂x²,        x ∈ [0, L]
u(0, t) = u_left,          u(L, t) = u_right        (Dirichlet)
u(x, 0) = initial profile
```

Discretisation: explicit forward-time centred-space (FTCS)

```text
u_i^{n+1} = u_i^n + (α Δt / Δx²) (u_{i+1}^n − 2u_i^n + u_{i−1}^n)
```

Stability requires `α Δt / Δx² ≤ 0.5`. The solver **refuses** larger timesteps instead of
returning an oscillating field. Default timestep is `0.4 Δx² / α`.

## Units

SI on purpose: `x` in m, `t` in s, `α` in m²/s, field in K (temperature) or mol/m³
(concentration). The atomistic engines use eV/Å/u/ps — the two unit systems are never mixed
in one record.

## Verification

Analytic single Fourier mode with `u(x,0) = A sin(πx/L)`:

```text
u(x,t) = A exp(−α π² t / L²) sin(π x / L)
```

The test runs 200 steps on a 51-node grid and compares the final field:

- max absolute error < 5e-4 (observed ~2e-5);
- Dirichlet boundaries remain fixed;
- linear steady state between 0 and 100 K reached within 0.5 K after a long run;
- invalid inputs (non-positive length, zero diffusivity, fewer than 3 nodes) throw;
- Courant number > 0.5 throws with the allowed timestep in the message.

## Known limitations

- 1D, single scalar field, constant diffusivity, no source term.
- Dirichlet boundaries only.
- First-order in time, second-order in space.
- Not a materials-specific prediction: the user supplies α and the geometry.

## Why it exists

It gives the project an analytically verifiable continuum workflow, so the job/result/
provenance machinery is exercised on a second, independent numerical method.
