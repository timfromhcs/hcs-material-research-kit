import { useMemo, useRef, useState } from "react";
import {
  addAtom,
  computeXrdPattern,
  createCrystal,
  createVacancy,
  CU_KA1_ANGSTROM,
  exportStructure,
  importStructure,
  makeSupercell,
  measureSites,
  prototypeInfo,
  setSitePosition,
  substituteSpecies,
  xrdPeaksToCsv,
  type CrystalPrototype,
  type Structure,
  type StructureFormat,
} from "@hcs-materials/core";
import { Badge, Button, Callout, Field, Panel, Stat, cx } from "@hcs-materials/ui";
import { LinePlot, StructureViewer } from "@hcs-materials/visualization";
import { useI18n } from "../i18n";
import { NumberInput } from "../components/NumberInput";
import { useWorkspace } from "../state/store";
import { downloadText, safeFilename } from "../lib/download";
import { formatNumber, validationTone } from "../lib/format";

const PROTOTYPES: CrystalPrototype[] = [
  "sc",
  "bcc",
  "fcc",
  "hcp",
  "diamond",
  "rocksalt",
  "cesiumchloride",
  "perovskite",
  "wurtzite",
];

const DEFAULT_LATTICE: Record<CrystalPrototype, number> = {
  sc: 3.6,
  bcc: 2.87,
  fcc: 3.62,
  hcp: 3.21,
  diamond: 5.431,
  rocksalt: 5.64,
  cesiumchloride: 4.12,
  perovskite: 3.905,
  wurtzite: 3.25,
};

