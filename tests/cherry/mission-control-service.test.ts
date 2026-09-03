import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from '../setup.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { approvePlan, projectPlanToWorkItems } from '../../src/cherry/workforce/mission-plan-service.ts';
import {
  cancelMission,
  createMission,
  getMissionView,
  listMissionCards,
  requestMissionAction,
} from '../../src/cherry/workforce/mission-control-service.ts';

/** No runner is reachable in unit tests: every fetch to loopback fails fast. */
function stubUnreachableRunner() {
  vi.stubGlobal('fetch', async () => {
    throw new Error('ECONNREFUSED');
  });
}

describe('mission control service', () => {
  beforeEach(() => {
    freshDb();
    stubUnreachableRunner();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('files a never-started plan under planned, and needs_you only while a person must decide', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Ledger columns' }));
    // The research brief needs no approval: validated, unbound, nothing running.
    const research = unwrap(await createMission({ workspaceId: workspace.id, outcome: 'Research this market and produce an evidence-backed launch brief.' }));
    expect(unwrap(await getMissionView(workspace.id, research.mission.id)).card.column).toBe('planned');

    // Projected into work items (status ready) but still not on a runner: still planned.
    unwrap(await projectPlanToWorkItems(workspace.id, research.plan.id));
    const ready = unwrap(await getMissionView(workspace.id, research.mission.id));
    expect(ready.card.status).toBe('ready');
    expect(ready.card.column).toBe('planned');

    // The release mission needs a person's approval first, then it is planned.
    const release = unwrap(await createMission({ workspaceId: workspace.id, outcome: 'Ship the release, fix the onboarding defect, and prepare launch content.' }));
    expect(unwrap(await getMissionView(workspace.id, release.mission.id)).card.column).toBe('needs_you');
    unwrap(await approvePlan(workspace.id, release.plan.id, release.plan.revision, 'human'));
    expect(unwrap(await getMissionView(workspace.id, release.mission.id)).card.column).toBe('planned');

    const cancelled = unwrap(await cancelMission(workspace.id, research.mission.id, 'human'));
    expect(cancelled.card.column).toBe('completed');
    const columns = Object.fromEntries((await listMissionCards(workspace.id)).map((card) => [card.missionId, card.column]));
    expect(columns).toEqual({ [research.mission.id]: 'completed', [release.mission.id]: 'planned' });
  });

  it('records who cancelled the mission in the plan status event', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Cancel actor' }));
    const byPerson = unwrap(await createMission({ workspaceId: workspace.id, outcome: 'Research this market and produce an evidence-backed launch brief.' }));
    const byAgent = unwrap(await createMission({ workspaceId: workspace.id, outcome: 'Audit this repository and fix the highest-impact defect.', actorType: 'agent' }));
    unwrap(await cancelMission(workspace.id, byPerson.mission.id));
    unwrap(await cancelMission(workspace.id, byAgent.mission.id, 'agent'));
    const events = await listProofEvents(workspace.id);
    const cancelSummary = (planId: string) => events.find((event) => event.type === 'mission.plan_status' && event.objectId === planId)?.summary ?? '';
    expect(cancelSummary(byPerson.plan.id)).toContain('cancelled by the person');
    expect(cancelSummary(byAgent.plan.id)).toContain('cancelled by the agent');
  });

  it('names the valid node ids when a mission action targets an unknown node', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Unknown node' }));
    const created = unwrap(await createMission({ workspaceId: workspace.id, outcome: 'Research this market and produce an evidence-backed launch brief.' }));
    const unknown = await requestMissionAction(workspace.id, created.mission.id, 'no-such-node', 'May I continue?', 'agent');
    expect(unknown).toMatchObject({ ok: false, error: { code: 'validation' } });
    if (!unknown.ok) {
      expect(unknown.error.message).toContain('no-such-node');
      for (const node of created.plan.nodes) expect(unknown.error.message).toContain(node.id);
    }
    // A known node that is not projected yet keeps the existing, honest answer.
    const known = await requestMissionAction(workspace.id, created.mission.id, created.plan.nodes[0]!.id, 'May I continue?', 'agent');
    expect(known).toMatchObject({ ok: false, error: { code: 'validation' } });
    if (!known.ok) expect(known.error.message).toMatch(/start the mission first/);
  });
});
