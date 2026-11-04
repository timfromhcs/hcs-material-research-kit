# ADR-0013 — Tauri 2 desktop shell without extra privileges

**Status:** accepted (2026-11-04)
**Context:** the browser edition is local-first, but it is still a tab: storage can be evicted,
the window is a browser window, and there is no installable artifact. A desktop edition was
planned from the start.

## Decision

Ship a Tauri 2 shell (`apps/desktop/src-tauri`) that loads the **same** static studio build:

- `frontendDist` points at `apps/web/dist`; there is no second frontend;
- the Rust surface exposes exactly one command, `app_info`, which reports the binary name,
  version, platform, architecture and edition;
- no shell plugin, no arbitrary filesystem command, no HTTP client, no auto-updater;
- the CSP is explicit and includes `'wasm-unsafe-eval'` for the WASM kernel and `ipc:` for
  Tauri's own channel;
- bundle targets: NSIS + MSI on Windows, deb/AppImage on Linux, dmg on macOS.

## Why not add native file dialogs now

The web app already exports and imports files through the browser download/upload path, which
works inside WebView2. Adding a native dialog is a privilege increase with no capability gain
until there is a sidecar that needs a path. It stays out until it is needed and tested.

## Consequences

- The desktop edition is honest about what it is: the same studio with a native window and an
  offline origin. It does not claim a different solver.
- Windows artifacts are built locally (NSIS 3.37 MiB, MSI 4.26 MiB) and smoke-tested. Linux and
  macOS artifacts come from the CI matrix; the release notes say which platform was built where.
- The binaries are **unsigned**. Windows SmartScreen will warn; the release notes say so instead
  of implying a trusted signature.
- `cargo test` in `apps/desktop/src-tauri` covers `app_info`; the UI smoke test covers launch.

## Alternatives rejected

| Alternative                         | Why not                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Electron                            | Much larger runtime and a Node surface the product does not need.                                                |
| A second React app for desktop      | Two frontends drift; the capability matrix would become a lie.                                                   |
| Bundle a Python sidecar immediately | The Python package is optional and not needed by the studio; a sidecar without an engine manager is dead weight. |
| Enable the Tauri shell plugin       | The product must not gain a general command-execution surface.                                                   |
