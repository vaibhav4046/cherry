import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { WebMcpRegistrationManager } from '../../src/cherry/webmcp/registration-manager.ts';
import { GLOBAL_TOOLS, TOOL_STATE_TABLE, buildToolDefinitions, type ToolContext } from '../../src/cherry/webmcp/tool-definitions.ts';
import { TOOL_SURFACE_TABLE } from '../../src/cherry/webmcp/workforce-tools.ts';
import type { ProductState } from '../../src/cherry/mission/mission-state.ts';
import {
  HARD_CAP_BYTES,
  MAX_RESULT_CHARS,
  redactToolText,
  toolError,
  toolText,
  validateOrigin,
  validatePostMessageEnvelope,
} from '../../src/cherry/webmcp/tool-contract.ts';
import { createMission, createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { addEvidence } from '../../src/cherry/evidence/evidence-service.ts';
import {
  decideSkillGraphApproval,
  draftSkillGraph,
  requestSkillGraphApproval,
  reviseSkillGraph,
} from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { exportSkillFile } from '../../src/cherry/library/library-service.ts';
import { sha256Text } from '../../src/cherry/core/hash.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import {
  SYNTHETIC_SAMPLE_APPROVER,
  SYNTHETIC_SAMPLE_NOTICE,
} from '../../src/cherry/skillgraph/sample-state.ts';

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

interface ToolResultShape {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function parseResult(result: unknown): Record<string, unknown> {
  const shaped = result as ToolResultShape;
  return JSON.parse(shaped.content[0]!.text) as Record<string, unknown>;
}

function resultText(result: unknown): string {
  return (result as ToolResultShape).content[0]!.text;
}

async function makeApprovedCitedSkill(
  evidenceCount = 1,
  oversized = false,
  decidedBy = 'user',
) {
  const workspace = unwrap(await createWorkspace({ name: 'Cited WebMCP skill' }));
  const mission = unwrap(
    await createMission({
      workspaceId: workspace.id,
      title: 'Learn cited thumbnail design',
      objective: 'Serve a cited skill to an attached agent',
      definitionOfDone: ['Citation metadata stays attached'],
    }),
  );
  const evidence = [];
  for (let index = 0; index < evidenceCount; index += 1) {
    evidence.push(
      unwrap(
        await addEvidence({
          workspaceId: workspace.id,
          missionId: mission.id,
          sourceType: 'video',
          sourceCreator: oversized ? `${'C'.repeat(190)}${index}` : 'Creator Lab',
          sourceTitle: oversized ? `${'T'.repeat(290)}${index}` : 'The Thumbnail Hierarchy Method',
          sourceUri: oversized
            ? `https://example.com/video/${index}?context=${'u'.repeat(900)}`
            : 'https://www.youtube.com/watch?v=abc123xyz00',
          timestampSeconds: 75 + index,
          claim: `Choose one focal subject before adding supporting text (${index + 1}).`,
          provenanceMethod: 'user_typed',
        }),
      ),
    );
  }
  const graph = unwrap(
    await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Thumbnail hierarchy',
      purpose: 'Build a thumbnail around one dominant focal subject',
      nodes: [
        {
          kind: 'action',
          title: 'Choose the subject',
          goal: 'Establish the focal point',
          evidenceIds: evidence.map((record) => record.id),
        },
      ],
    }),
  );
  const request = unwrap(await requestSkillGraphApproval(graph.id, 'WebMCP citation test', 'user'));
  unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', decidedBy));
  return graph;
}

