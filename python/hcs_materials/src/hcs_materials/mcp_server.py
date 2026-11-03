"""MCP server (v2 SDK) for local research agents.

Design rules from AGENTS.md §9:
  * stdio transport by default, loopback HTTP only if explicitly requested;
  * strict input schemas, no shell and no arbitrary Python execution tool;
  * every destructive or resource-heavy action is scoped to a configured root;
  * no tool is exposed before it is implemented and tested.

Run:  hcs-materials-mcp --root <project-directory>
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Sequence

from . import __version__
from .contracts import ContractViolation, validate_contract
from .io import StructureIOError, read_structure, write_structure
from .project import ProjectError, read_project, summarize_project
from .registry import PLANNED_ENGINES, list_engines, require_engine
from .structure import (
    Structure,
    base_symbol,
    cell_volume,
    structure_hash,
    validate_structure,
)

#: Hard workload ceilings for `simulations_run`. The O(N^2) reference kernel and
#: a stdio agent must not be able to start an unbounded job by accident.
SIMULATION_BUDGET: dict[str, tuple[int, int]] = {
    "energy.evaluate": (20_000, 0),
    "structure.validate": (20_000, 0),
    "analysis.rdf": (20_000, 0),
    "md.run": (5_000, 2_000),
    "structure.relax": (20_000, 5_000),
}

#: Environment variables forwarded to the simulation CLI. Everything else
#: (tokens, API keys, cloud credentials) stays out of the child process.
FORWARDED_ENV = ("PATH", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP", "HOME", "USERPROFILE")


class Workspace:
    """Confines project paths to one explicit root directory."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        if not self.root.is_dir():
            raise ValueError(f"Workspace root does not exist: {self.root}")

    def resolve(self, relative: str) -> Path:
        if relative.startswith(("/", "\\")) or ".." in Path(relative).parts:
            raise ValueError("Path must be a relative path inside the workspace root")
        candidate = (self.root / relative).resolve()
        if self.root not in candidate.parents and candidate != self.root:
            raise ValueError("Path escapes the workspace root")
        return candidate


