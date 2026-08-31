import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace, createMission, recordRun } from '../../src/cherry/mission/mission-service.ts';
import { draftSkillGraph } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { createProofReceipt } from '../../src/cherry/proof/proof-service.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';

describe('causal proof receipts', () => {
  beforeEach(() => freshDb());
  it('keeps run/provider identifiers and excludes another mission', async () => {
    const ws = unwrap(await createWorkspace({ name: 'Proof' }));
    const m1 = unwrap(await createMission({ workspaceId: ws.id, title: 'One', objective: 'one', definitionOfDone: ['done'] }));
    const m2 = unwrap(await createMission({ workspaceId: ws.id, title: 'Two', objective: 'two', definitionOfDone: ['done'] }));
    const g1 = unwrap(await draftSkillGraph({ workspaceId: ws.id, missionId: m1.id, name: 'G', purpose: 'p', nodes: [{ kind: 'build', title: 'n', goal: 'g' }] }));
    unwrap(await recordRun({ workspaceId: ws.id, missionId: m1.id, adapter: 'manual', mode: 'manual', status: 'succeeded', summary: 'run', provider: { kind: 'runner', status: 'completed', verifiedSeparately: true } }));
    await getDb().missions.update(m1.id, { skillGraphId: g1.id });
    const receipt = unwrap(await createProofReceipt(m1.id));
    expect(receipt.runId).toBeTruthy();
    expect(receipt.provider?.kind).toBe('runner');
    expect(receipt.events.every((e) => e.objectId !== m2.id)).toBe(true);
    expect(receipt.truncation?.truncated).toBe(false);
  });
});