async function makeMaximalEscapedSkill() {
  const workspace = unwrap(await createWorkspace({ name: 'Bounded JSON skill' }));
  const escapeHeavy = `Quote " slash \\ newline\n tab\t sk_live_example123 ghp_x ${'detail '.repeat(12)}`;
  const draft = unwrap(
    await draftSkillGraph({
      workspaceId: workspace.id,
      name: 'Bounded JSON skill',
      purpose: escapeHeavy.repeat(8),
      nodes: Array.from({ length: 100 }, (_, index) => ({
        kind: 'action' as const,
        title: `Step ${index + 1}: ${escapeHeavy}`,
        goal: `Preserve ${escapeHeavy}`,
        instructions: [escapeHeavy, escapeHeavy],
      })),
    }),
  );
  const revised = unwrap(
    await reviseSkillGraph(
      draft.id,
      {
        guardrails: Array.from({ length: 100 }, (_, index) => ({
          id: `guard-${index}`,
          title: `Guard ${index + 1}: ${escapeHeavy}`,
          effect: 'deny' as const,
          condition: escapeHeavy,
          scope: 'global' as const,
        })),
        evaluations: Array.from({ length: 100 }, (_, index) => ({
          id: `evaluation-${index}`,
          name: `Evaluation ${index + 1}: ${escapeHeavy}`,
          type: 'manual' as const,
          severity: 'info' as const,
          config: { note: escapeHeavy },
        })),
      },
      'Exercise the maximum summary collections',
      'human',
      draft.revision,
    ),
  );
  const request = unwrap(await requestSkillGraphApproval(revised.id, 'Bounded JSON test', 'user'));
  unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));
  return revised;
}

