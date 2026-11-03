import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LJ_NOBLE_GASES,
  baseSymbol,
  exportStructure,
  structureHash,
  type ResultBundle,
  type SimulationSpec,
  type TaskType,
} from "@hcs-materials/core";
import { Badge, Button, Callout, Field, Panel, Stat } from "@hcs-materials/ui";
import { LinePlot } from "@hcs-materials/visualization";
import { useI18n, type TranslationKey } from "../i18n";
import { NumberInput } from "../components/NumberInput";
import { useWorkspace, type StoredJob } from "../state/store";
import { useSolver } from "../lib/useSolver";
import { msdFromTrajectory } from "../lib/analysis";
import { downloadText, safeFilename } from "../lib/download";
import { formatNumber, formatSigned, stateTone } from "../lib/format";

type Task = Extract<TaskType, "energy.evaluate" | "structure.relax" | "md.run" | "analysis.rdf">;

const TASKS: Task[] = ["energy.evaluate", "structure.relax", "md.run", "analysis.rdf"];

export function Workbench(): JSX.Element {
  const { t } = useI18n();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const solver = useSolver();

  const structure =
    workspace.structures.find((item) => item.structure_id === workspace.activeStructureId) ?? null;
  const storedActive = workspace.getJob(workspace.activeJobId);
  const [live, setLive] = useState<StoredJob | null>(storedActive ?? null);
  const [task, setTask] = useState<Task>("energy.evaluate");
  const [maxForce, setMaxForce] = useState(0.02);
  const [maxSteps, setMaxSteps] = useState(400);
  const [steps, setSteps] = useState(200);
  const [timestep, setTimestep] = useState(0.002);
  const [temperature, setTemperature] = useState(60);
  const [cutoff, setCutoff] = useState(LJ_NOBLE_GASES.cutoff);
  const [bins, setBins] = useState(100);
  const [seed, setSeed] = useState(12345);
  const [recordTrajectory, setRecordTrajectory] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [msd, setMsd] = useState<ReturnType<typeof msdFromTrajectory> | null>(null);

  const result = live?.result ?? storedActive?.result;
  const provenance = live?.provenance ?? storedActive?.provenance;
  const job = live?.job ?? storedActive?.job;
  const trajectory = live?.trajectory ?? storedActive?.trajectory;

  const unsupportedSpecies = useMemo(() => {
    if (!structure) return [];
    return [...new Set(structure.sites.map((site) => baseSymbol(site.species)))].filter(
      (symbol) => !(symbol in LJ_NOBLE_GASES.species),
    );
  }, [structure]);

  const canRun = Boolean(structure) && unsupportedSpecies.length === 0 && solver.state.status !== "running";

  const buildSpec = (): SimulationSpec => {
    if (!structure) throw new Error(t("studio.needStructure"));
    const parameters: Record<string, unknown> = { cutoff };
    let requested: SimulationSpec["requested_outputs"] = ["energy", "forces"];
    if (task === "structure.relax") {
      parameters.maxForceEvPerA = maxForce;
      parameters.maxSteps = maxSteps;
      requested = ["energy", "structure"];
    }
    if (task === "md.run") {
      parameters.steps = steps;
      parameters.timestepPs = timestep;
      parameters.temperatureK = temperature;
      parameters.sampleInterval = Math.max(1, Math.floor(steps / 40));
      requested = recordTrajectory ? ["energy", "trajectory", "thermo"] : ["energy", "thermo"];
    }
    if (task === "analysis.rdf") {
      parameters.bins = bins;
      requested = ["rdf"];
    }
    return {
      schema_version: "1.0.0",
      task_id: `task_${Date.now().toString(36)}`,
      task_type: task,
      structure_ref: { structure_id: structure.structure_id, structure_hash: structureHash(structure) },
      engine_id: "hcs.lj-reference",
      model_id: LJ_NOBLE_GASES.id,
      fidelity_level: "classical_model",
      parameters,
      ...(task === "md.run"
        ? { thermodynamic_conditions: { ensemble: "NVE" as const, temperature } }
        : {}),
      seed,
      requested_outputs: requested,
      compute_policy: { backend: "auto", precision: "float64" },
    };
  };

  const run = async (): Promise<void> => {
    if (!structure) return;
    setNotice(null);
    setMsd(null);
    try {
      const spec = buildSpec();
      const outcome = await solver.run(spec, structure, workspace.project.project_id);
      if (!outcome) {
        setNotice(t("workbench.cancelled"));
        return;
      }
      const entry: StoredJob = {
        job: outcome.job,
        spec,
        result: outcome.result,
        provenance: outcome.provenance,
        log: outcome.job.events.map((event) => `${event.at} ${event.state} ${event.message}`).join("\n"),
        trajectory: outcome.trajectory,
        trajectoryLocation: outcome.trajectory ? "memory" : "none",
      };
      setLive(entry);
      if (outcome.job.state === "completed" || outcome.job.state === "failed") {
        await workspace.recordJob(entry);
      }
      if (outcome.error) setNotice(outcome.error.message);
      if (outcome.job.state === "completed") setNotice(t("workbench.jobSaved"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const computeMsdNow = (): void => {
    if (!trajectory || trajectory.length < 4) {
      setMsd({ error: t("workbench.msdNote") });
      return;
    }
    const summary = msdFromTrajectory(trajectory, structure ?? undefined);
    setMsd(summary);
    if (!("error" in summary) && live) {
      void workspace.recordJob({ ...live, msd: summary });
      setLive({ ...live, msd: summary });
    }
  };

  const renderSeries = (bundle: ResultBundle) => {
    const plots: JSX.Element[] = [];
    for (const series of bundle.series ?? []) {
      if (series.name === "energy_vs_step") {
        plots.push(
          <LinePlot key={series.name} series={{ name: series.name, x: series.x, y: series.y }} xLabel={t("axis.step")} yLabel={t("axis.energy")} xUnit="1" yUnit="eV" />,
        );
      } else if (series.name === "temperature_vs_time") {
        plots.push(
          <LinePlot key={series.name} series={{ name: series.name, x: series.x, y: series.y }} xLabel={t("axis.time")} yLabel={t("axis.temperature")} xUnit="ps" yUnit="K" />,
        );
      } else if (series.name === "energy_vs_time") {
        plots.push(
          <LinePlot key={series.name} series={{ name: series.name, x: series.x, y: series.y }} xLabel={t("axis.time")} yLabel={t("axis.energy")} xUnit="ps" yUnit="eV" />,
        );
      } else if (series.name === "radial_distribution_function") {
        plots.push(
          <LinePlot key={series.name} series={{ name: series.name, x: series.x, y: series.y }} xLabel={t("axis.distance")} yLabel={t("axis.g")} xUnit="Å" yUnit="1" />,
        );
      } else if (series.name === "max_force_vs_step") {
        plots.push(
          <LinePlot key={series.name} series={{ name: series.name, x: series.x, y: series.y }} xLabel={t("axis.step")} yLabel={t("axis.force")} xUnit="1" yUnit="eV/Å" />,
        );
      }
    }
    return plots;
  };

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>{t("workbench.title")}</h1>
          <p>{t("workbench.lead")}</p>
        </div>
        {job && <Badge tone={stateTone(job.state)}>{job.state}</Badge>}
      </header>

      {notice && (
        <Callout tone={solver.state.status === "failed" ? "error" : "info"}>
          {notice}
        </Callout>
      )}

      <div className="two-col">
        <div className="stack">
          <Panel title={t("workbench.task")} subtitle={t("workbench.structure")}>
            <div className="stack" style={{ gap: 12 }}>
              <Field label={t("workbench.structure")} htmlFor="wb-structure">
                <select
                  id="wb-structure"
                  className="select"
                  value={structure?.structure_id ?? ""}
                  onChange={(event) => {
                    workspace.selectStructure(event.target.value || null);
                    setLive(null);
                  }}
                >
                  <option value="">—</option>
                  {workspace.structures.map((item) => (
                    <option key={item.structure_id} value={item.structure_id}>
                      {item.composition?.reduced_formula ?? item.structure_id} · {item.sites.length} {t("common.atoms")}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("workbench.task")} htmlFor="wb-task">
                <select id="wb-task" className="select" value={task} onChange={(event) => setTask(event.target.value as Task)}>
                  <option value="energy.evaluate">{t("workbench.taskEnergy")}</option>
                  <option value="structure.relax">{t("workbench.taskRelax")}</option>
                  <option value="md.run">{t("workbench.taskMd")}</option>
                  <option value="analysis.rdf">{t("workbench.taskRdf")}</option>
                </select>
              </Field>

              <Field label={t("workbench.model")} htmlFor="wb-model" hint={t("workbench.modelWarning")}>
                <select id="wb-model" className="select" value={LJ_NOBLE_GASES.id} disabled>
                  <option value={LJ_NOBLE_GASES.id}>{LJ_NOBLE_GASES.name}</option>
                </select>
              </Field>

              {unsupportedSpecies.length > 0 && (
                <Callout tone="error">
                  {t("workbench.unsupportedElement")} ({unsupportedSpecies.join(", ")})
                </Callout>
              )}

              <div className="grid-2">
                <Field label={t("workbench.cutoff")} htmlFor="wb-cutoff" hint={t("workbench.cutoffNotice")}>
                  <NumberInput
                    id="wb-cutoff"
                    step={0.1}
                    min={1}
                    max={12}
                    value={cutoff}
                    onChange={setCutoff}
                  />
                </Field>
                <Field label={t("workbench.seed")} htmlFor="wb-seed">
                  <NumberInput
                    id="wb-seed"
                    step={1}
                    min={0}
                    value={seed}
                    onChange={(value) => setSeed(Math.round(value))}
                  />
                </Field>
              </div>

              {task === "structure.relax" && (
                <div className="grid-2">
                  <Field label={t("workbench.maxForce")} htmlFor="wb-fmax">
                    <NumberInput
                      id="wb-fmax"
                      step={0.005}
                      min={0.001}
                      value={maxForce}
                      onChange={setMaxForce}
                    />
                  </Field>
                  <Field label={t("workbench.maxSteps")} htmlFor="wb-maxsteps">
                    <NumberInput
                      id="wb-maxsteps"
                      step={50}
                      min={1}
                      value={maxSteps}
                      onChange={(value) => setMaxSteps(Math.round(value))}
                    />
                  </Field>
                </div>
              )}

              {task === "md.run" && (
                <>
                  <Callout tone="warn">{t("workbench.ensembleNveOnly")}</Callout>
                  <div className="grid-3">
                    <Field label={t("workbench.steps")} htmlFor="wb-steps">
                      <NumberInput
                        id="wb-steps"
                        step={50}
                        min={10}
                        value={steps}
                        onChange={(value) => setSteps(Math.round(value))}
                      />
                    </Field>
                    <Field label={t("workbench.timestep")} htmlFor="wb-dt">
                      <NumberInput
                        id="wb-dt"
                        step={0.001}
                        min={0.0001}
                        value={timestep}
                        onChange={setTimestep}
                      />
                    </Field>
                    <Field label={t("workbench.temperature")} htmlFor="wb-temp">
                      <NumberInput
                        id="wb-temp"
                        step={10}
                        min={1}
                        value={temperature}
                        onChange={setTemperature}
                      />
                    </Field>
                  </div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={recordTrajectory}
                      onChange={(event) => setRecordTrajectory(event.target.checked)}
                    />
                    {t("workbench.trajectory")}
                  </label>
                </>
              )}

              {task === "analysis.rdf" && (
                <Field label={t("workbench.bins")} htmlFor="wb-bins">
                  <NumberInput
                    id="wb-bins"
                    step={10}
                    min={10}
                    value={bins}
                    onChange={(value) => setBins(Math.round(value))}
                  />
                </Field>
              )}

              <div className="row">
                <Button variant="primary" onClick={() => void run()} disabled={!canRun}>
                  {solver.state.status === "running" ? t("common.running") : t("workbench.start")}
                </Button>
                {solver.state.status === "running" && (
                  <Button variant="danger" onClick={solver.cancel}>
                    {t("workbench.cancel")}
                  </Button>
                )}
                <span className="tiny muted">{t("workbench.runningHint")}</span>
              </div>

              {solver.state.status === "running" && (
                <div>
                  <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(solver.state.progress.fraction * 100)}>
                    <div className="progress-fill" style={{ width: `${Math.max(3, solver.state.progress.fraction * 100)}%` }} />
                  </div>
                  <p className="tiny muted mono" style={{ marginTop: 6 }}>
                    {solver.state.progress.phase} · {solver.state.progress.message}
                  </p>
                </div>
              )}
            </div>
          </Panel>

          {result && job && (
            <Panel title={t("workbench.results")} actions={<Badge tone={stateTone(job.state)}>{result.status}</Badge>}>
              <div className="grid-3">
                <Stat label={t("workbench.fidelity")} value={t(`fidelity.${result.fidelity_level}` as TranslationKey)} />
                <Stat label={t("workbench.method")} value={result.model_id ?? result.engine_id} />
                <Stat
                  label={t("workbench.convergence")}
                  value={result.convergence.converged ? t("workbench.converged") : t("workbench.notConverged")}
                  hint={result.convergence.criterion}
                />
              </div>

              <h3 style={{ marginTop: 18 }}>{t("workbench.quantities")}</h3>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th className="num">Value</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.quantities.map((quantity) => (
                      <tr key={quantity.name}>
                        <td className="mono small">{quantity.name}</td>
                        <td className="num">{formatNumber(quantity.value, 6)}</td>
                        <td className="mono small">{quantity.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.convergence.residuals && result.convergence.residuals.length > 0 && (
                <p className="tiny muted" style={{ marginTop: 8 }}>
                  {result.convergence.iterations ?? 0} iterations · final {formatNumber(result.convergence.final_value)} / threshold {formatNumber(result.convergence.threshold)}
                </p>
              )}

              {(result.series ?? []).length > 0 && (
                <div className="stack" style={{ marginTop: 18 }}>
                  {renderSeries(result)}
                </div>
              )}

              {task === "md.run" || result.engine_id.includes("lj") ? (
                trajectory && trajectory.length > 1 ? (
                  <div style={{ marginTop: 18 }}>
                    <div className="row">
                      <Button size="sm" onClick={computeMsdNow}>
                        {t("workbench.computeMsd")}
                      </Button>
                      <span className="tiny muted">
                        {trajectory.length} frames · {live?.trajectoryLocation ?? storedActive?.trajectoryLocation ?? "memory"}
                      </span>
                    </div>
                    <p className="tiny muted" style={{ marginTop: 6 }}>{t("workbench.msdNote")}</p>
                    {msd && "error" in msd && <Callout tone="error">{msd.error}</Callout>}
                    {msd && !("error" in msd) && (
                      <div className="stack" style={{ marginTop: 12 }}>
                        <div className="grid-3">
                          <Stat label="D" value={formatNumber(msd.diffusionCm2PerS, 4)} unit="cm²/s" />
                          <Stat label="slope" value={formatNumber(msd.slopeAngstrom2PerPs, 4)} unit="Å²/ps" />
                          <Stat label="fit window" value={`${formatNumber(msd.fitLagPs[0])} – ${formatNumber(msd.fitLagPs[1])}`} unit="ps" />
                        </div>
                        <LinePlot
                          series={{ name: "msd", x: msd.lagPs, y: msd.msd }}
                          xLabel={t("axis.time")}
                          yLabel={t("axis.msd")}
                          xUnit="ps"
                          yUnit="Å²"
                        />
                        {msd.warnings.map((warning, index) => (
                          <p className="tiny muted" key={index}>{warning}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null
              ) : null}

              <h3 style={{ marginTop: 18 }}>{t("workbench.limitations")}</h3>
              <ul className="small secondary" style={{ margin: 0, paddingLeft: 18 }}>
                {result.limitations.map((limitation, index) => (
                  <li key={index}>{limitation}</li>
                ))}
              </ul>

              {job.warnings && job.warnings.length > 0 && (
                <div style={{ marginTop: 12 }} className="stack">
                  {job.warnings.map((warning, index) => (
                    <Callout tone={warning.severity === "error" ? "error" : "warn"} key={index}>
                      <span className="mono tiny">{warning.code}</span> {warning.message}
                    </Callout>
                  ))}
                </div>
              )}

              <div className="row" style={{ marginTop: 18 }}>
                {result.result_structure && (
                  <Button
                    size="sm"
                    onClick={() => {
                      workspace.addStructure(result.result_structure!);
                      setNotice(t("workbench.resultStructure"));
                      navigate("/studio");
                    }}
                  >
                    {t("workbench.resultStructure")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const html = workspace.buildReport(job.job_id);
                    if (html) downloadText(safeFilename(`report-${job.job_id}`, "html"), html, "text/html");
                  }}
                  disabled={!provenance}
                >
                  {t("workbench.report")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => navigate("/provenance")}>
                  {t("workbench.provenance")}
                </Button>
                {result.result_structure && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadText(safeFilename("relaxed", "cif"), exportStructure(result.result_structure!, "cif"))}
                  >
                    CIF
                  </Button>
                )}
              </div>
            </Panel>
          )}

          {!result && (
            <Panel title={t("workbench.results")}>
              <p className="muted small">{t("workbench.noResults")}</p>
            </Panel>
          )}
        </div>

        <div className="stack">
          <Panel title={t("workbench.provenance")} subtitle={t("provenance.lead")}>
            {provenance ? (
              <dl className="kv">
                <dt>{t("provenance.record")}</dt>
                <dd>{provenance.provenance_id}</dd>
                <dt>{t("workbench.fidelity")}</dt>
                <dd>{provenance.fidelity_level}</dd>
                <dt>{t("provenance.inputs")}</dt>
                <dd title={provenance.inputs.input_hash}>{provenance.inputs.input_hash.slice(0, 24)}…</dd>
                <dt>{t("provenance.method")}</dt>
                <dd>{provenance.method?.name ?? "—"}</dd>
                <dt>{t("provenance.environment")}</dt>
                <dd>
                  {provenance.environment?.backend ?? "—"} · {provenance.environment?.precision ?? "—"}
                </dd>
                <dt>{t("workbench.seed")}</dt>
                <dd>{provenance.environment?.random_seed ?? "—"}</dd>
                <dt>{t("workbench.units")}</dt>
                <dd>{Object.entries(provenance.units).map(([key, value]) => `${key}: ${value}`).join(" · ")}</dd>
              </dl>
            ) : (
              <p className="muted small">{t("provenance.noJob")}</p>
            )}
          </Panel>

          <Panel title={t("workbench.resultStructure")} subtitle={t("workbench.msd")}>
            {trajectory && trajectory.length > 1 ? (
              <p className="small secondary">
                {trajectory.length} frames · Δt = {formatNumber(trajectory[1]!.timePs - trajectory[0]!.timePs, 4)} ps ·{" "}
                {live?.trajectoryLocation ?? storedActive?.trajectoryLocation ?? "memory"}
              </p>
            ) : (
              <p className="small muted">{t("workbench.trajectory")}: {t("common.no")}</p>
            )}
            {result && (
              <div className="grid-2" style={{ marginTop: 12 }}>
                {result.quantities
                  .filter((quantity) => quantity.name.includes("drift"))
                  .map((quantity) => (
                    <Stat
                      key={quantity.name}
                      label={quantity.name}
                      value={formatSigned(Number(quantity.value), 5)}
                      unit={quantity.unit}
                    />
                  ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
