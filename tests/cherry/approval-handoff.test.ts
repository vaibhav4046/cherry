import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { WebMcpRegistrationManager } from '../../src/cherry/webmcp/registration-manager.ts';
import { TOOL_STATE_TABLE, type ToolContext } from '../../src/cherry/webmcp/tool-definitions.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { createMission, createWorkspace, getMission, transitionMission, updateMission } from '../../src/cherry/mission/mission-service.ts';
import {
  decideSkillGraphApproval,
  draftSkillGraph,
  getSkillGraph,
  listApprovals,
  requestSkillGraphApproval,
} from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { sha256Canonical } from '../../src/cherry/core/hash.ts';
import { unwrap } from '../../src/cherry/core/result.ts';

/**
 * The handoff a live ChatGPT host needed and could not get: the workflow used
 * to stop dead at AWAITING_APPROVAL. An agent could request approval and then
 * had no honest way to learn the outcome, so the only way forward looked like
 * asserting approval in chat. Nothing here gives an agent that power; it gives
 * the agent a way to point at the human decision and to observe it.
 */

interface ToolResultShape {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function parseResult(result: unknown): Record<string, unknown> {
  return JSON.parse((result as ToolResultShape).content[0]!.text) as Record<string, unknown>;
}

function makeContext(): ToolContext & { workspaceId: string | null; missionId: string | null; presented: string[] } {
  const context = {
    workspaceId: null as string | null,
    missionId: null as string | null,
    presented: [] as string[],
    getActiveWorkspaceId: () => context.workspaceId,
    getActiveMissionId: () => context.missionId,
    setActiveIds: (ids: { workspaceId?: string; missionId?: string }) => {
      if (ids.workspaceId !== undefined) context.workspaceId = ids.workspaceId;
      if (ids.missionId !== undefined) context.missionId = ids.missionId;
    },
    presentPath: (path: string) => {
      context.presented.push(path);
    },
  };
  return context;
}

/** A mission with a valid, review-ready skill graph bound to it. */
async function makeReviewableSkill() {
  const workspace = unwrap(await createWorkspace({ name: 'Approval handoff' }));
  const mission = unwrap(
    await createMission({
      workspaceId: workspace.id,
      title: 'Write a landing page hero that converts',
      objective: 'Prove the approval boundary end to end',
      definitionOfDone: ['A person approved the exact revision'],
    }),
  );
  const graph = unwrap(
    await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Landing hero that converts',
      purpose: 'Lead with the outcome and keep one call to action',
      nodes: [{ kind: 'build', title: 'Write the outcome-first headline', goal: 'State the result the reader gets' }],
    }),
  );
  unwrap(await updateMission(mission.id, { skillGraphId: graph.id }, 'human'));
  unwrap(await transitionMission(mission.id, 'PLANNING', 'human'));
  return { workspace, mission, graph };
}