describe('WebMCP tool aperture', () => {
  beforeEach(() => {
    freshDb();
  });

  it('never exceeds five state tools plus seven globals (three are library reads)', () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    const states: ProductState[] = ['empty', 'onboarding', 'learning', 'planning', 'execution', 'verification', 'passed'];
    for (const state of states) {
      const names = manager.activeNamesFor(state);
      expect(names.length, state).toBeLessThanOrEqual(12);
      expect(names).toContain('read_cherry_context');
      expect(names).toContain('list_cherry_capabilities');
      expect(names).toContain('introduce_agent');
    }
  });

  it('the attached agent is auto-assigned and can introduce itself by name', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    // jsdom has no WebMCP host, so nothing is attached — and no name is set.
    expect(manager.status().agent).toEqual({ attached: false, name: null });
    const result = parseResult(await manager.executeLocal('introduce_agent', { name: 'Codex helper' }));
    expect(result.agent).toBe('Codex helper');
    expect(String(result.boundaries)).toMatch(/human-only/);
    expect(manager.status().agent.name).toBe('Codex helper');
  });

  it('introduce_agent rejects a blank name', async () => {
    const manager = new WebMcpRegistrationManager(makeContext());
    const shaped = (await manager.executeLocal('introduce_agent', { name: '   ' })) as { isError?: boolean };
    expect(shaped.isError).toBe(true);
  });

  it('surface apertures stay within five tools plus globals and select by route surface', () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    for (const surface of ['inbox', 'crew', 'run', 'sources'] as const) {
      expect(TOOL_SURFACE_TABLE[surface].length).toBeLessThanOrEqual(5);
      const names = manager.activeNamesFor('learning', surface);
      expect(names.length).toBeLessThanOrEqual(12);
      for (const name of TOOL_SURFACE_TABLE[surface]) expect(names).toContain(name);
    }
    // default surface falls back to the state table.
    expect(manager.activeNamesFor('learning', 'default')).toEqual(manager.activeNamesFor('learning'));
    // every surface tool has exactly one definition.
    const defined = new Set(buildToolDefinitions(makeContext()).map((definition) => definition.name));
    for (const names of Object.values(TOOL_SURFACE_TABLE)) {
      for (const name of names) expect(defined.has(name), name).toBe(true);
    }
  });

  it('Sources surface exposes five safe tools and saves without fetching URLs', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    const workspace = parseResult(await manager.executeLocal('create_workspace', { name: 'Source tools' }));
    context.workspaceId = workspace.workspaceId as string;
    manager.setSurface('sources');
    manager.syncState('onboarding');
    expect(manager.activeNamesFor('onboarding', 'sources')).toEqual([...GLOBAL_TOOLS, ...TOOL_SURFACE_TABLE.sources]);
    const saved = parseResult(await manager.executeLocal('save_source', { kind: 'note', title: 'Agent note', content: 'A human-supplied note', permissionAcknowledged: false }));
    expect(saved.status).toBe('ready');
    expect(parseResult(await manager.executeLocal('list_sources', {}))).toHaveLength(1);
  });

  it('inbox tools create and advance a work item honestly, never past QUEUED', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    const workspace = parseResult(await manager.executeLocal('create_workspace', { name: 'Tool workforce' }));
    context.workspaceId = workspace.workspaceId as string;
    const created = parseResult(await manager.executeLocal('create_work_item', { title: 'Tool-made item', objective: 'x', definitionOfDone: ['done'] }));
    expect(created.status).toBe('DRAFT');
    const readied = parseResult(await manager.executeLocal('request_work_run', { workItemId: created.workItemId }));
    expect(readied.status).toBe('READY');
    const queued = parseResult(await manager.executeLocal('request_work_run', { workItemId: created.workItemId }));
    expect(queued.status).toBe('QUEUED');
    const stuck = (await manager.executeLocal('request_work_run', { workItemId: created.workItemId })) as { isError?: boolean };
    expect(stuck.isError).toBe(true);
    const thread = parseResult(await manager.executeLocal('read_work_thread', { workItemId: created.workItemId }));
    expect((thread.item as { status: string }).status).toBe('QUEUED');
  });

  it('tool names are snake_case and within limits; descriptions within 500 chars', () => {
    const definitions = buildToolDefinitions(makeContext());
    for (const definition of definitions) {
      expect(definition.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(definition.name.length).toBeLessThanOrEqual(30);
      expect(definition.description.length).toBeLessThanOrEqual(500);
      const schema = definition.inputSchema as { additionalProperties?: boolean };
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it('every state-table tool exists exactly once in the definitions', () => {
    const definitions = buildToolDefinitions(makeContext());
    const names = definitions.map((definition) => definition.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tools of Object.values(TOOL_STATE_TABLE)) {
      for (const tool of tools) {
        expect(names, tool).toContain(tool);
      }
    }
    for (const globalTool of GLOBAL_TOOLS) {
      expect(names).toContain(globalTool);
    }
  });

  it('registers canonical public names while legacy names remain locally callable', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    const names = manager.activeNamesFor('learning');
    expect(names).toContain('record_observation');
    expect(names).toContain('derive_skill');
    expect(names).not.toContain('record_lesson_observation');
    const canonical = new Set(manager.listDefinitions().map((definition) => definition.name));
    for (const name of ['record_observation', 'derive_skill', 'request_skill_approval', 'propose_memory', 'run_verification']) {
      expect(canonical.has(name), name).toBe(true);
    }
    // Legacy bridge callers resolve to the canonical implementation.
    const result = parseResult(await manager.executeLocal('record_lesson_observation', {
      lessonId: 'missing', timestampSeconds: 1, kind: 'spoken', text: 'legacy call',
    }));
    expect(result.error).toBe('not_found');
  });

  it('runtime-validates arguments even if a host claims it validated them', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    const result = parseResult(await manager.executeLocal('create_workspace', { name: 42 }));
    expect(result['error']).toBe('validation');
  });

  it('cancelled signal aborts before execution', async () => {
    const definitions = buildToolDefinitions(makeContext());
    const create = definitions.find((definition) => definition.name === 'create_workspace')!;
    const controller = new AbortController();
    controller.abort();
    const result = parseResult(await create.execute({ name: 'x' }, controller.signal));
    expect(result['error']).toBe('temporary');
  });

  it('drives the full golden journey through tools against real persisted state', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);

    // Empty state: create workspace + mission.
    const workspace = parseResult(await manager.executeLocal('create_workspace', { name: 'Agent workspace' }));
    expect(workspace['workspaceId']).toBeTruthy();
    context.workspaceId = workspace['workspaceId'] as string;

    const mission = parseResult(
      await manager.executeLocal('create_mission', {
        title: 'Agent mission',
        objective: 'Build a demo artifact through tools',
        definitionOfDone: ['index.html exists'],
      }),
    );
    context.missionId = mission['missionId'] as string;
    expect(mission['state']).toBe('DRAFT');

    // read_cherry_context reflects the same state the UI reads.
    const snapshot = parseResult(await manager.executeLocal('read_cherry_context', {}));
    expect((snapshot['mission'] as Record<string, unknown>)['id']).toBe(context.missionId);

    // Learning: lesson + observation + evidence + draft compile.
    const lesson = parseResult(
      await manager.executeLocal('load_lesson', { title: 'Manual lesson', kind: 'manual' }),
    );
    expect(lesson['lessonId']).toBeTruthy();

    const observation = parseResult(
      await manager.executeLocal('record_lesson_observation', {
        lessonId: lesson['lessonId'],
        timestampSeconds: 12,
        kind: 'visual',
        text: 'Presenter uses semantic landmarks',
      }),
    );
    expect(observation['observationId']).toBeTruthy();

    const evidence = parseResult(
      await manager.executeLocal('add_source_evidence', {
        sourceType: 'observation',
        claim: 'Semantic landmarks improve accessibility',
      }),
    );
    expect(evidence['trust']).toBe('untrusted');

    const draft = parseResult(
      await manager.executeLocal('compile_lesson_draft', {
        name: 'Semantic page skill',
        purpose: 'Build accessible pages using landmarks',
        steps: [{ title: 'Write page', goal: 'Create index.html with landmarks' }],
      }),
    );
    const skillGraphId = draft['skillGraphId'] as string;
    expect(skillGraphId).toBeTruthy();

    // Planning: approval request cannot self-approve.
    const approval = parseResult(
      await manager.executeLocal('request_checkpoint_approval', { skillGraphId, reason: 'Draft ready' }),
    );
    expect(approval['status']).toBe('pending');
    expect(String(approval['note'])).toContain('cannot approve');
  });
});

