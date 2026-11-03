"""Command-line interface for the HCS Material Research Kit.

Only implemented commands are exposed. Exit codes:
  0  success
  2  usage error (argparse)
  3  validation or integrity failure
  4  unsupported or unavailable capability
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from . import __version__
from .contracts import ContractViolation, load_schema, validate_contract
from .io import (
    StructureIOError,
    detect_format,
    format_for_path,
    read_structure_file,
    write_structure,
)
from .project import (
    ProjectError,
    ProjectMeta,
    read_project,
    summarize_project,
    write_project,
)
from .registry import ENGINE_REGISTRY, PLANNED_ENGINES, list_engines, require_engine
from .structure import (
    cell_volume,
    density_g_per_cm3,
    structure_hash,
    total_mass_amu,
    validate_structure,
)

EXIT_OK = 0
EXIT_VALIDATION = 3
EXIT_UNSUPPORTED = 4


@dataclass
class Output:
    json_mode: bool

    def emit(self, payload: Any, human: str | None = None) -> None:
        if self.json_mode:
            print(json.dumps(payload, indent=2, default=str))
        elif human is not None:
            print(human)
        else:
            print(json.dumps(payload, indent=2, default=str))

    def error(self, message: str, code: int = EXIT_VALIDATION) -> int:
        if self.json_mode:
            print(json.dumps({"ok": False, "error": message, "code": code}, indent=2))
        else:
            print(f"error: {message}", file=sys.stderr)
        return code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hcs-materials",
        description="HCS Material Research Kit — structure validation, archives, engines and MCP.",
        epilog="Exit codes: 0 ok, 3 validation/integrity failure, 4 unsupported capability.",
    )
    parser.add_argument("--version", action="version", version=f"hcs-materials {__version__}")
    parser.add_argument("--json", action="store_true", help="machine-readable JSON output")
    sub = parser.add_subparsers(dest="command", required=True)

    doctor = sub.add_parser("doctor", help="check the local environment")
    doctor.set_defaults(func=cmd_doctor)

    hardware = sub.add_parser("hardware", help="report detected hardware")
    hardware.set_defaults(func=cmd_hardware)

    engines = sub.add_parser("engines", help="inspect the engine registry")
    engine_sub = engines.add_subparsers(dest="engines_command", required=True)
    engines_list = engine_sub.add_parser("list", help="list implemented engines")
    engines_list.add_argument("--planned", action="store_true", help="also list planned engines")
    engines_list.set_defaults(func=cmd_engines_list)
    engines_inspect = engine_sub.add_parser("inspect", help="show one engine record")
    engines_inspect.add_argument("engine_id")
    engines_inspect.set_defaults(func=cmd_engines_inspect)

    project = sub.add_parser("project", help="project archive operations")
    project_sub = project.add_subparsers(dest="project_command", required=True)
    project_create = project_sub.add_parser("create", help="create an empty .hcsproj project")
    project_create.add_argument("path")
    project_create.add_argument("--name", default=None)
    project_create.set_defaults(func=cmd_project_create)
    project_validate = project_sub.add_parser("validate", help="verify a .hcsproj archive")
    project_validate.add_argument("path")
    project_validate.set_defaults(func=cmd_project_validate)

    structure = sub.add_parser("structure", help="structure file operations")
    structure_sub = structure.add_subparsers(dest="structure_command", required=True)
    structure_validate = structure_sub.add_parser("validate", help="validate a structure file")
    structure_validate.add_argument("file")
    structure_validate.set_defaults(func=cmd_structure_validate)
    structure_convert = structure_sub.add_parser("convert", help="convert between CIF/POSCAR/XYZ/JSON")
    structure_convert.add_argument("input")
    structure_convert.add_argument("output")
    structure_convert.set_defaults(func=cmd_structure_convert)

    report = sub.add_parser("report", help="report generation")
    report_sub = report.add_subparsers(dest="report_command", required=True)
    report_build = report_sub.add_parser("build", help="build an HTML summary for a project archive")
    report_build.add_argument("project")
    report_build.add_argument("--out", default=None, help="output directory (default: ./hcs-report)")
    report_build.set_defaults(func=cmd_report_build)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    output = Output(json_mode=bool(args.json))
    return int(args.func(args, output))


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------


def cmd_doctor(args: argparse.Namespace, out: Output) -> int:
    checks = []

    def check(name: str, ok: bool, detail: str) -> None:
        checks.append({"check": name, "ok": ok, "detail": detail})

    check("python", sys.version_info >= (3, 11), f"Python {platform.python_version()}")
    try:
        load_schema("structure")
        check("schemas", True, "canonical JSON Schema files are readable")
    except Exception as error:  # noqa: BLE001
        check("schemas", False, str(error))
    try:
        import jsonschema  # noqa: F401

        check("jsonschema", True, "contract validation available")
    except ImportError:
        check("jsonschema", False, "install jsonschema")
    try:
        import mcp  # noqa: F401

        check("mcp", True, "MCP SDK available (hcs-materials[mcp])")
    except ImportError:
        check("mcp", False, "optional: pip install 'hcs-materials[mcp]' for the MCP server")
    for extra in ("ase", "pycalphad"):
        try:
            __import__(extra)
            check(extra, True, f"{extra} importable (adapter not implemented yet)")
        except ImportError:
            check(extra, False, "optional engine dependency not installed")
    check(
        "network",
        True,
        "no network calls are made by HCS by default",
    )
    ok = all(item["ok"] for item in checks if item["check"] in {"python", "schemas", "jsonschema"})
    out.emit({"ok": ok, "version": __version__, "checks": checks},
             "\n".join(f"[{'ok' if item['ok'] else '--'}] {item['check']}: {item['detail']}" for item in checks))
    return EXIT_OK if ok else EXIT_UNSUPPORTED


def cmd_hardware(args: argparse.Namespace, out: Output) -> int:
    payload = {
        "platform": platform.platform(),
        "system": platform.system(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "python": platform.python_version(),
        "cpu_count": os.cpu_count(),
        "backend_selection": {
            "selected": "cpu",
            "reasons": [
                "The Python package contains no GPU kernel; native GPU acceleration is not implemented in this build.",
            ],
        },
    }
    out.emit(payload, f"{payload['platform']} · {payload['cpu_count']} CPUs · backend: cpu (reference)")
    return EXIT_OK


def cmd_engines_list(args: argparse.Namespace, out: Output) -> int:
    engines = list_engines(include_planned=bool(args.planned))
    if out.json_mode:
        out.emit({"engines": engines})
    else:
        for engine in engines:
            state = engine.get("installation_state", engine.get("status"))
            print(f"{engine['engine_id']:<24} v{engine['version']:<8} {state:<12} {engine['name']}")
            if state == "not_implemented":
                print(f"{'':<24} planned — {engine.get('note', '')}")
    return EXIT_OK


def cmd_engines_inspect(args: argparse.Namespace, out: Output) -> int:
    try:
        engine = require_engine(args.engine_id)
    except LookupError as error:
        return out.error(str(error), EXIT_UNSUPPORTED)
    payload = engine.to_dict()
    try:
        validate_contract("engine", payload)
    except ContractViolation as error:
        return out.error(str(error))
    out.emit(payload, "\n".join(f"{key}: {value}" for key, value in payload.items()))
    return EXIT_OK


def cmd_project_create(args: argparse.Namespace, out: Output) -> int:
    path = Path(args.path)
    name = args.name or path.stem or "Untitled project"
    project = ProjectMeta(name=name, project_id=f"project_{os.urandom(6).hex()}")
    try:
        target = write_project(path, project, structures=[])
    except (ProjectError, OSError) as error:
        return out.error(str(error))
    out.emit(
        {"ok": True, "project": str(target), "project_id": project.project_id, "name": project.name},
        f"created {target}",
    )
    return EXIT_OK


def cmd_project_validate(args: argparse.Namespace, out: Output) -> int:
    try:
        result = read_project(args.path)
    except ProjectError as error:
        return out.error(str(error))
    summary = summarize_project(result)
    ok = result.checksums_verified and not any("incomplete" in w for w in result.warnings)
    out.emit(
        {"ok": ok, **summary},
        "\n".join(
            [
                f"project: {summary['name']} ({summary['project_id']})",
                f"checksums verified: {summary['checksums_verified']}",
                f"structures: {len(summary['structures'])}",
                f"jobs: {len(summary['jobs'])}",
                *(f"warning: {w}" for w in summary["warnings"]),
            ]
        ),
    )
    return EXIT_OK if ok else EXIT_VALIDATION


def cmd_structure_validate(args: argparse.Namespace, out: Output) -> int:
    try:
        structure, warnings = read_structure_file(args.file)
    except (StructureIOError, OSError) as error:
        return out.error(str(error))
    document = structure.to_dict()
    try:
        validate_contract("structure", document)
    except ContractViolation as error:
        return out.error(str(error))
    report = validate_structure(structure)
    payload = {
        "ok": report.status != "invalid",
        "file": str(args.file),
        "format": detect_format(Path(args.file).read_text(encoding="utf-8", errors="replace"), Path(args.file).name),
        "structure_id": structure.structure_id,
        "structure_hash": structure_hash(structure),
        "atoms": len(structure.sites),
        "formula": document.get("composition", {}).get("reduced_formula"),
        "cell_volume_angstrom3": round(cell_volume(structure), 6),
        "density_g_per_cm3": _safe_density(structure),
        "validation": report.to_dict(),
        "import_warnings": warnings,
    }
    human = "\n".join(
        [
            f"{payload['formula']}  {payload['atoms']} atoms  {payload['format']}",
            f"hash: {payload['structure_hash']}",
            f"volume: {payload['cell_volume_angstrom3']} Å³  density: {payload['density_g_per_cm3']} g/cm³",
            f"validation: {report.status}",
            *(f"  [{c.status}] {c.id}: {c.message}" for c in report.checks),
            *(f"  import warning: {w}" for w in warnings),
        ]
    )
    out.emit(payload, human)
    return EXIT_OK if report.status != "invalid" else EXIT_VALIDATION


def cmd_structure_convert(args: argparse.Namespace, out: Output) -> int:
    try:
        structure, warnings = read_structure_file(args.input)
    except (StructureIOError, OSError) as error:
        return out.error(str(error))
    target_format = format_for_path(args.output)
    try:
        text = write_structure(structure, target_format)
    except (StructureIOError, ValueError) as error:
        return out.error(str(error))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")
    payload = {
        "ok": True,
        "input": str(args.input),
        "output": str(output_path),
        "target_format": target_format,
        "atoms": len(structure.sites),
        "structure_hash": structure_hash(structure),
        "import_warnings": warnings,
    }
    out.emit(payload, f"wrote {output_path} ({target_format}, {len(structure.sites)} atoms)")
    return EXIT_OK


def cmd_report_build(args: argparse.Namespace, out: Output) -> int:
    try:
        result = read_project(args.project)
    except ProjectError as error:
        return out.error(str(error))
    out_dir = Path(args.out) if args.out else Path.cwd() / "hcs-report"
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = summarize_project(result)
    rows = "\n".join(
        f"<tr><td>{entry['structure_id']}</td><td>{entry.get('formula') or '—'}</td>"
        f"<td>{entry['atoms']}</td><td>{entry['validation']}</td>"
        f"<td><code>{entry['structure_hash'][:16]}</code></td></tr>"
        for entry in summary["structures"]
    )
    job_rows = "\n".join(
        f"<tr><td>{job['job_id']}</td><td>{job.get('task_type')}</td><td>{job.get('state')}</td>"
        f"<td>{'yes' if job.get('has_result') else 'no'}</td></tr>"
        for job in summary["jobs"]
    )
    warning_rows = "\n".join(f"<li>{warning}</li>" for warning in summary["warnings"])
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>HCS project summary — {summary['name']}</title>
<style>
body {{ font: 15px/1.55 ui-sans-serif, system-ui, sans-serif; background:#0f1417; color:#e7eef2; margin:0 }}
main {{ max-width:960px; margin:0 auto; padding:40px 24px 80px }}
h1 {{ font-size:1.6rem; margin:0 0 4px }} h2 {{ font-size:1rem; color:#7fe3d4; text-transform:uppercase; letter-spacing:.08em; margin-top:32px }}
table {{ border-collapse:collapse; width:100%; font-size:.92rem }}
th,td {{ text-align:left; padding:7px 10px; border-bottom:1px solid #24313a }}
th {{ color:#97a6ad; font-size:.78rem; text-transform:uppercase }}
code {{ background:#1a242b; padding:1px 5px; border-radius:4px }}
.sub {{ color:#97a6ad }} .warn li {{ color:#f0d9a8 }}
footer {{ margin-top:40px; color:#7d8b92; font-size:.85rem; border-top:1px solid #24313a; padding-top:14px }}
</style></head><body><main>
<h1>{summary['name']}</h1>
<p class="sub">project <code>{summary['project_id']}</code> · checksums verified: {summary['checksums_verified']}</p>
<h2>Structures</h2>
<table><thead><tr><th>ID</th><th>Formula</th><th>Atoms</th><th>Validation</th><th>Hash</th></tr></thead>
<tbody>{rows or '<tr><td colspan="5">No structures in this project.</td></tr>'}</tbody></table>
<h2>Jobs</h2>
<table><thead><tr><th>ID</th><th>Task</th><th>State</th><th>Result</th></tr></thead>
<tbody>{job_rows or '<tr><td colspan="4">No jobs in this project.</td></tr>'}</tbody></table>
<h2>Integrity warnings</h2>
<ul class="warn">{warning_rows or '<li>None.</li>'}</ul>
<footer>HCS Material Research Kit — local project summary. Simulation results remain conditional on their recorded model, parameters and provenance. Made with love by hcsmedia and timfromhcs.</footer>
</main></body></html>
"""
    target = out_dir / "index.html"
    target.write_text(html, encoding="utf-8")
    out.emit(
        {"ok": True, "output": str(target), "structures": len(result.structures), "jobs": len(result.jobs)},
        f"wrote {target}",
    )
    return EXIT_OK


def _safe_density(structure: Any) -> float | None:
    try:
        return round(density_g_per_cm3(structure), 6)
    except ValueError:
        return None


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
