# ADR-0014 — Loopback Streamable HTTP with a bearer token

**Status:** accepted (2026-11-04)
**Context:** v0.2.0 exposed MCP over stdio only. The 2026-07-28 specification is stateless-first
and requires `Mcp-Method` / `Mcp-Name` headers on Streamable HTTP; stdio-only is a real
limitation for agents that cannot spawn a subprocess.

## Decision

Add `--transport streamable-http` to `hcs-materials-mcp`:

- binds **127.0.0.1 by default**; a non-loopback bind is refused unless
  `--allow-non-loopback` is passed explicitly;
- requires a bearer token, generated at startup (`secrets.token_urlsafe(32)`) and printed once
  to stderr, or supplied with `--token`;
- the token is accepted as `Authorization: Bearer <token>` **or** as a `?token=` query
  parameter, because the official Python SDK client takes a URL and does not expose a headers
  argument. The query form is documented as a loopback convenience;
- uses the SDK's stateless HTTP mode with `json_response=true`;
- caps request bodies at 1 MB and returns 401/413 before the MCP app sees the request;
- stdio remains the default and is unchanged.

## Consequences

- `tools/list`, `resources/list` and `tools/call` work over HTTP with the official client
  (`docs/plan/evidence/mcp-http.txt`: 10 tools, 2 resources, protocol 2026-07-28).
- The token is a shared secret, not OAuth. It is appropriate for a local process, not for a
  network service; binding beyond loopback is an explicit, documented override.
- No session state is kept between requests. Cross-call state, if ever needed, must be an
  explicit handle passed as a tool argument — the specification's direction.
- The workload budgets and approval gate for `simulations_run` apply identically over HTTP.

## Alternatives rejected

| Alternative                     | Why not                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Unauthenticated loopback HTTP   | Any local process could start simulations; the approval gate would be weaker than advertised.            |
| Full OAuth authorization server | Far more surface than a local desktop tool needs; the SDK auth layer is designed for remote deployments. |
| Custom HTTP transport           | The SDK already implements the 2026-07-28 handshake and headers.                                         |
| Token only in the header        | The official SDK client cannot send custom headers.                                                      |
