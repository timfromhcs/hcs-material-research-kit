import { useRef, useState } from "react";
import { LJ_NOBLE_GASES, listEngines } from "@hcs-materials/core";
import { Badge, Button, Callout, Panel, Stat } from "@hcs-materials/ui";
import { useI18n, type TranslationKey } from "../i18n";
import { useWorkspace } from "../state/store";
import { downloadText, safeFilename } from "../lib/download";
import { formatDate, shortHash } from "../lib/format";

const FIDELITY_LEVELS = [
  "illustrative",
  "classical_model",
  "ml_potential",
  "semi_empirical",
  "first_principles",
  "continuum_model",
  "benchmark_validated",
  "experiment_referenced",
] as const;

export function ProvenancePage(): JSX.Element {
  const { t } = useI18n();
  const workspace = useWorkspace();
  const active = workspace.getJob(workspace.activeJobId) ?? workspace.jobs[0];
  const [archive, setArchive] = useState<{ ok: boolean; warnings: string[]; name: string } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const engines = listEngines();
  const engine = engines.find((item) => item.engine_id === "hcs.lj-reference");

  const provenance = active?.provenance;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>{t("provenance.title")}</h1>
          <p>{t("provenance.lead")}</p>
        </div>
        <div className="row">
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            {t("common.import")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const html = active ? workspace.buildReport(active.job.job_id) : null;
              if (html) downloadText(safeFilename(`report-${active!.job.job_id}`, "html"), html, "text/html");
            }}
            disabled={!active?.result}
          >
            {t("workbench.report")}
          </Button>
        </div>
      </header>

      {archive && (
        <Callout tone={archive.ok ? "info" : "error"}>
          <strong>{archive.name}</strong> — {archive.ok ? t("provenance.archiveOk") : t("provenance.archiveFailed")}
          {archive.warnings.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {archive.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
        </Callout>
      )}

      <div className="two-col">
        <div className="stack">
          <Panel title={t("provenance.selectJob")} flush>
            {workspace.jobs.length === 0 ? (
              <p className="panel-body muted small">{t("jobs.empty")}</p>
            ) : (
              <div className="panel-body">
                <div className="list">
                  {workspace.jobs.map((entry) => (
                    <button
                      type="button"
                      key={entry.job.job_id}
                      className="list-item"
                      data-active={entry.job.job_id === active?.job.job_id}
                      onClick={() => workspace.selectJob(entry.job.job_id)}
                    >
                      <Badge tone={entry.result ? "ok" : "warn"}>{entry.job.state}</Badge>
                      <span>
                        <div className="small">{entry.spec.task_type}</div>
                        <div className="tiny muted mono">{entry.job.job_id}</div>
                      </span>
                      <span className="spacer" />
                      <span className="tiny muted">{formatDate(entry.job.created_at)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          {provenance ? (
            <Panel title={t("provenance.record")} subtitle={provenance.provenance_id}>
              <div className="stack" style={{ gap: 18 }}>
                <section>
                  <h3>{t("provenance.method")}</h3>
                  <dl className="kv">
                    <dt>name</dt>
                    <dd>{provenance.method?.name ?? "—"}</dd>
                    <dt>model</dt>
                    <dd>{provenance.method?.model_id ?? "—"}</dd>
                    <dt>equation</dt>
                    <dd style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                      {provenance.method?.equation_reference ?? "—"}
                    </dd>
                    <dt>validation</dt>
                    <dd>{provenance.method?.validation_state ?? "—"}</dd>
                  </dl>
                </section>

                <section>
                  <h3>{t("provenance.software")}</h3>
                  <dl className="kv">
                    <dt>software</dt>
                    <dd>
                      {provenance.software.name} v{provenance.software.version}
                    </dd>
                    <dt>engine</dt>
                    <dd>
                      {provenance.software.engine_id ?? "—"} v{provenance.software.engine_version ?? "—"}
                    </dd>
                    <dt>adapter</dt>
                    <dd>{provenance.software.adapter_version ?? "—"}</dd>
                  </dl>
                </section>

                <section>
                  <h3>{t("provenance.inputs")}</h3>
                  <dl className="kv">
                    <dt>input_hash</dt>
                    <dd title={provenance.inputs.input_hash}>{shortHash(provenance.inputs.input_hash, 32)}…</dd>
                    <dt>normalized</dt>
                    <dd title={provenance.inputs.normalized_input_hash}>
                      {shortHash(provenance.inputs.normalized_input_hash, 32)}…
                    </dd>
                    <dt>structure_id</dt>
                    <dd>{provenance.inputs.structure_id ?? "—"}</dd>
                    <dt>structure_hash</dt>
                    <dd title={provenance.inputs.structure_hash}>{shortHash(provenance.inputs.structure_hash, 32)}…</dd>
                    <dt>{t("provenance.datasets")}</dt>
                    <dd>{provenance.inputs.dataset_refs?.length ? provenance.inputs.dataset_refs.length : t("common.none")}</dd>
                  </dl>
                </section>

                <section>
                  <h3>{t("provenance.environment")}</h3>
                  <dl className="kv">
                    <dt>backend</dt>
                    <dd>{provenance.environment?.backend ?? "—"}</dd>
                    <dt>precision</dt>
                    <dd>{provenance.environment?.precision ?? "—"}</dd>
                    <dt>runtime</dt>
                    <dd style={{ overflowWrap: "anywhere" }}>{provenance.environment?.runtime ?? "—"}</dd>
                    <dt>seed</dt>
                    <dd>{provenance.environment?.random_seed ?? "—"}</dd>
                    <dt>deterministic</dt>
                    <dd>{provenance.environment?.deterministic ? t("common.yes") : t("common.no")}</dd>
                  </dl>
                </section>

                <section>
                  <h3>{t("provenance.units")}</h3>
                  <dl className="kv">
                    {Object.entries(provenance.units).map(([key, value]) => (
                      <div key={key} style={{ display: "contents" }}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                {(provenance.method?.assumptions ?? []).length > 0 && (
                  <section>
                    <h3>{t("provenance.assumptions")}</h3>
                    <ul className="small secondary" style={{ margin: 0, paddingLeft: 18 }}>
                      {(provenance.method?.assumptions ?? []).map((assumption, index) => (
                        <li key={index}>{assumption}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {active?.result && (
                  <section>
                    <h3>{t("workbench.limitations")}</h3>
                    <ul className="small secondary" style={{ margin: 0, paddingLeft: 18 }}>
                      {active.result.limitations.map((limitation, index) => (
                        <li key={index}>{limitation}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </Panel>
          ) : (
            <Panel title={t("provenance.record")}>
              <p className="muted small">{t("provenance.noJob")}</p>
            </Panel>
          )}
        </div>

        <div className="stack">
          <Panel title={t("provenance.fidelityTitle")} subtitle={t("provenance.fidelityLead")}>
            <div className="list">
              {FIDELITY_LEVELS.map((level) => (
                <div key={level} className="stat" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong className="small">{t(`fidelity.${level}` as TranslationKey)}</strong>
                    <span className="tiny muted mono">{level}</span>
                  </div>
                  <p className="tiny secondary" style={{ margin: "6px 0 0" }}>
                    {t(`fidelity.desc.${level}` as TranslationKey)}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={t("provenance.citations")}>
            {engine && (
              <div className="stack" style={{ gap: 12 }}>
                <div className="grid-2">
                  <Stat label="engine" value={engine.engine_id} />
                  <Stat label="version" value={engine.version} />
                  <Stat label="license" value={engine.license} />
                  <Stat label="model" value={LJ_NOBLE_GASES.id} />
                </div>
                <p className="small secondary">{LJ_NOBLE_GASES.reference}</p>
                <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                  {LJ_NOBLE_GASES.limitations.map((limitation, index) => (
                    <li key={index}>{limitation}</li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel title={t("provenance.integrity")}>
            <p className="small secondary">{t("provenance.verifyArchive")}</p>
            <div className="row" style={{ marginTop: 8 }}>
              <Button size="sm" onClick={() => fileInput.current?.click()}>
                {t("common.import")}
              </Button>
            </div>
            {workspace.archiveWarnings.length > 0 && (
              <ul className="tiny" style={{ marginTop: 10, paddingLeft: 18 }}>
                {workspace.archiveWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".hcsproj"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void (async () => {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const result = workspace.importProject(bytes);
            setArchive({ ok: result.ok, warnings: result.warnings, name: file.name });
          })();
        }}
      />
    </div>
  );
}