describe('WebMCP graceful degradation', () => {
  beforeEach(() => {
    freshDb();
  });

  it('reports unsupported when document.modelContext is absent and stays usable', () => {
    const manager = new WebMcpRegistrationManager(makeContext());
    expect(manager.supported).toBe(false);
    manager.syncState('learning');
    const status = manager.status();
    expect(status.supported).toBe(false);
    expect(status.registered).toHaveLength(0);
    expect(status.productState).toBe('learning');
  });

  it('registers and swaps tools when a model context exists', () => {
    const registered: Array<{ name: string; signal: AbortSignal | undefined }> = [];
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool: (tool: { name: string }, options?: { signal?: AbortSignal }) => {
        registered.push({ name: tool.name, signal: options?.signal });
      },
    };
    try {
      const manager = new WebMcpRegistrationManager(makeContext());
      manager.syncState('learning');
      const learningNames = manager.status().registered.map((tool) => tool.name);
      expect(learningNames).toContain('load_lesson');
      expect(learningNames).not.toContain('compile_skill_bundle');

      const firstBatchSignals = registered.map((entry) => entry.signal);
      manager.syncState('passed');
      // Old registrations were aborted.
      expect(firstBatchSignals.every((signal) => signal?.aborted)).toBe(true);
      const passedNames = manager.status().registered.map((tool) => tool.name);
      expect(passedNames).toContain('compile_skill_bundle');
      expect(passedNames).not.toContain('load_lesson');
      manager.dispose();
    } finally {
      delete (document as unknown as { modelContext?: unknown }).modelContext;
    }
  });

  it('exposes allowed states and owning surface in inspector metadata', () => {
    const registered: Array<{ name: string }> = [];
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool: (tool: { name: string }) => { registered.push({ name: tool.name }); },
    };
    try {
      const manager = new WebMcpRegistrationManager(makeContext());
      manager.syncState('learning');
      const status = manager.status();
      const observation = status.registered.find((tool) => tool.name === 'record_observation');
      expect(observation?.allowedStates).toEqual(['learning']);
      expect(observation?.surface).toBe('default');
      const global = status.registered.find((tool) => tool.name === 'get_cherry_status');
      expect(global?.allowedStates).toEqual(['empty', 'onboarding', 'learning', 'planning', 'execution', 'verification', 'passed']);
      expect(registered.map((entry) => entry.name)).toContain('record_observation');
    } finally {
      delete (document as unknown as { modelContext?: unknown }).modelContext;
    }
  });
});

