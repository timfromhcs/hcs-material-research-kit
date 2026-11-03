import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildReproducibilityReport,
  createCrystal,
  createProjectMeta,
  makeSupercell,
  readProjectArchive,
  structureHash,
  writeProjectArchive,
  type Composition,
  type CrystalPrototype,
  type JobRecord,
  type ProvenanceRecord,
  type ResultBundle,
  type SimulationSpec,
  type Structure,
} from "@hcs-materials/core";
import { idbDelete, idbGet, idbSet } from "./idb";
import { deleteTrajectory, writeTrajectory } from "./opfs";

const STATE_KEY = "workspace.v1";

export interface StoredJob {
  job: JobRecord;
  spec: SimulationSpec;
  result?: ResultBundle;
  provenance?: ProvenanceRecord;
  log: string;
  /** Trajectory is kept in memory and, when supported, in OPFS. */
  trajectory?: { step: number; timePs: number; positions: [number, number, number][] }[];
  trajectoryLocation?: "opfs" | "memory" | "none";
  msd?: {
    lagPs: number[];
    msd: number[];
    slopeAngstrom2PerPs: number;
    diffusionCm2PerS: number;
    fitLagPs: [number, number];
    warnings: string[];
  };
  crossCheck?: {
    backend: "wasm";
    tolerance: number;
    maxDeltaEnergyEv: number;
    maxDeltaForceEvPerA: number;
    wasmEnergyEv: number;
    pairCount: number;
    passed: boolean;
  };
  crossCheckError?: string;
}

export interface ProjectInfo {
  project_id: string;
  name: string;
  created_at: string;
}

export interface WorkspaceState {
  project: ProjectInfo;
  structures: Structure[];
  jobs: StoredJob[];
  activeStructureId: string | null;
  activeJobId: string | null;
  archiveWarnings: string[];
  loaded: boolean;
}

interface PersistedState {
  project: ProjectInfo;
  structures: Structure[];
  jobs: Array<Omit<StoredJob, "trajectory">>;
  activeStructureId: string | null;
  activeJobId: string | null;
}

interface WorkspaceApi extends WorkspaceState {
  createProject: (name: string) => void;
  importProject: (bytes: Uint8Array) => { ok: boolean; warnings: string[] };
  exportProject: () => Uint8Array;
  addStructure: (structure: Structure) => void;
  updateStructure: (structure: Structure) => void;
  removeStructure: (structureId: string) => void;
  selectStructure: (structureId: string | null) => void;
  selectJob: (jobId: string | null) => void;
  recordJob: (entry: StoredJob) => Promise<void>;
  deleteJob: (jobId: string) => void;
  buildReport: (jobId: string) => string | null;
  getJob: (jobId: string | null) => StoredJob | undefined;
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null);

function newProject(name: string): ProjectInfo {
  return { project_id: `project_${crypto.randomUUID?.().slice(0, 8) ?? Date.now().toString(36)}`, name, created_at: new Date().toISOString() };
}

