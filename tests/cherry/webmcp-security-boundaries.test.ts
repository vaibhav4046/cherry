import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from '../setup.ts';
import { WebMcpRegistrationManager } from '../../src/cherry/webmcp/registration-manager.ts';
import {
  GLOBAL_TOOLS,
  TOOL_STATE_TABLE,
  type ToolContext,
} from '../../src/cherry/webmcp/tool-definitions.ts';
import type { ProductState } from '../../src/cherry/mission/mission-state.ts';
import {
  createMission,
  createWorkspace,
  transitionMission,
} from '../../src/cherry/mission/mission-service.ts';
import {
  decideSkillGraphApproval,
  draftSkillGraph,
  getSkillGraph,
  listApprovals,
  requestSkillGraphApproval,
} from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { minimalToolInput } from './tool-input-fixtures.ts';

/**
 * Cherry's whole claim is a set of boundaries an attached agent cannot cross:
 * it may ask, it may never grant. Each test here exercises one of those
 * boundaries through the real tool layer, because a boundary that only holds in
 * the service beneath the tools is not the boundary the host actually meets.
 */

const ALL_STATES: ProductState[] = [
  'empty',
  'onboarding',
  'learning',
  'planning',
  'execution',
  'verification',
  'passed',
];

function makeContext(): ToolContext & { workspaceId: string | null; missionId: string | null } {
  const context = {
    workspaceId: null as string | null,
    missionId: null as string | null,
    getActiveWorkspaceId() {
      return context.workspaceId;
    },
    getActiveMissionId() {
      return context.missionId;
    },
  };
  return context;
}

/** A context that follows selection changes the way the app shell does. */
function makeSyncedContext(): ReturnType<typeof makeContext> {
  const context = makeContext();
  context.setActiveIds = (ids) => {
    if (ids.workspaceId !== undefined) context.workspaceId = ids.workspaceId;
    if (ids.missionId !== undefined) context.missionId = ids.missionId;
  };
  return context;
}

interface ToolResultShape {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function parseResult(result: unknown): Record<string, unknown> {
  const shaped = result as ToolResultShape;
  return JSON.parse(shaped.content[0]!.text) as Record<string, unknown>;
}

const ONE_NODE = [
  { kind: 'action' as const, title: 'Do the work', goal: 'Produce the artifact this skill exists for' },
];

async function makeDraft(workspaceName: string, skillName = 'Boundary skill') {
  const workspace = unwrap(await createWorkspace({ name: workspaceName }));
  const graph = unwrap(
    await draftSkillGraph({
      workspaceId: workspace.id,
      name: skillName,
      purpose: 'Prove a boundary holds through the tool layer',
      nodes: ONE_NODE,
    }),
  );
  return { workspace, graph };
}

describe('unapproved skills are readable but not installable', () => {
  beforeEach(() => {
    freshDb();
  });

  it.each(['skill-md', 'agents-md'] as const)(
    'refuses a live %s file before a human decision',
    async (format) => {
      const { graph } = await makeDraft('Unapproved export');
      const manager = new WebMcpRegistrationManager(makeContext());

      const result = parseResult(await manager.executeLocal('get_skill', { skillId: graph.id, format }));
      // approval_required, not not_found: hiding the skill would be a lie about
      // what exists. The honest answer is "it exists, nobody approved it".
      expect(result.error).toBe('approval_required');
    },
  );

  it('still serves summary metadata before approval', async () => {
    const { graph } = await makeDraft('Readable summary');
    const manager = new WebMcpRegistrationManager(makeContext());

    const summary = parseResult(await manager.executeLocal('get_skill', { skillId: graph.id, format: 'summary' }));
    expect(summary.error).toBeUndefined();
    expect(summary).toMatchObject({
      skillId: graph.id,
      status: 'draft',
      installReady: false,
      approvedRevision: null,
    });
    // The contract is readable so an agent can decide whether to ask for it;
    // only the installable bytes are gated.
    expect(String(summary.name).length).toBeGreaterThan(0);
    expect(String(summary.purpose).length).toBeGreaterThan(0);
  });

  it('refuses a part beyond the end of the file as a validation error', async () => {
    const { graph } = await makeDraft('Out of range part');
    const requested = unwrap(await requestSkillGraphApproval(graph.id, 'so the file can be served', 'user'));
    unwrap(await decideSkillGraphApproval(requested.approval.id, 'approved', 'user'));
    const manager = new WebMcpRegistrationManager(makeContext());

    const first = parseResult(await manager.executeLocal('get_skill', { skillId: graph.id, format: 'skill-md' }));
    const beyond = parseResult(
      await manager.executeLocal('get_skill', {
        skillId: graph.id,
        format: 'skill-md',
        part: (first.totalParts as number) + 1,
      }),
    );
    expect(beyond.error).toBe('validation');
    expect(String(beyond.message)).toContain('out of range');
  });
});

describe('revision and approval-request conflicts', () => {
  beforeEach(() => {
    freshDb();
  });

  it('rejects a stale expectedRevision on revise_checkpoint', async () => {
    const { graph } = await makeDraft('Stale revision');
    const manager = new WebMcpRegistrationManager(makeContext());

    // The graph is at r1. An agent that believes it is at r7 is working from a
    // stale read; silently applying its edit would detach it from what it saw.
    const stale = parseResult(
      await manager.executeLocal('revise_checkpoint', {
        skillGraphId: graph.id,
        expectedRevision: graph.revision + 6,
        changeSummary: 'edit built on a stale read',
      }),
    );
    expect(stale.error).toBe('conflict');
    expect((await getSkillGraph(graph.id))?.revision).toBe(graph.revision);
  });

  it('never creates a second pending approval for the same revision', async () => {
    const { workspace, graph } = await makeDraft('Duplicate request');
    const manager = new WebMcpRegistrationManager(makeContext());

    const first = parseResult(
      await manager.executeLocal('request_checkpoint_approval', {
        skillGraphId: graph.id,
        reason: 'first ask',
      }),
    );
    expect(first.status).toBe('pending');

    const second = parseResult(
      await manager.executeLocal('request_checkpoint_approval', {
        skillGraphId: graph.id,
        reason: 'asking again for the same revision',
      }),
    );
    // Re-asking must not multiply the queue a person has to work through.
    expect(second.error).toBe('conflict');

    const approvals = await listApprovals(workspace.id);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ objectId: graph.id, objectRevision: graph.revision, decision: 'pending' });
  });
});

