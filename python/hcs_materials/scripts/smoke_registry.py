import json
from pathlib import Path

from hcs_materials.registry import ENGINE_REGISTRY, PLANNED_ENGINES
from hcs_materials.contracts import validate_contract

for engine in ENGINE_REGISTRY:
    document = engine.to_dict()
    validate_contract("engine", document)
    print(f"engine ok: {engine.engine_id}")
for planned in PLANNED_ENGINES:
    assert planned["status"] == "not_implemented"
print("planned engines are not marked implemented")
print(json.dumps(ENGINE_REGISTRY[0].to_dict(), indent=2)[:400])

# Verify the schema directory resolution used by contracts.load_schema
from hcs_materials.contracts import _schema_directories

print("schema dirs:", [str(p) for p in _schema_directories()])
print("fixture exists:", Path("tests/fixtures/reference/structure-identity.json").exists())
