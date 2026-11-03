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

`npm audit` reports **0 vulnerabilities** at the time of writing. Two upgrades were required:

- `react-router-dom` 6 → 7.18.5 (open-redirect and constructor-injection advisories in
  ≤ 7.17.0). Only `HashRouter`, `Routes`, `Route`, `NavLink` and `useNavigate` are used, all of
  which kept their API.
- `vitest` 2 → 4.1.12. The duplicate `vitest` 2 devDependency in `packages/core` pulled in
  `tinypool` ≤ 2.1.1 (critical) and Vite 5; it was removed because the workspace root owns the
  test runner.

**npm 11 is required** to install this tree: npm 10's arborist fails on the Vitest 4 peer graph
(`Cannot read properties of null (reading 'edgesOut')`). The root `package.json` pins
`packageManager: npm@11.21.1` and CI installs npm 11 explicitly. Keep this in mind on fresh
machines; `npx npm@11 install` is the fallback.

Do not run `npm audit fix --force` without reviewing version changes.

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
