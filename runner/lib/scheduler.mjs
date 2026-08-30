/**
 * Routine scheduler: materialises due jobs exactly once per due time.
 *
 * State (per-routine cursor = last materialised/skipped due time) persists to
 * <dataDir>/scheduler-state.json. A fresh instance constructed over persisted
 * state treats everything due between the cursor and the first tick as MISSED
 * (the runner was down) and applies the routine's missedRunPolicy:
 *   'skip'                    → materialise none of the backlog;
 *   'run_once_on_reconnect'   → materialise exactly one job (latest due time).
 * After that first tick, every due time materialises exactly once.
 *
 * Materialisation is at-least-once across a crash between materialise and
 * cursor save; the queue's idempotencyKey (`<routineId>@<dueIso>`) dedupes.
 */
import { join } from 'node:path';
import { loadJson, saveJsonAtomic } from './store.mjs';
import { nextRunAt, validateSchedule } from './schedule.mjs';

const MISSED_RUN_POLICIES = new Set(['skip', 'run_once_on_reconnect']);
const MAX_DUE_PER_TICK = 1000;

/** Returns human-readable problems; empty array means the routine is valid. */
export function validateRoutine(routine) {
  if (!routine || typeof routine !== 'object') return ['routine must be an object'];
  const problems = [];
  if (typeof routine.id !== 'string' || routine.id.length === 0) problems.push('id must be a non-empty string');
  if (!MISSED_RUN_POLICIES.has(routine.missedRunPolicy)) {
    problems.push("missedRunPolicy must be 'skip' or 'run_once_on_reconnect'");
  }
  problems.push(...validateSchedule(routine.schedule));
  return problems;
}

export class Scheduler {
  constructor({ dataDir, materialise, now = () => Date.now() }) {
    if (!dataDir) throw new Error('Scheduler requires a dataDir');
    this.file = join(dataDir, 'scheduler-state.json');
    this.materialise = materialise;
    this.now = now;
    this.routines = new Map();
    this.state = loadJson(this.file, {});
    // Routines with a persisted cursor are reconnecting after downtime.
    this.reconnectPending = new Set(Object.keys(this.state));
  }

  setRoutines(routines) {
    this.routines = new Map(routines.map((routine) => [routine.id, routine]));
  }

  /** Materialise everything newly due at `nowMs`; returns what was created. */
  tick(nowMs = this.now()) {
    const materialised = [];
    for (const routine of this.routines.values()) {
      if (routine.enabled === false) continue;
      const spec = routine.schedule;
      if (!spec || spec.kind === 'manual') continue;

      if (this.state[routine.id]?.cursor === undefined) {
        // First sighting: anchor at now — brand-new routines have no backlog.
        this.state[routine.id] = { cursor: new Date(nowMs).toISOString() };
        this.save();
      }
      const due = this.collectDue(spec, this.state[routine.id].cursor, nowMs);
      if (due.length === 0) {
        this.reconnectPending.delete(routine.id);
        continue;
      }
      const isReconnect = this.reconnectPending.has(routine.id);
      this.reconnectPending.delete(routine.id);
      let toRun = due;
      if (isReconnect) {
        toRun = routine.missedRunPolicy === 'run_once_on_reconnect' ? [due[due.length - 1]] : [];
      }
      for (const dueIso of toRun) {
        this.materialise(routine, dueIso);
        materialised.push({ routineId: routine.id, dueAt: dueIso });
      }
      this.state[routine.id] = { cursor: due[due.length - 1] };
      this.save();
    }
    return materialised;
  }

  /** All scheduled times strictly after `cursorIso` and at or before `nowMs`. */
  collectDue(spec, cursorIso, nowMs) {
    const due = [];
    let probe = nextRunAt(spec, cursorIso);
    while (probe !== null && Date.parse(probe) <= nowMs && due.length < MAX_DUE_PER_TICK) {
      due.push(probe);
      probe = nextRunAt(spec, probe);
    }
    return due;
  }

  save() {
    saveJsonAtomic(this.file, this.state);
  }
}
