"""JSON Schema validation shared with the TypeScript packages.

The schemas live in /schemas at the repository root and are copied into the
package for wheel builds by ``scripts/sync-python-schemas.py``. The same files
are the single source of truth for every language.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

SCHEMA_FILES = {
    "structure": "structure.schema.json",
    "material": "material.schema.json",
    "simulation": "simulation.schema.json",
    "job": "job.schema.json",
    "result": "result.schema.json",
    "provenance": "provenance.schema.json",
    "engine": "engine.schema.json",
}


class ContractViolation(ValueError):
    """Raised when a document does not satisfy its JSON Schema contract."""

    def __init__(self, schema: str, errors: list[str]) -> None:
        self.schema = schema
        self.errors = errors
        message = "; ".join(errors[:8]) or "invalid document"
        super().__init__(f"Contract validation failed for '{schema}': {message}")


def _schema_directories() -> list[Path]:
    here = Path(__file__).resolve()
    candidates = [
        here.parent / "schemas",  # packaged copy
        here.parents[3] / "schemas",  # repository root when running from source
        here.parents[2] / "schemas",
    ]
    return [path for path in candidates if path.is_dir()]


@lru_cache(maxsize=32)
def load_schema(name: str) -> dict[str, Any]:
    filename = SCHEMA_FILES.get(name)
    if filename is None:
        raise KeyError(f"Unknown schema '{name}'")
    for directory in _schema_directories():
        candidate = directory / filename
        if candidate.is_file():
            return json.loads(candidate.read_text(encoding="utf-8"))
    raise FileNotFoundError(
        f"Schema '{filename}' not found. Run scripts/sync-python-schemas.py to package the schemas."
    )


@lru_cache(maxsize=32)
def _validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(load_schema(name))


def validate_contract(name: str, document: Any) -> None:
    """Raises ContractViolation with readable errors; returns None when valid."""
    errors = [
        f"{'/'.join(str(part) for part in error.absolute_path) or '/'}: {error.message}"
        for error in _validator(name).iter_errors(document)
    ]
    if errors:
        raise ContractViolation(name, errors)


def is_valid(name: str, document: Any) -> bool:
    return _validator(name).is_valid(document)


def validate_structure_document(document: Any) -> None:
    validate_contract("structure", document)
