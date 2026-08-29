import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { WebMcpRegistrationManager } from '../../src/cherry/webmcp/registration-manager.ts';
import { GLOBAL_TOOLS, TOOL_STATE_TABLE, buildToolDefinitions, type ToolContext } from '../../src/cherry/webmcp/tool-definitions.ts';
import type { ProductState } from '../../src/cherry/mission/mission-state.ts';

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

describe('WebMCP tool aperture', () => {
  beforeEach(() => {
    freshDb();
  });

  it('never exceeds five state tools plus two global reads', () => {
    const context = makeContext();
    const manager = new WebMcpRegistrationManager(context);
    const states: ProductState[] = ['empty', 'onboarding', 'learning', 'planning', 'execution', 'verification', 'passed'];
    for (const state of states) {
      const names = manager.activeNamesFor(state);
      expect(names.length, state).toBeLessThanOrEqual(7);
      expect(names).toContain('read_cherry_context');
      expect(names).toContain('list_cherry_capabilities');
    }
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
});