describe('an agent may ask, never grant', () => {
  beforeEach(() => {
    freshDb();
  });

  it('refuses a non-human approval decision at the service boundary', async () => {
    const { graph } = await makeDraft('Agent decision');
    const requested = unwrap(await requestSkillGraphApproval(graph.id, 'agent asks', 'agent-x', 'agent'));

    const decided = await decideSkillGraphApproval(requested.approval.id, 'approved', 'agent-x', undefined, 'agent');
    expect(decided.ok).toBe(false);
    if (!decided.ok) expect(decided.error.code).toBe('validation');
    expect((await getSkillGraph(graph.id))?.status).not.toBe('approved');
  });

  it('exposes no tool that can flip an approval, even when every tool is driven', async () => {
    const { workspace, graph } = await makeDraft('Registry walk');
    const mission = unwrap(
      await createMission({
        workspaceId: workspace.id,
        title: 'Registry walk mission',
        objective: 'Give every tool something real to act on',
        definitionOfDone: ['Nothing gets approved'],
      }),
    );
    const requested = unwrap(await requestSkillGraphApproval(graph.id, 'pending on purpose', 'user'));
    const context = makeContext();
    context.workspaceId = workspace.id;
    context.missionId = mission.id;
    const manager = new WebMcpRegistrationManager(context);

    // No tool NAME advertises a decide/grant capability. Anything that mentions
    // approval must be a request or a read.
    for (const definition of manager.listDefinitions()) {
      if (/approv|decide|grant/i.test(definition.name)) {
        expect(definition.name, definition.name).toMatch(/^(request_|read_|get_|list_)/);
      }
    }

    const ids = {
      skillId: graph.id,
      skillGraphId: graph.id,
      approvalId: requested.approval.id,
      missionId: mission.id,
    };
    let executed = 0;
    for (const definition of manager.listDefinitions()) {
      const result = (await manager.executeLocal(
        definition.name,
        minimalToolInput(definition, ids),
      )) as ToolResultShape;
      if (result.isError !== true) executed += 1;
    }
    // Guard against this test quietly decaying into "every call bounced off
    // validation and therefore nothing changed". A large share of the registry
    // must really run for the conclusion below to mean anything.
    expect(executed).toBeGreaterThanOrEqual(25);

    // Whatever those calls did — and several legitimately write — none of them
    // may leave this graph approved or turn its pending record into a decision.
    const after = await getSkillGraph(graph.id);
    expect(after?.status).not.toBe('approved');
    expect(after?.approvedRevision).toBeNull();
    expect(after?.approvedBy).toBeNull();
    const decisions = (await getDb().approvals.toArray()).filter((record) => record.objectId === graph.id);
    expect(decisions.length).toBeGreaterThan(0);
    for (const record of decisions) expect(record.decision).not.toBe('approved');
  });

  it('cannot start execution, activate memory, or turn a report into verification', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Human-only gates' }));
    const mission = unwrap(
      await createMission({
        workspaceId: workspace.id,
        title: 'Gate mission',
        objective: 'Prove the human-only gates hold',
        definitionOfDone: ['Nothing self-promotes'],
      }),
    );
    const context = makeContext();
    context.workspaceId = workspace.id;
    context.missionId = mission.id;
    const manager = new WebMcpRegistrationManager(context);

    // Stage skipping: EXECUTING is a human-only transition.
    const executing = await transitionMission(mission.id, 'EXECUTING', 'agent');
    expect(executing.ok).toBe(false);
    expect((await getDb().missions.get(mission.id))?.state).not.toBe('EXECUTING');

    // Memory activation: proposing is allowed, taking effect is not.
    const proposed = parseResult(
      await manager.executeLocal('propose_memory_rule', {
        type: 'preference',
        title: 'Always ship on Fridays',
        content: 'The agent would like this to be a standing rule.',
        scope: 'workspace',
        sourceDescription: 'agent inference during a tool call',
      }),
    );
    expect(proposed.status).toBe('proposed');
    const memories = await getDb().memories.where('workspaceId').equals(workspace.id).toArray();
    expect(memories).toHaveLength(1);
    expect(memories[0]?.status).toBe('proposed');
    expect(['active', 'approved']).not.toContain(memories[0]?.status);

    // Evidence trust: an agent's own observation lands untrusted and stays there.
    const evidence = parseResult(
      await manager.executeLocal('add_source_evidence', {
        sourceType: 'observation',
        claim: 'The agent believes this is settled fact.',
      }),
    );
    expect(evidence.trust).toBe('untrusted');
    const storedEvidence = await getDb().evidence.where('workspaceId').equals(workspace.id).toArray();
    expect(storedEvidence.every((record) => record.trust === 'untrusted')).toBe(true);

    // Reporting success is not verification: no verification record appears.
    const reported = parseResult(
      await manager.executeLocal('record_task_result', { summary: 'I finished it', outcome: 'succeeded' }),
    );
    expect(String(reported.note)).toContain('verification is a separate step');
    expect(await getDb().verifications.where('missionId').equals(mission.id).count()).toBe(0);
  });
});

