/**
 * Portable HTML reproducibility report.
 *
 * Everything in the report is derived from a ResultBundle plus its
 * ProvenanceRecord. Missing data stays visible as "not recorded" — the report
 * never fills gaps with plausible-looking values.
 */
import type { JobRecord, ProvenanceRecord, ResultBundle, SimulationSpec, Structure } from "./types.js";

export interface ReportInput {
  result: ResultBundle;
  provenance: ProvenanceRecord;
  job: JobRecord;
  spec: SimulationSpec;
  structure?: Structure;
  projectName?: string;
  generatedAt?: string;
}

const escapeHtml = (value: unknown): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function buildReproducibilityReport(input: ReportInput): string {
  const { result, provenance, job, spec, structure } = input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  const quantityRows = result.quantities
    .map(
      (q) =>
        `<tr><td>${escapeHtml(q.name)}</td><td class="num">${escapeHtml(q.value)}</td><td>${escapeHtml(q.unit)}</td><td>${escapeHtml(q.method ?? result.engine_id)}</td></tr>`,
    )
    .join("\n");

  const seriesRows = (result.series ?? [])
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.x_label ?? "x")} (${escapeHtml(s.x_unit)})</td><td>${escapeHtml(s.y_label ?? "y")} (${escapeHtml(s.y_unit)})</td><td class="num">${s.x.length}</td></tr>`,
    )
    .join("\n");

  const limitations = result.limitations.map((l) => `<li>${escapeHtml(l)}</li>`).join("\n");
  const warnings = (result.warnings ?? []).map((w) => `<li>${escapeHtml(w)}</li>`).join("\n");
  const assumptions = (provenance.method?.assumptions ?? []).map((a) => `<li>${escapeHtml(a)}</li>`).join("\n");

  const siteRows = (structure?.sites ?? [])
    .slice(0, 400)
    .map(
      (site, index) =>
        `<tr><td class="num">${index}</td><td>${escapeHtml(site.species)}</td><td class="num">${site.fractional_position.map((x) => x.toFixed(6)).join("</td><td class=\"num\">")}</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reproducibility report — ${escapeHtml(input.projectName ?? job.project_id)} / ${escapeHtml(job.job_id)}</title>
