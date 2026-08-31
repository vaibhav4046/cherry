import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { createMission, createWorkspace, transitionMission } from '../../src/cherry/mission/mission-service.ts';
import { draftSkillGraph, requestSkillGraphApproval, decideSkillGraphApproval } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';

describe('approval invariants', () => {
  beforeEach(() => freshDb());

  it('rejects agent mission execution transitions', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Invariant workspace' }));
    const mission = unwrap(await createMission({ workspaceId: workspace.id, title: 'M', objective: 'O', definitionOfDone: ['D'] }));
    const result = await transitionMission(mission.id, 'EXECUTING', 'agent');
    expect(result.ok).toBe(false);
  });

  it('rejects non-human skill approval decisions', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Invariant workspace' }));
    const graph = unwrap(await draftSkillGraph({ workspaceId: workspace.id, name: 'G', purpose: 'P', nodes: [{ kind: 'build', title: 'B', goal: 'G' }] }));
    const request = unwrap(await requestSkillGraphApproval(graph.id, 'review', 'agent'));
    const result = await decideSkillGraphApproval(request.approval.id, 'approved', 'agent', undefined, 'agent');
    expect(result.ok).toBe(false);
  });
});