def create_server(root: str | Path, sim_cli: Sequence[str] | str | None = None):
    """Builds the MCPServer. Imported lazily so the base package stays light."""
    try:
        from mcp.server import MCPServer
    except ImportError as error:  # pragma: no cover - depends on optional extra
        raise RuntimeError(
            "The MCP SDK is not installed. Install the extra: pip install 'hcs-materials[mcp]'"
        ) from error

    workspace = Workspace(root)
    if sim_cli is None:
        configured = os.environ.get("HCS_SIM_CLI", "hcs-sim").strip()
        sim_command: tuple[str, ...] = (configured,) if configured else ("hcs-sim",)
    elif isinstance(sim_cli, str):
        sim_command = (sim_cli,)
    else:
        sim_command = tuple(sim_cli)
    if not sim_command or not sim_command[0]:
        raise ValueError("sim_cli must name an executable")

    server = MCPServer("HCS Material Research Kit")

    @server.tool()
    def engines_list() -> dict[str, Any]:
        """List engines that are actually implemented in this build."""
        return {"engines": list_engines(), "planned": PLANNED_ENGINES}

    @server.tool()
    def structures_validate(structure: dict[str, Any]) -> dict[str, Any]:
        """Validate a structure document against the schema and HCS geometry checks."""
        try:
            validate_contract("structure", structure)
        except ContractViolation as error:
            return {"ok": False, "error": str(error), "errors": error.errors}
        from .io import read_hcs_json

        parsed = read_hcs_json(json.dumps(structure))
        report = validate_structure(parsed)
        return {
            "ok": report.status != "invalid",
            "validation": report.to_dict(),
            "structure_hash": structure_hash(parsed),
            "atoms": len(parsed.sites),
            "cell_volume_angstrom3": cell_volume(parsed),
        }

    @server.tool()
    def structures_convert(content: str, filename: str, target_format: str) -> dict[str, Any]:
        """Convert a structure file's text content into another format."""
        if target_format not in ("cif", "poscar", "xyz", "hcs-json"):
            return {"ok": False, "error": f"Unsupported target format '{target_format}'"}
        try:
            parsed, warnings = read_structure(content, filename)
            text = write_structure(parsed, target_format)
        except (StructureIOError, ValueError) as error:
            return {"ok": False, "error": str(error)}
        return {
            "ok": True,
            "content": text,
            "warnings": warnings,
            "atoms": len(parsed.sites),
            "structure_hash": structure_hash(parsed),
        }

    @server.tool()
    def project_validate(relative_path: str) -> dict[str, Any]:
        """Verify a .hcsproj archive inside the configured workspace root."""
        try:
            path = workspace.resolve(relative_path)
            result = read_project(path)
        except (ValueError, ProjectError) as error:
            return {"ok": False, "error": str(error)}
        return {"ok": result.checksums_verified, **summarize_project(result)}

    @server.tool()
    def simulations_validate_spec(spec: dict[str, Any], structure: dict[str, Any]) -> dict[str, Any]:
        """Validate a SimulationSpec against the registry and structure before any run.

        This performs no computation. It reports every blocking issue it finds
        (unknown engine, unsupported task, undeclared fidelity, structure hash
        mismatch, unsupported elements, invalid structure) so an agent can fix
        the input instead of starting a doomed job.
        """
        issues: list[str] = []
        warnings: list[str] = []

        try:
            validate_contract("structure", structure)
        except ContractViolation as error:
            return {"ok": False, "issues": [str(error)], "warnings": []}

        from .io import read_hcs_json

        parsed = read_hcs_json(json.dumps(structure))
        report = validate_structure(parsed)
        if report.status == "invalid":
            issues.append(
                "structure is invalid: "
                + "; ".join(check.message for check in report.checks if check.status == "fail")
            )
        elif report.status == "warning":
            warnings.extend(check.message for check in report.checks if check.status == "warning")

        try:
            validate_contract("simulation", spec)
        except ContractViolation as error:
            return {"ok": False, "issues": [str(error)], "warnings": warnings}

        engine = None
        try:
            engine = require_engine(str(spec.get("engine_id", "")))
        except LookupError as error:
            issues.append(str(error))

        task_type = str(spec.get("task_type", ""))
        fidelity = str(spec.get("fidelity_level", ""))
        if engine is not None:
            if task_type not in engine.supported_tasks:
                issues.append(
                    f"engine '{engine.engine_id}' does not support task '{task_type}' "
                    f"(supported: {', '.join(engine.supported_tasks)})"
                )
            if engine.fidelity_levels and fidelity not in engine.fidelity_levels:
                issues.append(
                    f"engine '{engine.engine_id}' does not declare fidelity '{fidelity}' "
                    f"(declared: {', '.join(engine.fidelity_levels)})"
                )
            supported = set(engine.supported_elements)
            if supported and "*" not in supported:
                elements = {base_symbol(site.species) for site in parsed.sites}
                missing = sorted(elements - supported)
                if missing:
                    issues.append(
                        f"engine '{engine.engine_id}' has no parameters for: {', '.join(missing)}"
                    )

        reference = spec.get("structure_ref") or {}
        expected_hash = str(reference.get("structure_hash", ""))
        actual_hash = structure_hash(parsed)
        if expected_hash != actual_hash:
            issues.append(
                "structure_ref.structure_hash does not match the supplied structure "
                f"(expected {expected_hash[:16]}…, actual {actual_hash[:16]}…)"
            )

        if task_type == "md.run":
            ensemble = (spec.get("thermodynamic_conditions") or {}).get("ensemble")
            if ensemble and ensemble not in ("NVE", "none"):
                issues.append(
                    f"ensemble '{ensemble}' is not implemented; only NVE is available in this build"
                )

        return {
            "ok": not issues,
            "issues": issues,
            "warnings": warnings,
            "structure_hash": actual_hash,
            "validation_status": report.status,
            "engine": (
                {
                    "engine_id": engine.engine_id,
                    "version": engine.version,
                    "supported_tasks": engine.supported_tasks,
                    "fidelity_levels": engine.fidelity_levels,
                    "known_limits": engine.known_limits,
                }
                if engine is not None
                else None
            ),
            "note": "Validation only. No simulation was started by this tool.",
        }

    @server.tool()
    def results_summarize(relative_path: str) -> dict[str, Any]:
        """Summarize recorded results inside a .hcsproj archive (read-only)."""
        try:
            path = workspace.resolve(relative_path)
            result = read_project(path)
        except (ValueError, ProjectError) as error:
            return {"ok": False, "error": str(error)}

        jobs: list[dict[str, Any]] = []
        for job in result.jobs[:50]:
            bundle = job.get("result") or {}
            provenance = job.get("provenance") or {}
            jobs.append(
                {
                    "job_id": job["job_id"],
                    "state": (job.get("status") or {}).get("state"),
                    "task_type": (job.get("input") or {}).get("task_type"),
                    "fidelity_level": bundle.get("fidelity_level"),
                    "backend": (provenance.get("environment") or {}).get("backend"),
                    "result_status": bundle.get("status"),
                    "quantities": [
                        {
                            "name": quantity.get("name"),
                            "value": quantity.get("value"),
                            "unit": quantity.get("unit"),
                        }
                        for quantity in (bundle.get("quantities") or [])[:50]
                    ],
                    "convergence": bundle.get("convergence"),
                    "limitations": (bundle.get("limitations") or [])[:20],
                    "warnings": (bundle.get("warnings") or [])[:20],
                }
            )

        return {
            "ok": result.checksums_verified,
            "project": {
                "project_id": result.project.get("project_id"),
                "name": result.project.get("name"),
                "checksums_verified": result.checksums_verified,
            },
            "jobs": jobs,
            "warnings": result.warnings,
            "note": "Read-only summary. Missing fields are reported as missing, never filled in.",
        }

    @server.tool()
    def simulations_run(
        spec: dict[str, Any],
        structure: dict[str, Any],
        out_dir: str,
        approve: bool = False,
        backend: str = "auto",
    ) -> dict[str, Any]:
        """Run one local simulation with the hcs-sim CLI after explicit approval.

        This starts a real, bounded computation on this machine and writes its
        record into the workspace. It is not a simulation service and it never
        invents a result: if the CLI fails, the failure is returned verbatim.
        Call `simulations_validate_spec` first to fix inputs cheaply.
        """
        if approve is not True:
            return {
                "ok": False,
                "error_code": "approval_required",
                "error": (
                    "simulations_run starts a real computation. Repeat the call with "
                    "approve=true only after the user approved this specific run."
                ),
            }
        if backend not in ("auto", "cpu", "wasm"):
            return {
                "ok": False,
                "error_code": "invalid_backend",
                "error": f"backend must be auto, cpu or wasm (got '{backend}')",
            }

        task_type = str(spec.get("task_type", ""))
        if task_type not in SIMULATION_BUDGET:
            return {
                "ok": False,
                "error_code": "unsupported_task",
                "error": (
                    f"The MCP runner does not start task '{task_type}'. "
                    f"Allowed: {', '.join(sorted(SIMULATION_BUDGET))}."
                ),
            }

        atoms = len(structure.get("sites") or [])
        max_atoms, max_steps = SIMULATION_BUDGET[task_type]
        if atoms == 0:
            return {
                "ok": False,
                "error_code": "invalid_structure",
                "error": "structure.sites is empty",
            }
        if atoms > max_atoms:
            return {
                "ok": False,
                "error_code": "budget_exceeded",
                "error": (
                    f"{atoms} atoms exceeds the MCP budget for {task_type} ({max_atoms}). "
                    "Build a smaller cell or run the CLI directly."
                ),
            }
        raw_steps = (spec.get("parameters") or {}).get("steps", 0)
        steps = raw_steps if isinstance(raw_steps, int) and not isinstance(raw_steps, bool) else 0
        if max_steps and steps > max_steps:
            return {
                "ok": False,
                "error_code": "budget_exceeded",
                "error": (
                    f"{steps} steps exceeds the MCP budget for {task_type} ({max_steps}). "
                    "Split the run or use the CLI with a deliberate checkpoint."
                ),
            }

        try:
            validate_contract("structure", structure)
            validate_contract("simulation", spec)
        except ContractViolation as error:
            return {
                "ok": False,
                "error_code": "invalid_input",
                "error": str(error),
                "errors": error.errors,
            }

        from .io import read_hcs_json

        try:
            parsed = read_hcs_json(json.dumps(structure))
        except (StructureIOError, ValueError) as error:
            return {"ok": False, "error_code": "invalid_input", "error": str(error)}

        reference = spec.get("structure_ref") or {}
        expected_hash = str(reference.get("structure_hash", ""))
        actual_hash = structure_hash(parsed)
        if expected_hash != actual_hash:
            return {
                "ok": False,
                "error_code": "structure_hash_mismatch",
                "error": (
                    "structure_ref.structure_hash does not match the supplied structure "
                    f"(expected {expected_hash[:16]}…, actual {actual_hash[:16]}…)"
                ),
            }

        try:
            target = workspace.resolve(out_dir)
        except ValueError as error:
            return {"ok": False, "error_code": "path_rejected", "error": str(error)}
        if target == workspace.root:
            return {
                "ok": False,
                "error_code": "path_rejected",
                "error": "out_dir must be a dedicated directory inside the workspace root",
            }

        target.mkdir(parents=True, exist_ok=True)
        structure_path = target / "structure.json"
        spec_path = target / "spec.json"
        structure_path.write_text(json.dumps(structure, indent=2) + "\n", encoding="utf-8")
        spec_path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")

        command = [
            *sim_command,
            "run",
            "--structure",
            str(structure_path),
            "--spec",
            str(spec_path),
            "--out",
            str(target),
            "--backend",
            backend,
            "--json",
        ]
        env = {name: os.environ[name] for name in FORWARDED_ENV if name in os.environ}
        try:
            completed = subprocess.run(
                command,
                cwd=str(workspace.root),
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=180,
                check=False,
            )
        except (FileNotFoundError, NotADirectoryError, PermissionError) as error:
            return {
                "ok": False,
                "error_code": "sim_cli_unavailable",
                "error": (
                    f"Simulation CLI '{sim_command[0]}' is not available ({error}). "
                    "Build and install it, or set --sim-cli / HCS_SIM_CLI to the executable."
                ),
            }
        except subprocess.TimeoutExpired:
            return {
                "ok": False,
                "error_code": "sim_timeout",
                "error": (
                    "The simulation CLI did not finish within 180 s and was terminated. "
                    "No result is claimed."
                ),
            }

        stdout = (completed.stdout or "").strip()
        try:
            summary = json.loads(stdout)
        except json.JSONDecodeError:
            return {
                "ok": False,
                "error_code": "sim_cli_invalid_output",
                "error": (
                    "The simulation CLI did not return a JSON summary. "
                    f"exit={completed.returncode} stdout={stdout[:400]!r} "
                    f"stderr={(completed.stderr or '')[:400]!r}"
                ),
            }
        if not isinstance(summary, dict):
            return {
                "ok": False,
                "error_code": "sim_cli_invalid_output",
                "error": "The simulation CLI returned JSON that is not an object.",
            }

        artifacts = sorted(path.name for path in target.iterdir() if path.is_file())
        return {
            "ok": bool(summary.get("ok")),
            "state": summary.get("state"),
            "job_id": summary.get("job_id"),
            "out_dir": out_dir,
            "artifacts": artifacts,
            "result": summary.get("result"),
            "error": summary.get("error"),
            "exit_code": completed.returncode,
            "note": (
                "Started by an explicitly approved request. The record in out_dir is the "
                "result of record; this summary is a convenience copy."
            ),
        }

    @server.resource("hcs://engine-registry")
    def engine_registry() -> str:
        """The engine registry with honest installation states."""
        return json.dumps(
            {"implemented": list_engines(), "planned": PLANNED_ENGINES}, indent=2
        )

    @server.resource("hcs://science/fidelity-levels")
    def fidelity_levels() -> str:
        """Definition of the fidelity labels every result must carry."""
        return (
            "Fidelity levels: illustrative (deliberately simplified teaching physics), "
            "classical_model (named classical potential/model), ml_potential (learned "
            "interatomic potential with model card), semi_empirical, first_principles "
            "(named DFT method with functional/basis/cutoff/k-points), continuum_model "
            "(documented PDE/FEM model), benchmark_validated, experiment_referenced. "
            "These are not a universal accuracy ranking; each model is valid only "
            "inside its documented domain."
        )

    @server.prompt()
    def review_simulation_methodology(job_summary: str) -> str:
        """Ask for a critical review of a recorded job's method and provenance."""
        return (
            "You are reviewing a recorded virtual experiment. Use only the supplied "
            "record. Separate facts, assumptions and hypotheses. Check: fidelity level, "
            "engine and model version, cutoff/basis/convergence settings, units, "
            "random seed, uncertainty and stated limitations. Do not invent missing "
            "values; list them as missing.\n\nRecord:\n"
            + job_summary
        )

    @server.prompt()
    def diagnose_convergence_failure(result_summary: str) -> str:
        """Diagnose a non-converged calculation without guessing results."""
        return (
            "A HCS calculation did not converge. Propose concrete checks in order of "
            "likelihood, based only on the record: threshold, iteration count, max "
            "force, timestep, cutoff and structure validity. Do not claim it converged "
            "and do not fabricate final values.\n\nRecord:\n"
            + result_summary
        )

    return server


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="hcs-materials-mcp", description="HCS MCP server (stdio)")
    parser.add_argument("--root", default=".", help="workspace root for project access")
    parser.add_argument(
        "--sim-cli",
        default=os.environ.get("HCS_SIM_CLI", "hcs-sim"),
        help="hcs-sim executable used by simulations_run (default: hcs-sim or $HCS_SIM_CLI)",
    )
    parser.add_argument(
        "--transport",
        default="stdio",
        choices=["stdio"],
        help="stdio only in this build; loopback HTTP is not implemented yet",
    )
    args = parser.parse_args(argv)
    try:
        server = create_server(args.root, sim_cli=args.sim_cli)
    except Exception as error:  # noqa: BLE001
        print(f"error: {error}", file=sys.stderr)
        return 4
    print(f"HCS Material Research Kit {__version__} MCP server on stdio", file=sys.stderr)
    server.run(transport=args.transport)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