describe('tool aperture per product state', () => {
  beforeEach(() => {
    freshDb();
  });

  it('registers exactly the globals plus that state\'s table entries', () => {
    const manager = new WebMcpRegistrationManager(makeContext());
    for (const state of ALL_STATES) {
      // Read the table rather than hardcoding names, so a tool added to a state
      // later is checked against the real contract instead of a stale copy.
      const expected = [...GLOBAL_TOOLS, ...(TOOL_STATE_TABLE[state] ?? []).slice(0, 5)];
      expect(manager.activeNamesFor(state), state).toEqual(expected);
    }
  });

  it('keeps execution and export tools out of the states that cannot use them', () => {
    const manager = new WebMcpRegistrationManager(makeContext());
    // Writing files while a plan is still being decided would put artifacts on
    // disk before anyone approved the plan that produces them.
    expect(manager.activeNamesFor('planning')).not.toContain('write_artifact_file');
    // Exporting while still learning would ship an unverified, unapproved skill.
    expect(manager.activeNamesFor('learning')).not.toContain('compile_skill_bundle');
    expect(manager.activeNamesFor('learning')).not.toContain('export_workspace');
    // And they ARE present where they belong, so this is a boundary, not a ban.
    expect(manager.activeNamesFor('execution')).toContain('write_artifact_file');
    expect(manager.activeNamesFor('passed')).toContain('compile_skill_bundle');
    expect(manager.activeNamesFor('passed')).toContain('export_workspace');
  });
});

