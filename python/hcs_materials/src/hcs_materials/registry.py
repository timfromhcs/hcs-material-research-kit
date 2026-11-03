"""Engine registry — a faithful mirror of the TypeScript registry.

An engine is listed here only when it is implemented. Planned engines are
listed separately with ``status="not_implemented"`` and must never be offered
as runnable by a UI or an MCP host.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from . import __version__

SCHEMA_VERSION = "1.0.0"


@dataclass(frozen=True)
class ValidationCase:
    id: str
    description: str
    status: str
    tolerance: str | None = None


@dataclass(frozen=True)
class EngineRecord:
    engine_id: str
    name: str
    version: str
    provider: str
    license: str
    supported_tasks: list[str]
    supported_elements: list[str]
    execution_backends: list[str]
    installation_state: str
    known_limits: list[str]
    validation_cases: list[ValidationCase] = field(default_factory=list)
    platforms: list[str] = field(default_factory=lambda: ["windows", "linux", "macos", "browser"])
    precision_modes: list[str] = field(default_factory=lambda: ["float64"])
    fidelity_levels: list[str] = field(default_factory=list)
    model_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["schema_version"] = SCHEMA_VERSION
        return data


ENGINE_REGISTRY: list[EngineRecord] = [
    EngineRecord(
        engine_id="hcs.lj-reference",
        name="HCS Lennard-Jones reference engine",
        version=__version__,
        provider="HCS (hcsmedia and timfromhcs)",
        license="MIT (HCS code); parameters are literature estimates",
        supported_tasks=["energy.evaluate", "structure.relax", "md.run", "analysis.rdf"],
        supported_elements=["He", "Ne", "Ar", "Kr", "Xe"],
        execution_backends=["cpu", "wasm"],
        installation_state="builtin",
        known_limits=[
            "Pairwise Lennard-Jones only; no electrostatics, many-body or quantum effects.",
            "Parameters exist only for the noble gases at this revision.",
            "NVE only: no thermostat is implemented, so NVT/NPT is rejected.",
            "Not valid for predicting real engineering-material properties.",
        ],
        validation_cases=[
            ValidationCase(
                "lj.force-vs-gradient",
                "Forces equal the negative numerical energy gradient.",
                "passing",
                "relative deviation < 1e-5",
            ),
            ValidationCase(
                "lj.cross-language-parity",
                "TypeScript and Rust kernels agree within 1e-10 eV.",
                "passing",
                "abs < 1e-10 eV",
            ),
        ],
        fidelity_levels=["classical_model"],
        model_ids=["lj.noble-gases.v1"],
    ),
    EngineRecord(
        engine_id="hcs.heat1d-reference",
        name="HCS 1D heat/diffusion reference solver",
        version=__version__,
        provider="HCS (hcsmedia and timfromhcs)",
        license="MIT",
        supported_tasks=["continuum.heat_1d", "continuum.diffusion_1d"],
        supported_elements=[],
        execution_backends=["cpu", "wasm"],
        installation_state="builtin",
        known_limits=[
            "1D, single scalar field, constant diffusivity.",
            "Explicit FTCS only; unstable above alpha·dt/dx² = 0.5.",
        ],
        validation_cases=[
            ValidationCase(
                "heat1d.sine-mode",
                "Against the analytic decay of the lowest Fourier mode.",
                "passing",
                "max abs error < 5e-4",
            )
        ],
        fidelity_levels=["continuum_model"],
        model_ids=["heat1d.ftcs.v1"],
    ),
]


PLANNED_ENGINES: list[dict[str, Any]] = [
    {
        "engine_id": "ase",
        "name": "ASE bridge",
        "provider": "ASE developers",
        "planned_tasks": ["structure.validate", "structure.relax", "energy.evaluate"],
        "status": "not_implemented",
        "note": "Native Python bridge; requires optional ASE extra and an adapter test suite.",
    },
    {
        "engine_id": "lammps",
        "name": "LAMMPS",
        "provider": "Sandia National Laboratories",
        "planned_tasks": ["md.run", "structure.relax"],
        "status": "not_implemented",
        "note": "Subprocess adapter with input generation, log parsing and cancellation.",
    },
    {
        "engine_id": "quantum-espresso",
        "name": "Quantum ESPRESSO",
        "provider": "QE Foundation",
        "planned_tasks": ["energy.evaluate", "structure.relax"],
        "status": "not_implemented",
        "note": "Optional external DFT engine; pseudopotentials and convergence must be recorded.",
    },
    {
        "engine_id": "cp2k",
        "name": "CP2K",
        "provider": "CP2K developers",
        "planned_tasks": ["energy.evaluate", "md.run"],
        "status": "not_implemented",
        "note": "Optional external engine; CPU-first integration.",
    },
    {
        "engine_id": "pycalphad",
        "name": "pycalphad",
        "provider": "pycalphad developers",
        "planned_tasks": ["thermodynamics.phase_diagram"],
        "status": "not_implemented",
        "note": "CALPHAD TDB thermodynamics; no browser path.",
    },
]


def list_engines(*, include_planned: bool = False) -> list[dict[str, Any]]:
    engines = [engine.to_dict() for engine in ENGINE_REGISTRY]
    if include_planned:
        engines.extend({"schema_version": SCHEMA_VERSION, **planned} for planned in PLANNED_ENGINES)
    return engines


def get_engine(engine_id: str) -> EngineRecord | None:
    for engine in ENGINE_REGISTRY:
        if engine.engine_id == engine_id:
            return engine
    return None


def require_engine(engine_id: str) -> EngineRecord:
    engine = get_engine(engine_id)
    if engine is not None:
        return engine
    planned = next((item for item in PLANNED_ENGINES if item["engine_id"] == engine_id), None)
    if planned:
        raise LookupError(
            f"Engine '{engine_id}' is planned but not implemented in this build. {planned['note']}"
        )
    available = ", ".join(engine.engine_id for engine in ENGINE_REGISTRY)
    raise LookupError(f"Unknown engine '{engine_id}'. Available: {available}")
