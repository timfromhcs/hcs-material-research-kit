/**
 * 1D heat-equation reference solver (explicit FTCS finite differences).
 *
 *   ∂u/∂t = α ∂²u/∂x²,   x ∈ [0, L],  t ≥ 0
 *   u(0, t) = u_left,  u(L, t) = u_right   (Dirichlet)
 *   u(x, 0) = initial profile
 *
 * Stability: α Δt / Δx² ≤ 0.5 for the explicit scheme. The solver refuses to
 * run above 0.5 instead of producing an oscillating field and calling it a
 * result. The analytic reference case used by the tests is the single Fourier
 * mode u(x,t) = exp(-α π² t / L²) sin(π x / L).
 */

export interface Heat1DOptions {
  length: number;
  /** Thermal diffusivity in m²/s (SI on purpose: this is a continuum model). */
  alpha: number;
  /** Number of grid points including both boundaries (>= 3). */
  nodes: number;
  steps: number;
  /** Timestep in s; if omitted a stable step at 0.4 of the stability limit is chosen. */
  dt?: number;
  left: number;
  right: number;
  initial: (x: number) => number;
  /** Record the field every N steps; default records first and last only. */
  saveInterval?: number;
}

export interface Heat1DResult {
  x: number[];
  times: number[];
  fields: number[][];
  dt: number;
  dx: number;
  courant: number;
  stable: boolean;
  steps: number;
}

export function solveHeat1D(options: Heat1DOptions): Heat1DResult {
  const { length, alpha, nodes, steps } = options;
  if (!(length > 0)) throw new Error("Domain length must be positive");
  if (!(alpha > 0)) throw new Error("Thermal diffusivity must be positive");
  if (!Number.isInteger(nodes) || nodes < 3) throw new Error("nodes must be an integer >= 3");
  if (!Number.isInteger(steps) || steps < 1) throw new Error("steps must be an integer >= 1");

  const dx = length / (nodes - 1);
  const dt = options.dt ?? (0.4 * (dx * dx)) / alpha;
  if (!(dt > 0)) throw new Error("Timestep must be positive");
  const courant = (alpha * dt) / (dx * dx);
  if (courant > 0.5) {
    throw new Error(
      `Explicit scheme is unstable: alpha·dt/dx² = ${courant.toFixed(3)} > 0.5. ` +
        `Reduce dt to <= ${((0.5 * dx * dx) / alpha).toExponential(3)} s or increase nodes.`,
    );
  }

  const x: number[] = [];
  for (let i = 0; i < nodes; i++) x.push(i * dx);

  const current = new Float64Array(nodes);
  for (let i = 0; i < nodes; i++) current[i] = options.initial(x[i]!);
  current[0] = options.left;
  current[nodes - 1] = options.right;

  const saveInterval = options.saveInterval ?? steps;
  const times: number[] = [];
  const fields: number[][] = [];
  const snapshot = (): void => {
    fields.push(Array.from(current));
  };
  times.push(0);
  snapshot();

  const next = new Float64Array(nodes);
  for (let step = 1; step <= steps; step++) {
    next[0] = options.left;
    next[nodes - 1] = options.right;
    for (let i = 1; i < nodes - 1; i++) {
      next[i] = current[i]! + courant * (current[i + 1]! - 2 * current[i]! + current[i - 1]!);
    }
    current.set(next);
    if (step % saveInterval === 0 || step === steps) {
      times.push(step * dt);
      snapshot();
    }
  }

  return {
    x,
    times,
    fields,
    dt,
    dx,
    courant,
    stable: courant <= 0.5,
    steps,
  };
}

/** Analytic single-mode solution used as the numerical reference case. */
export function analyticSineMode(
  x: number,
  t: number,
  length: number,
  alpha: number,
  amplitude = 1,
): number {
  return (
    amplitude *
    Math.exp((-alpha * Math.PI * Math.PI * t) / (length * length)) *
    Math.sin((Math.PI * x) / length)
  );
}

/** Maximum absolute difference between the numeric field and the analytic mode. */
export function maxAbsError(
  field: number[],
  timeS: number,
  options: { length: number; alpha: number; amplitude?: number },
): number {
  let worst = 0;
  const n = field.length;
  for (let i = 0; i < n; i++) {
    const x = (i * options.length) / (n - 1);
    const reference = analyticSineMode(
      x,
      timeS,
      options.length,
      options.alpha,
      options.amplitude ?? 1,
    );
    worst = Math.max(worst, Math.abs(field[i]! - reference));
  }
  return worst;
}
