# @hcs-materials/cli

`hcs-sim` runs HCS simulation specs locally and writes a reproducible record
(`status.json`, `result.json`, `provenance.json`, `report.html`, `run.log`).

See [`docs/tutorials/cli.md`](../../docs/tutorials/cli.md) for usage, exit codes, backends and
an example spec.

```bash
node packages/cli/dist/index.js inspect <structure-file>
node packages/cli/dist/index.js run --structure <file> --spec <spec.json> --out <dir>
node packages/cli/dist/index.js engines --planned
```

The CLI is a thin layer over `@hcs-materials/core`: validation, the job state machine and the
result/provenance contracts are identical to the browser studio. It does not add scientific
capability that the library does not have.