describe('MCP inspector data (call log + retired tools)', () => {
  beforeEach(() => {
    freshDb();
  });

  it('records real tool calls with honest ok/error flags', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);

    await manager.executeLocal('create_workspace', { name: 'Log workspace' });
    // Invalid arguments produce a logged error entry, not silence.
    await manager.executeLocal('create_workspace', { name: 42 });

    const status = manager.status();
    expect(status.recentCalls).toHaveLength(2);
    expect(status.recentCalls[0]).toMatchObject({ name: 'create_workspace', ok: true, source: 'local' });
    expect(status.recentCalls[1]).toMatchObject({ name: 'create_workspace', ok: false });
    expect(status.recentCalls[0]!.resultPreview).toContain('workspaceId');
  });

  it('caps the call log at 50 entries', async () => {
    const manager = new WebMcpRegistrationManager(makeContext());
    for (let index = 0; index < 55; index += 1) {
      await manager.executeLocal('read_cherry_context', {});
    }
    expect(manager.status().recentCalls).toHaveLength(50);
  });

  it('reports tools retired by a state change', () => {
    const manager = new WebMcpRegistrationManager(makeContext());
    manager.syncState('learning');
    manager.syncState('passed');
    const status = manager.status();
    expect(status.recentlyRemoved).toContain('load_lesson');
    expect(status.recentlyRemoved).toContain('record_lesson_observation');
    expect(status.recentlyRemoved).not.toContain('read_cherry_context'); // global stays
    expect(status.recentlyRemoved).not.toContain('compile_skill_bundle'); // newly active
  });

  it('notifies subscribers when a call lands', async () => {
    const manager = new WebMcpRegistrationManager(makeContext());
    const snapshots: number[] = [];
    manager.subscribe((status) => snapshots.push(status.recentCalls.length));
    await manager.executeLocal('read_cherry_context', {});
    expect(snapshots[snapshots.length - 1]).toBe(1);
  });

  it('refuses a registered closure after its state aperture is retired', async () => {
    let stale: ((input: unknown) => Promise<unknown>) | undefined;
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool: (tool: { name: string; execute: (input: unknown) => Promise<unknown> }) => {
        if (tool.name === 'load_lesson') stale = tool.execute;
      },
    };
    try {
      const context = makeContext();
      const manager = new WebMcpRegistrationManager(context);
      manager.syncState('learning');
      expect(stale).toBeDefined();
      manager.syncState('passed');
      const result = parseResult(await stale!({ title: 'stale', kind: 'manual' }));
      expect(result.error).toBe('conflict');
    } finally {
      delete (document as unknown as { modelContext?: unknown }).modelContext;
    }
  });

  it('re-registers when active ids change and refuses local retired tools', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    manager.syncState('learning');
    context.workspaceId = 'ws_other';
    const refused = parseResult(await manager.executeLocal('create_workspace', { name: 'stale' }));
    expect(refused.error).toBe('conflict');
    const definitions = manager.listDefinitions();
    expect(definitions.find((entry) => entry.name === 'run_cherry_verification')?.annotations.sideEffect).toBe('execute');
    expect(definitions.find((entry) => entry.name === 'export_workspace')?.annotations.sideEffect).toBe('export');
    expect(definitions.find((entry) => entry.name === 'compile_skill_bundle')?.annotations.requiresApproval).toBe(true);
  });

  it('returns safe registration diagnostics and structured bounded contract errors', () => {
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool: () => {
        throw new Error('token sk_live_super-secret should never be rendered');
      },
    };
    try {
      const manager = new WebMcpRegistrationManager(makeContext());
      manager.syncState('empty');
      expect(manager.status().diagnostics[0]).toMatchObject({ code: 'registration_failed' });
      expect(JSON.stringify(manager.status().diagnostics)).not.toContain('sk_live');
    } finally {
      delete (document as unknown as { modelContext?: unknown }).modelContext;
    }
    const text = toolText({ message: '😀'.repeat(5000) }).content[0]!.text;
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(HARD_CAP_BYTES);
    const error = parseResult(toolError('validation', 'bad sk_live_secret', { raw: 'xoxb-123', safe: true }));
    expect(error.error).toBe('validation');
    expect(String(error.message)).not.toContain('sk_live');
    expect(String(error.details)).not.toContain('xoxb-123');
    expect(validateOrigin('https://cherry-wine.vercel.app', ['https://cherry-wine.vercel.app'])).toBe(true);
    expect(validateOrigin('https://evil.example', ['https://cherry-wine.vercel.app'])).toBe(false);
    expect(validatePostMessageEnvelope({ type: 'cherry-webmcp', version: 1, requestId: 'r1', payload: {} })).not.toBeNull();
    expect(validatePostMessageEnvelope({ type: 'cherry-webmcp', version: 2, requestId: 'r1', payload: {} })).toBeNull();
  });
});

