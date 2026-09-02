// @vitest-environment node
// Runs in the Node environment on purpose: jsdom's AbortSignal is rejected by Node's fetch, and this
// test talks to a real runner process over HTTP exactly as the browser does.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { listEvaluationReports } from '../../src/cherry/workforce/evaluation-service.ts';
import { runnerStatus, storePairToken } from '../../src/cherry/runner-client/runner-api.ts';
import { approveMissionPlan, createMission, decideMissionNode, getMissionView, startMission, syncMission } from '../../src/cherry/workforce/mission-control-service.ts';

/**
 * The browser mirror against a real runner process (mock host, slowed down so
 * concurrency is observable): the browser must see two nodes RUNNING at the
 * same time and every finished node must carry an evaluation before SUCCEEDED.
 * Skipped when the default runner port is already taken by a real runner.
 */

const PAIR_TOKEN = 'integration-pair-token-0123456789';

// The runner client keeps the pairing token in sessionStorage; Node has none, so provide the same surface.
const memoryStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => void memoryStorage.set(key, String(value)),
    removeItem: (key: string) => void memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
    key: (index: number) => [...memoryStorage.keys()][index] ?? null,
    get length() {
      return memoryStorage.size;
    },
  },
});
let runner: ChildProcess | null = null;
let root = '';
let available = false;
let runnerOutput = '';

async function startRunner(): Promise<boolean> {
  root = mkdtempSync(join(tmpdir(), 'cherry-mirror-'));
  const child = spawn(
    process.execPath,
    ['runner/server.mjs', '--root', root, '--state', join(root, '.state'), '--allow-mock-host', '--mock-delay-ms', '2500', '--concurrency', '3'],
    { env: { ...process.env, CHERRY_RUNNER_TOKEN: PAIR_TOKEN }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  runner = child;
  return new Promise((resolve) => {
    let output = '';
    const timer = setTimeout(() => resolve(false), 15_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      runnerOutput += chunk.toString();
      if (output.includes('listening on')) {
        clearTimeout(timer);
        resolve(true);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      runnerOutput += chunk.toString();
      if (/EADDRINUSE/.test(output)) {
        clearTimeout(timer);
        resolve(false);
      }
    });
    child.on('exit', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

describe('mission mirror against a real runner process', () => {
  beforeAll(async () => {
    const probe = await runnerStatus();
    if (probe.reachable) return; // a real runner owns the port; leave it alone
    available = await startRunner();
  }, 30_000);
  afterAll(() => {
    runner?.kill();
    if (root) rmSync(root, { recursive: true, force: true });
  });
  beforeEach(() => {
    freshDb();
    storePairToken(PAIR_TOKEN);
  });

  it('sees two nodes running at once, then only verified nodes as succeeded', async () => {
    if (!available) return;
    const workspace = unwrap(await createWorkspace({ name: 'Mirror' }));
    const { mission, plan } = unwrap(await createMission({ workspaceId: workspace.id, outcome: 'Audit Cherry against its strongest competitor, fix the highest-impact onboarding defect, and prepare the launch content. Nothing public without approval.' }));
    const view = unwrap(await getMissionView(workspace.id, mission.id));
    if (view.card.requiresApproval) unwrap(await approveMissionPlan(workspace.id, plan.id, plan.revision, 'human'));
    const started = await startMission(workspace.id, mission.id, plan.revision);
    expect(started.ok, JSON.stringify(started)).toBe(true);

    let maxRunning = 0;
    let finalStatus = '';
    const seenStatuses = new Set<string>();
    for (let tick = 0; tick < 60; tick += 1) {
      const synced = unwrap(await syncMission(workspace.id, mission.id));
      const statuses = synced.nodes.map((node) => node.status);
      for (const status of statuses) seenStatuses.add(status);
      maxRunning = Math.max(maxRunning, statuses.filter((status) => status === 'running').length);
      finalStatus = synced.card.status;
      if (['succeeded', 'failed', 'cancelled', 'waiting_for_human'].includes(finalStatus)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (maxRunning < 2 || !['succeeded', 'waiting_for_human'].includes(finalStatus)) {
      const last = unwrap(await getMissionView(workspace.id, mission.id));
      const nodes = Object.values(last.runner?.nodes ?? {}).map((node) => [node.status, node.attempts, node.lastError, node.host?.hostId ?? null, (node as unknown as { hostResult?: { reason?: string; stdoutTail?: string } }).hostResult?.reason ?? null, (node as unknown as { hostResult?: { stdoutTail?: string } }).hostResult?.stdoutTail?.slice(0, 160) ?? null, node.evaluation?.checks?.filter((check) => check.status !== 'passed').map((check) => `${check.id}:${check.detail}`)]);
      console.log('DIAG runner nodes', JSON.stringify(nodes).slice(0, 2500));
      console.log('DIAG runner output', runnerOutput.slice(-1500));
    }
    expect(maxRunning, `statuses seen: ${[...seenStatuses].join(', ')}`).toBeGreaterThanOrEqual(2);
    const final = unwrap(await getMissionView(workspace.id, mission.id));
    const reports = await listEvaluationReports(workspace.id, mission.id);
    for (const node of final.nodes) {
      if (node.status === 'succeeded') expect(reports.some((report) => report.nodeId === node.node.id && report.status === 'passed'), `${node.node.id} has a passed report`).toBe(true);
    }
    expect(['succeeded', 'waiting_for_human']).toContain(finalStatus);

    // The person decides the parked node; the runner finishes and the mirror reads Done.
    if (finalStatus === 'waiting_for_human') {
      const parked = unwrap(await getMissionView(workspace.id, mission.id));
      const waiting = parked.nodes.find((node) => node.status === 'waiting_for_human');
      expect(waiting, 'a node waits for a person').toBeTruthy();
      const decided = await decideMissionNode(workspace.id, mission.id, waiting!.node.id, 'approved', parked.plan.approvalId, 'human');
      expect(decided.ok, JSON.stringify(decided)).toBe(true);
      let status = decided.ok ? decided.value.card.status : '';
      for (let tick = 0; tick < 40 && status !== 'succeeded'; tick += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        status = unwrap(await syncMission(workspace.id, mission.id)).card.status;
      }
      if (status !== 'succeeded') {
        const last = unwrap(await getMissionView(workspace.id, mission.id));
        console.log('DIAG after decision', JSON.stringify(last.nodes.map((node) => [node.node.id, node.status, node.workItem?.status, node.runner?.status, node.runner?.lastError])));
      }
      expect(status).toBe('succeeded');
    }
  }, 120_000);
});
