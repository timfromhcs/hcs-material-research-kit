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
