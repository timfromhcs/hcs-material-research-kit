# Security and privacy threat model

## Assets

1. The user's structures, trajectories, results and research plans.
2. The integrity of scientific results (wrong numbers are worse than no numbers).
3. The user's machine (no arbitrary code execution from imported files).
4. Credentials (none are stored in this release).

## Adversaries

- A malicious structure/CIF/archive file.
- A malicious or compromised webpage (for the future browser companion).
- A careless user action (importing an untrusted project, deleting data).
- A supply-chain compromise in a dependency.
- A future MCP host that calls tools with hostile arguments.

## Controls currently implemented

| Threat | Control |
|---|---|
| Path traversal in `.hcsproj` | reject `..`, absolute paths, drive letters, backslashes; verified on read and write |
| Zip bomb / resource exhaustion | 5 000 entry limit, 256 MB total, 64 MB per file, verified before parsing |
| Silent archive corruption | per-file SHA-256, verified on read; mismatch reported |
| Unbounded computation | atom-count limits, step limits, O(N²) documented, cutoff preflight |
| Fabricated results | schema + fidelity + convergence + limitations enforced at the type level |
| Silent parameter reset | locale-tolerant numeric input, no NaN stored |
| Element guessing | species whitelist; unsupported elements refuse the run |
| MCP arbitrary execution | no shell tool, no Python tool, only 4 bounded tools |
| MCP path escape | paths resolved against `--root`, traversal rejected |
| Data exfiltration | no network calls in the studio, no telemetry, no backend |
| Secrets in bundle | no keys, no proxy tokens, `.env*` ignored |
| XSS in exported report | all interpolated values HTML-escaped (tested) |
| Oversized structure file | 64 MB read limit in Python; browser File API parse errors surface |

## Not yet implemented / residual risk

- **No CSP** is set on the static deployment yet (`vercel.json` sets `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`). Add a strict CSP before public launch.
- **No archive signing.** Checksums detect accidental/tampered modification only if the expected
  digest is known independently; they are not a signature.
- **No sandbox** around future native engine subprocesses (not implemented yet).
- **Browser storage eviction** can destroy unsaved work; the UI warns and offers export.
- **Dependency advisories** exist in the dev toolchain; see `SECURITY.md`.
- **No automated secret scanning** in CI yet (the workflow is defined, not executed).

## Privacy statement

- No account is required.
- No telemetry, analytics, crash reporting or remote logging exists in the codebase.
- No structure, coordinate, job or result is transmitted anywhere.
- The only network requests a user can trigger are explicit file downloads from their own
  browser (blob URLs). Future database connectors must show the provider and the fields sent
  before the first request.

## Reporting

See `SECURITY.md`. Do not attach confidential material data to public reports.
