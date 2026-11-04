# ADR-0011 — Langevin NVT instead of a velocity rescale

**Status:** accepted (2026-11-04)
**Context:** v0.2.0 refused NVT because no thermostat existed. A thermostat that merely rescales
velocities (Berendsen / "velocity scaling") does not sample the canonical ensemble, and calling
its output "NVT" would be a false claim.

## Decision

Implement the **BAOAB splitting of Langevin dynamics** (Leimkuhler & Matthews, _Applied
Mathematics Research eXpress_ 2013) in the reference MD kernel:

```text
B(dt/2)  v += (dt/2) F/m
A(dt/2)  x += (dt/2) v
O(dt)    v ← c₁ v + √(k_B T (1 − c₁²)/m) ξ,   c₁ = exp(−γ dt)
A(dt/2)  x += (dt/2) v
B(dt/2)  v += (dt/2) F/m
```

Properties that made this the choice:

- the O step is the exact solution of the Ornstein–Uhlenbeck equation, so the stationary
  distribution is Maxwell–Boltzmann at the target temperature;
- it is symplectic in the deterministic limit and has a documented weak second-order accuracy;
- it is time-reversible in the deterministic part, which keeps the checkpoint/resume property
  testable;
- no barostat is implied, so NPT can still be refused honestly.

## Consequences

- The random draw is **counter-based**: step _n_ draws from a stream seeded by `(seed, n)`.
  A resumed run therefore reproduces the continuous run bit for bit, which a wall-clock or
  stream-continuation RNG would not.
- The degrees of freedom are `3N` for NVT (Langevin does not conserve momentum) and `3N − 3`
  for NVE. The temperature series uses the ensemble's own count.
- NVT does not claim energy conservation. The result's convergence criterion is the mean
  temperature within 10 % of the target; an NVE drift warning is not emitted for NVT.
- NPT remains refused with `unsupported_ensemble`, naming the missing barostat.
- The UI exposes ensemble, target temperature and friction, and shows the realised mean
  temperature as a result.

## Alternatives rejected

| Alternative                  | Why not                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Berendsen weak coupling      | Does not sample the canonical distribution; the temperature is not a thermodynamic result.    |
| Nosé–Hoover chains           | Correct, but more state (chain variables) and harder to make bit-reproducible across resumes. |
| Velocity rescaling each step | Removes the physical fluctuations and produces a non-canonical ensemble.                      |
| Andersen collisions          | Valid, but a stochastic collision rate is harder to explain than a friction.                  |