describe('WebMCP approval handoff', () => {
  beforeEach(() => {
    freshDb();
  });

  it('registers a read-only approval status tool in the planning aperture', () => {
    expect(TOOL_STATE_TABLE.planning).toContain('get_approval_status');
    const manager = new WebMcpRegistrationManager(makeContext());
    const definition = manager.listDefinitions().find((candidate) => candidate.name === 'get_approval_status');
    expect(definition).toBeTruthy();
    expect(definition!.annotations.readOnlyHint).toBe(true);
    expect(manager.activeNamesFor('planning')).toContain('get_approval_status');
  });

  it('returns the pending approval id, object, exact revision, hash, status and a safe deep link', async () => {
    const { workspace, mission, graph } = await makeReviewableSkill();
    const context = makeContext();
    context.workspaceId = workspace.id;
    context.missionId = mission.id;
    const manager = new WebMcpRegistrationManager(context);
    manager.syncState('planning');

    const requested = parseResult(
      await manager.executeLocal('request_checkpoint_approval', { skillGraphId: graph.id, reason: 'Ready for review' }),
    );
    expect(requested.status).toBe('pending');
    expect(String(requested.approvalUrl)).toContain(graph.id);

    const status = parseResult(await manager.executeLocal('get_approval_status', {}));
    const pending = (status.pending as Array<Record<string, unknown>>)[0]!;
    expect(pending.approvalId).toBe(requested.approvalId);
    expect(pending.objectId).toBe(graph.id);
    expect(pending.objectType).toBe('skillgraph');
    expect(pending.objectRevision).toBe(graph.revision);
    expect(typeof pending.contentHash).toBe('string');
    expect((pending.contentHash as string).length).toBeGreaterThan(16);
    expect(pending.status).toBe('pending');
    expect(pending.stale).toBe(false);
    const url = String(pending.approvalUrl);
    expect(url).toMatch(/\/studio\/skills\//);
    expect(url).toContain(graph.id);
    expect(url).toContain(String(pending.approvalId));
    expect(status.decisionMakers).toBe('human-only');
  });

  it('asks the app shell to show the approval screen without deciding anything', async () => {
    const { workspace, mission, graph } = await makeReviewableSkill();
    const context = makeContext();
    context.workspaceId = workspace.id;
    context.missionId = mission.id;
    const manager = new WebMcpRegistrationManager(context);
    manager.syncState('planning');

    await manager.executeLocal('request_checkpoint_approval', { skillGraphId: graph.id, reason: 'Please look' });
    expect(context.presented.some((path) => path.includes(graph.id))).toBe(true);

    const after = await getSkillGraph(graph.id);
    expect(after!.status).toBe('ready_for_review');
    expect(after!.approvedRevision).toBeNull();
  });

  it('blocks execution until a person decides, then opens the execution aperture', async () => {
    const { workspace, mission, graph } = await makeReviewableSkill();
    const context = makeContext();
    context.workspaceId = workspace.id;
    context.missionId = mission.id;
    const manager = new WebMcpRegistrationManager(context);
    manager.syncState('planning');

    const requested = parseResult(
      await manager.executeLocal('request_checkpoint_approval', { skillGraphId: graph.id, reason: 'Ready' }),
    );
    expect((await getMission(mission.id))!.state).toBe('AWAITING_APPROVAL');

    // Execution tools are simply not registered while approval is pending.
    const blocked = (await manager.executeLocal('write_artifact_file', { path: 'index.html', content: '<h1>x</h1>' })) as ToolResultShape;
    expect(blocked.isError).toBe(true);
    expect(parseResult(blocked).error).toBe('conflict');

    // The decisive action: a person, in Cherry's own UI, at this exact revision.
    unwrap(await decideSkillGraphApproval(String(requested.approvalId), 'approved', 'user'));

    const mustBeExecuting = await getMission(mission.id);
    expect(mustBeExecuting!.state).toBe('EXECUTING');

    manager.syncState('execution');
    const wrote = parseResult(await manager.executeLocal('write_artifact_file', { path: 'index.html', content: '<h1>Hero</h1>' }));
    expect(wrote.path).toBe('index.html');
  });

  it('waits for the decision instead of asking the human again, and reports it once made', async () => {
    const { workspace, mission, graph } = await makeReviewableSkill();
    const context = makeContext();
    context.workspaceId = workspace.id;
    context.missionId = mission.id;
    const manager = new WebMcpRegistrationManager(context);
    manager.syncState('planning');
    const requested = parseResult(
      await manager.executeLocal('request_checkpoint_approval', { skillGraphId: graph.id, reason: 'Ready' }),
    );

    const waiting = manager.executeLocal('get_approval_status', { approvalId: String(requested.approvalId), waitSeconds: 5 });
    setTimeout(() => {
      void decideSkillGraphApproval(String(requested.approvalId), 'approved', 'user');
    }, 30);

    const settled = parseResult(await waiting);
    expect(settled.status).toBe('approved');
    expect(settled.approvalId).toBe(requested.approvalId);
    expect(settled.decidedBy).toBe('user');
    expect(typeof settled.decidedAt).toBe('string');
    expect(settled.objectRevision).toBe(graph.revision);
    expect(typeof settled.contentHash).toBe('string');
  });

  it('a wait that times out reports still-pending rather than inventing a decision', async () => {
    const { workspace, mission, graph } = await makeReviewableSkill();
    const context = makeContext();
    context.workspaceId = workspace.id;
    context.missionId = mission.id;
    const manager = new WebMcpRegistrationManager(context);
    manager.syncState('planning');
    const requested = parseResult(
      await manager.executeLocal('request_checkpoint_approval', { skillGraphId: graph.id, reason: 'Ready' }),
    );
    const settled = parseResult(
      await manager.executeLocal('get_approval_status', { approvalId: String(requested.approvalId), waitSeconds: 1 }),
    );
    expect(settled.status).toBe('pending');
    expect(settled.timedOut).toBe(true);
  });

  it('records approver, session, timestamp, exact revision, content hash and decision', async () => {
    const { workspace, graph } = await makeReviewableSkill();
    const requested = unwrap(await requestSkillGraphApproval(graph.id, 'Ready', 'user', 'human'));
    expect(typeof requested.approval.contentHash).toBe('string');

    const decided = unwrap(await decideSkillGraphApproval(requested.approval.id, 'approved', 'Vaibhav'));
    expect(decided.approval.decision).toBe('approved');
    expect(decided.approval.decidedBy).toBe('Vaibhav');
    expect(decided.approval.decidedAt).toBeTruthy();
    expect(decided.approval.objectRevision).toBe(graph.revision);
    expect(decided.approval.contentHash).toBe(requested.approval.contentHash);
    expect(typeof decided.approval.decidedSessionId).toBe('string');
    expect((decided.approval.decidedSessionId as string).length).toBeGreaterThan(8);

    const stored = (await listApprovals(workspace.id)).find((approval) => approval.id === requested.approval.id);
    expect(stored!.decidedSessionId).toBe(decided.approval.decidedSessionId);
  });

  it('rejects a stale approval when the content hash changed under the same revision', async () => {
    const { graph } = await makeReviewableSkill();
    const requested = unwrap(await requestSkillGraphApproval(graph.id, 'Ready', 'user', 'human'));

    // Tamper with the stored graph at the same revision, the way a concurrent
    // edit or a corrupted record would. The approval was given for content the
    // human read; different content must not inherit that decision.
    const db = getDb();
    const stored = (await db.skillGraphs.get(graph.id))!;
    const tampered = { ...stored, purpose: 'Something the human never read' };
    tampered.versionHash = await sha256Canonical({ ...tampered, versionHash: undefined });
    await db.skillGraphs.put(tampered);

    const decided = await decideSkillGraphApproval(requested.approval.id, 'approved', 'user');
    expect(decided.ok).toBe(false);
    if (!decided.ok) expect(decided.error.code).toBe('conflict');
    expect((await getSkillGraph(graph.id))!.status).not.toBe('approved');
  });

  it('keeps the rejection workflow intact and returns the mission to planning', async () => {
    const { mission, graph } = await makeReviewableSkill();
    const requested = unwrap(await requestSkillGraphApproval(graph.id, 'Ready', 'user', 'human'));
    unwrap(await transitionMission(mission.id, 'AWAITING_APPROVAL', 'human', 'requested'));

    const decided = unwrap(await decideSkillGraphApproval(requested.approval.id, 'rejected', 'user', 'Needs a sharper headline'));
    expect(decided.graph.status).toBe('rejected');
    expect(decided.approval.comment).toBe('Needs a sharper headline');
    expect((await getMission(mission.id))!.state).toBe('PLANNING');
  });

  it('reports the decision through a global read once the planning aperture is gone', async () => {
    const { workspace, mission, graph } = await makeReviewableSkill();
    const context = makeContext();
    context.workspaceId = workspace.id;
    context.missionId = mission.id;
    const manager = new WebMcpRegistrationManager(context);
    manager.syncState('planning');
    const requested = parseResult(
      await manager.executeLocal('request_checkpoint_approval', { skillGraphId: graph.id, reason: 'Ready' }),
    );
    unwrap(await decideSkillGraphApproval(String(requested.approvalId), 'approved', 'user'));

    // Approving moves the product out of planning, which retires the tool that
    // could answer the question. The always-on read has to carry the answer, or
    // an agent is left guessing at the moment the answer finally exists.
    manager.syncState('execution');
    expect(manager.activeNamesFor('execution')).not.toContain('get_approval_status');
    const context1 = parseResult(await manager.executeLocal('read_cherry_context', {}));
    const decisions = context1.recentDecisions as Array<Record<string, unknown>>;
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.decision).toBe('approved');
    expect(decisions[0]!.objectId).toBe(graph.id);
    expect(decisions[0]!.objectRevision).toBe(graph.revision);
    expect(decisions[0]!.decidedBy).toBe('user');
    expect(typeof decisions[0]!.decidedAt).toBe('string');
  });

  it('never lets an agent decide, whatever it sends', async () => {
    const { workspace, mission, graph } = await makeReviewableSkill();
    const context = makeContext();
    context.workspaceId = workspace.id;
    context.missionId = mission.id;
    const manager = new WebMcpRegistrationManager(context);
    manager.syncState('planning');
    const requested = parseResult(
      await manager.executeLocal('request_checkpoint_approval', { skillGraphId: graph.id, reason: 'Ready' }),
    );

    const agentDecision = await decideSkillGraphApproval(String(requested.approvalId), 'approved', 'agent', undefined, 'agent');
    expect(agentDecision.ok).toBe(false);

    // Forged approval-shaped arguments are rejected at the schema boundary and
    // leave the record untouched.
    for (const forged of [{ humanApproved: true }, { approved: true }, { humanConfirmed: true }]) {
      const shaped = (await manager.executeLocal('get_approval_status', forged)) as ToolResultShape;
      expect(shaped.isError).toBe(true);
      expect(parseResult(shaped).error).toBe('validation');
    }
    const still = (await listApprovals(workspace.id)).find((approval) => approval.id === String(requested.approvalId));
    expect(still!.decision).toBe('pending');
    expect((await getSkillGraph(graph.id))!.status).toBe('ready_for_review');
  });
});

