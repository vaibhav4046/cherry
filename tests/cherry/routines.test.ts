import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace, createMission } from '../../src/cherry/mission/mission-service.ts';
import {
  decideSkillGraphApproval,
  draftSkillGraph,
  requestSkillGraphApproval,
} from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import {
  approveRoutine,
  computeRoutineActionHash,
  draftRoutine,
  getRoutine,
  listApprovedSkillGraphs,
  pauseRoutine,
  requestRunNow,
  resumeRoutine,
  setRoutineSchedule,
} from '../../src/cherry/workforce/routines-service.ts';
import type { ScheduleSpec } from '../../src/cherry/workforce/workforce-model.ts';

async function seedApprovedGraph() {
  const workspace = unwrap(await createWorkspace({ name: 'Routines workspace' }));
  const mission = unwrap(await createMission({ workspaceId: workspace.id, title: 'Routine mission', objective: 'Run routine', definitionOfDone: ['done'] }));
  const graph = unwrap(
    await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Nightly digest',
      purpose: 'Summarise the day into one page',
      nodes: [{ kind: 'build', title: 'Summarise', goal: 'Produce the digest' }],
    }),
  );
  const request = unwrap(await requestSkillGraphApproval(graph.id, 'Routine test', 'user'));
  unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));
  return { workspace, graph };
}

async function seedStaleApprovedGraph() {
  const seeded = await seedApprovedGraph();
  const approved = await getDb().skillGraphs.get(seeded.graph.id);
  if (!approved) throw new Error('approved graph was not persisted');
  const stale = {
    ...approved,
    status: 'approved' as const,
    revision: approved.revision + 1,
    approvedRevision: approved.revision,
    updatedAt: new Date(Date.parse(approved.updatedAt) + 1_000).toISOString(),
  };
  await getDb().skillGraphs.put(stale);
  return { workspace: seeded.workspace, graph: stale };
}

const intervalSpec = (): ScheduleSpec => ({ kind: 'interval', everyMinutes: 30, startAt: new Date().toISOString() });

