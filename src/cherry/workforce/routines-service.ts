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
import type { ActorType } from '../core/domain-event.ts';
import type { RunRecord, RunStatus } from '../mission/mission-model.ts';
import { verifyReceipt } from '../proof/proof-verifier.ts';
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
      missionId: graph.missionId ?? null,
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
  actorType: ActorType = 'human',
): Promise<Result<Routine>> {
  if (actorType !== 'human') return err('approval_required', 'Only a person may approve a routine');
  // Hashing is async non-Dexie work, so it happens before the transaction.
  const current = await getRoutine(workspaceId, routineId);
  if (!current) return err('not_found', 'Routine not found.');
  if (current.revision !== expectedRevision) {
    return err('conflict', `Routine is at revision ${current.revision}, not ${expectedRevision}. Re-read before approving.`);
  }
  const actionHash = await computeRoutineActionHash(current);
  const graph = await getDb().skillGraphs.get(current.skillGraphId);
  if (!graph || graph.workspaceId !== workspaceId || graph.status !== 'approved' || graph.approvedRevision !== graph.revision || graph.revision !== current.skillGraphRevision || graph.versionHash !== await sha256Canonical({ ...graph, versionHash: undefined })) return err('approval_required', 'Routine requires approval of the current skill graph revision.');

  return withWorkspaceTx(workspaceId, ['routines', 'approvals', 'skillGraphs', 'missions'], async (ctx) => {
    const routine = await ctx.db.routines.get(routineId);
    if (!routine || routine.workspaceId !== workspaceId) return err('not_found', 'Routine not found.');
    if (routine.revision !== expectedRevision) {
      return err('conflict', `Routine changed to revision ${routine.revision} while approving r${expectedRevision}.`);
    }
    const graphNow = await ctx.db.skillGraphs.get(routine.skillGraphId);
    if (!graphNow || graphNow.revision !== routine.skillGraphRevision || graphNow.status !== 'approved' || graphNow.approvedRevision !== graphNow.revision || graphNow.versionHash !== graph.versionHash) return err('approval_required', 'Skill graph changed while approving routine.');

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
export async function resumeRoutine(workspaceId: string, routineId: string, actorType: ActorType = 'human'): Promise<Result<Routine>> {
  if (actorType !== 'human') return err('approval_required', 'Only a person may resume a routine');
  const current = await getRoutine(workspaceId, routineId);
  const currentHash = current ? await computeRoutineActionHash(current) : null;
  const currentGraph = current ? await getDb().skillGraphs.get(current.skillGraphId) : null;
  const currentGraphHash = currentGraph ? await sha256Canonical({ ...currentGraph, versionHash: undefined }) : null;
  return withWorkspaceTx(workspaceId, ['routines', 'approvals', 'skillGraphs', 'missions'], async (ctx) => {
    const routine = await ctx.db.routines.get(routineId);
    if (!routine || routine.workspaceId !== workspaceId) return err('not_found', 'Routine not found.');
    if (!routine.approvalId) {
      return err('approval_required', 'This routine has no standing approval. Approve the current revision to enable it.');
    }
    const approval = await ctx.db.approvals.get(routine.approvalId);
    if (!approval || approval.objectRevision !== routine.revision || approval.decision !== 'approved') {
      return err('approval_required', 'The routine changed since it was approved. Approve the current revision to enable it.');
    }
    const actionHash = currentHash ?? '';
    if (approval.contentHash !== actionHash || routine.approvedActionHash !== actionHash) {
      return err('approval_required', 'Routine approval hash no longer matches its current action envelope. Re-approve it.');
    }
    const graph = await ctx.db.skillGraphs.get(routine.skillGraphId);
    if (!graph?.missionId || routine.missionId !== graph.missionId) return err('validation', 'Routine must be bound to its skill graph mission before it can run.');
    const mission = await ctx.db.missions.get(graph.missionId);
    if (!mission || mission.workspaceId !== workspaceId) return err('not_found', 'Routine mission binding is invalid.');
    if (!graph || graph.workspaceId !== workspaceId || graph.status !== 'approved' || graph.revision !== routine.skillGraphRevision || graph.approvedRevision !== graph.revision || graph.versionHash !== currentGraphHash) {
      return err('approval_required', 'The skill graph approval is stale. Approve the current skill revision before resuming.');
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
export async function requestRunNow(
  workspaceId: string,
  routineId: string,
  actorType: ActorType = 'human',
  idempotencyKey?: string,
): Promise<Result<RunRecord & { note: string }>> {
  if (actorType !== 'human') return err('approval_required', 'Only a person may request consequential routine execution');
  const preflight = await getRoutine(workspaceId, routineId);
  const preflightHash = preflight ? await computeRoutineActionHash(preflight) : null;
  const preflightGraph = preflight ? await getDb().skillGraphs.get(preflight.skillGraphId) : null;
  const preflightGraphHash = preflightGraph ? await sha256Canonical({ ...preflightGraph, versionHash: undefined }) : null;
  return withWorkspaceTx(workspaceId, ['routines', 'approvals', 'skillGraphs', 'missions', 'runs'], async (ctx) => {
    const routine = await ctx.db.routines.get(routineId);
    if (!routine || routine.workspaceId !== workspaceId) return err('not_found', 'Routine not found.');

    if (!routine.enabled) return err('approval_required', 'Routine is disabled. Approve and enable it before running.');
    if (!routine.approvalId || !routine.approvedActionHash) return err('approval_required', 'Routine has no standing approval.');
    const approval = await ctx.db.approvals.get(routine.approvalId);
    if (!approval || approval.decision !== 'approved' || approval.objectRevision !== routine.revision) return err('approval_required', 'Routine approval is missing or stale.');
    const actionHash = preflightHash ?? '';
    if (actionHash !== routine.approvedActionHash || approval.contentHash !== actionHash) return err('approval_required', 'Routine action hash is stale; re-approve before running.');
    const graph = await ctx.db.skillGraphs.get(routine.skillGraphId);
    if (!graph || graph.workspaceId !== workspaceId || graph.status !== 'approved' || graph.revision !== routine.skillGraphRevision || graph.approvedRevision !== graph.revision || graph.versionHash !== preflightGraphHash) return err('approval_required', 'Skill graph approval is stale; re-approve before running.');
    if (!graph.missionId || routine.missionId !== graph.missionId) return err('validation', 'Routine must be bound to its skill graph mission before it can run.');
    const mission = await ctx.db.missions.get(graph.missionId);
    if (!mission || mission.workspaceId !== workspaceId) return err('not_found', 'Routine mission binding is invalid.');
    if (routine.executionHostId !== DEFAULT_EXECUTION_HOST_ID) return err('unsupported', 'Routine execution host is not available.');
    const key = idempotencyKey ?? newId('run');
    const existing = (await ctx.db.runs.toArray()).find((candidate) => candidate.idempotencyKey === key);
    if (existing) return err('conflict', 'A run with this idempotency key already exists.');
    const now = isoNow();
    const run: RunRecord & { note: string } = {
      id: newId('run'), workspaceId, missionId: graph.missionId, routineId: routine.id, routineRevision: routine.revision, approvedActionHash: routine.approvedActionHash, adapter: 'cherry-verify', status: 'waiting_for_runner', mode: 'runner', runnerJobId: null,
      summary: `Run requested for routine "${routine.name}"`, detail: 'Waiting for an approved local runner. Start it with: node runner/server.mjs', requestedAt: now,
      command: 'cherry-verify', outputSummary: undefined, error: null, receiptId: null, idempotencyKey: key, runnerCapabilityToken: newId('job'),
      provider: { kind: 'runner', status: 'blocked', verifiedSeparately: true }, revision: 1, createdAt: now, updatedAt: now,
      note: 'Run requested. It executes when an approved execution host picks it up — nothing has run yet.',
    };
    await ctx.db.runs.add(run);

    ctx.emit({
      type: 'routine.run_requested',
      actorType: 'human',
      objectType: 'routine',
      objectId: routineId,
      summary: `Run requested for routine "${routine.name}" r${routine.revision}`,
      payload: { revision: routine.revision, executionHostId: routine.executionHostId, runId: run.id, idempotencyKey: key },
    });
    ctx.emit({
      type: 'run.queued',
      actorType: 'human',
      objectType: 'run',
      objectId: run.id,
      summary: run.summary,
      payload: { adapter: run.adapter, mode: run.mode, status: run.status, idempotencyKey: key },
    });
    return ok(run);
  });
}

function redactOutput(value: string | undefined): string | undefined {
  if (!value) return value;
  return value.replace(/(token|secret|password|api[_-]?key|bearer)\s*[:=]?\s*(sk-|pk-|ghp-|rk-|gho-|xoxb-|xoxp-)?[^\s,;]+/gi, '$1=[REDACTED]').replace(/\b(sk|pk|ghp|rk|gho|xoxb|xoxp)-[A-Za-z0-9_-]+\b/gi, '[REDACTED]').slice(0, 4000);
}

export async function settleRun(
  runId: string,
  status: Exclude<RunStatus, 'queued'>,
  details: { outputSummary?: string; error?: string; receiptId?: string; command?: string; adapter?: RunRecord['adapter']; provider?: RunRecord['provider']; runnerCapabilityToken?: string } = {},
  actorType: ActorType = 'runner',
): Promise<Result<RunRecord>> {
  if (actorType !== 'runner') return err('approval_required', 'Only a paired runner may settle a run.');
  const db = getDb();
  const run = await db.runs.get(runId);
  if (!run) return err('not_found', 'Run not found.');
  if (!details.runnerCapabilityToken || details.runnerCapabilityToken !== run.runnerCapabilityToken) return err('approval_required', 'Runner capability token is invalid.');
  const terminal = new Set<RunStatus>(['succeeded', 'failed', 'cancelled']);
  if (run.status === 'queued' && status !== 'running' && status !== 'cancelled') return err('conflict', 'Queued runs may only transition to running or cancelled.');
  if (run.status === 'waiting_for_runner' && status !== 'running' && status !== 'setup-required' && status !== 'cancelled') return err('conflict', 'A waiting run must transition to running, setup-required, or cancelled.');
  if (run.status === 'setup-required' && status !== 'running' && status !== 'cancelled') return err('conflict', 'Setup-required runs may only transition to running or cancelled.');
  if (run.status === 'running' && !terminal.has(status) && status !== 'running') return err('conflict', 'Invalid run state transition.');
  if (terminal.has(run.status)) return err('conflict', 'Run is already settled.');
  if (status === 'succeeded') {
    if (!details.receiptId) return err('approval_required', 'A verified receipt is required before marking a run successful.');
    const receipt = await db.receipts.get(details.receiptId);
    if (!receipt || receipt.runId !== run.id || receipt.workspaceId !== run.workspaceId || receipt.missionId !== run.missionId) return err('approval_required', 'Receipt is not bound to this run.');
    if (receipt.status !== 'verified') return err('approval_required', 'Receipt is not verified.');
    const verification = await verifyReceipt(receipt);
    if (!verification.ok || verification.value.verdict !== 'valid') return err('approval_required', 'Receipt verification failed; run cannot be marked successful.');
  }
  const now = isoNow();
  const next: RunRecord = { ...run, status, outputSummary: details.outputSummary === undefined ? run.outputSummary : redactOutput(details.outputSummary), error: details.error === undefined ? run.error ?? null : redactOutput(details.error),
    receiptId: details.receiptId ?? run.receiptId ?? null, command: run.command, adapter: run.adapter,
    provider: run.provider ? { ...run.provider, status: status === 'succeeded' ? 'completed' : status === 'failed' ? 'failed' : status === 'cancelled' ? 'cancelled' : run.provider.status } : run.provider, startedAt: run.startedAt ?? now, finishedAt: status === 'running' || status === 'setup-required' ? undefined : now, revision: run.revision + 1, updatedAt: now };
  const settled = await withWorkspaceTx(run.workspaceId, ['runs', 'routines'], async (ctx) => {
    const latest = await ctx.db.runs.get(runId);
    if (!latest || latest.revision !== run.revision || latest.status !== run.status) return err('conflict', 'Run changed concurrently; reload before settling.');
    if (latest.routineId) {
      const routine = await ctx.db.routines.get(latest.routineId);
      if (!routine || !routine.enabled || routine.revision !== latest.routineRevision || routine.approvedActionHash !== latest.approvedActionHash) return err('approval_required', 'Routine approval is stale or disabled.');
    }
    const atomicNext = { ...next, revision: latest.revision + 1, updatedAt: isoNow() };
    await ctx.db.runs.put(atomicNext);
    if (atomicNext.routineId && status !== 'running' && status !== 'setup-required') {
      const routine = await ctx.db.routines.get(atomicNext.routineId);
      if (routine) await ctx.db.routines.put({ ...routine, lastRunAt: atomicNext.finishedAt ?? isoNow(), updatedAt: isoNow() });
    }
    ctx.emit({ type: 'run.updated', actorType: 'runner', objectType: 'run', objectId: run.id, summary: `Run ${status}`, payload: { status, receiptId: next.receiptId ?? null } });
    return ok(atomicNext);
  });
  return settled;
}

export async function attachRunnerJob(runId: string, runnerJobId: string, capabilityToken: string): Promise<Result<RunRecord>> {
  const run = await getDb().runs.get(runId);
  if (!run) return err('not_found', 'Run not found.');
  if (!capabilityToken || capabilityToken !== run.runnerCapabilityToken) return err('approval_required', 'Runner capability token is invalid.');
  return withWorkspaceTx(run.workspaceId, ['runs'], async (ctx) => {
    const latest = await ctx.db.runs.get(runId);
    if (!latest || latest.revision !== run.revision) return err('conflict', 'Run changed concurrently.');
    const next = { ...latest, runnerJobId, revision: latest.revision + 1, updatedAt: isoNow() };
    await ctx.db.runs.put(next);
    return ok(next);
  });
}
