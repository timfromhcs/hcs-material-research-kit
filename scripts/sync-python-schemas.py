#!/usr/bin/env python3
"""Copies the canonical JSON Schemas into the Python package for wheel builds.

/schemas at the repository root remains the single source of truth. The copy is
committed so an sdist/wheel build never depends on the workspace layout.
"""

from __future__ import annotations

import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = REPO_ROOT / "schemas"
TARGET = REPO_ROOT / "python" / "hcs_materials" / "src" / "hcs_materials" / "schemas"


def main() -> int:
    if not SCHEMA_DIR.is_dir():
        raise SystemExit(f"Schema directory not found: {SCHEMA_DIR}")
    TARGET.mkdir(parents=True, exist_ok=True)
    count = 0
    for schema in sorted(SCHEMA_DIR.glob("*.schema.json")):
        shutil.copy2(schema, TARGET / schema.name)
        count += 1
    print(f"[schemas] copied {count} schema file(s) to {TARGET.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