describe('autonomous agent drive (the Autopilot path)', () => {
  beforeEach(() => {
    freshDb();
  });

  it('an attached agent completes lesson→skill→approval-request purely through tools', async () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);

    const workspace = parseResult(await manager.executeLocal('create_workspace', { name: 'Autopilot workspace' }));
    context.workspaceId = workspace['workspaceId'] as string;
    const mission = parseResult(
      await manager.executeLocal('create_mission', {
        title: 'Learn the hero workflow',
        objective: 'Turn the video into a portable skill',
        definitionOfDone: ['SkillGraph approved', 'Verification passes'],
      }),
    );
    context.missionId = mission['missionId'] as string;

    const lesson = parseResult(
      await manager.executeLocal('load_lesson', {
        title: 'Hero section lesson',
        kind: 'youtube',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        permissionAcknowledged: true,
      }),
    );
    const lessonId = lesson['lessonId'] as string;

    // Multi-source ingestion through the tool: replace, then append.
    const first = parseResult(
      await manager.executeLocal('import_transcript', {
        lessonId,
        text: '0:05 Create the hero frame\n0:40 Add the pill navigation',
      }),
    );
    expect(first['addedSegments']).toBe(2);
    const second = parseResult(
      await manager.executeLocal('import_transcript', {
        lessonId,
        text: 'Check the spacing against the grid before shipping.',
        mode: 'append',
      }),
    );
    expect(second['totalSegments']).toBe(3);

    // Visual observation as the agent "watches" through the host browser.
    parseResult(
      await manager.executeLocal('record_lesson_observation', {
        lessonId,
        timestampSeconds: 42,
        kind: 'visual',
        text: 'Presenter drags the nav into the header slot',
      }),
    );

    // Auto-named quick skill; mission advances to PLANNING.
    const generated = parseResult(await manager.executeLocal('generate_quick_skill', { lessonId }));
    expect(generated['skillGraphId']).toBeTruthy();
    expect(String(generated['name']).length).toBeGreaterThan(3);
    expect(generated['nodeCount']).toBeGreaterThanOrEqual(2);
    expect(String(generated['note'])).toContain('human must decide');

    // Approval can be REQUESTED by the agent, never granted.
    const approval = parseResult(
      await manager.executeLocal('request_checkpoint_approval', {
        skillGraphId: generated['skillGraphId'],
        reason: 'Autopilot finished learning',
      }),
    );
    expect(approval['status']).toBe('pending');

    // Ledger reflects the whole run.
    const snapshot = parseResult(await manager.executeLocal('read_cherry_context', {}));
    expect((snapshot['pendingApprovals'] as unknown[]).length).toBe(1);
    expect(snapshot['productState']).toBe('planning');
  });
});

