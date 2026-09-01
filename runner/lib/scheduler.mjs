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
  constructor({ dataDir, materialise, now = () => Date.now(), validate = validateRoutine }) {
    if (!dataDir) throw new Error('Scheduler requires a dataDir');
    this.file = join(dataDir, 'scheduler-state.json');
    this.routinesFile = join(dataDir, 'scheduler-routines.json');
    this.materialise = materialise;
    this.now = now;
    this.validate = validate;
    this.routines = new Map();
    this.state = loadJson(this.file, {});
    // Routines with a persisted cursor are reconnecting after downtime.
    this.reconnectPending = new Set(Object.keys(this.state));
    const persisted = loadJson(this.routinesFile, []);
    let migrated = false;
    if (Array.isArray(persisted)) {
      for (const routine of persisted) {
        if (this.validate(routine).length === 0) {
          migrated = this.migrateLegacyState(routine) || migrated;
          this.routines.set(this.routineKey(routine), routine);
        }
      }
    }
    if (migrated) this.save();
  }

  namespaceOf(routine) {
    return typeof routine?.namespace === 'string' && routine.namespace.length > 0 ? routine.namespace : 'default';
  }

  routineKey(routineOrNamespace, id) {
    const namespace = typeof routineOrNamespace === 'string' ? routineOrNamespace : this.namespaceOf(routineOrNamespace);
    const routineId = typeof routineOrNamespace === 'string' ? id : routineOrNamespace.id;
    return JSON.stringify([namespace, routineId]);
  }

  migrateLegacyState(routine) {
    if (this.namespaceOf(routine) !== 'default') return false;
    const key = this.routineKey(routine);
    if (this.state[key] !== undefined || this.state[routine.id] === undefined) return false;
    this.state[key] = this.state[routine.id];
    delete this.state[routine.id];
    if (this.reconnectPending.delete(routine.id)) this.reconnectPending.add(key);
    return true;
  }

  assertValid(routine) {
    const problems = this.validate(routine);
    if (problems.length > 0) throw new Error(`invalid routine ${routine?.id ?? '?'}: ${problems.join('; ')}`);
  }

  /** Replace only one namespace, leaving every other owner untouched. */
  setRoutines(routines, namespace = 'default') {
    if (!Array.isArray(routines)) throw new Error('routines must be an array');
    for (const routine of routines) {
      this.assertValid(routine);
      if (this.namespaceOf(routine) !== namespace) {
        throw new Error(`routine ${routine.id} does not belong to namespace ${namespace}`);
      }
    }
    for (const [key, routine] of this.routines) {
      if (this.namespaceOf(routine) === namespace) this.routines.delete(key);
    }
    for (const routine of routines) {
      this.migrateLegacyState(routine);
      this.routines.set(this.routineKey(routine), routine);
    }
    this.saveRoutines();
    this.save();
  }

  upsertRoutine(routine) {
    this.assertValid(routine);
    this.migrateLegacyState(routine);
    this.routines.set(this.routineKey(routine), routine);
    this.saveRoutines();
    this.save();
    return routine;
  }

  removeRoutine(namespace, id) {
    const key = this.routineKey(namespace, id);
    const removed = this.routines.delete(key);
    if (!removed) return false;
    delete this.state[key];
    this.reconnectPending.delete(key);
    this.saveRoutines();
    this.save();
    return true;
  }

  getRoutine(namespace, id) {
    return this.routines.get(this.routineKey(namespace, id)) ?? null;
  }

  listRoutines(namespace) {
    const routines = [...this.routines.values()];
    return namespace === undefined ? routines : routines.filter((routine) => this.namespaceOf(routine) === namespace);
  }

  saveRoutines() {
    saveJsonAtomic(this.routinesFile, [...this.routines.values()]);
  }

  /** Materialise everything newly due at `nowMs`; returns what was created. */
  tick(nowMs = this.now()) {
    const materialised = [];
    for (const routine of this.routines.values()) {
      const key = this.routineKey(routine);
      if (routine.enabled === false) continue;
      const spec = routine.schedule;
      if (!spec || spec.kind === 'manual') continue;

      if (this.state[key]?.cursor === undefined) {
        // First sighting: anchor at now — brand-new routines have no backlog.
        this.state[key] = { cursor: new Date(nowMs).toISOString() };
        this.save();
      }
      const due = this.collectDue(spec, this.state[key].cursor, nowMs);
      if (due.length === 0) {
        this.reconnectPending.delete(key);
        continue;
      }
      const isReconnect = this.reconnectPending.has(key);
      this.reconnectPending.delete(key);
      let toRun = due;
      if (isReconnect) {
        toRun = routine.missedRunPolicy === 'run_once_on_reconnect' ? [due[due.length - 1]] : [];
      }
      for (const dueIso of toRun) {
        this.materialise(routine, dueIso);
        materialised.push({ routineId: routine.id, dueAt: dueIso });
      }
      this.state[key] = { cursor: due[due.length - 1] };
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
