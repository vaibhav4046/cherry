import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import {
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  WORK_ITEM_TRANSITIONS,
  canTransition,
  hostSatisfies,
  nextRunAt,
  sortAttention,
  validateSchedule,
  type ExecutionHost,
  type WorkItemStatus,
} from '../../src/cherry/workforce/workforce-model.ts';
import {
  addWorkMessage,
  assignWorkItem,
  attentionQueue,
  createAgentProfile,
  createStarterCrew,
  createWorkItem,
  listAgentProfiles,
  listWorkMessages,
  transitionWorkItem,
} from '../../src/cherry/workforce/workforce-service.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';

async function workspace(): Promise<string> {
  const created = await createWorkspace({ name: 'Workforce test' });
  if (!created.ok) throw new Error(created.error.message);
  return created.value.id;
}

describe('work-item state machine', () => {
  it('permits exactly the specified transitions', () => {
    expect(canTransition('DRAFT', 'READY')).toBe(true);
    expect(canTransition('READY', 'QUEUED')).toBe(true);
    expect(canTransition('QUEUED', 'LEASED')).toBe(true);
    expect(canTransition('LEASED', 'RUNNING')).toBe(true);
    expect(canTransition('RUNNING', 'VERIFYING')).toBe(true);
    expect(canTransition('VERIFYING', 'SUCCEEDED')).toBe(true);
    expect(canTransition('FAILED', 'QUEUED')).toBe(true);
  });

  it('refuses shortcuts to success and exits from terminal states', () => {
    expect(canTransition('DRAFT', 'SUCCEEDED')).toBe(false);
    expect(canTransition('RUNNING', 'SUCCEEDED')).toBe(false);
    expect(canTransition('QUEUED', 'RUNNING')).toBe(false);
    expect(canTransition('SUCCEEDED', 'QUEUED')).toBe(false);
    expect(canTransition('CANCELLED', 'READY')).toBe(false);
    const states = Object.keys(WORK_ITEM_TRANSITIONS) as WorkItemStatus[];
    for (const state of states) {
      // SUCCEEDED is reachable from VERIFYING only.
      if (state !== 'VERIFYING') expect(WORK_ITEM_TRANSITIONS[state]).not.toContain('SUCCEEDED');
    }
  });
});

describe('schedule validation and next-run math', () => {
  it('enforces interval bounds of 5 minutes to 30 days', () => {
    expect(validateSchedule({ kind: 'interval', everyMinutes: MIN_INTERVAL_MINUTES - 1, startAt: '2026-09-01T00:00:00Z' })).not.toEqual([]);
    expect(validateSchedule({ kind: 'interval', everyMinutes: MAX_INTERVAL_MINUTES + 1, startAt: '2026-09-01T00:00:00Z' })).not.toEqual([]);
    expect(validateSchedule({ kind: 'interval', everyMinutes: 30, startAt: '2026-09-01T00:00:00Z' })).toEqual([]);
  });

  it('requires a valid IANA time zone for daily and weekly schedules', () => {
    expect(validateSchedule({ kind: 'daily', localTime: '09:30', timeZone: 'Europe/London' })).toEqual([]);
    expect(validateSchedule({ kind: 'daily', localTime: '09:30', timeZone: 'Not/AZone' })).not.toEqual([]);
    expect(validateSchedule({ kind: 'weekly', weekdays: [1, 3], localTime: '07:00', timeZone: 'Asia/Kolkata' })).toEqual([]);
    expect(validateSchedule({ kind: 'weekly', weekdays: [], localTime: '07:00', timeZone: 'Asia/Kolkata' })).not.toEqual([]);
    expect(validateSchedule({ kind: 'weekly', weekdays: [7], localTime: '07:00', timeZone: 'Asia/Kolkata' })).not.toEqual([]);
  });

  it('computes interval next run deterministically', () => {
    const spec = { kind: 'interval', everyMinutes: 30, startAt: '2026-09-01T10:00:00.000Z' } as const;
    expect(nextRunAt(spec, '2026-09-01T09:00:00.000Z')).toBe('2026-09-01T10:00:00.000Z');
    expect(nextRunAt(spec, '2026-09-01T10:00:00.000Z')).toBe('2026-09-01T10:30:00.000Z');
    expect(nextRunAt(spec, '2026-09-01T10:29:59.000Z')).toBe('2026-09-01T10:30:00.000Z');
  });

  it('daily next run is DST-aware in Europe/London', () => {
    // 2026-03-29: London springs forward (01:00 GMT -> 02:00 BST).
    // Before the change, 09:00 local = 09:00Z; after it, 09:00 local = 08:00Z.
    expect(nextRunAt({ kind: 'daily', localTime: '09:00', timeZone: 'Europe/London' }, '2026-03-28T10:00:00.000Z')).toBe('2026-03-29T08:00:00.000Z');
    expect(nextRunAt({ kind: 'daily', localTime: '09:00', timeZone: 'Europe/London' }, '2026-03-27T10:00:00.000Z')).toBe('2026-03-28T09:00:00.000Z');
  });

  it('weekly next run lands on the requested weekday in the zone', () => {
    // 2026-08-31 is a Monday. From Sunday 30th, next Monday 09:00 IST = 03:30Z.
    const next = nextRunAt({ kind: 'weekly', weekdays: [1], localTime: '09:00', timeZone: 'Asia/Kolkata' }, '2026-08-30T12:00:00.000Z');
    expect(next).toBe('2026-08-31T03:30:00.000Z');
  });

  it('manual never schedules; a past once schedule returns null', () => {
    expect(nextRunAt({ kind: 'manual' }, '2026-09-01T00:00:00Z')).toBeNull();
    expect(nextRunAt({ kind: 'once', runAt: '2026-01-01T00:00:00Z' }, '2026-09-01T00:00:00Z')).toBeNull();
    expect(nextRunAt({ kind: 'once', runAt: '2026-09-02T00:00:00.000Z' }, '2026-09-01T00:00:00Z')).toBe('2026-09-02T00:00:00.000Z');
  });
});

