import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildPrototype,
  supercellOf,
  useWorkspace,
} from "../state/store";
import { useI18n, type TranslationKey } from "../i18n";
import { useHardware } from "../lib/useHardware";
import { downloadBytes } from "../lib/download";
import { formatBytes, formatDate, formatNumber, stateTone, shortHash } from "../lib/format";
import { Badge, Button, Callout, Panel, Stat } from "@hcs-materials/ui";
import { listEngines, PLANNED_ENGINES, importStructure as importStructureFile } from "@hcs-materials/core";

const QUICK_STARTS = [
  {
    key: "dashboard.quickSilicon",
    prototype: "diamond" as const,
    a: 5.431,
    species: ["Si"],
    label: "Si",
  },
  {
    key: "dashboard.quickNacl",
    prototype: "rocksalt" as const,
    a: 5.64,
    species: ["Na", "Cl"],
    label: "NaCl",
  },
  {
    key: "dashboard.quickArgon",
    prototype: "fcc" as const,
    a: 5.26,
    species: ["Ar"],
    label: "Ar",
  },
];

export function Dashboard(): JSX.Element {
  const { t } = useI18n();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const { report } = useHardware();
  const structureInput = useRef<HTMLInputElement | null>(null);
  const projectInput = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const engines = listEngines();

  const quickCreate = (prototype: (typeof QUICK_STARTS)[number]): void => {
    if (prototype.key === "dashboard.quickArgon") {
      // A single conventional fcc cell is too small for the 8.5 Å pair cutoff:
      // build 3x3x3 so a documented reference run has real interactions.
      const cell = buildPrototype(prototype.prototype, prototype.a, prototype.species);
      workspace.addStructure(supercellOf(cell, 3, 3, 3));
    } else {
      workspace.addStructure(buildPrototype(prototype.prototype, prototype.a, prototype.species));
    }
    navigate("/studio");
  };

  const handleStructureFile = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const result = importStructureFile(text, file.name);
      workspace.addStructure(result.structure);
      setNotice({
        tone: result.warnings.length ? "err" : "ok",
        text: result.warnings.length ? result.warnings.join(" ") : `${result.structure.composition?.reduced_formula ?? ""} · ${result.structure.sites.length} ${t("common.atoms")}`,
      });
      navigate("/studio");
    } catch (error) {
      setNotice({ tone: "err", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleProjectFile = async (file: File): Promise<void> => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = workspace.importProject(bytes);
      setNotice({
        tone: result.ok ? "ok" : "err",
        text: result.ok
          ? `${t("provenance.archiveOk")} (${file.name})`
          : result.warnings.join(" ") || t("provenance.archiveFailed"),
      });
    } catch (error) {
      setNotice({ tone: "err", text: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <h1>{t("app.name")}</h1>
          <p>{t("app.mission")}</p>
          <div className="row" style={{ marginTop: 16 }}>
            <Button variant="primary" onClick={() => navigate("/studio")}>
              {t("dashboard.openStudio")}
            </Button>
            <Button onClick={() => navigate("/workbench")}>{t("dashboard.openWorkbench")}</Button>
            <Button variant="ghost" onClick={() => structureInput.current?.click()}>
              {t("dashboard.importStructure")}
            </Button>
          </div>
          <p className="tiny muted" style={{ marginTop: 14 }}>
            {t("science.disclaimer")}
          </p>
        </div>
        <img className="lattice-art" src="./brand/mark.svg" alt="" aria-hidden="true" />
      </section>

      {notice && (
        <Callout tone={notice.tone === "ok" ? "info" : "error"}>
          {notice.text}
          <div className="row" style={{ marginTop: 8 }}>
            <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>
              {t("common.close")}
            </Button>
          </div>
        </Callout>
      )}

      <div className="two-col">
        <div className="stack">
          <Panel title={t("dashboard.quickStart")} subtitle={t("dashboard.workflow")}>
            <div className="quick-actions">
              {QUICK_STARTS.map((quick) => (
                <button className="quick-card" key={quick.key} onClick={() => quickCreate(quick)} type="button">
                  <strong>{t(quick.key as TranslationKey)}</strong>
                  <span className="tiny muted">
                    {quick.label} · a = {quick.a} Å · {quick.prototype}
                  </span>
                </button>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 12 }}>
              {t("dashboard.workflowBody")}
            </p>
          </Panel>

          <Panel
            title={t("dashboard.recentJobs")}
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate("/jobs")}>
                {t("jobs.title")}
              </Button>
            }
            flush
          >
            {workspace.jobs.length === 0 ? (
              <p className="panel-body muted small">{t("dashboard.noJobs")}</p>
            ) : (
              <div className="job-list" style={{ padding: 12 }}>
                {workspace.jobs.slice(0, 6).map((entry) => (
                  <button
                    type="button"
                    className="list-item"
                    key={entry.job.job_id}
                    onClick={() => {
                      workspace.selectJob(entry.job.job_id);
                      navigate("/provenance");
                    }}
                  >
                    <Badge tone={stateTone(entry.job.state)}>{entry.job.state}</Badge>
                    <span style={{ minWidth: 0 }}>
                      <div className="small">{entry.spec.task_type}</div>
                      <div className="tiny muted">
                        {formatDate(entry.job.created_at)} · {entry.job.job_id}
                      </div>
                    </span>
                    <span className="spacer" />
                    <span className="tiny muted mono">
                      {entry.result?.quantities.length ?? 0} values
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={t("dashboard.project")} actions={
            <div className="row">
              <Button size="sm" variant="ghost" onClick={() => projectInput.current?.click()}>
                {t("dashboard.importProject")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  try {
                    const bytes = workspace.exportProject();
                    downloadBytes(`${workspace.project.name || "project"}.hcsproj`, bytes);
                  } catch (error) {
                    setNotice({ tone: "err", text: error instanceof Error ? error.message : String(error) });
                  }
                }}
                disabled={workspace.structures.length === 0 && workspace.jobs.length === 0}
              >
                {t("dashboard.exportProject")}
              </Button>
            </div>
          }>
            <div className="grid-3">
              <Stat label={t("dashboard.project")} value={workspace.project.name} hint={workspace.project.project_id} />
              <Stat label={t("studio.structureList")} value={workspace.structures.length} />
              <Stat label={t("jobs.title")} value={workspace.jobs.length} />
            </div>
            {workspace.structures.length === 0 ? (
              <p className="muted small" style={{ marginTop: 12 }}>{t("dashboard.projectEmpty")}</p>
            ) : (
              <div className="list" style={{ marginTop: 12 }}>
                {workspace.structures.map((structure) => (
                  <button
                    type="button"
                    className="list-item"
                    key={structure.structure_id}
                    onClick={() => {
                      workspace.selectStructure(structure.structure_id);
                      navigate("/studio");
                    }}
                  >
                    <Badge tone={structure.validation?.status === "valid" ? "ok" : structure.validation?.status === "invalid" ? "err" : "warn"}>
                      {structure.validation?.status ?? "unchecked"}
                    </Badge>
                    <span>
                      <div className="small">
                        {structure.composition?.reduced_formula ?? structure.display_name ?? structure.structure_id}
                      </div>
                      <div className="tiny muted mono">{structure.structure_id}</div>
                    </span>
                    <span className="spacer" />
                    <span className="tiny muted">{structure.sites.length} {t("common.atoms")}</span>
                  </button>
                ))}
              </div>
            )}
            {workspace.archiveWarnings.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Callout tone="error">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {workspace.archiveWarnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </Callout>
              </div>
            )}
          </Panel>
        </div>

        <div className="stack">
          <Panel title={t("dashboard.engines")} subtitle={t("settings.installed")}>
            <div className="list">
              {engines.map((engine) => (
                <div className="stat" key={engine.engine_id}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong className="small">{engine.name}</strong>
                    <Badge tone="ok">{engine.installation_state}</Badge>
                  </div>
                  <div className="tiny muted mono">{engine.engine_id} v{engine.version}</div>
                  <div className="tiny secondary" style={{ marginTop: 6 }}>
                    {engine.supported_tasks.join(" · ")}
                  </div>
                </div>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              {PLANNED_ENGINES.length} {t("settings.planned").toLowerCase()}:{" "}
              {PLANNED_ENGINES.map((engine) => engine.name).join(", ")}
            </p>
          </Panel>

          <Panel title={t("dashboard.hardware")}>
            {report ? (
              <div className="grid-2">
                <Stat label={t("settings.backendSelected")} value={report.selectedBackend.toUpperCase()} />
                <Stat label={t("settings.threads")} value={report.cpuThreads} />
                <Stat
                  label={t("settings.webgpu")}
                  value={report.webgpu.available ? "adapter" : "none"}
                  hint={report.webgpu.reason}
                />
                <Stat
                  label={t("settings.wasm")}
                  value={report.wasm.available ? (report.wasm.simd ? "SIMD" : "yes") : "no"}
                />
                <Stat label={t("settings.memory")} value={report.deviceMemoryGb ? `${report.deviceMemoryGb} GB` : "—"} />
                <Stat
                  label={t("dashboard.storage")}
                  value={report.storage.quotaBytes ? formatBytes(report.storage.quotaBytes) : "—"}
                  hint={report.storage.persisted ? t("settings.storagePersisted") : t("dashboard.storageNote")}
                />
              </div>
            ) : (
              <p className="muted small">{t("common.loading")}…</p>
            )}
          </Panel>

          <Panel title={t("provenance.integrity")}>
            <p className="small secondary">{t("provenance.verifyArchive")}</p>
            <div className="row" style={{ marginTop: 8 }}>
              <Button size="sm" onClick={() => projectInput.current?.click()}>
                {t("common.import")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const bytes = workspace.exportProject();
                  downloadBytes(`${workspace.project.name || "project"}.hcsproj`, bytes);
                }}
                disabled={workspace.structures.length === 0 && workspace.jobs.length === 0}
              >
                {t("common.export")}
              </Button>
            </div>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              {formatNumber(workspace.jobs.length)} {t("jobs.title").toLowerCase()} ·{" "}
              {formatNumber(workspace.structures.length)} {t("studio.structureList").toLowerCase()}
            </p>
          </Panel>
        </div>
      </div>

      <input
        ref={structureInput}
        type="file"
        accept=".cif,.poscar,.vasp,.contcar,.xyz,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleStructureFile(file);
          event.target.value = "";
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".hcsproj"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleProjectFile(file);
          event.target.value = "";
        }}
      />
      <p className="tiny muted">{t("app.brandLine")}</p>
    </div>
  );
}
