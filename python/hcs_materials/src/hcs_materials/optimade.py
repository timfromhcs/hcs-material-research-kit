"""OPTIMADE 1.3 client (standard library only).

Design rules:

* HTTPS only, and only hosts on the explicit provider list unless the caller
  opts into ``allow_any_https``;
* responses are cached on disk with a TTL, so a repeated query does not hammer
  a public database;
* requests are rate limited per client;
* the conversion to an HCS structure records provider, record id, URI, retrieval
  time and (when the provider publishes one) the licence. It never invents a
  licence or a provenance field;
* no credentials are sent, and no user structure is uploaded — OPTIMADE is a
  read-only *import* path.

Specification: https://www.optimade.org (v1.3.0, December 2025).
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .structure import Site, Structure, base_symbol

USER_AGENT = "hcs-materials/0.3 (+https://github.com/timfromhcs/hcs-material-research-kit)"

#: Fields the converter needs. Requesting them explicitly is allowed by the
#: specification and is required in practice: some providers (COD) omit the
#: site arrays from their default response.
REQUIRED_RESPONSE_FIELDS = (
    "lattice_vectors,cartesian_site_positions,species_at_sites,"
    "chemical_formula_reduced,nelements,elements"
)


@dataclass(frozen=True)
class Provider:
    name: str
    base_url: str
    description: str


#: Only providers whose ``/v1/structures`` endpoint was verified on 2026-11-04.
PROVIDERS: dict[str, Provider] = {
    "materials-project": Provider(
        "materials-project",
        "https://optimade.materialsproject.org/v1",
        "Materials Project (computed inorganic materials)",
    ),
    "aflow": Provider(
        "aflow",
        "https://aflow.org/API/optimade/v1",
        "AFLOW (computed alloy and compound library)",
    ),
    "cod": Provider(
        "cod",
        "https://www.crystallography.net/cod/optimade/v1",
        "Crystallography Open Database (experimental crystal structures)",
    ),
    "jarvis": Provider(
        "jarvis",
        "https://jarvis.nist.gov/optimade/jarvisdft/v1",
        "NIST JARVIS (DFT database)",
    ),
}


class OptimadeError(RuntimeError):
    """Typed failure with a stable ``code`` for CLI/MCP callers."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _inverse3(matrix: list[list[float]]) -> list[list[float]]:
    (a, b, c), (d, e, f), (g, h, i) = matrix
    determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(determinant) < 1e-12:
        raise OptimadeError("degenerate_cell", "The provider returned a degenerate lattice")
    return [
        [(e * i - f * h) / determinant, (c * h - b * i) / determinant, (b * f - c * e) / determinant],
        [(f * g - d * i) / determinant, (a * i - c * g) / determinant, (c * d - a * f) / determinant],
        [(d * h - e * g) / determinant, (b * g - a * h) / determinant, (a * e - b * d) / determinant],
    ]


def _fractional(cartesian: list[float], inverse: list[list[float]]) -> tuple[float, float, float]:
    x, y, z = cartesian
    return (
        x * inverse[0][0] + y * inverse[1][0] + z * inverse[2][0],
        x * inverse[0][1] + y * inverse[1][1] + z * inverse[2][1],
        x * inverse[0][2] + y * inverse[1][2] + z * inverse[2][2],
    )


def _safe_id(value: str) -> str:
    return "".join(character if character.isalnum() or character in "-_." else "_" for character in value)[:120]