describe('start_apprenticeship predictability', () => {
  beforeEach(() => {
    freshDb();
  });

  it('says plainly when it reused the active workspace rather than creating one', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    const first = parseResult(await manager.executeLocal('start_apprenticeship', { workspaceName: 'Live host proof' }));
    expect(first.workspaceCreated).toBe(true);
    expect(first.workspaceName).toBe('Live host proof');

    const second = parseResult(
      await manager.executeLocal('start_apprenticeship', {
        workspaceName: 'Approval proof',
        title: 'Write a landing page hero that converts',
      }),
    );
    expect(second.workspaceId).toBe(first.workspaceId);
    expect(second.workspaceCreated).toBe(false);
    expect(second.workspaceName).toBe('Live host proof');
    expect(String(second.note)).toMatch(/Approval proof/);
    expect(String(second.note)).toMatch(/newWorkspace/);
    expect(second.missionId).not.toBe(first.missionId);
    expect(second.state).toBe('DRAFT');
    expect(String(second.nextAction)).toMatch(/load_lesson/);
  });

  it('creates and activates a new workspace when explicitly asked', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    const first = parseResult(await manager.executeLocal('start_apprenticeship', { workspaceName: 'Live host proof' }));
    const second = parseResult(
      await manager.executeLocal('start_apprenticeship', { workspaceName: 'Approval proof', newWorkspace: true }),
    );
    expect(second.workspaceCreated).toBe(true);
    expect(second.workspaceId).not.toBe(first.workspaceId);
    expect(second.workspaceName).toBe('Approval proof');
    expect(context.workspaceId).toBe(second.workspaceId);
    expect(context.missionId).toBe(second.missionId);

    // Existing data is preserved, never reset.
    const workspaces = await getDb().workspaces.toArray();
    expect(workspaces.map((workspace) => workspace.id)).toContain(String(first.workspaceId));
  });

  it('documents workspaceName so a client cannot read it as "switch to this workspace"', () => {
    const manager = new WebMcpRegistrationManager(makeContext());
    const definition = manager.listDefinitions().find((candidate) => candidate.name === 'start_apprenticeship')!;
    expect(definition.description).toMatch(/newWorkspace/);
    expect(definition.inputSchema).toMatchObject({ additionalProperties: false });
    const properties = (definition.inputSchema as { properties: Record<string, { description?: string }> }).properties;
    expect(properties.newWorkspace).toBeTruthy();
    expect(String(properties.workspaceName!.description)).toMatch(/only.*(new|created)/i);
  });
});
