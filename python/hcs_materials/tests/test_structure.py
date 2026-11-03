from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from hcs_materials.contracts import ContractViolation, validate_contract
from hcs_materials.io import (
    StructureIOError,
    detect_format,
    read_structure,
    write_structure,
)
from hcs_materials.structure import (
    Structure,
    Site,
    cell_volume,
    composition_of,
    density_g_per_cm3,
    structure_hash,
    validate_structure,
)

FIXTURES = Path(__file__).resolve().parents[3] / "tests" / "fixtures"


def read_fixture(name: str) -> str:
    return (FIXTURES / "structures" / name).read_text(encoding="utf-8")


def rocksalt(a: float = 5.64) -> Structure:
    fcc = [(0, 0, 0), (0, 0.5, 0.5), (0.5, 0, 0.5), (0.5, 0.5, 0)]
    sites = [Site("Na", f) for f in fcc]
    sites += [Site("Cl", ((f[0] + 0.5) % 1.0, f[1], f[2])) for f in fcc]
    return Structure(structure_id="rocksalt", lattice=((a, 0, 0), (0, a, 0), (0, 0, a)), sites=sites)


class TestStructure:
    def test_cell_volume_and_density(self) -> None:
        s = rocksalt()
        assert cell_volume(s) == pytest.approx(5.64**3)
        # Reference density of rock salt at room temperature
        assert density_g_per_cm3(s) == pytest.approx(2.165, rel=0.015)

    def test_composition_uses_conventional_ordering(self) -> None:
        assert composition_of(rocksalt().sites)["reduced_formula"] == "NaCl"
        perovskite = [
            Site("Sr", (0, 0, 0)),
            Site("Ti", (0.5, 0.5, 0.5)),
            Site("O", (0.5, 0.5, 0)),
            Site("O", (0.5, 0, 0.5)),
            Site("O", (0, 0.5, 0.5)),
        ]
        assert composition_of(perovskite)["reduced_formula"] == "SrTiO3"

    def test_validation_flags_collapsed_cells(self) -> None:
        s = Structure(
            structure_id="bad",
            lattice=((0, 0, 0), (0, 0, 0), (0, 0, 0)),
            sites=[Site("Cu", (0, 0, 0))],
        )
        report = validate_structure(s)
        assert report.status == "invalid"
        assert any(check.id == "lattice.volume" and check.status == "fail" for check in report.checks)

    def test_validation_warns_on_overlaps(self) -> None:
        s = Structure(
            structure_id="overlap",
            lattice=((4, 0, 0), (0, 4, 0), (0, 0, 4)),
            sites=[Site("Ar", (0, 0, 0)), Site("Ar", (0.01, 0, 0))],
        )
        report = validate_structure(s)
        assert report.status == "warning"
        assert any(check.id == "sites.overlap" and check.status == "warning" for check in report.checks)

    def test_wrapping_does_not_change_identity(self) -> None:
        s = rocksalt()
        shifted = Structure(
            structure_id=s.structure_id,
            lattice=s.lattice,
            sites=[Site(site.species, (site.fractional_position[0] + 1.0, site.fractional_position[1],
                                    site.fractional_position[2] + 2.0)) for site in s.sites],
        )
        assert structure_hash(s) == structure_hash(shifted)

    def test_schema_validation_accepts_generated_document(self) -> None:
        validate_contract("structure", json.loads(rocksalt().to_json()))

    def test_schema_validation_rejects_bad_documents(self) -> None:
        document = json.loads(rocksalt().to_json())
        document["sites"][0]["occupancy"] = 2.0
        with pytest.raises(ContractViolation):
            validate_contract("structure", document)


class TestIO:
    def test_reads_silicon_cif(self) -> None:
        structure, warnings = read_structure(read_fixture("silicon.cif"), "silicon.cif")
        assert len(structure.sites) == 8
        assert cell_volume(structure) == pytest.approx(5.431**3, rel=1e-9)
        assert any("space group" in warning for warning in warnings)

    def test_expands_explicit_symmetry_operations(self) -> None:
        structure, _, applied = __import__("hcs_materials.io", fromlist=["read_cif"]).read_cif(
            read_fixture("inversion.cif"), "inversion.cif"
        )
        assert applied == 2
        assert len(structure.sites) == 4

    def test_poscar_roundtrip(self) -> None:
        original, _ = read_structure(read_fixture("nacl.poscar"), "nacl.poscar")
        assert len(original.sites) == 8
        again, _ = read_structure(write_structure(original, "poscar"), "roundtrip.poscar")
        assert structure_hash(again) == structure_hash(original)

    def test_xyz_without_cell_gets_padded_box(self) -> None:
        structure, warnings = read_structure(read_fixture("water.xyz"), "water.xyz")
        assert len(structure.sites) == 3
        assert structure.pbc == (False, False, False)
        assert any("no cell" in warning.lower() for warning in warnings)

    def test_extxyz_lattice_is_honoured(self) -> None:
        structure, _ = read_structure(read_fixture("nacl_ext.xyz"), "nacl_ext.xyz")
        assert structure.pbc == (True, True, True)
        assert cell_volume(structure) == pytest.approx(64.0)

    def test_detects_formats(self) -> None:
        assert detect_format(read_fixture("silicon.cif"), "x.cif") == "cif"
        assert detect_format(read_fixture("nacl.poscar"), "x.poscar") == "poscar"
        assert detect_format(read_fixture("water.xyz"), "x.xyz") == "xyz"
        assert detect_format('{"lattice": {}}') == "hcs-json"

    def test_rejects_truncated_xyz(self) -> None:
        with pytest.raises(StructureIOError):
            read_structure("5\ncomment\nC 0 0 0\n", "bad.xyz")

    def test_rejects_cif_without_cell(self) -> None:
        with pytest.raises(StructureIOError):
            read_structure("data_x\nloop_\n_atom_site_fract_x\n0\n", "bad.cif")

    def test_cif_writer_roundtrip(self) -> None:
        original = rocksalt()
        again, _ = read_structure(write_structure(original, "cif"), "x.cif")
        assert structure_hash(again) == structure_hash(original)


class TestCrossLanguage:
    """Fixtures generated by the TypeScript package must be reproduced here."""

    def test_structure_identity_matches_typescript(self) -> None:
        path = FIXTURES / "reference" / "structure-identity.json"
        if not path.is_file():
            pytest.skip("run `npx tsx scripts/make-reference-fixtures.ts` to generate fixtures")
        payload = json.loads(path.read_text(encoding="utf-8"))
        from hcs_materials.io import read_hcs_json

        structure = read_hcs_json(json.dumps(payload["structure"]))
        expected = payload["expected"]
        assert structure_hash(structure) == expected["structure_hash"]
        assert composition_of(structure.sites)["reduced_formula"] == expected["reduced_formula"]
        assert cell_volume(structure) == pytest.approx(expected["cell_volume_angstrom3"], rel=1e-12)
        assert density_g_per_cm3(structure) == pytest.approx(expected["density_g_per_cm3"], rel=1e-9)
