import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { ok, type Result } from '../core/result.ts';
import { conflict, invalid, notFound } from '../core/errors.ts';
import { sha256Canonical } from '../core/hash.ts';
import type { ActorType } from '../core/domain-event.ts';
import { validateSkillGraph, type GraphIssue } from './skillgraph-validator.ts';
import type { SkillGraph, SkillGraphVersion, SkillNode } from './skillgraph-model.ts';
import type { ApprovalRecord } from '../approval/approval-model.ts';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'skill';
}

export interface DraftSkillGraphInput {
  workspaceId: string;
  missionId?: string | null;
  name: string;
  purpose: string;
  nodes: Array<
    Pick<SkillNode, 'kind' | 'title' | 'goal'> &
      Partial<Pick<SkillNode, 'instructions' | 'evidenceIds' | 'position'>>
  >;
}

/** Create the first revision of a SkillGraph in draft status. */
export async function draftSkillGraph(
  input: DraftSkillGraphInput,
  actorType: ActorType = 'human',
): Promise<Result<SkillGraph>> {
  if (!input.name.trim()) return invalid('Skill name is required');
  if (!input.purpose.trim()) return invalid('Skill purpose is required');
  if (input.nodes.length === 0) return invalid('At least one node is required');
  if (input.nodes.length > 100) return invalid('A draft cannot exceed 100 nodes');

  const workspace = await getDb().workspaces.get(input.workspaceId);
  if (!workspace) return notFound('Workspace', input.workspaceId);

  const now = isoNow();
  const nodes: SkillNode[] = input.nodes.map((node, index) => ({
    id: newId('sv'),
    kind: node.kind,
    title: node.title,
    goal: node.goal,
    instructions: node.instructions ?? [],
    requires: [],
    produces: [],
    allowedToolIds: [],
    evidenceIds: node.evidenceIds ?? [],
    memorySelectors: [],
    assertionIds: [],
    humanGateIds: [],
    onFailure: { strategy: 'stop' },
    position: node.position ?? { x: 80, y: 80 + index * 140 },
  }));

  const edges = nodes.slice(1).map((node, index) => ({
    id: newId('sv'),
    source: nodes[index]!.id,
    target: node.id,
    type: 'dependency' as const,
  }));

  const graph: SkillGraph = {
    schemaVersion: '1.0.0',
    id: newId('sg'),
    workspaceId: input.workspaceId,
    missionId: input.missionId ?? null,
    name: input.name.trim(),
    slug: slugify(input.name),
    purpose: input.purpose.trim(),
    version: '0.1.0',
    revision: 1,
    status: 'draft',
    triggers: [],
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    nodes,
    edges,
    tools: [],
    knowledge: [],
    memoryPolicy: {
      allowedScopes: ['mission', 'workspace'],
      allowedSensitivity: ['public', 'private'],
      requireApproval: true,
      selectors: [],
    },
    guardrails: [],
    humanGates: [
      {
        id: newId('sv'),
        title: 'Approve this skill before execution',
        reason: 'Execution requires an exact-revision human approval',
        requiredRevisionType: 'skillgraph',
        action: 'approve',
      },
    ],
    evaluations: [
      {
        id: newId('sv'),
        name: 'Skill graph is structurally valid',
        type: 'graph',
        severity: 'blocking',
        config: { check: 'structure' },
      },
    ],
    targets: ['agent-skills', 'codex', 'claude-code'],
    approvedRevision: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  graph.versionHash = await sha256Canonical({ ...graph, versionHash: undefined });

  await withWorkspaceTx(graph.workspaceId, ['skillGraphs', 'skillVersions'], async (ctx) => {
    await ctx.db.skillGraphs.add(graph);
    await ctx.db.skillVersions.add(makeVersion(graph, 'Initial draft', actorType === 'agent' ? 'agent' : 'human'));
    ctx.emit({
      type: 'skillgraph.drafted',
      actorType,
      objectType: 'skillgraph',
      objectId: graph.id,
      summary: `SkillGraph "${graph.name}" drafted with ${graph.nodes.length} nodes`,
      payload: { revision: graph.revision, nodeCount: graph.nodes.length },
    });
  });
  return ok(graph);
}

function makeVersion(graph: SkillGraph, changeSummary: string, actorType: 'human' | 'agent' | 'system'): SkillGraphVersion {
  return {
    id: newId('sv'),
    workspaceId: graph.workspaceId,
    skillGraphId: graph.id,
    revision: graph.revision,
    version: graph.version,
    status: graph.status,
    snapshot: graph,
    versionHash: graph.versionHash ?? '',
    changeSummary,
    createdAt: graph.updatedAt,
    actorType,
  };
}

export async function getSkillGraph(id: string): Promise<SkillGraph | undefined> {
  return getDb().skillGraphs.get(id);
}

export async function listSkillGraphs(workspaceId: string): Promise<SkillGraph[]> {
  const graphs = await getDb().skillGraphs.where('workspaceId').equals(workspaceId).toArray();
  return graphs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listSkillGraphVersions(skillGraphId: string): Promise<SkillGraphVersion[]> {
  const versions = await getDb().skillVersions.where('skillGraphId').equals(skillGraphId).toArray();
  return versions.sort((a, b) => a.revision - b.revision);
}

export type SkillGraphPatch = Partial<
  Pick<
    SkillGraph,
    | 'name'
    | 'purpose'
    | 'nodes'
    | 'edges'
    | 'tools'
    | 'knowledge'
    | 'guardrails'
    | 'humanGates'
    | 'evaluations'
    | 'targets'
    | 'triggers'
    | 'inputSchema'
    | 'outputSchema'
    | 'memoryPolicy'
  >
>;

/**
 * Any revision moves the graph back to draft/proposed and invalidates a prior
 * approval, because approvals bind to the exact revision they were given for.
 */
export async function reviseSkillGraph(
  skillGraphId: string,
  patch: SkillGraphPatch,
  changeSummary: string,
  actorType: ActorType = 'human',
  expectedRevision?: number,
): Promise<Result<SkillGraph>> {
  const db = getDb();
  const graph = await db.skillGraphs.get(skillGraphId);
  if (!graph) return notFound('SkillGraph', skillGraphId);
  if (typeof expectedRevision === 'number' && graph.revision !== expectedRevision) {
    return conflict(`SkillGraph is at revision ${graph.revision}, expected ${expectedRevision}`, {
      actual: graph.revision,
      expected: expectedRevision,
    });
  }
  if (!changeSummary.trim()) return invalid('A change summary is required for a revision');

  const next: SkillGraph = {
    ...graph,
    ...patch,
    status: graph.status === 'approved' ? 'proposed' : graph.status === 'rejected' ? 'proposed' : graph.status,
    revision: graph.revision + 1,
    updatedAt: isoNow(),
  };
  next.versionHash = await sha256Canonical({ ...next, versionHash: undefined });

  const issues = validateSkillGraph(next);
  const structural = issues.filter((issue) => issue.code.endsWith('_missing') || issue.code === 'dependency_cycle');
  if (structural.length > 0) {
    return invalid('Revision would break graph integrity', { issues: structural });
  }

  await withWorkspaceTx(graph.workspaceId, ['skillGraphs', 'skillVersions'], async (ctx) => {
    await ctx.db.skillGraphs.put(next);
    await ctx.db.skillVersions.add(makeVersion(next, changeSummary, actorType === 'agent' ? 'agent' : 'human'));
    ctx.emit({
      type: 'skillgraph.revised',
      actorType,
      objectType: 'skillgraph',
      objectId: graph.id,
      summary: `SkillGraph revised to r${next.revision}: ${changeSummary.slice(0, 140)}`,
      payload: { revision: next.revision, previousStatus: graph.status },
    });
  });
  return ok(next);
}

export async function requestSkillGraphApproval(
  skillGraphId: string,
  reason: string,
  requestedBy: string,
  actorType: ActorType = 'agent',
): Promise<Result<{ graph: SkillGraph; approval: ApprovalRecord }>> {
  const db = getDb();
  const graph = await db.skillGraphs.get(skillGraphId);
  if (!graph) return notFound('SkillGraph', skillGraphId);

  const recomputedHash = await sha256Canonical({ ...graph, versionHash: undefined });
  if (graph.versionHash !== recomputedHash) return invalid('SkillGraph version hash is invalid');

  const issues = validateSkillGraph(graph);
  const blocking = issues.filter((issue) => issue.code !== 'no_evaluations');
  if (blocking.length > 0) {
    return invalid('SkillGraph has validation issues that block review', { issues: blocking });
  }

  const now = isoNow();
  const approval: ApprovalRecord = {
    id: newId('ap'),
    workspaceId: graph.workspaceId,
    objectType: 'skillgraph',
    objectId: graph.id,
    objectRevision: graph.revision,
    decision: 'pending',
    requestedAt: now,
    requestedBy,
    requestReason: reason,
  };
  const next: SkillGraph = { ...graph, status: 'ready_for_review', updatedAt: now };
  next.versionHash = await sha256Canonical({ ...next, versionHash: undefined });

  await withWorkspaceTx(graph.workspaceId, ['skillGraphs', 'approvals'], async (ctx) => {
    const pending = await ctx.db.approvals.where('objectId').equals(graph.id).toArray();
    if (pending.some((a) => a.objectType === 'skillgraph' && a.objectRevision === graph.revision && a.decision === 'pending')) {
      return conflict('An approval decision is already pending for this skill graph revision');
    }
    await ctx.db.skillGraphs.put(next);
    await ctx.db.approvals.add(approval);
    ctx.emit({
      type: 'skillgraph.approval_requested',
      actorType,
      objectType: 'skillgraph',
      objectId: graph.id,
      summary: `Approval requested for r${graph.revision}: ${reason.slice(0, 140)}`,
      payload: { revision: graph.revision, approvalId: approval.id },
    });
  });
  return ok({ graph: next, approval });
}

/** Human decision on an exact revision. Rejects stale approvals. */
export async function decideSkillGraphApproval(
  approvalId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
  comment?: string,
  actorType: ActorType = 'human',
): Promise<Result<{ graph: SkillGraph; approval: ApprovalRecord }>> {
  // Backwards/forwards compatible calling convention: some protocol layers
  // pass actorType as the fourth argument (where older callers used comment).
  if (actorType === 'human' && (comment === 'agent' || comment === 'system' || comment === 'runner')) {
    actorType = comment;
    comment = undefined;
  }
  if (actorType !== 'human') return invalid('Only a person may decide a skill graph approval');
  const db = getDb();
  const approval = await db.approvals.get(approvalId);
  if (!approval) return notFound('Approval', approvalId);
  if (approval.decision !== 'pending') {
    return conflict(`Approval was already ${approval.decision}`);
  }
  const graph = await db.skillGraphs.get(approval.objectId);
  if (!graph) return notFound('SkillGraph', approval.objectId);
  if (graph.revision !== approval.objectRevision) {
    return conflict(
      `The graph changed since this approval was requested (now r${graph.revision}, requested r${approval.objectRevision}). Request approval again.`,
      { actual: graph.revision, requested: approval.objectRevision },
    );
  }

  const recomputedVersionHash = await sha256Canonical({ ...graph, versionHash: undefined });
  if (graph.versionHash !== recomputedVersionHash) return invalid('SkillGraph version hash is invalid');

  const now = isoNow();
  const contentHash = await sha256Canonical({ ...graph, versionHash: undefined });
  const decidedApproval: ApprovalRecord = {
    ...approval,
    decision,
    decidedBy,
    decidedAt: now,
    contentHash,
  };
  if (comment) decidedApproval.comment = comment;

  const next: SkillGraph = {
    ...graph,
    status: decision === 'approved' ? 'approved' : 'rejected',
    approvedRevision: decision === 'approved' ? graph.revision : graph.approvedRevision ?? null,
    approvedBy: decision === 'approved' ? decidedBy : graph.approvedBy ?? null,
    approvedAt: decision === 'approved' ? now : graph.approvedAt ?? null,
    updatedAt: now,
  };
  next.versionHash = await sha256Canonical({ ...next, versionHash: undefined });

  await withWorkspaceTx(graph.workspaceId, ['skillGraphs', 'approvals', 'skillVersions'], async (ctx) => {
    await ctx.db.skillGraphs.put(next);
    await ctx.db.approvals.put(decidedApproval);
    await ctx.db.skillVersions.add(makeVersion(next, `Revision ${decision} by ${decidedBy}`, 'human'));
    ctx.emit({
      type: decision === 'approved' ? 'skillgraph.approved' : 'skillgraph.rejected',
      actorType: 'human',
      objectType: 'skillgraph',
      objectId: graph.id,
      summary: `SkillGraph r${graph.revision} ${decision} by ${decidedBy}`,
      payload: { revision: graph.revision, approvalId: approval.id, decision },
    });
  });
  return ok({ graph: next, approval: decidedApproval });
}

/** Roll back to an earlier stored revision snapshot as a new revision. */
export async function rollbackSkillGraph(
  skillGraphId: string,
  toRevision: number,
  actorType: ActorType = 'human',
): Promise<Result<SkillGraph>> {
  const db = getDb();
  const graph = await db.skillGraphs.get(skillGraphId);
  if (!graph) return notFound('SkillGraph', skillGraphId);
  const versions = await listSkillGraphVersions(skillGraphId);
  const target = versions.find((version) => version.revision === toRevision);
  if (!target) return notFound('SkillGraph revision', String(toRevision));

  const now = isoNow();
  const next: SkillGraph = {
    ...target.snapshot,
    status: 'proposed',
    revision: graph.revision + 1,
    approvedRevision: null,
    approvedBy: null,
    approvedAt: null,
    updatedAt: now,
  };
  next.versionHash = await sha256Canonical({ ...next, versionHash: undefined });

  await withWorkspaceTx(graph.workspaceId, ['skillGraphs', 'skillVersions'], async (ctx) => {
    await ctx.db.skillGraphs.put(next);
    await ctx.db.skillVersions.add(makeVersion(next, `Rolled back to revision ${toRevision}`, 'human'));
    ctx.emit({
      type: 'skillgraph.rolled_back',
      actorType,
      objectType: 'skillgraph',
      objectId: graph.id,
      summary: `SkillGraph rolled back to r${toRevision} (now r${next.revision})`,
      payload: { fromRevision: graph.revision, toRevision, newRevision: next.revision },
    });
  });
  return ok(next);
}

export async function listApprovals(workspaceId: string): Promise<ApprovalRecord[]> {
  const approvals = await getDb().approvals.where('workspaceId').equals(workspaceId).toArray();
  return approvals.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export function graphIssues(graph: SkillGraph): GraphIssue[] {
  return validateSkillGraph(graph);
}
