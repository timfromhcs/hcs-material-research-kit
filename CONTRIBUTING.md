# Contributing

Thanks for considering a contribution. This project is scientific software: correctness,
transparency and reproducibility matter more than feature count.

## Ground rules

1. **No fake science.** Do not add a calculation that returns plausible numbers without a
   named model, parameter provenance and a test. Do not label an approximation as DFT.
2. **No fake features.** A control must do what it says. Unimplemented capability belongs in
   `PLANNED_ENGINES` or the roadmap, not in a dropdown.
3. **Every result carries provenance.** If you add a task, extend `ResultBundle`,
   `ProvenanceRecord` and the report, not just the UI.
4. **CPU reference first.** A GPU path requires a CPU reference, a parity test and a declared
   tolerance.
5. **Tests are the deliverable.** A change without tests is not mergeable.

## Development workflow

```bash
npm install
npm run build          # packages + studio
npm run typecheck
npm test               # TypeScript
npm run test:rust      # Rust
npm run test:python    # Python (see python/hcs_materials/README.md)
```

- Keep `/schemas` as the single source of truth. Run `node scripts/sync-schemas.mjs` and
  `python scripts/sync-python-schemas.py` after changing a schema.
- Regenerate cross-language fixtures with `npx tsx scripts/make-reference-fixtures.ts` and
  commit them together with the code change that alters the values. Never edit a fixture by
  hand to make a test pass.
- Write an ADR in `docs/decisions/` for architectural changes.
- Update `STATUS.md` and `CHANGELOG.md` in the same pull request.

## Code style

- TypeScript: strict mode, no `any` in public APIs, explicit units in identifiers or
  documentation.
- Rust: `cargo fmt` and `cargo clippy -- -D warnings` clean.
- Python: typed public functions, 3.11+ syntax, no silent exception swallowing.
- CSS: design tokens from `packages/ui/src/styles.css`; do not hard-code colours in components.

## Commit messages

Use conventional prefixes (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`) and
describe the user-facing or scientific effect, not just the file touched.

## Reporting bugs

Include the project archive or a minimal structure file, the job id, the engine/model id,
the browser or Python version and the exact unexpected output. Do not attach confidential
material data to a public issue.
