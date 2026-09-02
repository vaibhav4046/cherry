import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from '../setup.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { listWorkItems } from '../../src/cherry/workforce/workforce-service.ts';
import { listEvaluationReports } from '../../src/cherry/workforce/evaluation-service.ts';
import { getPlanForMission } from '../../src/cherry/workforce/mission-plan-service.ts';
import {
  approveMissionPlan,
  createMission,
  getMissionRunBinding,
  getMissionView,
  startMission,
  syncMission,
} from '../../src/cherry/workforce/mission-control-service.ts';
import type { RunnerMission, RunnerMissionNode } from '../../src/cherry/runner-client/runner-api.ts';
import { storePairToken } from '../../src/cherry/runner-client/runner-api.ts';

/**
 * Browser-side coordination against a scripted runner: the mission executor
 * lives on the runner, and the browser mirrors its node states onto work
 * items through legal transitions only. Provider completion alone never
 * reaches SUCCEEDED; only a passed evaluation report does.
 */

function runnerNode(status: RunnerMissionNode['status'], extra: Partial<RunnerMissionNode> = {}): RunnerMissionNode {
  return {
    status,
    attempts: 1,
    jobIds: ['job-1'],
    sandbox: { id: 'sb-1', provider: 'directory', root: 'D:/tmp/sb-1', branchName: null, baseCommit: null, boundary: 'process' },
    host: { hostId: 'mock', kind: 'local-runner', version: null },
    startedAt: '2026-09-02T14:00:00.000Z',
    finishedAt: null,
    evaluation: null,
    lastError: null,
    ...extra,
  };
}

/** The runner as the browser sees it. Node states change only when a test sets `override`. */
class ScriptedRunner {
  missions = new Map<string, RunnerMission>();
  override: Record<string, RunnerMissionNode> = {};
  calls: string[] = [];

  install() {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? 'GET';
      this.calls.push(`${method} ${path}`);
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (path === '/status') return json(200, { version: '1.0.0', paired: true, adapters: [], v2: { adapters: ['agent-host', 'cherry-check', 'mock-host'] } });
      if (path === '/v2/hosts') {
        return json(200, {
          probedAt: '2026-09-02T14:00:00.000Z',
          hosts: [
            { hostId: 'mock', kind: 'local-runner', executable: null, available: true, authenticated: null, version: null, modes: ['mock'], capabilities: ['repository_read', 'repository_write', 'command_execution', 'artifact_write', 'verification'], boundary: 'process', checkedAt: '2026-09-02T14:00:00.000Z', details: { note: 'test host' }, status: 'shipped_tested' },
            { hostId: 'codex', kind: 'codex-cli', executable: null, available: false, authenticated: null, version: null, modes: [], capabilities: [], boundary: 'unknown', checkedAt: '2026-09-02T14:00:00.000Z', details: 'not on PATH', status: 'unavailable' },
          ],
        });
      }
      if (path === '/v2/missions' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { plan: { id: string; missionId: string; workspaceId: string; revision: number; contentHash: string; nodes: Array<{ id: string }> } };
        const id = `mr-${body.plan.id}`;
        const nodes: Record<string, RunnerMissionNode> = {};
        for (const node of body.plan.nodes) nodes[node.id] = runnerNode('pending', { jobIds: [], sandbox: null, host: null, startedAt: null });
        this.missions.set(id, { id, planId: body.plan.id, missionId: body.plan.missionId, workspaceId: body.plan.workspaceId, status: 'validated', revision: body.plan.revision, contentHash: body.plan.contentHash, nodes, createdAt: '2026-09-02T14:00:00.000Z', updatedAt: '2026-09-02T14:00:00.000Z' });
        return json(201, { missionRunId: id });
      }
      const match = /^\/v2\/missions\/([^/]+)(?:\/(start|cancel|decisions))?$/.exec(path);
      if (match) {
        const mission = this.missions.get(match[1]!);
        if (!mission) return json(404, { error: 'not found' });
        if (match[2] === 'start') mission.status = 'running';
        if (match[2] === 'cancel') mission.status = 'cancelled';
        const nodes = { ...mission.nodes, ...this.override };
        const statuses = Object.values(nodes).map((node) => node.status);
        const status = mission.status === 'cancelled' ? 'cancelled' : statuses.every((value) => value === 'succeeded') ? 'succeeded' : statuses.some((value) => value === 'waiting_for_human') ? 'waiting_for_human' : mission.status;
        return json(200, { mission: { ...mission, nodes, status } });
      }
      return json(404, { error: `unexpected ${method} ${path}` });
    });
  }
}