describe('fresh-journey tools and mutation sync', () => {
  beforeEach(() => {
    freshDb();
  });

  function makeSyncedContext() {
    const calls: string[] = [];
    const context = makeContext() as ReturnType<typeof makeContext> & {
      mutations: number;
      synced: string[];
    };
    context.mutations = 0;
    context.synced = calls;
    context.setActiveIds = (ids) => {
      if (ids.workspaceId !== undefined) context.workspaceId = ids.workspaceId;
      if (ids.missionId !== undefined) context.missionId = ids.missionId;
      calls.push(JSON.stringify(ids));
    };
    context.onMutation = () => {
      context.mutations += 1;
    };
    return context;
  }

  it('start_apprenticeship creates workspace + mission and makes them active', async () => {
    const context = makeSyncedContext();
    const manager = new WebMcpRegistrationManager(context);
    const result = parseResult(await manager.executeLocal('start_apprenticeship', {}));
    expect(result.workspaceId).toBeTruthy();
    expect(result.missionId).toBeTruthy();
    expect(result.state).toBe('DRAFT');
    expect(String(result.nextAction)).toMatch(/load_lesson/);
    // The shell was told to switch selection — the aperture can advance without a click.
    expect(context.workspaceId).toBe(result.workspaceId);
    expect(context.missionId).toBe(result.missionId);
    expect(context.mutations).toBeGreaterThanOrEqual(1);
  });

  it('start_apprenticeship reuses the active workspace and never loads a source', async () => {
    const context = makeSyncedContext();
    const manager = new WebMcpRegistrationManager(context);
    const first = parseResult(await manager.executeLocal('start_apprenticeship', { workspaceName: 'Mine' }));
    const second = parseResult(
      await manager.executeLocal('start_apprenticeship', { title: 'Second draft' }),
    );
    expect(second.workspaceId).toBe(first.workspaceId);
    expect(second.missionId).not.toBe(first.missionId);
    expect(JSON.stringify(second)).not.toMatch(/lessonId/);
  });

  it('create_workspace and create_mission update the active selection', async () => {
    const context = makeSyncedContext();
    const manager = new WebMcpRegistrationManager(context);
    const workspace = parseResult(await manager.executeLocal('create_workspace', { name: 'Synced' }));
    expect(context.workspaceId).toBe(workspace.workspaceId);
    const mission = parseResult(
      await manager.executeLocal('create_mission', { title: 'M', objective: 'o', definitionOfDone: ['d'] }),
    );
    expect(context.missionId).toBe(mission.missionId);
  });

  it('read-only tools never trigger the mutation callback', async () => {
    const context = makeSyncedContext();
    const manager = new WebMcpRegistrationManager(context);
    await manager.executeLocal('get_cherry_status', {});
    await manager.executeLocal('read_cherry_context', {});
    await manager.executeLocal('list_cherry_capabilities', {});
    expect(context.mutations).toBe(0);
  });

  it('failed mutations do not trigger the mutation callback', async () => {
    const context = makeSyncedContext();
    const manager = new WebMcpRegistrationManager(context);
    const shaped = (await manager.executeLocal('create_workspace', { name: '' })) as { isError?: boolean };
    expect(shaped.isError).toBe(true);
    expect(context.mutations).toBe(0);
  });

  it('get_cherry_status reports state, ids, and the active tool set honestly', async () => {
    const context = makeSyncedContext();
    const manager = new WebMcpRegistrationManager(context);
    const before = parseResult(await manager.executeLocal('get_cherry_status', {}));
    expect(before.productState).toBe('empty');
    expect(before.activeWorkspaceId).toBeNull();
    expect(before.activeTools).toContain('start_apprenticeship');
    await manager.executeLocal('start_apprenticeship', {});
    const after = parseResult(await manager.executeLocal('get_cherry_status', {}));
    expect(after.productState).toBe('onboarding');
    expect(after.activeWorkspaceId).toBe(context.workspaceId);
    expect(after.missionState).toBe('DRAFT');
  });
});

