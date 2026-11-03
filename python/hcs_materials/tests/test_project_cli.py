from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from hcs_materials.cli import main
from hcs_materials.io import read_structure
from hcs_materials.project import (
    ProjectError,
    is_safe_archive_path,
    read_project,
    summarize_project,
    write_project,
    ProjectMeta,
)
from hcs_materials.registry import get_engine, list_engines, require_engine

FIXTURES = Path(__file__).resolve().parents[3] / "tests" / "fixtures"


def test_safe_path_rules() -> None:
    assert is_safe_archive_path("structures/a.json")
    assert not is_safe_archive_path("../escape")
    assert not is_safe_archive_path("/etc/passwd")
    assert not is_safe_archive_path("C:/Windows/evil.dll")
    assert not is_safe_archive_path("a\\b")
    assert not is_safe_archive_path("a//b")


def test_project_roundtrip(tmp_path: Path) -> None:
    structure, _ = read_structure((FIXTURES / "structures" / "silicon.cif").read_text(encoding="utf-8"), "silicon.cif")
    project = ProjectMeta(name="Silicon demo", project_id="project_demo")
    target = write_project(
        tmp_path / "demo.hcsproj",
        project,
        structures=[structure],
        jobs=[
            {
                "job_id": "job_1",
                "input": {"task_type": "energy.evaluate"},
                "status": {"state": "completed"},
                "result": {"quantities": []},
                "log": "done\n",
            }
        ],
        reports={"summary.html": "<html></html>"},
    )
    assert target.exists()
    result = read_project(target)
    assert result.checksums_verified
    assert result.warnings == []
    assert len(result.structures) == 1
    assert result.jobs[0]["job_id"] == "job_1"
    assert result.reports["summary.html"] == "<html></html>"
    summary = summarize_project(result)
    assert summary["structures"][0]["formula"] == "Si"


def test_project_detects_tampering(tmp_path: Path) -> None:
    structure, _ = read_structure((FIXTURES / "structures" / "silicon.cif").read_text(encoding="utf-8"), "silicon.cif")
    target = write_project(tmp_path / "tamper.hcsproj", ProjectMeta(name="t", project_id="p"), [structure])
    with zipfile.ZipFile(target) as archive:
        entries = {name: archive.read(name) for name in archive.namelist()}
    entries["structures/silicon.cif.json" if False else next(n for n in entries if n.startswith("structures/"))] += b" "
    tampered = tmp_path / "tampered.hcsproj"
    with zipfile.ZipFile(tampered, "w") as archive:
        for name, payload in entries.items():
            archive.writestr(name, payload)
    result = read_project(tampered)
    assert not result.checksums_verified
    assert any("Checksum mismatch" in warning for warning in result.warnings)


def test_project_rejects_path_traversal(tmp_path: Path) -> None:
    target = tmp_path / "evil.hcsproj"
    with zipfile.ZipFile(target, "w") as archive:
        archive.writestr("project.json", "{}")
        archive.writestr("../escape.txt", "pwned")
    with pytest.raises(ProjectError):
        read_project(target)


def test_registry_is_honest() -> None:
    ids = [engine["engine_id"] for engine in list_engines()]
    assert "hcs.lj-reference" in ids
    assert "lammps" not in ids
    assert get_engine("hcs.lj-reference") is not None
    with pytest.raises(LookupError):
        require_engine("lammps")


def test_cli_structure_validate_json(capsys: pytest.CaptureFixture[str]) -> None:
    file = FIXTURES / "structures" / "nacl.poscar"
    code = main(["--json", "structure", "validate", str(file)])
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True
    assert payload["formula"] == "NaCl"
    assert payload["validation"]["status"] in ("valid", "warning")


def test_cli_structure_validate_bad_file(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["--json", "structure", "validate", "does-not-exist.cif"])
    assert code == 3
    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is False


def test_cli_convert_and_project(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = FIXTURES / "structures" / "silicon.cif"
    out = tmp_path / "silicon.poscar"
    assert main(["--json", "structure", "convert", str(source), str(out)]) == 0
    assert out.exists()
    capsys.readouterr()
    project_path = tmp_path / "p"
    assert main(["--json", "project", "create", str(project_path), "--name", "Demo"]) == 0
    capsys.readouterr()
    archive = tmp_path / "p.hcsproj"
    assert archive.exists()
    assert main(["--json", "project", "validate", str(archive)]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["checksums_verified"] is True


def test_cli_engines(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--json", "engines", "list"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert any(engine["engine_id"] == "hcs.lj-reference" for engine in payload["engines"])
    assert main(["--json", "engines", "inspect", "lammps"]) != 0
