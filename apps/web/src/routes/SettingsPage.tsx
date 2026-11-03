import { useEffect, useState } from "react";
import { CORE_VERSION, PLANNED_ENGINES, listEngines } from "@hcs-materials/core";
import { Badge, Button, Panel, Stat } from "@hcs-materials/ui";
import { useI18n, type Lang } from "../i18n";
import { useHardware } from "../lib/useHardware";
import { useWorkspace } from "../state/store";
import { formatBytes, formatDate } from "../lib/format";
import { probeOpfs, type OpfsStatus } from "../state/opfs";

const THEME_KEY = "hcs.theme";

export function SettingsPage(): JSX.Element {
  const { t, lang, setLang } = useI18n();
  const { report, error } = useHardware();
  const workspace = useWorkspace();
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "dark");
  const [opfs, setOpfs] = useState<OpfsStatus | null>(null);
  const engines = listEngines();

  useEffect(() => {
    void probeOpfs().then(setOpfs);
  }, []);

  const applyTheme = (next: "dark" | "light"): void => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* blocked storage */
    }
    setTheme(next);
  };

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>{t("settings.title")}</h1>
          <p>{t("settings.lead")}</p>
        </div>
      </header>

      <div className="two-col">
        <div className="stack">
          <Panel title={t("settings.appearance")}>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="lang-select">{t("settings.language")}</label>
                <select
                  id="lang-select"
                  className="select"
                  value={lang}
                  onChange={(event) => setLang(event.target.value as Lang)}
                >
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                </select>
              </div>
              <div className="field">
                <label>{t("settings.theme")}</label>
                <div className="row">
                  <Button
                    size="sm"
                    variant={theme === "dark" ? "primary" : "default"}
                    onClick={() => applyTheme("dark")}
                  >
                    {t("common.dark")}
                  </Button>
                  <Button
                    size="sm"
                    variant={theme === "light" ? "primary" : "default"}
                    onClick={() => applyTheme("light")}
                  >
                    {t("common.light")}
                  </Button>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title={t("settings.engineRegistry")} subtitle={t("settings.installed")}>
            <div className="stack" style={{ gap: 10 }}>
              {engines.map((engine) => (
                <div className="stat" key={engine.engine_id} style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong className="small">{engine.name}</strong>
                    <Badge tone="ok">{engine.installation_state}</Badge>
                  </div>
                  <div className="tiny muted mono">
                    {engine.engine_id} · v{engine.version} · {engine.execution_backends.join("/")} ·{" "}
                    {engine.precision_modes?.join("/")}
                  </div>
                  <div className="tiny secondary" style={{ marginTop: 6 }}>
                    {t("workbench.fidelity")}: {(engine.fidelity_levels ?? []).join(", ")} ·{" "}
                    {t("studio.speciesCol")}: {(engine.supported_elements ?? []).join(", ") || "—"}
                  </div>
                  <ul className="tiny muted" style={{ margin: "8px 0 0", paddingLeft: 16 }}>
                    {(engine.known_limits ?? []).map((limit, index) => (
                      <li key={index}>{limit}</li>
                    ))}
                  </ul>
                  {(engine.validation_cases ?? []).length > 0 && (
                    <p className="tiny muted" style={{ marginTop: 6 }}>
                      {engine
                        .validation_cases!.map((test) => `${test.id}: ${test.status}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <h3 style={{ marginTop: 18 }}>{t("settings.planned")}</h3>
            <div className="list">
              {PLANNED_ENGINES.map((engine) => (
                <div className="stat" key={engine.engine_id} style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong className="small">{engine.name}</strong>
                    <Badge tone="warn">{engine.status}</Badge>
                  </div>
                  <p className="tiny muted" style={{ margin: "6px 0 0" }}>
                    {engine.note}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title={t("settings.privacy")}>
            <p className="small secondary">{t("settings.privacyText")}</p>
            <p className="small secondary">{t("settings.noTelemetry")}</p>
            <p className="tiny muted">{t("science.disclaimer")}</p>
          </Panel>
        </div>

        <div className="stack">
          <Panel title={t("settings.hardware")}>
            {error && (
              <p className="small" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            {report ? (
              <div className="grid-2">
                <Stat
                  label={t("settings.backendSelected")}
                  value={report.selectedBackend.toUpperCase()}
                  hint={report.selectionReasons.join(" ")}
                />
                <Stat label={t("settings.threads")} value={report.cpuThreads} />
                <Stat
                  label={t("settings.webgpu")}
                  value={report.webgpu.available ? "WebGPU" : "—"}
                  hint={report.webgpu.reason}
                />
                <Stat
                  label={t("settings.wasm")}
                  value={`${report.wasm.available ? "yes" : "no"} · SIMD ${report.wasm.simd ? "yes" : "no"}`}
                />
                <Stat
                  label={t("settings.memory")}
                  value={report.deviceMemoryGb ? `${report.deviceMemoryGb} GB` : "—"}
                />
                <Stat label={t("common.format")} value={report.platform} />
              </div>
            ) : (
              <p className="muted small">{t("common.loading")}…</p>
            )}
          </Panel>

          <Panel title={t("settings.storage")}>
            {report?.storage.supported ? (
              <div className="grid-2">
                <Stat
                  label={t("settings.storageQuota")}
                  value={formatBytes(report.storage.quotaBytes)}
                />
                <Stat
                  label={t("settings.storageUsed")}
                  value={formatBytes(report.storage.usageBytes)}
                />
                <Stat
                  label={t("dashboard.storage")}
                  value={report.storage.persisted ? "persisted" : "best effort"}
                />
                <Stat
                  label="OPFS"
                  value={opfs ? (opfs.supported ? "available" : "unavailable") : "…"}
                  hint={opfs?.reason}
                />
              </div>
            ) : (
              <p className="muted small">{t("dashboard.storageUnavailable")}</p>
            )}
            <p className="tiny muted" style={{ marginTop: 10 }}>
              {t("dashboard.storageNote")}
            </p>
          </Panel>

          <Panel title={t("dashboard.project")}>
            <dl className="kv">
              <dt>{t("common.name")}</dt>
              <dd>{workspace.project.name}</dd>
              <dt>{t("common.id")}</dt>
              <dd>{workspace.project.project_id}</dd>
              <dt>{t("jobs.created")}</dt>
              <dd>{formatDate(workspace.project.created_at)}</dd>
              <dt>{t("studio.structureList")}</dt>
              <dd>{workspace.structures.length}</dd>
              <dt>{t("jobs.title")}</dt>
              <dd>{workspace.jobs.length}</dd>
            </dl>
            <div className="row" style={{ marginTop: 12 }}>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (
                    confirm(
                      "Start a new empty project? The current project stays exported only if you saved it.",
                    )
                  ) {
                    workspace.createProject("Untitled project");
                  }
                }}
              >
                {t("dashboard.newProject")}
              </Button>
            </div>
          </Panel>

          <Panel title={t("settings.about")}>
            <dl className="kv">
              <dt>{t("settings.version")}</dt>
              <dd>{CORE_VERSION}</dd>
              <dt>{t("settings.license")}</dt>
              <dd>MIT (code); model parameters carry their own notes</dd>
              <dt>Brand</dt>
              <dd>{t("app.brandLine")}</dd>
            </dl>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              {t("settings.noTelemetry")}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
