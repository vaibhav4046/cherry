import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRunnerChannelWatch,
  listRunnerChannelWatchJobs,
  pairRunner,
  registerRunnerChannelWatch,
  runnerStatus,
  unregisterRunnerChannelWatch,
} from '../../src/cherry/runner-client/runner-api.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('runner client channel watches', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('accepts runner-generated base64url tokens containing underscores', async () => {
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ paired: true }));
    const paired = await pairRunner('pair_token_with_underscore');
    expect(paired).toEqual({ ok: true, value: { paired: true } });
    expect(request).toHaveBeenCalledOnce();
  });

  it('reports v2 RSS readiness separately from Scrapling readiness', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      paired: true,
      adapters: ['cherry-verify'],
      scraplingReady: false,
      v2: { adapters: ['youtube-rss-watch'] },
    }));
    const status = await runnerStatus();
    expect(status).toMatchObject({ paired: true, scraplingReady: false, v2Adapters: ['youtube-rss-watch'] });
  });

  it('registers a hashed watch and reads only its filtered jobs endpoint', async () => {
    const request = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ routineId: 'rss-watch:src-1', actionHash: 'a'.repeat(64) }))
      .mockResolvedValueOnce(jsonResponse({ jobId: 'job-manual-1' }, 201))
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ id: 'job-1', status: 'completed' }] }))
      .mockResolvedValueOnce(jsonResponse({ removed: true }));
    const definition = {
      channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
      revision: 1,
      schedule: { kind: 'interval' as const, everyMinutes: 1440, startAt: '2026-09-01T08:00:00.000Z' },
      sourceId: 'src-1',
      workspaceId: 'ws-1',
      actionHash: 'a'.repeat(64),
    };
    expect(await registerRunnerChannelWatch(definition)).toEqual({ ok: true, value: { routineId: 'rss-watch:src-1', actionHash: 'a'.repeat(64) } });
    expect(await checkRunnerChannelWatch(definition)).toEqual({ ok: true, value: { jobId: 'job-manual-1' } });
    expect(await listRunnerChannelWatchJobs(definition)).toMatchObject({ ok: true, value: [{ id: 'job-1' }] });
    expect(await unregisterRunnerChannelWatch(definition)).toEqual({ ok: true, value: { removed: true } });
    expect(request.mock.calls[0]?.[0]).toBe('http://127.0.0.1:47821/v2/channel-watches');
    expect(request.mock.calls[1]?.[0]).toBe('http://127.0.0.1:47821/v2/channel-watches/src-1/check');
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
      workspaceId: 'ws-1',
      revision: 1,
      actionHash: 'a'.repeat(64),
    });
    expect(request.mock.calls[2]?.[0]).toBe(`http://127.0.0.1:47821/v2/channel-watches/src-1/jobs?workspaceId=ws-1&revision=1&actionHash=${'a'.repeat(64)}`);
    expect(request.mock.calls[3]?.[0]).toBe(`http://127.0.0.1:47821/v2/channel-watches/src-1?workspaceId=ws-1&revision=1&actionHash=${'a'.repeat(64)}`);
    expect(request.mock.calls[3]?.[1]).toMatchObject({ method: 'DELETE' });
  });

  it('rejects a registration acknowledgement for a different exact watch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      routineId: 'rss-watch:src-1',
      actionHash: 'b'.repeat(64),
    }, 201));
    const result = await registerRunnerChannelWatch({
      channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
      revision: 1,
      schedule: { kind: 'interval', everyMinutes: 1440, startAt: '2026-09-01T08:00:00.000Z' },
      sourceId: 'src-1',
      workspaceId: 'ws-1',
      actionHash: 'a'.repeat(64),
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'internal' } });
  });
});
