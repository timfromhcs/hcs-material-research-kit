/**
 * Job state machine. Illegal transitions throw; there is no silent recovery.
 *
 *   created -> validated -> queued -> preparing -> running
 *          -> checkpointing -> running
 *          -> completed | failed | cancelled | interrupted
 */
import type { JobEvent, JobRecord, JobState } from "../types.js";
import { SCHEMA_VERSION } from "../types.js";

const TRANSITIONS: Record<JobState, JobState[]> = {
  created: ["validated", "failed", "cancelled"],
  validated: ["queued", "failed", "cancelled"],
  queued: ["preparing", "cancelled", "failed"],
  preparing: ["running", "failed", "cancelled", "interrupted"],
  running: ["checkpointing", "completed", "failed", "cancelled", "interrupted"],
  checkpointing: ["running", "failed", "cancelled", "interrupted"],
  completed: [],
  failed: [],
  cancelled: [],
  interrupted: ["queued", "failed", "cancelled"],
};

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobState, to: JobState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal job transition ${from} -> ${to}`);
  }
}

export const TERMINAL_STATES: readonly JobState[] = ["completed", "failed", "cancelled"];

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.includes(state);
}

export interface JobControllerOptions {
  job_id: string;
  project_id: string;
  task_type: string;
  input_hash: string;
  spec_ref: string;
  engine_id?: string;
  fidelity_level?: string;
  engine_capability_snapshot?: Record<string, unknown>;
  now?: () => Date;
}

/** Owns the mutable job record and enforces the lifecycle rules. */
export class JobController {
  readonly events: JobEvent[] = [];
  private readonly now: () => Date;
  private record: JobRecord;
  private cancelledFlag = false;

  constructor(options: JobControllerOptions) {
    this.now = options.now ?? (() => new Date());
    const timestamp = this.now().toISOString();
    this.record = {
      schema_version: SCHEMA_VERSION,
      job_id: options.job_id,
      project_id: options.project_id,
      task_type: options.task_type,
      engine_id: options.engine_id,
      fidelity_level: options.fidelity_level,
      state: "created",
      created_at: timestamp,
      updated_at: timestamp,
      input_hash: options.input_hash,
      spec_ref: options.spec_ref,
      events: [],
      warnings: [],
      ...(options.engine_capability_snapshot
        ? { engine_capability_snapshot: options.engine_capability_snapshot }
        : {}),
    };
    this.events.push({ at: timestamp, state: "created", message: "Job created" });
  }

  get state(): JobState {
    return this.record.state;
  }

  get isCancelled(): boolean {
    return this.cancelledFlag;
  }

  get snapshot(): JobRecord {
    return { ...this.record, events: [...this.events] };
  }

  transition(state: JobState, message: string, data?: Record<string, unknown>): void {
    if (this.record.state === state) {
      // Idempotent progress update only.
      return;
    }
    assertTransition(this.record.state, state);
    const timestamp = this.now().toISOString();
    this.record.state = state;
    this.record.updated_at = timestamp;
    if (state === "running" && !this.record.started_at) this.record.started_at = timestamp;
    if (isTerminal(state)) this.record.finished_at = timestamp;
    const event: JobEvent = { at: timestamp, state, message };
    if (data) event.data = data;
    this.events.push(event);
  }

  progress(phase: string, fraction: number, message: string): void {
    const clamped = Math.max(0, Math.min(1, fraction));
    this.record.progress = { phase, fraction: clamped, message };
    this.record.updated_at = this.now().toISOString();
  }

  warn(code: string, message: string, severity: "info" | "warning" | "error" = "warning"): void {
    this.record.warnings = [...(this.record.warnings ?? []), { code, message, severity }];
  }

  addCheckpoint(ref: string): void {
    this.record.checkpoint_refs = [...(this.record.checkpoint_refs ?? []), ref];
  }

  addOutput(ref: string): void {
    this.record.output_refs = [...(this.record.output_refs ?? []), ref];
  }

  setResultRef(ref: string): void {
    this.record.result_ref = ref;
  }

  setMetrics(metrics: NonNullable<JobRecord["resource_metrics"]>): void {
    this.record.resource_metrics = metrics;
  }

  /** Cooperative cancellation request. The runner checks `isCancelled`. */
  requestCancel(): void {
    if (isTerminal(this.record.state)) return;
    this.cancelledFlag = true;
    this.record.cancel_requested = true;
    this.events.push({
      at: this.now().toISOString(),
      state: this.record.state,
      message: "Cancellation requested",
    });
  }

  finalize(metrics?: NonNullable<JobRecord["resource_metrics"]>): JobRecord {
    if (metrics) this.record.resource_metrics = metrics;
    return this.snapshot;
  }
}
