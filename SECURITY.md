# Security Policy

## Scope

HCS runs scientific code locally: on your machine, with your files. The security model is in
`docs/security/threat-model.md`. In short:

- no telemetry and no upload of structures, coordinates, results or model prompts;
- no shell interpolation and no arbitrary executables;
- project paths are confined to an explicit workspace root;
- archives are bounded and reject traversal, drive letters and absolute paths;
- no secrets in the browser bundle.

## Supported versions

Only the current development line (0.1.x) receives fixes.

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Contact the maintainers privately
(`security@hcs.example` is a placeholder until a real address is published) and include:

- affected version/commit;
- reproduction steps;
- impact (data exposure, path escape, denial of service, integrity);
- whether a crafted file or a crafted archive is required.

You will receive an acknowledgement, an assessment and a coordinated disclosure date.

## Known advisories in the development toolchain

`npm audit` reports advisories in development-only dependencies (test runner and its
transitive packages). They are not shipped in the static bundle, but they are tracked here and
should be resolved before publication:

- 2 critical / 1 high / 5 moderate advisories reported by `npm audit` at the time of writing;
- mitigation: upgrade the test/build toolchain as a single coordinated change and re-run the
  full `npm run verify` gate.

Do not run `npm audit fix --force` without reviewing the version changes: it can silently
alter Vite or the test runner major version.

## Secrets

- Never commit `.env`, tokens, API keys or signing keys.
- `.env*` is git-ignored.
- Browser builds must never contain a provider key. There is no proxy key in this project.
- CI must use OIDC trusted publishing rather than long-lived registry tokens once publishing is
  enabled.

## Dependency policy

- Pin lockfiles (`package-lock.json`, `Cargo.lock`, Python environment file) in the repository.
- Review new dependencies for license, maintenance and install scripts.
- Do not add a dependency that downloads binaries at install time without an explicit decision.
