import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelRunnerMission,
  decideRunnerMission,
  getRunnerMission,
  listRunnerHosts,
  startRunnerMission,
  storePairToken,
  submitRunnerMission,
} from '../../src/cherry/runner-client/runner-api.ts';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('runner client: hosts and missions', () => {
  const calls: Call[] = [];
  let next: Response | Error = jsonResponse(200, {});

  beforeEach(() => {
    calls.length = 0;
    storePairToken('pair-token-0123456789');
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (next instanceof Error) throw next;
      return next;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the pairing token and reads host probes', async () => {
    next = jsonResponse(200, { hosts: [{ hostId: 'claude', available: true, boundary: 'process', status: 'shipped_tested' }], probedAt: '2026-09-02T12:00:00.000Z' });
    const result = await listRunnerHosts();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hosts[0]?.hostId).toBe('claude');
    expect(calls[0]?.url).toBe('http://127.0.0.1:47821/v2/hosts');
    expect(new Headers(calls[0]?.init?.headers).get('x-cherry-pair')).toBe('pair-token-0123456789');
  });

  it('submits a plan with its envelopes and returns the mission run id', async () => {
    next = jsonResponse(201, { missionRunId: 'mr-1' });
    const result = await submitRunnerMission({ plan: { id: 'plan-1' }, envelopes: { a: { adapter: 'mock-host' } } });
    expect(result).toEqual({ ok: true, value: { missionRunId: 'mr-1' } });
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ plan: { id: 'plan-1' }, envelopes: { a: { adapter: 'mock-host' } } });
  });

  it('maps runner refusals to the shared error vocabulary', async () => {
    next = jsonResponse(409, { error: 'different hash' });
    expect((await submitRunnerMission({ plan: {}, envelopes: {} })).ok).toBe(false);
    const conflict = await submitRunnerMission({ plan: {}, envelopes: {} });
    expect(!conflict.ok && conflict.error.code).toBe('conflict');
    next = jsonResponse(401, { error: 'pairing token required' });
    const unpaired = await getRunnerMission('mr-1');
    expect(!unpaired.ok && unpaired.error.code).toBe('approval_required');
    next = jsonResponse(404, { error: 'not found' });
    const missing = await startRunnerMission('mr-x');
    expect(!missing.ok && missing.error.code).toBe('not_found');
    next = jsonResponse(400, { error: 'invalid plan' });
    const invalid = await cancelRunnerMission('mr-1');
    expect(!invalid.ok && invalid.error.code).toBe('validation');
  });

  it('reports an unreachable runner as temporary without throwing', async () => {
    next = new Error('ECONNREFUSED');
    const result = await getRunnerMission('mr-1');
    expect(!result.ok && result.error.code).toBe('temporary');
  });

  it('posts a human decision with the approval binding and returns the mission', async () => {
    next = jsonResponse(200, { mission: { id: 'mr-1', status: 'running', nodes: {} } });
    const result = await decideRunnerMission('mr-1', { nodeId: 'publish-approval', decision: 'approved', approvalId: 'ap-1', contentHash: 'abc' });
    expect(result.ok && result.value.id).toBe('mr-1');
    expect(calls[0]?.url).toBe('http://127.0.0.1:47821/v2/missions/mr-1/decisions');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ nodeId: 'publish-approval', approvalId: 'ap-1' });
  });
});
