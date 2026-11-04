# Importing structures with OPTIMADE

**Specification:** [OPTIMADE 1.3.0](https://www.optimade.org) (December 2025)
**Edition:** Python CLI and MCP server (desktop/native). The browser edition cannot call these
providers directly because they do not send CORS headers — see the note at the end.

## Why it is a separate path

OPTIMADE is a read-only federation API over materials databases. HCS imports a record, converts
it to the canonical HCS structure, and records where it came from:

- provider name and base URL;
- provider record id;
- record URI;
- retrieval timestamp;
- licence, when the provider publishes one;
- a note that the provider's terms still apply.

Nothing is uploaded. No API key is used. The client sends no cookies or credentials.

## Providers

These four endpoints were verified on 2026-11-04:

| Name                | Base URL                                          | What it is                      |
| ------------------- | ------------------------------------------------- | ------------------------------- |
| `materials-project` | `https://optimade.materialsproject.org/v1`        | Computed inorganic materials    |
| `aflow`             | `https://aflow.org/API/optimade/v1`               | AFLOW alloy/compound library    |
| `cod`               | `https://www.crystallography.net/cod/optimade/v1` | Experimental crystal structures |
| `jarvis`            | `https://jarvis.nist.gov/optimade/jarvisdft/v1`   | NIST JARVIS DFT database        |

A custom endpoint requires `allow_any_https=True` in the Python API; the CLI/MCP tools use the
allow-list.

## CLI

```bash
# What can I query?
hcs-materials optimade providers

# Read the provider's capabilities
hcs-materials optimade info --provider cod

# Search and write one HCS JSON file per structure plus a manifest
hcs-materials optimade search \
  --provider cod \
  --filter 'nelements=2' \
  --limit 5 \
  --out ./imported

# Fetch a single record
hcs-materials optimade fetch --provider cod --id 1000017 --out ./Al2O3.json
```

The search writes:

```text
imported/
  optimade_cod_1000017.json     converted HCS structure
  optimade_cod_1000025.json
  optimade-search.json          query, provider, counts, skipped records, licences
```

Every converted structure is validated against the canonical schema before it is written.

## MCP

| Tool                 | Inputs                                                   | Behaviour                  |
| -------------------- | -------------------------------------------------------- | -------------------------- |
| `optimade_providers` | —                                                        | Lists the allow-list       |
| `optimade_search`    | `provider`, `filter`, `page_limit` (1–20), `page_offset` | Read-only, bounded, cached |
| `optimade_fetch`     | `provider`, `entry_id`                                   | Read-only, one record      |

The tools return the HCS structure documents, the query that was sent, skipped records with a
typed reason, and the provider/licence note. They never write to the workspace.

## Caching and rate limiting

- Responses are cached on disk (default `~/.hcs-materials/cache/optimade`) for 24 hours.
- The cache key is the canonical request URL, so a changed filter is a new request.
- Requests are limited per client (default 2 per second).
- A cache write failure never fails the request.

## Why the browser does not call OPTIMADE

The providers tested on 2026-11-04 return no `Access-Control-Allow-Origin` header. A browser
fetch would be blocked, and routing it through a server-side proxy would turn a local-first
import into a cloud dependency. The browser therefore shows the honest state: use the desktop
or Python connector.

## Limitations

- Only the `structures` endpoint is exposed; references and calculations are not imported.
- Records without `cartesian_site_positions` or `species_at_sites` are skipped with a typed
  reason (`missing_positions`, `species_mismatch`), never guessed.
- The conversion assumes a fully periodic 3D cell. Partial-periodicity records are imported with
  `pbc = [true, true, true]`; this is a known limitation, not a silent assumption.
- Licence metadata is recorded only when the provider publishes it. The absence of a licence
  field is not permission.