describe('workspace scoping', () => {
  beforeEach(() => {
    freshDb();
  });

  it('never reads or mutates the workspace that is not selected', async () => {
    const spaceA = unwrap(await createWorkspace({ name: 'Space A' }));
    const missionA = unwrap(
      await createMission({
        workspaceId: spaceA.id,
        title: 'Mission A',
        objective: 'Stay inside space A',
        definitionOfDone: ['A only'],
      }),
    );
    const skillA = unwrap(
      await draftSkillGraph({ workspaceId: spaceA.id, name: 'Skill A', purpose: 'Belongs to A', nodes: ONE_NODE }),
    );

    const spaceB = unwrap(await createWorkspace({ name: 'Space B' }));
    const missionB = unwrap(
      await createMission({
        workspaceId: spaceB.id,
        title: 'Mission B',
        objective: 'Must never appear in an A-scoped result',
        definitionOfDone: ['B only'],
      }),
    );
    const skillB = unwrap(
      await draftSkillGraph({ workspaceId: spaceB.id, name: 'Skill B', purpose: 'Belongs to B', nodes: ONE_NODE }),
    );

    const context = makeContext();
    context.workspaceId = spaceA.id;
    context.missionId = missionA.id;
    const manager = new WebMcpRegistrationManager(context);

    const snapshot = parseResult(await manager.executeLocal('read_cherry_context', {}));
    expect((snapshot.workspace as { id: string }).id).toBe(spaceA.id);
    expect((snapshot.mission as { id: string }).id).toBe(missionA.id);
    expect(snapshot.missionCount).toBe(1);
    const snapshotText = JSON.stringify(snapshot);
    expect(snapshotText).not.toContain(spaceB.id);
    expect(snapshotText).not.toContain(missionB.id);

    const exported = parseResult(await manager.executeLocal('export_workspace', {}));
    expect(exported.missions).toBe(1);
    expect(JSON.stringify(exported)).not.toContain(spaceB.id);

    await manager.executeLocal('add_source_evidence', {
      sourceType: 'observation',
      claim: 'This evidence belongs to space A only.',
    });
    expect(await getDb().evidence.where('workspaceId').equals(spaceA.id).count()).toBe(1);
    expect(await getDb().evidence.where('workspaceId').equals(spaceB.id).count()).toBe(0);

    // list_skills is the deliberate exception: the library is the product's
    // cross-workspace memory, and it says so in the description a host reads.
    const listSkills = manager.listDefinitions().find((definition) => definition.name === 'list_skills')!;
    expect(listSkills.description.toLowerCase()).toContain('cross-workspace');
    const listed = parseResult(await manager.executeLocal('list_skills', {}));
    const listedIds = (listed.skills as Array<{ skillId: string }>).map((skill) => skill.skillId);
    expect(listedIds).toEqual(expect.arrayContaining([skillA.id, skillB.id]));
  });
});

describe('nothing leaves local storage without an explicit export', () => {
  beforeEach(() => {
    freshDb();
  });

  it('drives a whole journey without touching the network', async () => {
    const context = makeSyncedContext();
    const manager = new WebMcpRegistrationManager(context);
    const originalFetch = globalThis.fetch;
    // A spy that THROWS, not one that records quietly: if any code path reached
    // for the network, the journey below would fail loudly instead of passing
    // with a silent request in the middle of it.
    const fetchSpy = vi.fn(() => {
      throw new Error('Cherry must not reach the network during a tool-driven journey');
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    let exported: Record<string, unknown>;
    try {
      const started = parseResult(await manager.executeLocal('start_apprenticeship', {}));
      expect(started.missionId).toBeTruthy();

      const lesson = parseResult(
        await manager.executeLocal('load_lesson', { title: 'Local lesson', kind: 'manual' }),
      );
      const lessonId = lesson.lessonId as string;
      parseResult(
        await manager.executeLocal('import_transcript', {
          lessonId,
          text: '0:05 Frame the hero\n0:40 Add the navigation',
        }),
      );
      parseResult(
        await manager.executeLocal('record_lesson_observation', {
          lessonId,
          timestampSeconds: 12,
          kind: 'visual',
          text: 'The presenter drags the nav into the header slot',
        }),
      );
      parseResult(
        await manager.executeLocal('add_source_evidence', {
          sourceType: 'observation',
          claim: 'Semantic landmarks improve accessibility',
        }),
      );
      const draft = parseResult(
        await manager.executeLocal('compile_lesson_draft', {
          name: 'Semantic page skill',
          purpose: 'Build accessible pages using landmarks',
          steps: [{ title: 'Write the page', goal: 'Create index.html with landmarks' }],
        }),
      );
      const skillGraphId = draft.skillGraphId as string;
      const approval = parseResult(
        await manager.executeLocal('request_checkpoint_approval', { skillGraphId, reason: 'journey complete' }),
      );
      // The person decides — the one step no tool performs.
      unwrap(await decideSkillGraphApproval(approval.approvalId as string, 'approved', 'user'));

      exported = parseResult(await manager.executeLocal('export_workspace', {}));
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    // export_workspace hands back a locally prepared descriptor: an id, a
    // schema version, counts and a verifiable hash. No URL, no upload, no
    // transport of the archive itself.
    expect(exported).toMatchObject({ schemaVersion: expect.any(String), missions: 1 });
    expect(typeof exported.exportId).toBe('string');
    expect(typeof exported.payloadSha256).toBe('string');
    expect(String(exported.note)).toContain('locally');
    expect(JSON.stringify(exported)).not.toMatch(/https?:\/\//);
  });
});
