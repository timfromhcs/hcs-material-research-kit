"""Tests for the OPTIMADE 1.3 client. No network is used."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hcs_materials.contracts import validate_contract
from hcs_materials.optimade import (
    PROVIDERS,
    OptimadeClient,
    OptimadeError,
    entry_to_structure,
)

ENTRY = {
    "type": "structures",
    "id": "cod-123",
    "attributes": {
        "lattice_vectors": [[5.431, 0, 0], [0, 5.431, 0], [0, 0, 5.431]],
        "cartesian_site_positions": [[0, 0, 0], [1.35775, 1.35775, 1.35775]],
        "species_at_sites": ["Si", "Si"],
        "chemical_formula_reduced": "Si",
        "nsites": 2,
        "license": "CC BY 4.0",
    },
}


class FakeTransport:
    def __init__(self, entry=ENTRY):
        self.entry = entry
        self.calls: list[str] = []

    def __call__(self, url: str):
        self.calls.append(url)
        if "/structures/" in url:
            return {"data": self.entry}
        if "/structures?" in url:
            return {"data": [self.entry], "links": {"next": None}}
        if url.endswith("/info"):
            return {
                "data": {
                    "api_version": "1.3.0",
                    "available_endpoints": ["info", "links", "structures"],
                    "formats": ["json"],
                }
            }
        if url.endswith("/links"):
            return {"data": []}
        raise AssertionError(f"unexpected URL {url}")


def client(tmp_path: Path, transport=None, **kwargs) -> OptimadeClient:
    return OptimadeClient(
        "cod",
        cache_dir=tmp_path / "cache",
        fetch_json=transport or FakeTransport(),
        sleep=lambda _: None,
        **kwargs,
    )


def test_provider_list_is_the_verified_set() -> None:
    assert set(PROVIDERS) == {"materials-project", "aflow", "cod", "jarvis"}
    assert all(provider.base_url.startswith("https://") for provider in PROVIDERS.values())


def test_unknown_and_insecure_providers_are_refused(tmp_path: Path) -> None:
    with pytest.raises(OptimadeError) as error:
        OptimadeClient("not-a-provider", cache_dir=tmp_path)
    assert error.value.code == "unknown_provider"
    with pytest.raises(OptimadeError) as insecure:
        OptimadeClient("http://example.org/v1", cache_dir=tmp_path, allow_any_https=True)
    assert insecure.value.code == "insecure_endpoint"


def test_entry_converts_to_a_valid_hcs_structure(tmp_path: Path) -> None:
    structure = entry_to_structure(ENTRY, provider=PROVIDERS["cod"])
    document = structure.to_dict()
    validate_contract("structure", document)
    assert document["composition"]["reduced_formula"] == "Si"
    assert structure.sites[1].fractional_position == pytest.approx((0.25, 0.25, 0.25))
    assert structure.source["format"] == "optimade"
    assert structure.source["provider"] == "cod"
    assert structure.source["provider_record_id"] == "cod-123"
    assert structure.source["license"] == "CC BY 4.0"


def test_search_passes_the_filter_and_paginates(tmp_path: Path) -> None:
    transport = FakeTransport()
    result = client(tmp_path, transport).search(
        filter='elements HAS "Si"', page_limit=5, page_offset=10, sort="nelements"
    )
    assert result["count"] == 1
    assert result["next_offset"] == 11
    assert "filter=elements+HAS+%22Si%22" in transport.calls[0]
    assert "page_limit=5" in transport.calls[0]
    assert "page_offset=10" in transport.calls[0]
    assert "sort=nelements" in transport.calls[0]


def test_cache_prevents_a_second_request(tmp_path: Path) -> None:
    transport = FakeTransport()
    first = client(tmp_path, transport).search(filter='elements HAS "Si"')
    second_client = client(tmp_path, transport)
    second = second_client.search(filter='elements HAS "Si"')
    assert first["cached"] is False
    assert second["cached"] is True
    assert second_client.cache_hits == 1
    assert len(transport.calls) == 1


def test_cache_ttl_expires(tmp_path: Path) -> None:
    transport = FakeTransport()
    first = client(tmp_path, transport)
    first.search()
    # Rewrite the cache record with an old timestamp.
    cache_file = next((tmp_path / "cache").glob("*.json"))
    record = json.loads(cache_file.read_text(encoding="utf-8"))
    record["fetched_at_epoch"] = 0
    cache_file.write_text(json.dumps(record), encoding="utf-8")
    second = client(tmp_path, transport)
    result = second.search()
    assert result["cached"] is False
    assert len(transport.calls) == 2


def test_rate_limit_waits_between_requests(tmp_path: Path) -> None:
    sleeps: list[float] = []
    now = [100.0]

    def clock() -> float:
        return now[0]

    def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        now[0] += seconds

    transport = FakeTransport()
    rate_limited = OptimadeClient(
        "cod",
        cache_dir=tmp_path / "cache",
        fetch_json=transport,
        requests_per_second=2.0,
        clock=clock,
        sleep=sleep,
    )
    rate_limited.search(page_limit=1)
    rate_limited.search(page_limit=2)
    assert sleeps and sleeps[0] == pytest.approx(0.5)


def test_malformed_entries_are_skipped_with_a_code(tmp_path: Path) -> None:
    broken = {
        "type": "structures",
        "id": "broken-1",
        "attributes": {
            "lattice_vectors": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            "cartesian_site_positions": [[0, 0, 0]],
            "species_at_sites": ["Si", "O"],
        },
    }
    transport = FakeTransport(entry=broken)
    result = client(tmp_path, transport).search()
    assert result["count"] == 0
    assert result["skipped"][0]["code"] == "species_mismatch"  # noqa: E501


def test_fetch_rejects_path_characters(tmp_path: Path) -> None:
    with pytest.raises(OptimadeError) as error:
        client(tmp_path).fetch("../../etc/passwd")
    assert error.value.code == "invalid_id"


def test_info_and_links(tmp_path: Path) -> None:
    info = client(tmp_path).info()
    assert info["api_version"] == "1.3.0"
    assert "structures" in info["available_endpoints"]
    assert client(tmp_path).links() == []
