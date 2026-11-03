"""End-to-end test of the MCP server using the official SDK client in-process.

The server is created exactly as the CLI creates it (same tools, resources and
prompts), so this test covers the real exposed surface rather than a stub.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

mcp = pytest.importorskip("mcp")

from mcp import Client  # noqa: E402

from hcs_materials.mcp_server import create_server  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[3] / "tests" / "fixtures"


def run(coro):
    return asyncio.run(coro)


def test_tools_are_listed_and_documented(tmp_path: Path) -> None:
    server = create_server(tmp_path)

    async def scenario() -> list[str]:
        async with Client(server) as client:
            result = await client.list_tools()
            return sorted(tool.name for tool in result.tools)

    names = run(scenario())
    assert names == [
        "engines_list",
        "project_validate",
        "results_summarize",
        "simulations_validate_spec",
        "structures_convert",
        "structures_validate",
    ]


def test_engines_list_is_honest(tmp_path: Path) -> None:
    server = create_server(tmp_path)

    async def scenario():
        async with Client(server) as client:
            return await client.call_tool("engines_list", {})

    result = run(scenario())
    payload = json.loads(result.content[0].text)
    ids = [engine["engine_id"] for engine in payload["engines"]]
    assert "hcs.lj-reference" in ids
    assert "lammps" not in ids
    assert any(item["status"] == "not_implemented" for item in payload["planned"])


def test_validate_a_real_structure(tmp_path: Path) -> None:
    from hcs_materials.io import read_structure

    cif = (FIXTURES / "structures" / "silicon.cif").read_text(encoding="utf-8")
    structure, _ = read_structure(cif, "silicon.cif")
    document = json.loads(structure.to_json())
    server = create_server(tmp_path)

    async def scenario():
        async with Client(server) as client:
            return await client.call_tool("structures_validate", {"structure": document})

    result = run(scenario())
    payload = json.loads(result.content[0].text)
    assert payload["ok"] is True
    assert payload["atoms"] == 8
    assert payload["cell_volume_angstrom3"] == pytest.approx(5.431**3, rel=1e-9)


def test_convert_rejects_unknown_target_format(tmp_path: Path) -> None:
    server = create_server(tmp_path)

    async def scenario():
        async with Client(server) as client:
            return await client.call_tool(
                "structures_convert",
                {"content": "1\nx\nC 0 0 0\n", "filename": "x.xyz", "target_format": "exe"},
            )

    payload = json.loads(run(scenario()).content[0].text)
    assert payload["ok"] is False
    assert "Unsupported target format" in payload["error"]


def test_project_validate_is_confined_to_the_workspace(tmp_path: Path) -> None:
    from hcs_materials.project import ProjectMeta, write_project

    write_project(tmp_path / "ok.hcsproj", ProjectMeta(name="ok", project_id="p"), [])
    server = create_server(tmp_path)

    async def scenario():
        async with Client(server) as client:
            inside = await client.call_tool("project_validate", {"relative_path": "ok.hcsproj"})
            outside = await client.call_tool(
                "project_validate", {"relative_path": "../../etc/passwd"}
            )
            return (
                json.loads(inside.content[0].text),
                json.loads(outside.content[0].text),
            )

    inside, outside = run(scenario())
    assert inside["ok"] is True
    assert outside["ok"] is False
    assert "escapes" in outside["error"] or "relative" in outside["error"]


def test_engine_registry_resource(tmp_path: Path) -> None:
    server = create_server(tmp_path)

    async def scenario() -> str:
        async with Client(server) as client:
            resources = await client.list_resources()
            uris = [str(r.uri) for r in resources.resources]
            assert any("engine-registry" in uri for uri in uris)
            result = await client.read_resource("hcs://engine-registry")
            return result.contents[0].text

    text = run(scenario())
    assert "hcs.lj-reference" in text


def argon_structure():
    """2x2x2 fcc argon cell built from exact rational coordinates."""
    from hcs_materials.structure import Site, Structure

    a = 5.26
    basis = [(0, 0, 0), (0, 0.5, 0.5), (0.5, 0, 0.5), (0.5, 0.5, 0)]
    sites = []
    for i in range(2):
        for j in range(2):
            for k in range(2):
                for bx, by, bz in basis:
                    sites.append(
                        Site("Ar", ((bx + i) / 2, (by + j) / 2, (bz + k) / 2))
                    )
    return Structure(
        structure_id="ar32",
        lattice=((a * 2, 0, 0), (0, a * 2, 0), (0, 0, a * 2)),
        sites=sites,
    )


def valid_spec(structure) -> dict:
    from hcs_materials.structure import structure_hash

    return {
        "schema_version": "1.0.0",
        "task_id": "task_1",
        "task_type": "energy.evaluate",
        "structure_ref": {
            "structure_id": structure.structure_id,
            "structure_hash": structure_hash(structure),
        },
        "engine_id": "hcs.lj-reference",
        "model_id": "lj.noble-gases.v1",
        "fidelity_level": "classical_model",
        "parameters": {},
    }


def test_validate_spec_accepts_a_runnable_input(tmp_path: Path) -> None:
    structure = argon_structure()
    spec = valid_spec(structure)
    server = create_server(tmp_path)

    async def scenario():
        async with Client(server) as client:
            return await client.call_tool(
                "simulations_validate_spec",
                {"spec": spec, "structure": json.loads(structure.to_json())},
            )

    payload = json.loads(run(scenario()).content[0].text)
    assert payload["ok"] is True
    assert payload["issues"] == []
    assert payload["engine"]["engine_id"] == "hcs.lj-reference"
    assert "No simulation was started" in payload["note"]


def test_validate_spec_reports_every_blocking_issue(tmp_path: Path) -> None:
    structure = argon_structure()
    spec = valid_spec(structure)
    bad = dict(spec)
    bad["fidelity_level"] = "first_principles"
    bad["engine_id"] = "lammps"
    bad["structure_ref"] = {"structure_id": "x", "structure_hash": "0" * 64}
    bad["task_type"] = "md.run"
    bad["thermodynamic_conditions"] = {"ensemble": "NVT"}
    server = create_server(tmp_path)

    async def scenario():
        async with Client(server) as client:
            return await client.call_tool(
                "simulations_validate_spec",
                {"spec": bad, "structure": json.loads(structure.to_json())},
            )

    payload = json.loads(run(scenario()).content[0].text)
    assert payload["ok"] is False
    text = " | ".join(payload["issues"])
    assert "planned but not implemented" in text
    assert "does not match" in text


def test_validate_spec_reports_unsupported_elements(tmp_path: Path) -> None:
    from hcs_materials.io import read_structure

    cif = (FIXTURES / "structures" / "silicon.cif").read_text(encoding="utf-8")
    structure, _ = read_structure(cif, "silicon.cif")
    spec = valid_spec(structure)
    server = create_server(tmp_path)

    async def scenario():
        async with Client(server) as client:
            return await client.call_tool(
                "simulations_validate_spec",
                {"spec": spec, "structure": json.loads(structure.to_json())},
            )

    payload = json.loads(run(scenario()).content[0].text)
    assert payload["ok"] is False
    assert any("no parameters for: Si" in issue for issue in payload["issues"])


def test_results_summarize_reads_an_archive(tmp_path: Path) -> None:
    from hcs_materials.project import ProjectMeta, write_project

    structure = argon_structure()
    job = {
        "job_id": "job_demo",
        "input": {"task_type": "energy.evaluate", "engine_id": "hcs.lj-reference"},
        "status": {"state": "completed"},
        "result": {
            "status": "complete",
            "fidelity_level": "classical_model",
            "quantities": [
                {"name": "total_potential_energy", "value": -1.5, "unit": "eV"},
                {"name": "max_force", "value": 0.02, "unit": "eV/angstrom"},
            ],
            "convergence": {"converged": True, "criterion": "single point"},
            "limitations": ["Pairwise model only."],
        },
        "provenance": {"environment": {"backend": "wasm"}},
    }
    write_project(
        tmp_path / "demo.hcsproj",
        ProjectMeta(name="demo", project_id="project_demo"),
        [structure],
        [job],
    )
    server = create_server(tmp_path)

    async def scenario():
        async with Client(server) as client:
            return await client.call_tool(
                "results_summarize", {"relative_path": "demo.hcsproj"}
            )

    payload = json.loads(run(scenario()).content[0].text)
    assert payload["ok"] is True
    assert len(payload["jobs"]) == 1
    summary = payload["jobs"][0]
    assert summary["backend"] == "wasm"
    assert summary["quantities"][0]["unit"] == "eV"
    assert summary["limitations"] == ["Pairwise model only."]
    assert "never filled in" in payload["note"]