def entry_to_structure(
    entry: dict[str, Any],
    *,
    provider: Provider,
    retrieved_at: str | None = None,
) -> Structure:
    """Converts one OPTIMADE ``structures`` entry to an HCS structure."""
    if entry.get("type") != "structures":
        raise OptimadeError("wrong_entry_type", f"Expected a structures entry, got '{entry.get('type')}'")
    entry_id = entry.get("id")
    if not isinstance(entry_id, str) or not entry_id:
        raise OptimadeError("missing_id", "The provider returned an entry without an id")
    attributes = entry.get("attributes")
    if not isinstance(attributes, dict):
        raise OptimadeError("missing_attributes", f"Entry {entry_id} has no attributes object")

    lattice = attributes.get("lattice_vectors")
    positions = attributes.get("cartesian_site_positions")
    species = attributes.get("species_at_sites")
    if not isinstance(lattice, list) or len(lattice) != 3:
        raise OptimadeError("missing_lattice", f"Entry {entry_id} has no valid lattice_vectors")
    if not isinstance(positions, list) or not positions:
        raise OptimadeError("missing_positions", f"Entry {entry_id} has no cartesian_site_positions")
    if not isinstance(species, list) or len(species) != len(positions):
        raise OptimadeError(
            "species_mismatch",
            f"Entry {entry_id} has {len(positions)} positions but {len(species) if isinstance(species, list) else 0} species",
        )
    for row in lattice:
        if not isinstance(row, list) or len(row) != 3 or not all(isinstance(v, (int, float)) for v in row):
            raise OptimadeError("invalid_lattice", f"Entry {entry_id} has a malformed lattice row")
    if not all(isinstance(position, list) and len(position) == 3 for position in positions):
        raise OptimadeError("invalid_positions", f"Entry {entry_id} has a malformed site position")

    inverse = _inverse3([[float(v) for v in row] for row in lattice])
    sites = [
        Site(
            species=base_symbol(str(symbol)),
            label=f"{base_symbol(str(symbol))}{index + 1}",
            fractional_position=_fractional([float(v) for v in position], inverse),
            occupancy=1.0,
        )
        for index, (symbol, position) in enumerate(zip(species, positions))
    ]

    license_text = attributes.get("license")
    if not isinstance(license_text, str) or not license_text:
        license_text = None

    retrieved = retrieved_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    structure_id = f"optimade_{provider.name}_{_safe_id(entry_id)}"
    return Structure(
        structure_id=structure_id,
        lattice=tuple(tuple(float(v) for v in row) for row in lattice),  # type: ignore[arg-type]
        sites=sites,
        pbc=(True, True, True),
        display_name=attributes.get("chemical_formula_reduced") or entry_id,
        source={
            "format": "optimade",
            "uri": f"{provider.base_url}/structures/{urllib.parse.quote(entry_id)}",
            "retrieved_at": retrieved,
            "provider": provider.name,
            "provider_record_id": entry_id,
            **({"license": license_text} if license_text else {}),
            "notes": "OPTIMADE 1.3 import; original provider terms apply",
        },
    )


