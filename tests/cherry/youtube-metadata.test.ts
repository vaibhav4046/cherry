import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchYouTubeTitle } from '../../src/cherry/source/youtube-metadata.ts';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { ...init, headers });
}

describe('explicit YouTube metadata lookup', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('requests the exact public oEmbed endpoint with a locked-down fetch policy', async () => {
    let requestedUrl: string | null = null;
    let requestedInit: RequestInit | undefined;
    const request: typeof fetch = async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return jsonResponse({ title: '  A careful workflow  ' });
    };

    const result = await fetchYouTubeTitle('youtu.be/dQw4w9WgXcQ?t=90', request);

    expect(result).toEqual({ ok: true, value: { title: 'A careful workflow' } });
    expect(requestedUrl).toBe('https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json');
    expect(requestedInit).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
    expect(requestedInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects invalid source URLs without making a request', async () => {
    let requested = false;
    const request: typeof fetch = async () => {
      requested = true;
      return jsonResponse({ title: 'should not be used' });
    };

    const result = await fetchYouTubeTitle('https://youtube.com/redirect?v=dQw4w9WgXcQ', request);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
    expect(requested).toBe(false);
  });

  it('trims and caps returned titles at the SourceRecord limit', async () => {
    const request: typeof fetch = async () => jsonResponse({ title: `  ${'x'.repeat(320)}  ` });

    const result = await fetchYouTubeTitle('dQw4w9WgXcQ', request);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('x'.repeat(300));
      expect(result.value.title).toHaveLength(300);
    }
  });

  it('fails closed for non-success, non-JSON, malformed, and empty-title responses', async () => {
    const responses = [
      new Response('', { status: 404, headers: { 'content-type': 'application/json' } }),
      new Response('{"title":"wrong type"}', { status: 200, headers: { 'content-type': 'text/html' } }),
      new Response('{broken', { status: 200, headers: { 'content-type': 'application/json' } }),
      jsonResponse({ title: '   ' }),
      jsonResponse({ title: 42 }),
    ];

    for (const response of responses) {
      const request: typeof fetch = async () => response;
      const result = await fetchYouTubeTitle('dQw4w9WgXcQ', request);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('temporary');
    }
  });

  it('refuses a response body beyond the fixed metadata byte limit', async () => {
    const request: typeof fetch = async () => jsonResponse({ title: 'x'.repeat(20_000) });

    const result = await fetchYouTubeTitle('dQw4w9WgXcQ', request);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('temporary');
  });

  it('aborts and fails closed when the request exceeds its bounded timeout', async () => {
    vi.useFakeTimers();
    const captured: { signal?: AbortSignal } = {};
    const request: typeof fetch = (_url, init) => {
      if (init?.signal instanceof AbortSignal) captured.signal = init.signal;
      return new Promise<Response>(() => undefined);
    };

    const pending = fetchYouTubeTitle('dQw4w9WgXcQ', request);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('temporary');
    expect(captured.signal?.aborted).toBe(true);
  });

  it('converts thrown request failures into a closed Result', async () => {
    const request: typeof fetch = async () => {
      throw new Error('network details must not escape');
    };

    const result = await fetchYouTubeTitle('dQw4w9WgXcQ', request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('temporary');
      expect(result.error.message).not.toContain('network details');
    }
  });
});
