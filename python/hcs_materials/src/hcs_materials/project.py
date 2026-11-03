"""Portable .hcsproj archives: creation, integrity verification, safe reading.

Security rules mirror the TypeScript implementation: no absolute paths, no
drive letters, no backslashes and no '..' segments; bounded entry count and
uncompressed size; checksums verified on read.
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any
from .structure import Structure, structure_hash, validate_structure

PROJECT_FORMAT_VERSION = "1.0.0"
SCHEMA_VERSION = "1.0.0"
MAX_ENTRIES = 5000
MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024
MAX_SINGLE_FILE_BYTES = 64 * 1024 * 1024


class ProjectError(ValueError):
    """Raised for malformed, unsafe or corrupted project archives."""


def is_safe_archive_path(path: str) -> bool:
    if not path or len(path) > 300:
        return False
    if "\\" in path or "\x00" in path or path.startswith("/"):
        return False
    if len(path) > 1 and path[1] == ":":
        return False
    return all(segment not in ("", ".", "..") for segment in path.split("/"))


def _require_safe(path: str) -> None:
    if not is_safe_archive_path(path):
        raise ProjectError(f"Unsafe archive path rejected: {path!r}")


@dataclass
class ProjectMeta:
    name: str
    project_id: str
    description: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "project_id": self.project_id,
            "name": self.name,
            "description": self.description,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "app": {"name": "HCS Material Research Kit", "version": "0.1.0"},
            "structure_ids": [],
            "job_ids": [],
            "tags": self.tags,
        }


def _canonical(document: Any) -> bytes:
    return json.dumps(document, indent=2, sort_keys=False).encode("utf-8")


def write_project(
    path: str | Path,
    project: ProjectMeta,
    structures: list[Structure],
    jobs: list[dict[str, Any]] | None = None,
    reports: dict[str, str] | None = None,
) -> Path:
    """Writes a .hcsproj archive with manifest and checksums."""
    jobs = jobs or []
    reports = reports or {}
    files: dict[str, bytes] = {}
    checksums: list[dict[str, Any]] = []

    def put(name: str, payload: bytes) -> None:
        _require_safe(name)
        if len(payload) > MAX_SINGLE_FILE_BYTES:
            raise ProjectError(f"{name} exceeds the 64 MB single-file limit")
        files[name] = payload
        checksums.append(
            {"path": name, "sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload)}
        )

    project_dict = project.to_dict()
    project_dict["structure_ids"] = [s.structure_id for s in structures]
    project_dict["job_ids"] = [job.get("job_id", "") for job in jobs]
    put("project.json", _canonical(project_dict))

    for structure in structures:
        _require_safe(structure.structure_id)
        put(f"structures/{structure.structure_id}.json", _canonical(structure.to_dict()))

    for job in jobs:
        job_id = job.get("job_id")
        if not job_id:
            raise ProjectError("Every job needs a job_id")
        _require_safe(str(job_id))
        base = f"simulations/{job_id}"
        for key, filename in (
            ("input", "input.json"),
            ("status", "status.json"),
            ("result", "result.json"),
            ("provenance", "provenance.json"),
        ):
            if key in job and job[key] is not None:
                put(f"{base}/{filename}", _canonical(job[key]))
        if job.get("log"):
            put(f"{base}/logs/run.log", str(job["log"]).encode("utf-8"))

    for name, content in reports.items():
        _require_safe(name)
        put(f"reports/{name}", content.encode("utf-8"))

    checksum_text = "\n".join(
        f"{entry['sha256']}  {entry['path']}" for entry in sorted(checksums, key=lambda e: e["path"])
    ) + "\n"
    checksum_bytes = checksum_text.encode("utf-8")
    files["checksums.sha256"] = checksum_bytes
    manifest = {
        "format": "hcsproj",
        "format_version": PROJECT_FORMAT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "app": {"name": "HCS Material Research Kit", "version": "0.1.0"},
        "project_id": project.project_id,
        "files": checksums
        + [
            {
                "path": "checksums.sha256",
                "sha256": hashlib.sha256(checksum_bytes).hexdigest(),
                "bytes": len(checksum_bytes),
            }
        ],
    }
    files["manifest.json"] = _canonical(manifest)

    target = Path(path)
    if target.suffix != ".hcsproj":
        target = target.with_suffix(".hcsproj")
    target.parent.mkdir(parents=True, exist_ok=True)
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, payload in files.items():
            info = zipfile.ZipInfo(name)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.date_time = datetime.now().timetuple()[:6]
            info.external_attr = 0o644 << 16
            archive.writestr(info, payload)
    target.write_bytes(buffer.getvalue())
    return target


@dataclass
class ProjectReadResult:
    project: dict[str, Any]
    structures: list[Structure]
    jobs: list[dict[str, Any]]
    reports: dict[str, str]
    checksums_verified: bool
    warnings: list[str]


def read_project(path: str | Path) -> ProjectReadResult:
    file_path = Path(path)
    if not file_path.is_file():
        raise ProjectError(f"Project not found: {file_path}")
    if file_path.stat().st_size > MAX_UNCOMPRESSED_BYTES:
        raise ProjectError("Project archive exceeds the 256 MB limit")
    warnings: list[str] = []
    try:
        with zipfile.ZipFile(file_path) as archive:
            return _read_archive(archive, warnings)
    except zipfile.BadZipFile as error:
        raise ProjectError(f"Not a readable .hcsproj archive: {error}") from error


def _read_archive(archive: zipfile.ZipFile, warnings: list[str]) -> ProjectReadResult:
    infos = archive.infolist()
    if len(infos) > MAX_ENTRIES:
        raise ProjectError(f"Archive has {len(infos)} entries; limit is {MAX_ENTRIES}")
    total = 0
    names: list[str] = []
    for info in infos:
        _require_safe(info.filename)
        if info.file_size > MAX_SINGLE_FILE_BYTES:
            raise ProjectError(f"Entry {info.filename} exceeds the 64 MB limit")
        total += info.file_size
        names.append(info.filename)
    if total > MAX_UNCOMPRESSED_BYTES:
        raise ProjectError(f"Archive expands to {total} bytes; limit is {MAX_UNCOMPRESSED_BYTES}")

    def read_text(name: str) -> str | None:
        if name not in names:
            return None
        return archive.read(name).decode("utf-8", errors="replace")

    verified = False
    checksum_text = read_text("checksums.sha256")
    if checksum_text is None:
        warnings.append("Archive has no checksums.sha256; integrity cannot be verified.")
    else:
        mismatches = 0
        for line in [line for line in checksum_text.splitlines() if line.strip()]:
            digest, _, name = line.strip().partition("  ")
            if not name or len(digest) != 64:
                warnings.append(f"Malformed checksum line: {line[:60]}")
                continue
            _require_safe(name)
            if name not in names:
                warnings.append(f"Checksum entry for missing file: {name}")
                continue
            actual = hashlib.sha256(archive.read(name)).hexdigest()
            if actual != digest:
                mismatches += 1
                warnings.append(f"Checksum mismatch for {name}")
        verified = mismatches == 0 and not warnings
        if not verified:
            warnings.append("Project integrity could not be fully verified; treat extracted data as untrusted.")

    project_text = read_text("project.json")
    if project_text is None:
        raise ProjectError("Archive has no project.json")
    project = json.loads(project_text)

    structures: list[Structure] = []
    for name in names:
        if not name.startswith("structures/") or not name.endswith(".json"):
            continue
        text = read_text(name)
        if text is None:
            continue
        try:
            from .io import read_hcs_json

            structures.append(read_hcs_json(text))
        except Exception as error:  # noqa: BLE001 - report, never crash on one file
            warnings.append(f"Could not read {name}: {error}")

    jobs_by_id: dict[str, dict[str, Any]] = {}
    for name in names:
        parts = name.split("/")
        if len(parts) < 3 or parts[0] != "simulations":
            continue
        job_id, rest = parts[1], "/".join(parts[2:])
        entry = jobs_by_id.setdefault(job_id, {"job_id": job_id})
        text = read_text(name)
        if text is None:
            continue
        try:
            if rest == "input.json":
                entry["input"] = json.loads(text)
            elif rest == "status.json":
                entry["status"] = json.loads(text)
            elif rest == "result.json":
                entry["result"] = json.loads(text)
            elif rest == "provenance.json":
                entry["provenance"] = json.loads(text)
            elif rest == "logs/run.log":
                entry["log"] = text
        except json.JSONDecodeError:
            warnings.append(f"Could not parse {name}")

    complete_jobs = []
    for job_id, entry in jobs_by_id.items():
        if "input" not in entry or "status" not in entry:
            warnings.append(f"Job {job_id} is incomplete and was skipped")
            continue
        complete_jobs.append(entry)

    reports = {
        name[len("reports/") :]: read_text(name) or ""
        for name in names
        if name.startswith("reports/")
    }

    return ProjectReadResult(project, structures, complete_jobs, reports, verified, warnings)


def summarize_project(result: ProjectReadResult) -> dict[str, Any]:
    return {
        "project_id": result.project.get("project_id"),
        "name": result.project.get("name"),
        "checksums_verified": result.checksums_verified,
        "structures": [
            {
                "structure_id": s.structure_id,
                "formula": (s.to_dict().get("composition") or {}).get("reduced_formula"),
                "atoms": len(s.sites),
                "structure_hash": structure_hash(s),
                "validation": validate_structure(s).status,
            }
            for s in result.structures
        ],
        "jobs": [
            {
                "job_id": job["job_id"],
                "state": job.get("status", {}).get("state"),
                "task_type": job.get("input", {}).get("task_type"),
                "has_result": "result" in job,
            }
            for job in result.jobs
        ],
        "warnings": result.warnings,
    }
