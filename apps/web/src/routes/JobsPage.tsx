import { useNavigate } from "react-router-dom";
import { Badge, Button, Callout, Panel } from "@hcs-materials/ui";
import { useI18n } from "../i18n";
import { useWorkspace } from "../state/store";
import { formatDate, formatDuration, stateTone } from "../lib/format";

export function JobsPage(): JSX.Element {
  const { t } = useI18n();
  const navigate = useNavigate();
  const workspace = useWorkspace();

  const open = (jobId: string): void => {
    workspace.selectJob(jobId);
    navigate("/workbench");
  };

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>{t("jobs.title")}</h1>
          <p>{t("jobs.lead")}</p>
        </div>
      </header>

      <Panel title={t("dashboard.project")} flush>
        {workspace.jobs.length === 0 ? (
          <p className="panel-body muted small">{t("jobs.empty")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("jobs.state")}</th>
                  <th>{t("jobs.task")}</th>
                  <th>{t("jobs.engine")}</th>
                  <th>{t("jobs.created")}</th>
                  <th className="num">{t("jobs.result")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {workspace.jobs.map((entry) => (
                  <tr key={entry.job.job_id}>
                    <td>
                      <Badge tone={stateTone(entry.job.state)}>{entry.job.state}</Badge>
                    </td>
                    <td>
                      <div className="small">{entry.spec.task_type}</div>
                      <div className="tiny muted mono">{entry.job.job_id}</div>
                    </td>
                    <td className="small mono">{entry.job.engine_id ?? "—"}</td>
                    <td className="small">{formatDate(entry.job.created_at)}</td>
                    <td className="num small">
                      {entry.result ? `${entry.result.quantities.length}` : t("jobs.noResult")}
                    </td>
                    <td>
                      <div className="row">
                        <Button size="sm" variant="ghost" onClick={() => open(entry.job.job_id)}>
                          {t("jobs.open")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => workspace.deleteJob(entry.job.job_id)}>
                          {t("common.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {workspace.activeJobId && workspace.getJob(workspace.activeJobId) && (
        <Panel title={t("jobs.events")} subtitle={workspace.activeJobId}>
          <dl className="kv" style={{ marginBottom: 14 }}>
            <dt>{t("jobs.inputHash")}</dt>
            <dd className="mono tiny">{workspace.getJob(workspace.activeJobId)?.spec ? workspace.jobs.find((job) => job.job.job_id === workspace.activeJobId)?.job.input_hash : "—"}</dd>
            <dt>{t("jobs.created")}</dt>
            <dd>{formatDate(workspace.getJob(workspace.activeJobId)?.job.created_at)}</dd>
            <dt>{t("common.status")}</dt>
            <dd>{workspace.getJob(workspace.activeJobId)?.job.state}</dd>
            {workspace.getJob(workspace.activeJobId)?.job.resource_metrics?.wall_time_seconds !== undefined && (
              <>
                <dt>{t("jobs.created")}</dt>
                <dd>{formatDuration((workspace.getJob(workspace.activeJobId)!.job.resource_metrics!.wall_time_seconds ?? 0) * 1000)}</dd>
              </>
            )}
          </dl>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>State</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {(workspace.getJob(workspace.activeJobId)?.job.events ?? []).map((event, index) => (
                  <tr key={index}>
                    <td className="mono tiny">{formatDate(event.at)}</td>
                    <td className="small">{event.state}</td>
                    <td className="small secondary">{event.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(workspace.getJob(workspace.activeJobId)?.job.warnings ?? []).length > 0 && (
            <div className="stack" style={{ marginTop: 12 }}>
              {(workspace.getJob(workspace.activeJobId)?.job.warnings ?? []).map((warning, index) => (
                <Callout key={index} tone={warning.severity === "error" ? "error" : "warn"}>
                  <span className="mono tiny">{warning.code}</span> {warning.message}
                </Callout>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