<style>
:root { color-scheme: light dark; }
body { font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; margin: 0; background: #0f1417; color: #e7eef2; }
main { max-width: 1000px; margin: 0 auto; padding: 40px 24px 80px; }
h1 { font-size: 1.7rem; margin: 0 0 4px; letter-spacing: -0.02em; }
h2 { font-size: 1.05rem; margin: 34px 0 10px; color: #7fe3d4; text-transform: uppercase; letter-spacing: 0.08em; }
.sub { color: #97a6ad; margin: 0 0 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.card { border: 1px solid #24313a; border-radius: 12px; padding: 14px 16px; background: #141c21; }
.card dt { color: #97a6ad; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; }
.card dd { margin: 4px 0 0; font-variant-numeric: tabular-nums; word-break: break-word; }
table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #24313a; vertical-align: top; }
th { color: #97a6ad; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; }
.num { font-variant-numeric: tabular-nums; }
.badge { display: inline-block; padding: 2px 9px; border-radius: 999px; background: #1b3b3a; color: #7fe3d4; font-size: 0.78rem; letter-spacing: 0.04em; }
.warn { border-left: 3px solid #d9a441; padding-left: 12px; color: #f0d9a8; }
ul { padding-left: 20px; }
code { background: #1a242b; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
footer { margin-top: 48px; color: #7d8b92; font-size: 0.85rem; border-top: 1px solid #24313a; padding-top: 16px; }
@media print { body { background: #fff; color: #111; } .card, table, th, td { border-color: #ccc; } h2 { color: #0b6b62; } }
</style>
</head>
<body>
<main>
  <h1>Reproducibility report</h1>
  <p class="sub">${escapeHtml(input.projectName ?? job.project_id)} · job <code>${escapeHtml(job.job_id)}</code> · generated ${escapeHtml(generatedAt)}</p>
  <p><span class="badge">fidelity: ${escapeHtml(result.fidelity_level)}</span> <span class="badge">status: ${escapeHtml(result.status)}</span></p>

  <h2>Method</h2>
  <div class="grid">
    <div class="card"><dt>Task</dt><dd>${escapeHtml(spec.task_type)}</dd></div>
    <div class="card"><dt>Engine</dt><dd>${escapeHtml(provenance.software.engine_id ?? result.engine_id)} v${escapeHtml(provenance.software.engine_version ?? "unknown")}</dd></div>
    <div class="card"><dt>Model</dt><dd>${escapeHtml(result.model_id ?? "—")}</dd></div>
    <div class="card"><dt>Software</dt><dd>${escapeHtml(provenance.software.name)} v${escapeHtml(provenance.software.version)}</dd></div>
    <div class="card"><dt>Validation state</dt><dd>${escapeHtml(provenance.method?.validation_state ?? "not recorded")}</dd></div>
    <div class="card"><dt>Units</dt><dd>${Object.entries(provenance.units).map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`).join(" · ")}</dd></div>
    <div class="card"><dt>Input hash</dt><dd><code>${escapeHtml(provenance.inputs.input_hash)}</code></dd></div>
    <div class="card"><dt>Structure hash</dt><dd><code>${escapeHtml(provenance.inputs.structure_hash ?? "—")}</code></dd></div>
    <div class="card"><dt>Backend / precision</dt><dd>${escapeHtml(provenance.environment?.backend ?? "unknown")} · ${escapeHtml(provenance.environment?.precision ?? "unknown")}</dd></div>
    <div class="card"><dt>Random seed</dt><dd>${provenance.environment?.random_seed ?? "deterministic / none"}</dd></div>
  </div>

  ${provenance.method?.equation_reference ? `<h2>Equation / model reference</h2><p><code>${escapeHtml(provenance.method.equation_reference)}</code></p>` : ""}
  ${assumptions ? `<h2>Assumptions</h2><ul>${assumptions}</ul>` : ""}

  <h2>Results</h2>
  <table><thead><tr><th>Quantity</th><th>Value</th><th>Unit</th><th>Method</th></tr></thead><tbody>${quantityRows}</tbody></table>
  ${seriesRows ? `<h2>Series</h2><table><thead><tr><th>Name</th><th>X axis</th><th>Y axis</th><th>Points</th></tr></thead><tbody>${seriesRows}</tbody></table>` : ""}

  <h2>Convergence</h2>
  <p>${result.convergence.converged ? "Converged" : "Not converged"} — criterion: <code>${escapeHtml(result.convergence.criterion)}</code>${result.convergence.iterations !== undefined ? ` · ${result.convergence.iterations} iterations` : ""}</p>

  ${warnings ? `<h2>Warnings</h2><div class="warn"><ul>${warnings}</ul></div>` : ""}
  <h2>Limitations</h2>
  <ul>${limitations}</ul>

  ${siteRows ? `<h2>Input structure (first 400 sites)</h2><table><thead><tr><th>#</th><th>Species</th><th>f_a</th><th>f_b</th><th>f_c</th></tr></thead><tbody>${siteRows}</tbody></table>` : ""}

  <h2>Job lifecycle</h2>
  <table><thead><tr><th>Time</th><th>State</th><th>Message</th></tr></thead><tbody>
  ${job.events.map((e) => `<tr><td class="num">${escapeHtml(e.at)}</td><td>${escapeHtml(e.state)}</td><td>${escapeHtml(e.message)}</td></tr>`).join("\n")}
  </tbody></table>

  <footer>HCS Material Research Kit ${escapeHtml(provenance.software.version)} — Made with love by hcsmedia and timfromhcs.<br>
  This report describes a virtual experiment under the stated model and assumptions. It is not experimental proof and not a synthesis or certification claim.</footer>
</main>
</body>
</html>
`;
}
