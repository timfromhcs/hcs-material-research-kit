# Documentation index

| Area | Document |
|---|---|
| Product overview | [`../README.md`](../README.md) |
| Current state | [`../STATUS.md`](../STATUS.md) |
| Phases and gates | [`../ROADMAP.md`](../ROADMAP.md) |
| Science: Lennard-Jones reference | [`science/lennard-jones-reference.md`](science/lennard-jones-reference.md) |
| Science: 1D heat equation | [`science/heat-equation-reference.md`](science/heat-equation-reference.md) |
| Science: fidelity labels | [`science/fidelity-levels.md`](science/fidelity-levels.md) |
| Science: units and conventions | [`science/units-and-conventions.md`](science/units-and-conventions.md) |
| Architecture: system context | [`architecture/system-context.md`](architecture/system-context.md) |
| Architecture: job lifecycle | [`architecture/job-lifecycle.md`](architecture/job-lifecycle.md) |
| Architecture: browser runtime | [`architecture/browser-runtime.md`](architecture/browser-runtime.md) |
| Engines and capability matrix | [`engines/engine-registry.md`](engines/engine-registry.md) |
| Security and privacy | [`security/threat-model.md`](security/threat-model.md) |
| Benchmarks | [`../benchmarks/README.md`](../benchmarks/README.md) |
| Tutorial | [`tutorials/first-calculation.md`](tutorials/first-calculation.md) |
| CLI tutorial | [`tutorials/cli.md`](tutorials/cli.md) |
| Research baseline and verification | [`research/baseline.md`](research/baseline.md) |

## Architecture decision records

| ADR | Decision |
|---|---|
| [0001](decisions/ADR-0001-json-schema-contract.md) | JSON Schema as the single contract |
| [0002](decisions/ADR-0002-browser-execution-profile.md) | Browser execution profile (worker, CPU float64) |
| [0003](decisions/ADR-0003-job-cancellation.md) | Job cancellation semantics |
| [0004](decisions/ADR-0004-design-system.md) | Hand-written CSS design system |
| [0005](decisions/ADR-0005-switched-pair-potential.md) | Cubically switched pair potential |
| [0006](decisions/ADR-0006-project-format.md) | `.hcsproj` format and archive safety |
| [0007](decisions/ADR-0007-mcp-surface.md) | MCP surface limited to implemented tools |
| [0008](decisions/ADR-0008-third-party-licensing.md) | Third-party licensing and model parameters |
| [0009](decisions/ADR-0009-honest-failure-modes.md) | Honest failure instead of silent clamping |
| [0010](decisions/ADR-0010-wasm-abi.md) | WASM kernel ABI without wasm-bindgen |

## Documentation rules

1. Do not describe an unimplemented capability as available. Use `ROADMAP.md` for planned work.
2. Every numerical claim links to the test or fixture that demonstrates it.
3. Every model document states equations, units, assumptions, parameters, domain and limits.
4. Documentation changes ship with the code change they describe.