describe('WebMCP skill provenance delivery', () => {
  beforeEach(() => {
    freshDb();
  });

  it('reports durable synthetic sample approval state even without a workspace flag', async () => {
    const graph = await makeApprovedCitedSkill(1, false, SYNTHETIC_SAMPLE_APPROVER);
    const manager = new WebMcpRegistrationManager(makeContext());

    const summary = parseResult(await manager.executeLocal('get_skill', { skillId: graph.id }));
    expect(summary).toMatchObject({
      sample: true,
      approvalKind: 'synthetic-sample-state',
      sampleNotice: SYNTHETIC_SAMPLE_NOTICE,
    });
    const listed = parseResult(await manager.executeLocal('list_skills', {}));
    expect(listed.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillId: graph.id, sample: true, approvalKind: 'synthetic-sample-state' }),
    ]));
    const recommended = parseResult(await manager.executeLocal('recommend_skills', { task: 'thumbnail hierarchy' }));
    expect(recommended.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillId: graph.id, sample: true, approvalKind: 'synthetic-sample-state' }),
    ]));
  });

  it('serves creator, title, URL, and timestamp in summary and every file part without changing the file hash', async () => {
    const graph = await makeApprovedCitedSkill();
    const manager = new WebMcpRegistrationManager(makeContext());

    const summary = parseResult(await manager.executeLocal('get_skill', { skillId: graph.id }));
    expect(summary.citationCount).toBe(1);
    expect(summary.citations).toEqual([
      {
        creator: 'Creator Lab',
        title: 'The Thumbnail Hierarchy Method',
        url: 'https://www.youtube.com/watch?v=abc123xyz00',
        timestampSeconds: 75,
      },
    ]);

    const firstResult = await manager.executeLocal('get_skill', { skillId: graph.id, format: 'skill-md' });
    const first = parseResult(firstResult);
    expect(first.citations).toEqual(summary.citations);
    const totalParts = first.totalParts as number;
    const parts: string[] = [];
    let returnedHash = '';
    for (let part = 1; part <= totalParts; part += 1) {
      const raw = await manager.executeLocal('get_skill', { skillId: graph.id, format: 'skill-md', part });
      expect(resultText(raw).length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
      expect(new TextEncoder().encode(resultText(raw)).length).toBeLessThanOrEqual(HARD_CAP_BYTES);
      const parsed = parseResult(raw);
      expect(parsed.citations).toEqual(summary.citations);
      parts.push(parsed.content as string);
      returnedHash = parsed.contentSha256 as string;
    }
    const reassembled = parts.join('');
    const exported = unwrap(await exportSkillFile(graph.id, 'skill-md'));
    expect(reassembled).toBe(exported.content);
    expect(await sha256Text(reassembled)).toBe(returnedHash);
  });

  it('keeps oversized citation sets bounded and parseable', async () => {
    const graph = await makeApprovedCitedSkill(8, true);
    const manager = new WebMcpRegistrationManager(makeContext());

    for (const args of [
      { skillId: graph.id },
      { skillId: graph.id, format: 'skill-md', part: 1 },
    ]) {
      const result = await manager.executeLocal('get_skill', args);
      const text = resultText(result);
      expect(text.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
      expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(HARD_CAP_BYTES);
      const parsed = parseResult(result);
      expect(parsed.citationCount).toBe(8);
      expect((parsed.citations as unknown[]).length).toBeGreaterThan(0);
      expect((parsed.citations as unknown[]).length).toBeLessThanOrEqual(3);
      expect(parsed.citationsTruncated).toBe(true);
    }
  });

  it('never cites unrelated evidence from the same mission', async () => {
    const graph = await makeApprovedCitedSkill();
    unwrap(await addEvidence({
      workspaceId: graph.workspaceId,
      missionId: graph.missionId,
      sourceType: 'video',
      sourceCreator: 'Unrelated Creator',
      sourceTitle: 'A different method',
      sourceUri: 'https://www.youtube.com/watch?v=unrelated01',
      timestampSeconds: 9,
      claim: 'This record is intentionally not referenced by the skill.',
      provenanceMethod: 'user_typed',
    }));
    const manager = new WebMcpRegistrationManager(makeContext());

    const summary = parseResult(await manager.executeLocal('get_skill', { skillId: graph.id }));
    expect(summary.citationCount).toBe(1);
    expect(JSON.stringify(summary.citations)).not.toContain('Unrelated Creator');
  });

  it('keeps maximal summaries and escape-heavy file parts valid JSON and exactly reassemblable', async () => {
    const graph = await makeMaximalEscapedSkill();
    const manager = new WebMcpRegistrationManager(makeContext());

    const summaryResult = await manager.executeLocal('get_skill', { skillId: graph.id });
    const summaryText = resultText(summaryResult);
    expect(summaryText.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
    const summary = parseResult(summaryResult);
    expect(summary.stepCount).toBe(100);
    expect(summary.guardrailCount).toBe(100);
    expect(summary.evaluationCount).toBe(100);
    expect(summary.stepsTruncated).toBe(true);
    expect(summary.guardrailsTruncated).toBe(true);
    expect(summary.evaluationsTruncated).toBe(true);
    expect(summary.sample).toBe(false);
    expect(summary.approvalKind).toBe('human-decision');

    const first = parseResult(await manager.executeLocal('get_skill', { skillId: graph.id, format: 'skill-md' }));
    const parts: string[] = [];
    for (let part = 1; part <= (first.totalParts as number); part += 1) {
      const result = await manager.executeLocal('get_skill', { skillId: graph.id, format: 'skill-md', part });
      const text = resultText(result);
      expect(text.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
      expect(() => JSON.parse(text)).not.toThrow();
      parts.push(parseResult(result).content as string);
    }
    const reassembled = parts.join('');
    const exported = unwrap(await exportSkillFile(graph.id, 'skill-md'));
    expect(reassembled).toBe(redactToolText(exported.content));
    expect(reassembled).not.toContain('sk_live_example123');
    expect(reassembled).not.toContain('ghp_x');
    expect(exported.content).toContain('sk_live_example123');
    expect(exported.content).toContain('ghp_x');
    expect(await sha256Text(reassembled)).toBe(first.contentSha256);
  });
});