describe('routines service', () => {
  beforeEach(() => {
    freshDb();
  });

  it('refuses to draft over a missing or unapproved skill graph', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Empty workspace' }));
    const missing = await draftRoutine({ workspaceId: workspace.id, skillGraphId: 'sg-nope' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('not_found');

    const draft = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        name: 'Unapproved',
        purpose: 'Still a draft',
        nodes: [{ kind: 'build', title: 'Step', goal: 'Goal' }],
      }),
    );
    expect(await listApprovedSkillGraphs(workspace.id)).toHaveLength(0);
    const refused = await draftRoutine({ workspaceId: workspace.id, skillGraphId: draft.id });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe('approval_required');
  });

  it('does not list a stale approved graph whose approval trails its current revision', async () => {
    const { workspace, graph } = await seedStaleApprovedGraph();

    const eligible = await listApprovedSkillGraphs(workspace.id);

    expect(eligible.map((candidate) => candidate.id)).not.toContain(graph.id);
  });

  it('refuses to draft a routine against a stale approved graph', async () => {
    const { workspace, graph } = await seedStaleApprovedGraph();

    const result = await draftRoutine({ workspaceId: workspace.id, skillGraphId: graph.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('approval_required');
    expect(await getDb().routines.where('workspaceId').equals(workspace.id).count()).toBe(0);
  });

  it('draft -> set schedule -> approve enables the routine with nextRunAt set', async () => {
    const { workspace, graph } = await seedApprovedGraph();
    expect((await listApprovedSkillGraphs(workspace.id)).map((g) => g.id)).toContain(graph.id);

    const routine = unwrap(await draftRoutine({ workspaceId: workspace.id, skillGraphId: graph.id, name: 'Digest run' }));
    expect(routine.enabled).toBe(false);
    expect(routine.schedule).toEqual({ kind: 'manual' });
    expect(routine.missedRunPolicy).toBe('skip');
    expect(routine.approvalId).toBeNull();
    expect(routine.nextRunAt).toBeNull();
    expect(routine.executionHostId).toBe('local-runner');
    expect(routine.skillGraphRevision).toBe(graph.revision);
    expect(routine.revision).toBe(1);

    const scheduled = unwrap(await setRoutineSchedule(workspace.id, routine.id, intervalSpec(), 'skip'));
    expect(scheduled.revision).toBe(2);
    expect(scheduled.enabled).toBe(false);
    // Preview only: nextRunAt is computed but the routine stays disabled.
    expect(scheduled.nextRunAt).toBeTruthy();

    const approved = unwrap(await approveRoutine(workspace.id, routine.id, scheduled.revision));
    expect(approved.enabled).toBe(true);
    expect(approved.approvalId).toBeTruthy();
    expect(approved.approvedActionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(approved.nextRunAt).toBeTruthy();
    expect(Date.parse(approved.nextRunAt!)).toBeGreaterThan(Date.now() - 1000);

    const types = (await listProofEvents(workspace.id)).map((event) => event.type);
    expect(types).toContain('routine.drafted');
    expect(types).toContain('routine.schedule_set');
    expect(types).toContain('routine.approved');
    expect(types).toContain('routine.enabled');
  });

  it('editing the schedule after approval disables the routine and clears the approval', async () => {
    const { workspace, graph } = await seedApprovedGraph();
    const routine = unwrap(await draftRoutine({ workspaceId: workspace.id, skillGraphId: graph.id }));
    unwrap(await setRoutineSchedule(workspace.id, routine.id, intervalSpec(), 'skip'));
    const approved = unwrap(await approveRoutine(workspace.id, routine.id, 2));
    expect(approved.enabled).toBe(true);

    const edited = unwrap(
      await setRoutineSchedule(
        workspace.id,
        routine.id,
        { kind: 'daily', localTime: '09:00', timeZone: 'Europe/London' },
        'run_once_on_reconnect',
      ),
    );
    expect(edited.revision).toBe(3);
    expect(edited.enabled).toBe(false);
    expect(edited.approvalId).toBeNull();
    expect(edited.approvedActionHash).toBeNull();
    expect(edited.missedRunPolicy).toBe('run_once_on_reconnect');
  });

  it('refuses approval with a stale expectedRevision', async () => {
    const { workspace, graph } = await seedApprovedGraph();
    const routine = unwrap(await draftRoutine({ workspaceId: workspace.id, skillGraphId: graph.id }));
    unwrap(await setRoutineSchedule(workspace.id, routine.id, intervalSpec(), 'skip'));

    const stale = await approveRoutine(workspace.id, routine.id, 1);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('conflict');
    expect((await getRoutine(workspace.id, routine.id))!.enabled).toBe(false);
  });

  it('refuses resume without a standing approval', async () => {
    const { workspace, graph } = await seedApprovedGraph();
    const routine = unwrap(await draftRoutine({ workspaceId: workspace.id, skillGraphId: graph.id }));
    unwrap(await setRoutineSchedule(workspace.id, routine.id, intervalSpec(), 'skip'));

    const refused = await resumeRoutine(workspace.id, routine.id);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe('approval_required');
  });

  it('pause keeps the approval and resume re-enables with a recomputed nextRunAt', async () => {
    const { workspace, graph } = await seedApprovedGraph();
    const routine = unwrap(await draftRoutine({ workspaceId: workspace.id, skillGraphId: graph.id }));
    unwrap(await setRoutineSchedule(workspace.id, routine.id, intervalSpec(), 'skip'));
    const approved = unwrap(await approveRoutine(workspace.id, routine.id, 2));

    const paused = unwrap(await pauseRoutine(workspace.id, routine.id));
    expect(paused.enabled).toBe(false);
    expect(paused.nextRunAt).toBeNull();
    expect(paused.approvalId).toBe(approved.approvalId);

    const resumed = unwrap(await resumeRoutine(workspace.id, routine.id));
    expect(resumed.enabled).toBe(true);
    expect(resumed.nextRunAt).toBeTruthy();
    const types = (await listProofEvents(workspace.id)).map((event) => event.type);
    expect(types).toContain('routine.paused');
  });

  it('refuses invalid schedules: too-short interval and bad time zone', async () => {
    const { workspace, graph } = await seedApprovedGraph();
    const routine = unwrap(await draftRoutine({ workspaceId: workspace.id, skillGraphId: graph.id }));

    const tooFrequent = await setRoutineSchedule(
      workspace.id,
      routine.id,
      { kind: 'interval', everyMinutes: 2, startAt: new Date().toISOString() },
      'skip',
    );
    expect(tooFrequent.ok).toBe(false);
    if (!tooFrequent.ok) {
      expect(tooFrequent.error.code).toBe('validation');
      expect(tooFrequent.error.message).toContain('at least 5 minutes');
    }

    const badZone = await setRoutineSchedule(
      workspace.id,
      routine.id,
      { kind: 'daily', localTime: '09:00', timeZone: 'Not/AZone' },
      'skip',
    );
    expect(badZone.ok).toBe(false);
    if (!badZone.ok) {
      expect(badZone.error.code).toBe('validation');
      expect(badZone.error.message).toContain('time zone');
    }
    // A refused save never touches the stored routine.
    expect((await getRoutine(workspace.id, routine.id))!.revision).toBe(1);
  });

  it('computes a stable action hash that changes when the schedule changes', async () => {
    const { workspace, graph } = await seedApprovedGraph();
    const routine = unwrap(await draftRoutine({ workspaceId: workspace.id, skillGraphId: graph.id }));

    const first = await computeRoutineActionHash(routine);
    const second = await computeRoutineActionHash(routine);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);

    const scheduled = unwrap(await setRoutineSchedule(workspace.id, routine.id, intervalSpec(), 'skip'));
    const changed = await computeRoutineActionHash(scheduled);
    expect(changed).not.toBe(first);
  });

  it('requestRunNow records a proof event without pretending anything ran', async () => {
    const { workspace, graph } = await seedApprovedGraph();
    const routine = unwrap(await draftRoutine({ workspaceId: workspace.id, skillGraphId: graph.id }));
    unwrap(await setRoutineSchedule(workspace.id, routine.id, intervalSpec(), 'skip'));
    const approved = unwrap(await approveRoutine(workspace.id, routine.id, 2));

    const requested = unwrap(await requestRunNow(workspace.id, routine.id));
    expect(requested.note).toContain('execution host');
    expect(requested.note).toContain('nothing has run yet');

    const after = (await getRoutine(workspace.id, routine.id))!;
    expect(after.enabled).toBe(approved.enabled);
    expect(after.nextRunAt).toBe(approved.nextRunAt);
    expect(after.lastRunAt).toBeNull();

    const events = await listProofEvents(workspace.id);
    const runEvents = events.filter((event) => event.type === 'routine.run_requested');
    expect(runEvents).toHaveLength(1);
    expect(runEvents[0]!.objectId).toBe(routine.id);
  });
});
