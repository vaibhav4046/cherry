/**
 * Routine persistence: scheduled, human-approved skill runs. Every mutation runs
 * in withWorkspaceTx so its ProofEvent lands in the same IndexedDB transaction.
 * The core security property: any change to what a routine would do bumps its
 * revision and invalidates the standing approval, so nothing ever runs on a
 * schedule the human did not approve exactly as stored.
 */

import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { fail as err, ok, type Result } from '../core/result.ts';
import { sha256Canonical } from '../core/hash.ts';
import type { ApprovalRecord } from '../approval/approval-model.ts';
import type { SkillGraph } from '../skillgraph/skillgraph-model.ts';
import { nextRunAt, validateSchedule, type Routine, type ScheduleSpec } from './workforce-model.ts';

const MISSED_RUN_POLICIES: readonly Routine['missedRunPolicy'][] = ['skip', 'run_once_on_reconnect'];

/** The one host kind that exists today; the UI states availability honestly. */
const DEFAULT_EXECUTION_HOST_ID = 'local-runner';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Human-readable one-line summary of a schedule, shared by the routine pages. */
export function describeSchedule(spec: ScheduleSpec): string {
  switch (spec.kind) {
    case 'manual':
      return 'Manual — runs only when you request it';
    case 'once':
      return `Once at ${new Date(spec.runAt).toLocaleString()}`;
    case 'interval':
      return `Every ${spec.everyMinutes} min from ${new Date(spec.startAt).toLocaleString()}`;
    case 'daily':
      return `Daily at ${spec.localTime} (${spec.timeZone})`;
    case 'weekly':
      return `Weekly ${spec.weekdays.map((day) => WEEKDAY_NAMES[day] ?? String(day)).join(', ')} at ${spec.localTime} (${spec.timeZone})`;
  }
}

