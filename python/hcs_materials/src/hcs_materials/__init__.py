"""HCS Material Research Kit — Python package.

Deliberately small: structure IO and validation, the engine registry view,
portable project archives, a CLI and an optional MCP server. Heavy scientific
engines are optional extras, never base dependencies.
"""

from __future__ import annotations

__version__ = "0.2.0"
PACKAGE_NAME = "hcs-materials"
SCHEMA_VERSION = "1.0.0"

from .structure import (  # noqa: E402
    Structure,
    Site,
    composition_of,
    lattice_vectors,
    structure_hash,
    validate_structure,
)
from .registry import ENGINE_REGISTRY, PLANNED_ENGINES, list_engines  # noqa: E402
from .contracts import validate_contract, ContractViolation  # noqa: E402

__all__ = [
    "__version__",
    "PACKAGE_NAME",
    "SCHEMA_VERSION",
    "Structure",
    "Site",
    "composition_of",
    "lattice_vectors",
    "structure_hash",
    "validate_structure",
    "ENGINE_REGISTRY",
    "PLANNED_ENGINES",
    "list_engines",
    "validate_contract",
    "ContractViolation",
]