export function StructureStudio(): JSX.Element {
  const { t } = useI18n();
  const workspace = useWorkspace();
  const current =
    workspace.structures.find((s) => s.structure_id === workspace.activeStructureId) ?? null;

  const [prototype, setPrototype] = useState<CrystalPrototype>("diamond");
  const [latticeA, setLatticeA] = useState(DEFAULT_LATTICE.diamond);
  const [latticeC, setLatticeC] = useState(5.431);
  const [species, setSpecies] = useState<string[]>(["Si"]);
  const [supercell, setSupercell] = useState({ na: 1, nb: 1, nc: 1 });
  const [selected, setSelected] = useState<number[]>([]);
  const [substituteTo, setSubstituteTo] = useState("Ge");
  const [newSpecies, setNewSpecies] = useState("C");
  const [newPosition, setNewPosition] = useState<[string, string, string]>(["0.5", "0.5", "0.5"]);
  const [moveTo, setMoveTo] = useState<[string, string, string]>(["0", "0", "0"]);
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);
  const [showBonds, setShowBonds] = useState(true);
  const [showCell, setShowCell] = useState(true);
  const [wavelength, setWavelength] = useState(CU_KA1_ANGSTROM);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const measurement = useMemo(() => {
    if (!current || selected.length < 2) return null;
    try {
      return measureSites(current, selected);
    } catch {
      return null;
    }
  }, [current, selected]);

  const xrd = useMemo(() => {
    if (!current) return null;
    try {
      return {
        pattern: computeXrdPattern(current, { wavelengthAngstrom: wavelength }),
        error: null,
      };
    } catch (error) {
      return { pattern: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [current, wavelength]);

  const toggleSelection = (index: number | null, additive: boolean): void => {
    if (index === null) {
      setSelected([]);
      return;
    }
    setSelected((previous) => {
      if (!additive) return [index];
      if (previous.includes(index)) return previous.filter((value) => value !== index);
      return [...previous, index].slice(-3);
    });
  };

  const info = prototypeInfo(prototype);
  const validation = current?.validation;
  const checks = validation?.checks ?? [];

  const speciesInputs = useMemo(() => {
    const existing = [...species];
    while (existing.length < info.speciesCount) existing.push("");
    return existing.slice(0, Math.max(info.speciesCount, 1));
  }, [species, info.speciesCount]);

  const updatePrototype = (next: CrystalPrototype): void => {
    setPrototype(next);
    setLatticeA(DEFAULT_LATTICE[next]);
    const nextInfo = prototypeInfo(next);
    const presets: Partial<Record<CrystalPrototype, string[]>> = {
      rocksalt: ["Na", "Cl"],
      cesiumchloride: ["Cs", "Cl"],
      perovskite: ["Sr", "Ti", "O"],
      wurtzite: ["Zn", "S"],
    };
    setSpecies(presets[next] ?? Array.from({ length: nextInfo.speciesCount }, () => "Si"));
  };

  const handleCreate = (): void => {
    try {
      const needed = species.slice(0, info.speciesCount);
      if (needed.some((value) => !value.trim()))
        throw new Error(t("studio.species") + ": " + needed.join(", "));
      const structure = createCrystal({
        prototype,
        a: latticeA,
        ...(info.needsC ? { c: latticeC } : {}),
        species: needed,
      });
      workspace.addStructure(structure);
      setSelected([]);
      setNotice({
        tone: "info",
        text: `${structure.composition?.reduced_formula} · ${structure.sites.length} ${t("common.atoms")}`,
      });
    } catch (error) {
      setNotice({ tone: "err", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const replaceCurrent = (next: Structure): void => {
    if (!current) return;
    workspace.removeStructure(current.structure_id);
    workspace.addStructure(next);
    setSelected([]);
  };

  const handleSupercell = (): void => {
    if (!current) return;
    try {
      replaceCurrent(makeSupercell(current, supercell));
    } catch (error) {
      setNotice({ tone: "err", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleImport = async (file: File): Promise<void> => {
    try {
      const result = importStructure(await file.text(), file.name);
      workspace.addStructure(result.structure);
      setNotice({
        tone: result.warnings.length > 0 ? "info" : "ok",
        text:
          result.warnings.length > 0
            ? result.warnings.join(" ")
            : `${result.format}: ${result.structure.sites.length} ${t("common.atoms")}`,
      });
    } catch (error) {
      setNotice({ tone: "err", text: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleExport = (format: StructureFormat): void => {
    if (!current) return;
    const text = exportStructure(current, format);
    const ext = format === "hcs-json" ? "json" : format;
    downloadText(safeFilename(`${current.display_name ?? current.structure_id}`, ext), text);
  };

  const parsePosition = (values: [string, string, string]): [number, number, number] => {
    const parsed = values.map((value) => Number(value.replace(",", "."))) as [
      number,
      number,
      number,
    ];
    if (parsed.some((value) => !Number.isFinite(value))) throw new Error(t("studio.addPosition"));
    return parsed;
  };

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>{t("studio.title")}</h1>
          <p>{t("studio.lead")}</p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={() => fileInput.current?.click()}>
            {t("studio.importFile")}
          </Button>
        </div>
      </header>

      {notice && (
        <Callout tone={notice.tone === "err" ? "error" : notice.tone === "ok" ? "info" : "warn"}>
          {notice.text}
          <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>
            {t("common.close")}
          </Button>
        </Callout>
      )}

      <div className="two-col">
        <div className="stack">
          <Panel
            title={
              current ? (current.display_name ?? current.structure_id) : t("studio.needStructure")
            }
            subtitle={
              current
                ? `${current.sites.length} ${t("common.atoms")} · ${current.composition?.reduced_formula}`
                : undefined
            }
            flush
            actions={
              current && (
                <div className="row">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={showBonds}
                      onChange={(event) => setShowBonds(event.target.checked)}
                    />
                    {t("studio.showBonds")}
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={showCell}
                      onChange={(event) => setShowCell(event.target.checked)}
                    />
                    {t("studio.showCell")}
                  </label>
                </div>
              )
            }
          >
            {current ? (
              <>
                <StructureViewer
                  structure={current}
                  selectedSites={selected}
                  onSelectSite={toggleSelection}
                  showBonds={showBonds}
                  showCell={showCell}
                  emptyMessage={t("studio.needStructure")}
                />
                <div className="panel-body">
                  <p className="tiny muted">{t("studio.viewerNote")}</p>
                </div>
              </>
            ) : (
              <div className="panel-body">
                <p className="muted small">{t("studio.needStructureHint")}</p>
              </div>
            )}
          </Panel>

          {current && (
            <Panel title={t("studio.atomsTable")} flush>
              <div className="site-table">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="num">{t("studio.index")}</th>
                      <th>{t("studio.speciesCol")}</th>
                      <th className="num">{t("studio.fracX")}</th>
                      <th className="num">{t("studio.fracY")}</th>
                      <th className="num">{t("studio.fracZ")}</th>
                      <th className="num">{t("studio.occupancy")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.sites.map((site, index) => (
                      <tr
                        key={`${site.label ?? site.species}-${index}`}
                        aria-selected={selected.includes(index)}
                        onClick={(event) => toggleSelection(index, event.shiftKey)}
                      >
                        <td className="num">{index}</td>
                        <td>{site.species}</td>
                        {site.fractional_position.map((value, axis) => (
                          <td className="num" key={axis}>
                            {value.toFixed(6)}
                          </td>
                        ))}
                        <td className="num">{(site.occupancy ?? 1).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>

        <div className="stack">
          <Panel title={t("studio.newCrystal")}>
            <div className="stack" style={{ gap: 12 }}>
              <Field label={t("studio.prototype")} htmlFor="prototype">
                <select
                  id="prototype"
                  className="select"
                  value={prototype}
                  onChange={(event) => updatePrototype(event.target.value as CrystalPrototype)}
                >
                  {PROTOTYPES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <span className="field-hint">{info.description}</span>
              </Field>
              <div className="grid-2">
                <Field label={`${t("studio.latticeA")} (Å)`} htmlFor="lattice-a">
                  <NumberInput
                    id="lattice-a"
                    step={0.001}
                    min={0.1}
                    value={latticeA}
                    onChange={setLatticeA}
                  />
                </Field>
                {info.needsC && (
                  <Field label={`${t("studio.latticeC")} (Å)`} htmlFor="lattice-c">
                    <NumberInput
                      id="lattice-c"
                      step={0.001}
                      min={0.1}
                      value={latticeC}
                      onChange={setLatticeC}
                    />
                  </Field>
                )}
              </div>
              <div className="grid-2">
                {speciesInputs.map((value, index) => (
                  <Field
                    key={index}
                    label={`${t("studio.species")} ${index + 1}`}
                    htmlFor={`species-${index}`}
                  >
                    <input
                      id={`species-${index}`}
                      className="input"
                      value={value}
                      maxLength={3}
                      onChange={(event) => {
                        const next = [...speciesInputs];
                        next[index] = event.target.value;
                        setSpecies(next);
                      }}
                    />
                  </Field>
                ))}
              </div>
              <Button variant="primary" onClick={handleCreate}>
                {t("studio.create")}
              </Button>
            </div>
          </Panel>

          {current && (
            <>
              <Panel title={t("studio.supercell")}>
                <div className="grid-3">
                  {(["na", "nb", "nc"] as const).map((axis, index) => (
                    <Field
                      key={axis}
                      label={
                        [t("studio.repeatA"), t("studio.repeatB"), t("studio.repeatC")][index]!
                      }
                      htmlFor={`sc-${axis}`}
                    >
                      <NumberInput
                        id={`sc-${axis}`}
                        min={1}
                        max={20}
                        value={supercell[axis]}
                        onChange={(value) =>
                          setSupercell({ ...supercell, [axis]: Math.round(value) })
                        }
                      />
                    </Field>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <Button size="sm" onClick={handleSupercell}>
                    {t("studio.buildSupercell")}
                  </Button>
                  <span className="tiny muted">
                    {current.sites.length * supercell.na * supercell.nb * supercell.nc}{" "}
                    {t("common.atoms")}
                  </span>
                </div>
              </Panel>

              <Panel
                title={t("studio.validation")}
                actions={
                  <Badge tone={validationTone(validation?.status)}>
                    {validation?.status ?? "unchecked"}
                  </Badge>
                }
              >
                <ul className="list" style={{ gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
                  {checks.map((check) => (
                    <li key={check.id} className="small" style={{ display: "flex", gap: 8 }}>
                      <Badge
                        tone={
                          check.status === "pass"
                            ? "ok"
                            : check.status === "warning"
                              ? "warn"
                              : "err"
                        }
                      >
                        {check.status}
                      </Badge>
                      <span className="secondary">
                        <span className="mono tiny muted">{check.id}</span> {check.message}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="grid-3" style={{ marginTop: 14 }}>
                  <Stat
                    label={t("studio.formula")}
                    value={current.composition?.reduced_formula ?? "—"}
                  />
                  <Stat
                    label={t("studio.volume")}
                    value={formatNumber(
                      Math.abs(
                        current.lattice.vectors[0][0] *
                          (current.lattice.vectors[1][1] * current.lattice.vectors[2][2] -
                            current.lattice.vectors[1][2] * current.lattice.vectors[2][1]) -
                          current.lattice.vectors[0][1] *
                            (current.lattice.vectors[1][0] * current.lattice.vectors[2][2] -
                              current.lattice.vectors[1][2] * current.lattice.vectors[2][0]) +
                          current.lattice.vectors[0][2] *
                            (current.lattice.vectors[1][0] * current.lattice.vectors[2][1] -
                              current.lattice.vectors[1][1] * current.lattice.vectors[2][0]),
                      ),
                      3,
                    )}
                    unit="Å³"
                  />
                  <Stat
                    label={t("studio.speciesCol")}
                    value={Object.keys(current.composition?.amounts ?? {}).join(" · ")}
                  />
                </div>
              </Panel>

              <Panel
                title={t("studio.xrd")}
                subtitle={t("studio.xrdHint")}
                actions={
                  xrd?.pattern ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        downloadText(
                          safeFilename("xrd-pattern", "csv"),
                          xrdPeaksToCsv(xrd.pattern!),
                        )
                      }
                    >
                      CSV
                    </Button>
                  ) : null
                }
              >
                <div className="grid-2">
                  <Field label={t("studio.wavelength")} htmlFor="xrd-wavelength">
                    <NumberInput
                      id="xrd-wavelength"
                      step={0.01}
                      min={0.1}
                      value={wavelength}
                      onChange={setWavelength}
                    />
                  </Field>
                  <Stat
                    label={t("studio.wavelength")}
                    value={wavelength.toFixed(5)}
                    unit="Å"
                    hint="Cu Kα1 = 1.54056 Å"
                  />
                </div>
                {xrd?.error && (
                  <Callout tone="error">
                    {t("studio.xrdUnavailable")} {xrd.error}
                  </Callout>
                )}
                {xrd?.pattern && (
                  <div className="stack" style={{ marginTop: 12 }}>
                    <LinePlot
                      series={{
                        name: "xrd",
                        x: xrd.pattern.twoThetaDeg,
                        y: xrd.pattern.intensity,
                      }}
                      xLabel={t("studio.twoTheta")}
                      yLabel={t("studio.intensity")}
                      xUnit="°"
                      yUnit="1"
                    />
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>hkl</th>
                            <th className="num">2θ (°)</th>
                            <th className="num">d (Å)</th>
                            <th className="num">mult.</th>
                            <th className="num">I (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {xrd.pattern.peaks.slice(0, 12).map((peak) => (
                            <tr key={`${peak.h}-${peak.k}-${peak.l}-${peak.twoThetaDeg}`}>
                              <td className="mono small">
                                {peak.h} {peak.k} {peak.l}
                              </td>
                              <td className="num">{formatNumber(peak.twoThetaDeg, 3)}</td>
                              <td className="num">{formatNumber(peak.dSpacingAngstrom, 4)}</td>
                              <td className="num">{peak.multiplicity}</td>
                              <td className="num">{formatNumber(peak.intensity, 1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="tiny muted">{xrd.pattern.method}</p>
                  </div>
                )}
              </Panel>

              <Panel title={t("studio.measurement")} subtitle={t("studio.measureHint")}>
                {measurement ? (
                  <div className="stack" style={{ gap: 10 }}>
                    <div className="grid-2">
                      {measurement.distances.map((distance, index) => (
                        <Stat
                          key={index}
                          label={`${t("studio.distance")} ${measurement.indices[index]}–${measurement.indices[index + 1]}`}
                          value={distance.toFixed(6)}
                          unit="Å"
                        />
                      ))}
                      {measurement.angleDegrees !== undefined && (
                        <Stat
                          label={t("studio.angle")}
                          value={measurement.angleDegrees.toFixed(3)}
                          unit="°"
                          hint={`${measurement.indices.join(" → ")}`}
                        />
                      )}
                    </div>
                    {measurement.vector && (
                      <p className="tiny muted mono">
                        Δ = [{measurement.vector.map((v) => v.toFixed(4)).join(", ")}] Å
                      </p>
                    )}
                    {measurement.wrapped && (
                      <Callout tone="info">{t("studio.wrappedNote")}</Callout>
                    )}
                    <div className="row">
                      <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                        {t("studio.clearSelection")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="small muted">{t("studio.measureHint")}</p>
                )}
              </Panel>

              <Panel title={t("studio.edit")}>
                <div className="stack" style={{ gap: 12 }}>
                  <p className="small secondary">
                    {selected.length === 0
                      ? t("studio.noSelection")
                      : `${selected.length} ${t("studio.selectionCount")}: ${selected
                          .map((index) => `${index} (${current.sites[index]?.species})`)
                          .join(", ")}`}
                  </p>
                  <div className="row">
                    <input
                      className="input"
                      style={{ maxWidth: 110 }}
                      value={substituteTo}
                      maxLength={3}
                      onChange={(event) => setSubstituteTo(event.target.value)}
                      aria-label={t("studio.substitute")}
                    />
                    <Button
                      size="sm"
                      disabled={selected.length === 0}
                      onClick={() => {
                        if (selected.length === 0 || !current) return;
                        try {
                          replaceCurrent(substituteSpecies(current, selected, substituteTo));
                        } catch (error) {
                          setNotice({
                            tone: "err",
                            text: error instanceof Error ? error.message : String(error),
                          });
                        }
                      }}
                    >
                      {t("studio.substitute")}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={selected.length === 0}
                      onClick={() => {
                        if (selected.length === 0 || !current) return;
                        try {
                          replaceCurrent(createVacancy(current, selected));
                        } catch (error) {
                          setNotice({
                            tone: "err",
                            text: error instanceof Error ? error.message : String(error),
                          });
                        }
                      }}
                    >
                      {t("studio.vacancy")}
                    </Button>
                  </div>
                  {selected.length > 0 && (
                    <div className="row">
                      {(["a", "b", "c"] as const).map((axis, index) => (
                        <input
                          key={axis}
                          className="input num"
                          style={{ maxWidth: 86 }}
                          defaultValue={
                            current.sites[selected[0]!]?.fractional_position[index]?.toFixed(4) ??
                            "0"
                          }
                          aria-label={`f_${axis}`}
                          onChange={(event) => {
                            const next = [...moveTo] as [string, string, string];
                            next[index] = event.target.value;
                            setMoveTo(next);
                          }}
                        />
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (selected.length === 0 || !current) return;
                          try {
                            replaceCurrent(
                              setSitePosition(current, selected[0]!, parsePosition(moveTo)),
                            );
                          } catch (error) {
                            setNotice({
                              tone: "err",
                              text: error instanceof Error ? error.message : String(error),
                            });
                          }
                        }}
                      >
                        {t("studio.moveTo")}
                      </Button>
                    </div>
                  )}
                  <div className="row">
                    <input
                      className="input"
                      style={{ maxWidth: 90 }}
                      value={newSpecies}
                      maxLength={3}
                      onChange={(event) => setNewSpecies(event.target.value)}
                      aria-label={t("studio.addAtom")}
                    />
                    {(["a", "b", "c"] as const).map((axis, index) => (
                      <input
                        key={axis}
                        className="input num"
                        style={{ maxWidth: 80 }}
                        defaultValue={newPosition[index]}
                        aria-label={`${t("studio.addPosition")} f_${axis}`}
                        onChange={(event) => {
                          const next = [...newPosition] as [string, string, string];
                          next[index] = event.target.value;
                          setNewPosition(next);
                        }}
                      />
                    ))}
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!current) return;
                        try {
                          replaceCurrent(addAtom(current, newSpecies, parsePosition(newPosition)));
                        } catch (error) {
                          setNotice({
                            tone: "err",
                            text: error instanceof Error ? error.message : String(error),
                          });
                        }
                      }}
                    >
                      {t("studio.addAtom")}
                    </Button>
                  </div>
                </div>
              </Panel>

              <Panel title={t("studio.exportAs")}>
                <div className="row">
                  {(["cif", "poscar", "xyz", "hcs-json"] as StructureFormat[]).map((format) => (
                    <Button
                      key={format}
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExport(format)}
                    >
                      {format.toUpperCase()}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (!current) return;
                      workspace.removeStructure(current.structure_id);
                      setSelected([]);
                    }}
                  >
                    {t("studio.deleteStructure")}
                  </Button>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>

      <Panel title={t("studio.structureList")} flush>
        <div className="panel-body">
          {workspace.structures.length === 0 ? (
            <p className="muted small">{t("dashboard.projectEmpty")}</p>
          ) : (
            <div className="list">
              {workspace.structures.map((structure) => (
                <div
                  key={structure.structure_id}
                  className={cx(
                    "list-item",
                    structure.structure_id === workspace.activeStructureId && "active",
                  )}
                  data-active={structure.structure_id === workspace.activeStructureId}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    workspace.selectStructure(structure.structure_id);
                    setSelected([]);
                  }}
                >
                  <Badge tone={validationTone(structure.validation?.status)}>
                    {structure.validation?.status ?? "unchecked"}
                  </Badge>
                  <span style={{ minWidth: 0 }}>
                    <div className="small">
                      {structure.composition?.reduced_formula ??
                        structure.display_name ??
                        structure.structure_id}
                    </div>
                    <div className="tiny muted mono">{structure.structure_id}</div>
                  </span>
                  <span className="spacer" />
                  <span className="tiny muted">
                    {structure.sites.length} {t("common.atoms")} ·{" "}
                    {structure.source?.format ?? "generated"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void handleImport(file);
        }}
        className={cx("panel", dragging && "drag-over")}
        style={{ padding: 16, borderStyle: "dashed" }}
      >
        <p className="small muted">{t("studio.dropHint")}</p>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".cif,.poscar,.vasp,.contcar,.xyz,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImport(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
