import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { createMission, createWorkspace, updateMission } from '../../src/cherry/mission/mission-service.ts';
import { draftSkillGraph, requestSkillGraphApproval, reviseSkillGraph } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { runVerification } from '../../src/cherry/verify/verification-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import type { Evaluation } from '../../src/cherry/skillgraph/skillgraph-model.ts';

async function fixture(evaluations: Evaluation[]) {
  const workspace = unwrap(await createWorkspace({ name: 'Verification boundary' }));
  const mission = unwrap(await createMission({
    workspaceId: workspace.id,
    title: 'Fail closed',
    objective: 'Never turn missing evidence into a pass',
    definitionOfDone: ['Required checks pass'],
  }));
  const initial = unwrap(await draftSkillGraph({
    workspaceId: workspace.id,
    missionId: mission.id,
    name: 'Fail-closed verification',
    purpose: 'Prove required checks ran',
    nodes: [{ kind: 'verification', title: 'Run checks', goal: 'Record positive evidence' }],
  }));
  const graph = unwrap(await reviseSkillGraph(initial.id, { evaluations }, 'Set adversarial checks'));
  unwrap(await updateMission(mission.id, { skillGraphId: graph.id }));
  return { workspace, mission, graph };
}

describe('verification authority boundary', () => {
  beforeEach(() => freshDb());

  it.each([
    ['command', 'blocked'],
    ['manual', 'skipped'],
  ] as const)('does not pass a required %s check that is %s', async (type, expectedStatus) => {
    const { mission } = await fixture([{ id: `required-${type}`, name: `Required ${type}`, type, severity: 'blocking', config: {} }]);
    const report = unwrap(await runVerification({ missionId: mission.id }));
    expect(report.status).toBe('failed');
    expect(report.blockingFailures).toBe(1);
    expect(report.results[0]?.status).toBe(expectedStatus);
  });

  it('requires positive runtime observation but accepts an observed clean preview', async () => {
    const { mission } = await fixture([{ id: 'runtime', name: 'Preview has no errors', type: 'runtime', severity: 'blocking', config: {} }]);
    const unseen = unwrap(await runVerification({ missionId: mission.id }));
    expect(unseen).toMatchObject({ status: 'failed', blockingFailures: 1 });
    expect(unseen.results[0]).toMatchObject({ status: 'blocked', errorCode: 'runtime_not_observed' });

    const observed = unwrap(await runVerification({ missionId: mission.id, previewErrors: [] }));
    expect(observed).toMatchObject({ status: 'passed', blockingFailures: 0 });
  });

  it('refuses empty or advisory-only checks at both approval and verification', async () => {
    const empty = await fixture([]);
    await expect(requestSkillGraphApproval(empty.graph.id, 'No checks', 'user')).resolves.toMatchObject({ ok: false });
    await expect(runVerification({ missionId: empty.mission.id })).resolves.toMatchObject({ ok: false });

    freshDb();
    const advisory = await fixture([{ id: 'note', name: 'Optional note', type: 'manual', severity: 'info', config: {} }]);
    await expect(requestSkillGraphApproval(advisory.graph.id, 'No required checks', 'user')).resolves.toMatchObject({ ok: false });
    await expect(runVerification({ missionId: advisory.mission.id })).resolves.toMatchObject({ ok: false });
  });

  it('uses the graph hash as positive evidence when no artifact files exist', async () => {
    const { mission } = await fixture([{ id: 'hash', name: 'Hashes recompute', type: 'hash', severity: 'blocking', config: {} }]);
    const report = unwrap(await runVerification({ missionId: mission.id }));
    expect(report.status).toBe('passed');
    expect(report.results[0]?.evidence.join(' ')).toContain('Skill graph');
    expect(report.results[0]?.evidence.join(' ')).not.toContain('No files');
  });
});