class OptimadeClient:
    """Rate-limited, cached, read-only OPTIMADE client."""

    def __init__(
        self,
        provider: str | Provider = "cod",
        *,
        cache_dir: str | Path | None = None,
        timeout: float = 20.0,
        requests_per_second: float = 2.0,
        cache_ttl_seconds: float = 24 * 60 * 60,
        fetch_json: Callable[[str], Any] | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        allow_any_https: bool = False,
    ) -> None:
        if isinstance(provider, Provider):
            self.provider = provider
        elif provider in PROVIDERS:
            self.provider = PROVIDERS[provider]
        elif "://" in provider:
            if not provider.startswith("https://"):
                raise OptimadeError("insecure_endpoint", "OPTIMADE requests must use HTTPS")
            if not allow_any_https:
                raise OptimadeError(
                    "unknown_provider",
                    "A custom endpoint requires allow_any_https=True; the provider allow-list is the default.",
                )
            self.provider = Provider("custom", provider.rstrip("/"), "Custom HTTPS OPTIMADE endpoint")
        else:
            raise OptimadeError(
                "unknown_provider",
                f"Unknown provider '{provider}'. Known: {', '.join(sorted(PROVIDERS))}. "
                "Pass a full https:// URL with allow_any_https=True for another endpoint.",
            )
        if not self.provider.base_url.startswith("https://"):
            raise OptimadeError("insecure_endpoint", "OPTIMADE requests must use HTTPS")
        if requests_per_second <= 0:
            raise OptimadeError("invalid_rate", "requests_per_second must be positive")
        self.timeout = timeout
        self._interval = 1.0 / requests_per_second
        self._cache_ttl = cache_ttl_seconds
        self._fetch_json = fetch_json or self._urllib_json
        self._clock = clock
        self._sleep = sleep
        self._last_request: float | None = None
        self._cache_dir = Path(cache_dir) if cache_dir else Path.home() / ".hcs-materials" / "cache" / "optimade"
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self.request_count = 0
        self.cache_hits = 0

    # -- transport ---------------------------------------------------------

    def _urllib_json(self, url: str) -> Any:
        request = urllib.request.Request(url, headers={"Accept": "application/vnd.api+json", "User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 - explicit https
                payload = response.read()
        except urllib.error.HTTPError as error:
            raise OptimadeError("http_error", f"{url} returned HTTP {error.code}") from error
        except urllib.error.URLError as error:
            raise OptimadeError("network_error", f"{url} could not be reached: {error.reason}") from error
        try:
            return json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise OptimadeError("invalid_json", f"{url} did not return JSON") from error

    def _cache_path(self, url: str) -> Path:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
        return self._cache_dir / f"{digest}.json"

    def _read_cache(self, url: str) -> Any | None:
        path = self._cache_path(url)
        if not path.is_file():
            return None
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(record, dict) or record.get("url") != url:
            return None
        age = datetime.now(timezone.utc).timestamp() - float(record.get("fetched_at_epoch", 0))
        if age > self._cache_ttl:
            return None
        self.cache_hits += 1
        return record.get("payload")

    def _write_cache(self, url: str, payload: Any) -> None:
        record = {
            "url": url,
            "fetched_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "fetched_at_epoch": datetime.now(timezone.utc).timestamp(),
            "payload": payload,
        }
        path = self._cache_path(url)
        temporary = path.with_suffix(".tmp")
        try:
            temporary.write_text(json.dumps(record), encoding="utf-8")
            temporary.replace(path)
        except OSError:
            # A cache that cannot be written must not fail the request.
            temporary.unlink(missing_ok=True)

    def _get(self, path: str, params: dict[str, Any] | None = None) -> tuple[Any, bool]:
        url = f"{self.provider.base_url}{path}"
        if params:
            filtered = {key: value for key, value in params.items() if value is not None}
            if filtered:
                url = f"{url}?{urllib.parse.urlencode(filtered, doseq=True)}"
        cached = self._read_cache(url)
        if cached is not None:
            return cached, True
        if self._last_request is not None:
            elapsed = self._clock() - self._last_request
            if elapsed < self._interval:
                self._sleep(self._interval - elapsed)
        self._last_request = self._clock()
        self.request_count += 1
        payload = self._fetch_json(url)
        if not isinstance(payload, dict):
            raise OptimadeError("invalid_response", "The provider did not return a JSON object")
        self._write_cache(url, payload)
        return payload, False

    # -- API ---------------------------------------------------------------

    def info(self) -> dict[str, Any]:
        payload, cached = self._get("/info")
        data = payload.get("data")
        if not isinstance(data, dict):
            raise OptimadeError("invalid_info", "The provider returned no /info data")
        return {
            "provider": self.provider.name,
            "base_url": self.provider.base_url,
            "api_version": data.get("api_version"),
            "available_endpoints": data.get("available_endpoints", []),
            "formats": data.get("formats", []),
            "cached": cached,
        }

    def links(self) -> list[dict[str, Any]]:
        payload, _ = self._get("/links")
        data = payload.get("data")
        if not isinstance(data, list):
            raise OptimadeError("invalid_links", "The provider returned no /links data")
        return [
            {
                "id": entry.get("id"),
                "name": entry.get("attributes", {}).get("name"),
                "description": entry.get("attributes", {}).get("description"),
                "base_url": entry.get("attributes", {}).get("base_url"),
                "link_type": entry.get("attributes", {}).get("link_type"),
            }
            for entry in data
            if isinstance(entry, dict)
        ]

    def search(
        self,
        *,
        filter: str | None = None,
        page_limit: int = 10,
        page_offset: int = 0,
        response_fields: str | None = None,
        sort: str | None = None,
    ) -> dict[str, Any]:
        if not 1 <= page_limit <= 50:
            raise OptimadeError("invalid_limit", "page_limit must be between 1 and 50")
        if page_offset < 0:
            raise OptimadeError("invalid_offset", "page_offset must be non-negative")
        payload, cached = self._get(
            "/structures",
            {
                "filter": filter,
                "page_limit": page_limit,
                "page_offset": page_offset,
                "response_fields": response_fields or REQUIRED_RESPONSE_FIELDS,
                "sort": sort,
            },
        )
        data = payload.get("data")
        if not isinstance(data, list):
            raise OptimadeError("invalid_search", "The provider returned no data array")
        retrieved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        structures: list[Structure] = []
        errors: list[dict[str, str]] = []
        for entry in data:
            try:
                structures.append(
                    entry_to_structure(entry, provider=self.provider, retrieved_at=retrieved_at)
                )
            except OptimadeError as error:
                errors.append({"id": str(entry.get("id")), "code": error.code, "message": error.message})
        return {
            "provider": self.provider.name,
            "query": {
                "filter": filter,
                "page_limit": page_limit,
                "page_offset": page_offset,
                "response_fields": response_fields or REQUIRED_RESPONSE_FIELDS,
                "sort": sort,
            },
            "count": len(structures),
            "structures": structures,
            "skipped": errors,
            "cached": cached,
            "retrieved_at": retrieved_at,
            "next_offset": page_offset + len(data),
            "has_more": bool(payload.get("links", {}).get("next")),
        }

    def fetch(self, entry_id: str) -> Structure:
        if not entry_id or "/" in entry_id or ".." in entry_id:
            raise OptimadeError("invalid_id", "The record id contains path characters")
        payload, _ = self._get(
            f"/structures/{urllib.parse.quote(entry_id)}",
            {"response_fields": REQUIRED_RESPONSE_FIELDS},
        )
        entry = payload.get("data")
        if not isinstance(entry, dict):
            raise OptimadeError("not_found", f"The provider returned no entry for '{entry_id}'")
        return entry_to_structure(entry, provider=self.provider)