describe('mission run coordination (browser mirror of the runner)', () => {
  let runner: ScriptedRunner;

  beforeEach(() => {
    freshDb();
    storePairToken('pair-token-0123456789');
    runner = new ScriptedRunner();
    runner.install();
  });
  afterEach(() => vi.unstubAllGlobals());

  async function started() {
    const workspace = unwrap(await createWorkspace({ name: 'Coordination' }));
    const created = unwrap(await createMission({ workspaceId: workspace.id, outcome: 'Research this market and produce an evidence-backed launch brief.' }));
    const { mission, plan } = created;
    const view = unwrap(await getMissionView(workspace.id, mission.id));
    if (view.card.requiresApproval) unwrap(await approveMissionPlan(workspace.id, plan.id, plan.revision, 'human'));
    const result = await startMission(workspace.id, mission.id, plan.revision);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const first = plan.nodes.find((node) => node.dependencyIds.length === 0)!.id;
    return { workspaceId: workspace.id, missionId: mission.id, plan, first };
  }

  /** Runner check results keyed by the node's own verification spec ids, as the real runner reports them. */
  function checksFor(plan: { nodes: Array<{ id: string; verificationPlan: Array<{ id: string }> }> }, nodeId: string, status: 'passed' | 'failed') {
    return plan.nodes.find((node) => node.id === nodeId)!.verificationPlan.map((spec) => ({ id: spec.id, name: spec.id, status, detail: status === 'passed' ? 'present' : 'missing' }));
  }

  async function statusOf(workspaceId: string, missionId: string, nodeId: string): Promise<string | undefined> {
    const view = unwrap(await getMissionView(workspaceId, missionId));
    return view.nodes.find((node) => node.node.id === nodeId)?.workItem?.status;
  }

  it('start projects the graph, registers the mission with hashed envelopes, and binds the runner id', async () => {
    const { workspaceId, plan } = await started();
    const binding = await getMissionRunBinding(plan.id);
    expect(binding?.missionRunId).toBe(`mr-${plan.id}`);
    expect(binding?.contentHash).toBe(plan.contentHash);
    const items = await listWorkItems(workspaceId);
    expect(items.length).toBe(plan.nodes.length);
    expect(runner.calls).toEqual(expect.arrayContaining(['GET /status', 'GET /v2/hosts', 'POST /v2/missions', `POST /v2/missions/mr-${plan.id}/start`]));
    expect(runner.missions.get(`mr-${plan.id}`)?.contentHash).toBe(plan.contentHash);
  });

  it('mirrors running, verifying and passed states through legal transitions and records the report', async () => {
    const { workspaceId, missionId, plan, first } = await started();
    runner.override = { [first]: runnerNode('running') };
    unwrap(await syncMission(workspaceId, missionId));
    expect(await statusOf(workspaceId, missionId, first)).toBe('RUNNING');
    runner.override = { [first]: runnerNode('verifying') };
    unwrap(await syncMission(workspaceId, missionId));
    expect(await statusOf(workspaceId, missionId, first)).toBe('VERIFYING');
    // The executor starts the dependants in the same tick the first node passes.
    const second = plan.nodes.find((node) => node.dependencyIds.includes(first))!.id;
    runner.override = {
      [first]: runnerNode('succeeded', { finishedAt: '2026-09-02T14:01:00.000Z', evaluation: { status: 'passed', checks: checksFor(plan, first, 'passed') } }),
      [second]: runnerNode('running', { jobIds: ['job-2'] }),
    };
    const synced = unwrap(await syncMission(workspaceId, missionId));
    expect(await statusOf(workspaceId, missionId, first)).toBe('SUCCEEDED');
    expect(await statusOf(workspaceId, missionId, second)).toBe('RUNNING');
    const reports = await listEvaluationReports(workspaceId, missionId);
    expect(reports.length).toBe(1);
    expect(reports[0]!.nodeId).toBe(first);
    expect(synced.card.status).toBe('running');
    expect(synced.card.activeWorkers).toBe(1);
  });

  it('never marks work succeeded on provider completion alone', async () => {
    const { workspaceId, missionId, first } = await started();
    runner.override = { [first]: runnerNode('running') };
    unwrap(await syncMission(workspaceId, missionId));
    // A runner that claims success without any evaluation report is refused by the orchestrator.
    runner.override = { [first]: runnerNode('succeeded', { evaluation: null }) };
    unwrap(await syncMission(workspaceId, missionId));
    expect(await statusOf(workspaceId, missionId, first)).not.toBe('SUCCEEDED');
    expect(await listEvaluationReports(workspaceId, missionId)).toHaveLength(0);
  });

  it('a failed report retries, the repair passes, and the derived plan status follows', async () => {
    const { workspaceId, missionId, plan, first } = await started();
    runner.override = { [first]: runnerNode('running') };
    unwrap(await syncMission(workspaceId, missionId));
    runner.override = { [first]: runnerNode('failed', { attempts: 1, evaluation: { status: 'failed', checks: checksFor(plan, first, 'failed') }, lastError: 'required check failed' }) };
    unwrap(await syncMission(workspaceId, missionId));
    expect(['RETRYING', 'FAILED']).toContain(await statusOf(workspaceId, missionId, first));
    runner.override = { [first]: runnerNode('running', { attempts: 2, jobIds: ['job-1', 'job-2'] }) };
    unwrap(await syncMission(workspaceId, missionId));
    expect(await statusOf(workspaceId, missionId, first)).toBe('RUNNING');
    runner.override = { [first]: runnerNode('succeeded', { attempts: 2, jobIds: ['job-1', 'job-2'], evaluation: { status: 'passed', checks: checksFor(plan, first, 'passed') } }) };
    unwrap(await syncMission(workspaceId, missionId));
    expect(await statusOf(workspaceId, missionId, first)).toBe('SUCCEEDED');
    const reports = await listEvaluationReports(workspaceId, missionId);
    expect(reports.map((report) => report.status)).toEqual(['failed', 'passed']);
    const stored = await getPlanForMission(workspaceId, missionId);
    expect(stored?.status).toBe('running');
  });
});