function initialState(): WorkspaceState {
  return {
    project: newProject("Untitled project"),
    structures: [],
    jobs: [],
    activeStructureId: null,
    activeJobId: null,
    archiveWarnings: [],
    loaded: false,
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<WorkspaceState>(initialState);
  const saveTimer = useRef<number | null>(null);

  // Hydrate once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await idbGet<PersistedState>(STATE_KEY);
        if (cancelled) return;
        if (stored && Array.isArray(stored.structures)) {
          setState({
            ...initialState(),
            ...stored,
            jobs: stored.jobs.map((job) => ({ ...job, trajectoryLocation: job.trajectoryLocation ?? "none" })),
            activeStructureId: stored.activeStructureId ?? stored.structures[0]?.structure_id ?? null,
            activeJobId: stored.activeJobId ?? stored.jobs[0]?.job.job_id ?? null,
            loaded: true,
          });
        } else {
          setState((current) => ({ ...current, loaded: true }));
        }
      } catch {
        if (!cancelled) setState((current) => ({ ...current, loaded: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist (debounced) without trajectories.
  useEffect(() => {
    if (!state.loaded) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const persisted: PersistedState = {
        project: state.project,
        structures: state.structures,
        jobs: state.jobs.map(({ trajectory: _trajectory, ...rest }) => rest),
        activeStructureId: state.activeStructureId,
        activeJobId: state.activeJobId,
      };
      void idbSet(STATE_KEY, persisted).catch(() => {
        /* storage full or blocked: the session keeps working in memory */
      });
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [state]);

  const createProject = useCallback((name: string) => {
    setState({
      project: newProject(name.trim() || "Untitled project"),
      structures: [],
      jobs: [],
      activeStructureId: null,
      activeJobId: null,
      archiveWarnings: [],
      loaded: true,
    });
  }, []);

  const importProject = useCallback((bytes: Uint8Array) => {
    try {
      const read = readProjectArchive(bytes);
      const jobs: StoredJob[] = read.jobs.map((entry) => ({
        job: entry.job,
        spec: entry.spec,
        result: entry.result,
        provenance: entry.provenance,
        log: entry.log ?? "",
        trajectoryLocation: "none",
      }));
      setState({
        project: {
          project_id: read.project.project_id,
          name: read.project.name,
          created_at: read.project.created_at,
        },
        structures: read.structures,
        jobs,
        activeStructureId: read.structures[0]?.structure_id ?? null,
        activeJobId: jobs[0]?.job.job_id ?? null,
        archiveWarnings: read.warnings,
        loaded: true,
      });
      return { ok: read.checksumsVerified, warnings: read.warnings };
    } catch (error) {
      const warning = error instanceof Error ? error.message : String(error);
      setState((current) => ({ ...current, archiveWarnings: [warning] }));
      return { ok: false, warnings: [warning] };
    }
  }, []);

  const exportProject = useCallback((): Uint8Array => {
    const reports: Record<string, string> = {};
    for (const entry of state.jobs) {
      if (!entry.result || !entry.provenance) continue;
      const structure = state.structures.find((s) => s.structure_id === entry.spec.structure_ref.structure_id);
      reports[`${entry.job.job_id}.html`] = buildReproducibilityReport({
        result: entry.result,
        provenance: entry.provenance,
        job: entry.job,
        spec: entry.spec,
        structure,
        projectName: state.project.name,
      });
    }
    return writeProjectArchive({
      project: createProjectMeta({
        name: state.project.name,
        projectId: state.project.project_id,
        now: new Date(state.project.created_at),
      }),
      structures: state.structures,
      jobs: state.jobs.map((entry) => ({
        spec: entry.spec,
        job: entry.job,
        result: entry.result,
        provenance: entry.provenance,
        log: entry.log,
        trajectories: entry.trajectory ? { "trajectory.json": entry.trajectory } : undefined,
      })),
      reports,
    });
  }, [state]);

  const addStructure = useCallback((structure: Structure) => {
    setState((current) => ({
      ...current,
      structures: [...current.structures, structure],
      activeStructureId: structure.structure_id,
    }));
  }, []);

  const updateStructure = useCallback((structure: Structure) => {
    setState((current) => ({
      ...current,
      structures: current.structures.map((candidate) =>
        candidate.structure_id === structure.structure_id ? structure : candidate,
      ),
      activeStructureId: structure.structure_id,
    }));
  }, []);

  const removeStructure = useCallback((structureId: string) => {
    setState((current) => {
      const structures = current.structures.filter((s) => s.structure_id !== structureId);
      return {
        ...current,
        structures,
        activeStructureId: current.activeStructureId === structureId ? (structures[0]?.structure_id ?? null) : current.activeStructureId,
      };
    });
  }, []);

  const selectStructure = useCallback((structureId: string | null) => {
    setState((current) => ({ ...current, activeStructureId: structureId }));
  }, []);

  const selectJob = useCallback((jobId: string | null) => {
    setState((current) => ({ ...current, activeJobId: jobId }));
  }, []);

  const recordJob = useCallback(async (entry: StoredJob) => {
    let trajectoryLocation: StoredJob["trajectoryLocation"] = "none";
    if (entry.trajectory && entry.trajectory.length > 0) {
      const written = await writeTrajectory(entry.job.job_id, entry.trajectory);
      trajectoryLocation = written.ok ? "opfs" : "memory";
    }
    setState((current) => ({
      ...current,
      jobs: [{ ...entry, trajectoryLocation }, ...current.jobs.filter((job) => job.job.job_id !== entry.job.job_id)],
      activeJobId: entry.job.job_id,
    }));
  }, []);

  const deleteJob = useCallback((jobId: string) => {
    void deleteTrajectory(jobId);
    setState((current) => ({
      ...current,
      jobs: current.jobs.filter((job) => job.job.job_id !== jobId),
      activeJobId: current.activeJobId === jobId ? null : current.activeJobId,
    }));
  }, []);

  const getJob = useCallback(
    (jobId: string | null) => (jobId ? state.jobs.find((job) => job.job.job_id === jobId) : undefined),
    [state.jobs],
  );

  const buildReport = useCallback(
    (jobId: string): string | null => {
      const entry = state.jobs.find((job) => job.job.job_id === jobId);
      if (!entry?.result || !entry.provenance) return null;
      const structure = state.structures.find((s) => s.structure_id === entry.spec.structure_ref.structure_id);
      return buildReproducibilityReport({
        result: entry.result,
        provenance: entry.provenance,
        job: entry.job,
        spec: entry.spec,
        structure,
        projectName: state.project.name,
      });
    },
    [state.jobs, state.structures, state.project.name],
  );

  const value = useMemo<WorkspaceApi>(
    () => ({
      ...state,
      createProject,
      importProject,
      exportProject,
      addStructure,
      updateStructure,
      removeStructure,
      selectStructure,
      selectJob,
      recordJob,
      deleteJob,
      buildReport,
      getJob,
    }),
    [
      state,
      createProject,
      importProject,
      exportProject,
      addStructure,
      updateStructure,
      removeStructure,
      selectStructure,
      selectJob,
      recordJob,
      deleteJob,
      buildReport,
      getJob,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceApi {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}

/** Convenience wrappers used by quick-start buttons. */
export function buildPrototype(
  prototype: CrystalPrototype,
  a: number,
  species: string[],
  c?: number,
): Structure {
  return createCrystal({ prototype, a, species, c });
}

export function supercellOf(structure: Structure, na: number, nb: number, nc: number): Structure {
  return makeSupercell(structure, { na, nb, nc });
}

export function formulaOf(structure: Structure): string {
  const composition: Composition | undefined = structure.composition;
  return composition?.reduced_formula ?? "";
}

export function hashOf(structure: Structure): string {
  return structureHash(structure);
}

export async function discardWorkspace(): Promise<void> {
  await idbDelete(STATE_KEY);
}
