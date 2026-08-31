import { z } from 'zod';
import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { ok, type Result } from '../core/result.ts';
import { conflict, invalid, notFound } from '../core/errors.ts';
import type { ActorType } from '../core/domain-event.ts';
import { canTransition } from './mission-state.ts';
import { sha256Canonical } from '../core/hash.ts';
import type { Mission, MissionState, RunRecord, WorkspaceRecord } from './mission-model.ts';

const SAFE_TEXT = z.string().trim().min(1).max(4000);

export const createWorkspaceInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInput>;

export const createMissionInput = z.object({
  workspaceId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  objective: SAFE_TEXT,
  definitionOfDone: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  constraints: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  nonGoals: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  agentRole: z.string().trim().max(200).default('Generalist assistant'),
  riskLevel: z.enum(['low', 'medium', 'high']).default('low'),
});
export type CreateMissionInput = z.input<typeof createMissionInput>;

export async function createWorkspace(
  input: CreateWorkspaceInput,
  actorType: ActorType = 'human',
): Promise<Result<WorkspaceRecord>> {
  const parsed = createWorkspaceInput.safeParse(input);
  if (!parsed.success) return invalid('Workspace input is invalid', { issues: parsed.error.issues });

  const now = isoNow();
  const workspace: WorkspaceRecord = {
    id: newId('ws'),
    name: parsed.data.name,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  if (parsed.data.description) workspace.description = parsed.data.description;

  await withWorkspaceTx(workspace.id, ['workspaces'], async (ctx) => {
    await ctx.db.workspaces.add(workspace);
    ctx.emit({
      type: 'workspace.created',
      actorType,
      objectType: 'workspace',
      objectId: workspace.id,
      summary: `Workspace "${workspace.name}" created`,
    });
  });
  return ok(workspace);
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  return getDb().workspaces.orderBy('createdAt').toArray();
}

export async function getWorkspace(id: string): Promise<WorkspaceRecord | undefined> {
  return getDb().workspaces.get(id);
}

/** Destructive: cascades over every store that belongs to the workspace. */
export async function deleteWorkspace(id: string): Promise<Result<{ deleted: string }>> {
  const db = getDb();
  const workspace = await db.workspaces.get(id);
  if (!workspace) return notFound('Workspace', id);
  const tables = [
    db.workspaces,
    db.missions,
    db.missionTasks,
    db.lessons,
    db.transcriptSegments,
    db.observations,
    db.evidence,
    db.skillGraphs,
    db.skillVersions,
    db.memories,
    db.memoryVersions,
    db.approvals,
    db.artifactSets,
    db.artifactFiles,
    db.artifactVersions,
    db.verifications,
    db.runs,
    db.proofEvents,
    db.receipts,
  ];
  await db.transaction('rw', tables, async () => {
    await db.workspaces.delete(id);
    for (const table of tables.slice(1)) {
      await table.where('workspaceId').equals(id).delete();
    }
  });
  return ok({ deleted: id });
}

export async function createMission(
  input: CreateMissionInput,
  actorType: ActorType = 'human',
): Promise<Result<Mission>> {
  const parsed = createMissionInput.safeParse(input);
  if (!parsed.success) return invalid('Mission input is invalid', { issues: parsed.error.issues });

  const workspace = await getDb().workspaces.get(parsed.data.workspaceId);
  if (!workspace) return notFound('Workspace', parsed.data.workspaceId);

  const now = isoNow();
  const mission: Mission = {
    id: newId('ms'),
    workspaceId: parsed.data.workspaceId,
    title: parsed.data.title,
    objective: parsed.data.objective,
    definitionOfDone: parsed.data.definitionOfDone,
    constraints: parsed.data.constraints,
    nonGoals: parsed.data.nonGoals,
    agentRole: parsed.data.agentRole,
    allowedToolIds: [],
    requiredMemoryIds: [],
    riskLevel: parsed.data.riskLevel,
    state: 'DRAFT',
    stateHistory: [{ from: null, to: 'DRAFT', at: now, actorType }],
    lessonId: null,
    skillGraphId: null,
    artifactSetId: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };

  await withWorkspaceTx(mission.workspaceId, ['missions'], async (ctx) => {
    await ctx.db.missions.add(mission);
    ctx.emit({
      type: 'mission.created',
      actorType,
      objectType: 'mission',
      objectId: mission.id,
      summary: `Mission "${mission.title}" created`,
      payload: { objective: mission.objective, definitionOfDone: mission.definitionOfDone },
    });
  });
  return ok(mission);
}

export async function getMission(id: string): Promise<Mission | undefined> {
  return getDb().missions.get(id);
}

export async function listMissions(workspaceId: string): Promise<Mission[]> {
  const missions = await getDb().missions.where('workspaceId').equals(workspaceId).toArray();
  return missions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function transitionMission(
  missionId: string,
  to: MissionState,
  actorType: ActorType = 'human',
  reason?: string,
): Promise<Result<Mission>> {
  const db = getDb();
  const mission = await db.missions.get(missionId);
  if (!mission) return notFound('Mission', missionId);
  if (actorType !== 'human' && to === 'EXECUTING') {
    return invalid('Only a person may transition a mission to EXECUTING');
  }
  if (mission.state === to) return ok(mission);
  if (to === 'EXECUTING') {
    if (!mission.skillGraphId) return invalid('Mission must reference an approved skill graph before execution');
    const graph = await db.skillGraphs.get(mission.skillGraphId);
    if (!graph || graph.workspaceId !== mission.workspaceId || graph.missionId && graph.missionId !== mission.id || graph.status !== 'approved' || graph.approvedRevision !== graph.revision || graph.versionHash !== await sha256Canonical({ ...graph, versionHash: undefined })) {
      return invalid('Mission execution requires approval of the current skill graph revision');
    }
  }
  if (!canTransition(mission.state, to)) {
    return conflict(`Mission cannot move from ${mission.state} to ${to}`, { from: mission.state, to });
  }

  const now = isoNow();
  const change = reason
    ? { from: mission.state, to, at: now, actorType, reason }
    : { from: mission.state, to, at: now, actorType };
  const next: Mission = {
    ...mission,
    state: to,
    stateHistory: [...mission.stateHistory, change],
    revision: mission.revision + 1,
    updatedAt: now,
  };

  await withWorkspaceTx(mission.workspaceId, ['missions'], async (ctx) => {
    await ctx.db.missions.put(next);
    ctx.emit({
      type: 'mission.state_changed',
      actorType,
      objectType: 'mission',
      objectId: mission.id,
      summary: `Mission moved ${mission.state} to ${to}`,
      payload: { from: mission.state, to, reason: reason ?? null },
    });
  });
  return ok(next);
}

export type MissionPatch = Partial<
  Pick<
    Mission,
    | 'title'
    | 'objective'
    | 'definitionOfDone'
    | 'constraints'
    | 'nonGoals'
    | 'agentRole'
    | 'riskLevel'
    | 'lessonId'
    | 'skillGraphId'
    | 'artifactSetId'
  >
>;

export async function updateMission(
  missionId: string,
  patch: MissionPatch,
  actorType: ActorType = 'human',
): Promise<Result<Mission>> {
  const db = getDb();
  const mission = await db.missions.get(missionId);
  if (!mission) return notFound('Mission', missionId);

  const next: Mission = { ...mission, ...patch, revision: mission.revision + 1, updatedAt: isoNow() };

  await withWorkspaceTx(mission.workspaceId, ['missions'], async (ctx) => {
    await ctx.db.missions.put(next);
    ctx.emit({
      type: 'mission.updated',
      actorType,
      objectType: 'mission',
      objectId: mission.id,
      summary: `Mission "${next.title}" updated`,
      payload: { fields: Object.keys(patch) },
    });
  });
  return ok(next);
}

export async function recordRun(
  run: Omit<RunRecord, 'id' | 'revision' | 'createdAt' | 'updatedAt'>,
  actorType: ActorType = 'human',
): Promise<Result<RunRecord>> {
  const now = isoNow();
  const record: RunRecord = { ...run, id: newId('run'), revision: 1, createdAt: now, updatedAt: now };
  await withWorkspaceTx(record.workspaceId, ['runs'], async (ctx) => {
    await ctx.db.runs.add(record);
    ctx.emit({
      type: 'run.queued',
      actorType,
      objectType: 'run',
      objectId: record.id,
      summary: record.summary,
      payload: { adapter: record.adapter, mode: record.mode, status: record.status },
    });
  });
  return ok(record);
}

export async function updateRun(
  runId: string,
  patch: Partial<RunRecord>,
  actorType: ActorType = 'system',
): Promise<Result<RunRecord>> {
  const lifecycle = ['status','outputSummary','receiptId','finishedAt','startedAt','error','command','adapter','provider','detail'];
  if (lifecycle.some((key) => key in patch)) return { ok: false, error: { code: 'approval_required', message: 'Use settleRun with runner authorization for lifecycle updates.' } };
  const db = getDb();
  const run = await db.runs.get(runId);
  if (!run) return notFound('Run', runId);
  const next: RunRecord = { ...run, ...patch, revision: run.revision + 1, updatedAt: isoNow() };
  await withWorkspaceTx(run.workspaceId, ['runs'], async (ctx) => {
    await ctx.db.runs.put(next);
    ctx.emit({
      type: 'run.updated',
      actorType,
      objectType: 'run',
      objectId: run.id,
      summary: `Run ${next.status}: ${next.summary}`,
      payload: { status: next.status },
    });
  });
  return ok(next);
}

export async function listRuns(workspaceId: string): Promise<RunRecord[]> {
  const runs = await getDb().runs.where('workspaceId').equals(workspaceId).toArray();
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
