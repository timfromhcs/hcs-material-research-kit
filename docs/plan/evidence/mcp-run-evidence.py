"""Evidence run for the approval-gated MCP simulation tool (Phase B).

Runs the real hcs-sim CLI through the MCP tool against a temporary workspace and
prints the tool's JSON answer. Invoked manually; the output is stored in
docs/plan/evidence/B-mcp-run.txt.
"""

import asyncio
import json
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "python" / "hcs_materials" / "src"))

from mcp import Client  # noqa: E402

from hcs_materials.mcp_server import create_server  # noqa: E402
from hcs_materials.structure import Site, Structure, structure_hash  # noqa: E402


def argon() -> Structure:
    a = 5.26
    basis = [(0, 0, 0), (0, 0.5, 0.5), (0.5, 0, 0.5), (0.5, 0.5, 0)]
    sites = []
    for i in range(2):
        for j in range(2):
            for k in range(2):
                for bx, by, bz in basis:
                    sites.append(Site("Ar", ((bx + i) / 2, (by + j) / 2, (bz + k) / 2)))
    return Structure(
        structure_id="ar32",
        lattice=((a * 2, 0, 0), (0, a * 2, 0), (0, 0, a * 2)),
        sites=sites,
    )


def spec_for(structure: Structure) -> dict:
    return {
        "schema_version": "1.0.0",
        "task_id": "task_evidence",
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


async def main() -> int:
    root = Path(tempfile.mkdtemp(prefix="hcs-mcp-evidence-"))
    cli = REPO / "packages" / "cli" / "dist" / "index.js"
    structure = argon()
    server = create_server(root, sim_cli=["node", str(cli)])
    async with Client(server) as client:
        tools = await client.list_tools()
        print("tools:", sorted(tool.name for tool in tools.tools))
        result = await client.call_tool(
            "simulations_run",
            {
                "spec": spec_for(structure),
                "structure": json.loads(structure.to_json()),
                "out_dir": "runs/evidence",
                "approve": True,
            },
        )
        payload = json.loads(result.content[0].text)
        print(json.dumps(payload, indent=2))
        return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