describe('host capability routing', () => {
  const host: ExecutionHost = {
    id: 'h1',
    workspaceId: 'ws',
    kind: 'local-runner',
    name: 'Runner',
    status: 'available',
    capabilities: ['command_execution', 'artifact_write', 'verification'],
    lastSeenAt: null,
    publicConfig: {},
    revision: 1,
  };

  it('routes only when every required capability is present', () => {
    expect(hostSatisfies(host, ['command_execution'])).toBe(true);
    expect(hostSatisfies(host, ['command_execution', 'verification'])).toBe(true);
    expect(hostSatisfies(host, ['browser_vision'])).toBe(false);
    expect(hostSatisfies(host, ['command_execution', 'network'])).toBe(false);
  });
});

describe('workforce service', () => {
  beforeEach(() => {
    freshDb();
  });

  it('creates the five-agent starter crew once, editable and deletable', async () => {
    const workspaceId = await workspace();
    const crew = await createStarterCrew(workspaceId);
    expect(crew.ok).toBe(true);
    if (!crew.ok) return;
    expect(crew.value.profiles.map((profile) => profile.name)).toEqual(['Lead', 'Researcher', 'Designer', 'Builder', 'Verifier']);
    expect(crew.value.crew.memberAgentIds).toHaveLength(5);
    // Profiles are configurations, not running models.
    expect(crew.value.profiles.every((profile) => profile.status === 'idle')).toBe(true);

    const again = await createStarterCrew(workspaceId);
    expect(again.ok).toBe(false);

    const archived = await import('../../src/cherry/workforce/workforce-service.ts').then((module) =>
      module.archiveAgentProfile(workspaceId, crew.value.profiles[4]!.id),
    );
    expect(archived.ok).toBe(true);
    expect((await listAgentProfiles(workspaceId)).map((profile) => profile.name)).not.toContain('Verifier');
  });

  it('walks a work item through the legal path and blocks the illegal one', async () => {
    const workspaceId = await workspace();
    const item = await createWorkItem({
      workspaceId,
      title: 'Summarise the Karpathy lesson',
      objective: 'Produce a briefing doc from the approved skill',
      definitionOfDone: ['briefing.md exists'],
    });
    expect(item.ok).toBe(true);
    if (!item.ok) return;
    expect(item.value.status).toBe('DRAFT');

    // Illegal: DRAFT cannot jump to RUNNING or SUCCEEDED.
    expect((await transitionWorkItem(workspaceId, item.value.id, 'RUNNING')).ok).toBe(false);
    expect((await transitionWorkItem(workspaceId, item.value.id, 'SUCCEEDED')).ok).toBe(false);

    for (const to of ['READY', 'QUEUED', 'LEASED', 'RUNNING', 'VERIFYING', 'SUCCEEDED'] as const) {
      const moved = await transitionWorkItem(workspaceId, item.value.id, to);
      expect(moved.ok, `transition to ${to}`).toBe(true);
    }
    // Terminal: no way out of SUCCEEDED.
    expect((await transitionWorkItem(workspaceId, item.value.id, 'QUEUED')).ok).toBe(false);
  });

  it('rejects a stale revision instead of silently overwriting', async () => {
    const workspaceId = await workspace();
    const item = await createWorkItem({ workspaceId, title: 'Stale test', objective: 'x', definitionOfDone: ['y'] });
    if (!item.ok) throw new Error('setup');
    const first = await transitionWorkItem(workspaceId, item.value.id, 'READY', { expectedRevision: 1 });
    expect(first.ok).toBe(true);
    const stale = await transitionWorkItem(workspaceId, item.value.id, 'QUEUED', { expectedRevision: 1 });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.message).toMatch(/revision/i);
  });

  it('assignment requires real agents in the same workspace', async () => {
    const workspaceId = await workspace();
    const agent = await createAgentProfile({ workspaceId, name: 'Solo', role: 'build' });
    if (!agent.ok) throw new Error('setup');
    const item = await createWorkItem({ workspaceId, title: 'Assign test', objective: 'x', definitionOfDone: ['y'] });
    if (!item.ok) throw new Error('setup');

    expect((await assignWorkItem(workspaceId, item.value.id, ['ag_missing'])).ok).toBe(false);
    const assigned = await assignWorkItem(workspaceId, item.value.id, [agent.value.id]);
    expect(assigned.ok).toBe(true);
    if (assigned.ok) expect(assigned.value.assignedAgentIds).toEqual([agent.value.id]);
  });

  it('records thread messages and emits proof events for every mutation', async () => {
    const workspaceId = await workspace();
    const item = await createWorkItem({ workspaceId, title: 'Thread test', objective: 'x', definitionOfDone: ['y'] });
    if (!item.ok) throw new Error('setup');
    const message = await addWorkMessage(workspaceId, item.value.id, { actorType: 'human', kind: 'message', body: 'Kick-off note' });
    expect(message.ok).toBe(true);
    expect((await listWorkMessages(workspaceId, item.value.id)).map((entry) => entry.body)).toContain('Kick-off note');

    const events = await listProofEvents(workspaceId, 50);
    const types = events.map((event) => event.type);
    expect(types).toContain('work.item_created');
    expect(types).toContain('work.message_added');
  });

  it('attention queue surfaces waiting and failed work sorted by consequence', async () => {
    const workspaceId = await workspace();
    const waiting = await createWorkItem({ workspaceId, title: 'Needs a human', objective: 'x', definitionOfDone: ['y'] });
    const failing = await createWorkItem({ workspaceId, title: 'Broke', objective: 'x', definitionOfDone: ['y'] });
    if (!waiting.ok || !failing.ok) throw new Error('setup');
    for (const to of ['READY', 'QUEUED', 'LEASED', 'RUNNING', 'WAITING_FOR_HUMAN'] as const) {
      await transitionWorkItem(workspaceId, waiting.value.id, to);
    }
    for (const to of ['READY', 'QUEUED', 'LEASED', 'FAILED'] as const) {
      await transitionWorkItem(workspaceId, failing.value.id, to);
    }
    const queue = await attentionQueue(workspaceId);
    const kinds = queue.map((entry) => entry.kind);
    expect(kinds).toContain('waiting_for_human');
    expect(kinds).toContain('failed_run');
    expect(kinds.indexOf('waiting_for_human')).toBeLessThan(kinds.indexOf('failed_run'));
  });

  it('sortAttention orders by consequence then age without fake urgency', () => {
    const sorted = sortAttention([
      { id: 'a', kind: 'memory_proposal', title: 'm', objectType: 'memory', objectId: 'x', consequence: 40, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', kind: 'approval', title: 'a', objectType: 'approval', objectId: 'y', consequence: 90, createdAt: '2026-01-02T00:00:00Z' },
      { id: 'c', kind: 'approval', title: 'a2', objectType: 'approval', objectId: 'z', consequence: 90, createdAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['c', 'b', 'a']);
  });
});
