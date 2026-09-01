import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace, createMission, recordRun } from '../../src/cherry/mission/mission-service.ts';
import { draftSkillGraph } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { createProofReceipt } from '../../src/cherry/proof/proof-service.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { appendProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { createSource } from '../../src/cherry/source/source-service.ts';

describe('causal proof receipts', () => {
  beforeEach(() => freshDb());
  it('keeps run/provider identifiers and excludes another mission', async () => {
    const ws = unwrap(await createWorkspace({ name: 'Proof' }));
    const m1 = unwrap(await createMission({ workspaceId: ws.id, title: 'One', objective: 'one', definitionOfDone: ['done'] }));
    const m2 = unwrap(await createMission({ workspaceId: ws.id, title: 'Two', objective: 'two', definitionOfDone: ['done'] }));
    const g1 = unwrap(await draftSkillGraph({ workspaceId: ws.id, missionId: m1.id, name: 'G', purpose: 'p', nodes: [{ kind: 'build', title: 'n', goal: 'g' }] }));
    unwrap(await recordRun({ workspaceId: ws.id, missionId: m1.id, adapter: 'manual', mode: 'manual', status: 'failed', summary: 'run', provider: { kind: 'runner', status: 'failed', verifiedSeparately: true } }));
    await getDb().missions.update(m1.id, { skillGraphId: g1.id });
    const receipt = unwrap(await createProofReceipt(m1.id));
    expect(receipt.runId).toBeTruthy();
    expect(receipt.provider?.kind).toBe('runner');
    expect(receipt.events.every((e) => e.objectId !== m2.id)).toBe(true);
    expect(receipt.truncation?.truncated).toBe(false);
  });

  it('includes a channel check that created the mission source', async () => {
    const ws = unwrap(await createWorkspace({ name: 'RSS proof' }));
    const source = unwrap(await createSource({
      workspaceId: ws.id,
      kind: 'youtube',
      title: 'Generated source',
      url: 'https://www.youtube.com/watch?v=freshVid001',
      permissionAcknowledged: true,
    }));
    const mission = unwrap(await createMission({ workspaceId: ws.id, title: 'From feed', objective: 'Learn it', definitionOfDone: ['done'] }));
    const graph = unwrap(await draftSkillGraph({ workspaceId: ws.id, missionId: mission.id, name: 'Feed skill', purpose: 'p', nodes: [{ kind: 'build', title: 'n', goal: 'g' }] }));
    await getDb().missions.update(mission.id, { lessonId: source.lessonId, skillGraphId: graph.id });
    await appendProofEvents(ws.id, [{
      type: 'channel_watch.checked',
      actorType: 'runner',
      objectType: 'channel_watch',
      objectId: 'anchor-source',
      summary: 'Channel checked; one source saved',
      payload: { createdSourceIds: [source.id] },
    }]);

    const receipt = unwrap(await createProofReceipt(mission.id));
    expect(receipt.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'channel_watch.checked', objectId: 'anchor-source' }),
    ]));
  });
});