export async function listApprovedSkillGraphs(workspaceId: string): Promise<SkillGraph[]> {
  const graphs = await getDb().skillGraphs.where('workspaceId').equals(workspaceId).toArray();
  return graphs.filter((graph) => graph.status === 'approved').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listRoutines(workspaceId: string): Promise<Routine[]> {
  const routines = await getDb().routines.where('workspaceId').equals(workspaceId).toArray();
  return routines.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRoutine(workspaceId: string, routineId: string): Promise<Routine | null> {
  const routine = await getDb().routines.get(routineId);
  return routine && routine.workspaceId === workspaceId ? routine : null;
}

export interface DraftRoutineInput {
  workspaceId: string;
  skillGraphId: string;
  name?: string;
}

/** Draft a disabled, unscheduled routine over an approved skill graph. */
export async function draftRoutine(input: DraftRoutineInput): Promise<Result<Routine>> {
  return withWorkspaceTx(input.workspaceId, ['routines', 'skillGraphs'], async (ctx) => {
    const graph = await ctx.db.skillGraphs.get(input.skillGraphId);
    if (!graph || graph.workspaceId !== input.workspaceId) return err('not_found', 'Skill graph not found in this workspace.');
    if (graph.status !== 'approved') {
      return err('approval_required', 'Only an approved skill graph can back a routine. Approve it in Skills first.');
    }

    const name = (input.name ?? `${graph.name} routine`).trim();
    if (name.length === 0 || name.length > 120) return err('validation', 'Routine name must be 1–120 characters.');

    const now = isoNow();
    const routine: Routine = {
      id: newId('rt'),
      workspaceId: input.workspaceId,
      name,
      skillGraphId: graph.id,
      skillGraphRevision: graph.approvedRevision ?? graph.revision,
      executionHostId: DEFAULT_EXECUTION_HOST_ID,
      schedule: { kind: 'manual' },
      missedRunPolicy: 'skip',
      enabled: false,
      approvalId: null,
      approvedActionHash: null,
      nextRunAt: null,
      lastRunAt: null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    await ctx.db.routines.add(routine);
    ctx.emit({
      type: 'routine.drafted',
      actorType: 'human',
      objectType: 'routine',
      objectId: routine.id,
      summary: `Routine "${name}" drafted over skill "${graph.name}" r${routine.skillGraphRevision}`,
      payload: { skillGraphId: graph.id, skillGraphRevision: routine.skillGraphRevision },
    });
    return ok(routine);
  });
}

/**
 * Set a routine's schedule. Every save bumps the revision, clears any standing
 * approval, and disables the routine: an approval binds to the exact action it
 * was granted for, so a changed schedule must be re-approved by the human.
 * nextRunAt is recomputed as a preview only — the routine stays disabled.
 */
export async function setRoutineSchedule(
  workspaceId: string,
  routineId: string,
  schedule: ScheduleSpec,
  missedRunPolicy: Routine['missedRunPolicy'],
): Promise<Result<Routine>> {
  const problems = validateSchedule(schedule);
  if (problems.length > 0) return err('validation', problems.join('; '), { problems });
  if (!MISSED_RUN_POLICIES.includes(missedRunPolicy)) {
    return err('validation', 'missedRunPolicy must be "skip" or "run_once_on_reconnect".');
  }

  return withWorkspaceTx(workspaceId, ['routines'], async (ctx) => {
    const routine = await ctx.db.routines.get(routineId);
    if (!routine || routine.workspaceId !== workspaceId) return err('not_found', 'Routine not found.');

    const now = isoNow();
    const updated: Routine = {
      ...routine,
      schedule,
      missedRunPolicy,
      revision: routine.revision + 1,
      approvalId: null,
      approvedActionHash: null,
      enabled: false,
      nextRunAt: nextRunAt(schedule, now),
      updatedAt: now,
    };
    await ctx.db.routines.put(updated);
    ctx.emit({
      type: 'routine.schedule_set',
      actorType: 'human',
      objectType: 'routine',
      objectId: routineId,
      summary: `Routine "${routine.name}" schedule set (${describeSchedule(schedule)}) — now r${updated.revision}, approval cleared`,
      payload: { revision: updated.revision, previousApprovalId: routine.approvalId },
    });
    return ok(updated);
  });
}

/**
 * Canonical-JSON sha256 over exactly what an execution host would act on.
 * Exported so tests and hosts can recompute and compare it independently.
 */
export async function computeRoutineActionHash(routine: Routine): Promise<string> {
  return sha256Canonical({
    routineId: routine.id,
    revision: routine.revision,
    skillGraphId: routine.skillGraphId,
    skillGraphRevision: routine.skillGraphRevision,
    schedule: routine.schedule,
    missedRunPolicy: routine.missedRunPolicy,
    executionHostId: routine.executionHostId,
  });
}

/** Human approval of the exact current revision; enables the routine. */
export async function approveRoutine(
  workspaceId: string,
  routineId: string,
  expectedRevision: number,
): Promise<Result<Routine>> {
  // Hashing is async non-Dexie work, so it happens before the transaction.
  const current = await getRoutine(workspaceId, routineId);
  if (!current) return err('not_found', 'Routine not found.');
  if (current.revision !== expectedRevision) {
    return err('conflict', `Routine is at revision ${current.revision}, not ${expectedRevision}. Re-read before approving.`);
  }
  const actionHash = await computeRoutineActionHash(current);

  return withWorkspaceTx(workspaceId, ['routines', 'approvals'], async (ctx) => {
    const routine = await ctx.db.routines.get(routineId);
    if (!routine || routine.workspaceId !== workspaceId) return err('not_found', 'Routine not found.');
    if (routine.revision !== expectedRevision) {
      return err('conflict', `Routine changed to revision ${routine.revision} while approving r${expectedRevision}.`);
    }

    const now = isoNow();
    const approval: ApprovalRecord = {
      id: newId('ap'),
      workspaceId,
      // The approvals table stores routine approvals alongside the existing
      // object types; the ApprovalObjectType union is owned by the approvals
      // module and widened there.
      objectType: 'routine',
      objectId: routineId,
      objectRevision: routine.revision,
      decision: 'approved',
      requestedAt: now,
      requestedBy: 'user',
      requestReason: `Enable routine "${routine.name}" (${describeSchedule(routine.schedule)})`,
      decidedBy: 'user',
      decidedAt: now,
      contentHash: actionHash,
    };
    const updated: Routine = {
      ...routine,
      approvalId: approval.id,
      approvedActionHash: actionHash,
      enabled: true,
      nextRunAt: nextRunAt(routine.schedule, now),
      updatedAt: now,
    };
    await ctx.db.approvals.add(approval);
    await ctx.db.routines.put(updated);
    ctx.emit({
      type: 'routine.approved',
      actorType: 'human',
      objectType: 'routine',
      objectId: routineId,
      summary: `Routine "${routine.name}" r${routine.revision} approved (hash ${actionHash.slice(0, 16)}…)`,
      payload: { revision: routine.revision, approvalId: approval.id, actionHash },
    });
    ctx.emit({
      type: 'routine.enabled',
      actorType: 'human',
      objectType: 'routine',
      objectId: routineId,
      summary: `Routine "${routine.name}" enabled — next run ${updated.nextRunAt ?? 'manual only'}`,
      payload: { nextRunAt: updated.nextRunAt },
    });
    return ok(updated);
  });
}

/** Pausing reduces risk, so the approval is kept; only execution stops. */
export async function pauseRoutine(workspaceId: string, routineId: string): Promise<Result<Routine>> {
  return withWorkspaceTx(workspaceId, ['routines'], async (ctx) => {
    const routine = await ctx.db.routines.get(routineId);
    if (!routine || routine.workspaceId !== workspaceId) return err('not_found', 'Routine not found.');

    const updated: Routine = { ...routine, enabled: false, nextRunAt: null, updatedAt: isoNow() };
    await ctx.db.routines.put(updated);
    ctx.emit({
      type: 'routine.paused',
      actorType: 'human',
      objectType: 'routine',
      objectId: routineId,
      summary: `Routine "${routine.name}" paused — approval kept`,
      payload: { revision: routine.revision },
    });
    return ok(updated);
  });
}

/** Re-enable a paused routine. Only valid while its exact-revision approval stands. */
export async function resumeRoutine(workspaceId: string, routineId: string): Promise<Result<Routine>> {
  return withWorkspaceTx(workspaceId, ['routines', 'approvals'], async (ctx) => {
    const routine = await ctx.db.routines.get(routineId);
    if (!routine || routine.workspaceId !== workspaceId) return err('not_found', 'Routine not found.');
    if (!routine.approvalId) {
      return err('approval_required', 'This routine has no standing approval. Approve the current revision to enable it.');
    }
    const approval = await ctx.db.approvals.get(routine.approvalId);
    if (!approval || approval.objectRevision !== routine.revision) {
      return err('approval_required', 'The routine changed since it was approved. Approve the current revision to enable it.');
    }

    const now = isoNow();
    const updated: Routine = { ...routine, enabled: true, nextRunAt: nextRunAt(routine.schedule, now), updatedAt: now };
    await ctx.db.routines.put(updated);
    ctx.emit({
      type: 'routine.enabled',
      actorType: 'human',
      objectType: 'routine',
      objectId: routineId,
      summary: `Routine "${routine.name}" resumed — next run ${updated.nextRunAt ?? 'manual only'}`,
      payload: { revision: routine.revision, nextRunAt: updated.nextRunAt },
    });
    return ok(updated);
  });
}

/**
 * Record a run request in the ledger. Nothing executes here: the run happens
 * only when an approved execution host picks the request up, and lastRunAt is
 * written by that host — never by this function.
 */
export async function requestRunNow(workspaceId: string, routineId: string): Promise<Result<{ note: string }>> {
  return withWorkspaceTx(workspaceId, ['routines'], async (ctx) => {
    const routine = await ctx.db.routines.get(routineId);
    if (!routine || routine.workspaceId !== workspaceId) return err('not_found', 'Routine not found.');

    ctx.emit({
      type: 'routine.run_requested',
      actorType: 'human',
      objectType: 'routine',
      objectId: routineId,
      summary: `Run requested for routine "${routine.name}" r${routine.revision}`,
      payload: { revision: routine.revision, executionHostId: routine.executionHostId },
    });
    return ok({
      note: 'Run requested. It executes when an approved execution host picks it up — nothing has run yet.',
    });
  });
}
