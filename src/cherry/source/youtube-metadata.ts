import { fail, ok, type Result } from '../core/result.ts';
import { parseYouTubeUrl } from '../watch/youtube-url.ts';

const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_TITLE_CHARACTERS = 300;

function temporaryFailure(): Result<never> {
  return fail('temporary', 'YouTube title lookup failed. Try again.');
}

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('response too large');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('response too large');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function fetchYouTubeTitle(
  rawUrl: string,
  request?: typeof fetch,
): Promise<Result<{ title: string }>> {
  const parsed = parseYouTubeUrl(rawUrl);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const endpoint = new URL(OEMBED_ENDPOINT);
  endpoint.searchParams.set('url', parsed.value.canonicalUrl);
  endpoint.searchParams.set('format', 'json');

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('request timed out'));
    }, REQUEST_TIMEOUT_MS);
  });
  const requestFn: typeof fetch = request ?? ((input, init) => globalThis.fetch(input, init));

  try {
    const response = await Promise.race([
      requestFn(endpoint.toString(), {
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      }),
      timedOut,
    ]);
    if (!response.ok) return temporaryFailure();
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') return temporaryFailure();

    const text = await readBoundedText(response);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return temporaryFailure();
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return temporaryFailure();
    const rawTitle = (payload as Record<string, unknown>)['title'];
    if (typeof rawTitle !== 'string') return temporaryFailure();
    const title = rawTitle.trim().slice(0, MAX_TITLE_CHARACTERS);
    return title ? ok({ title }) : temporaryFailure();
  } catch {
    return temporaryFailure();
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
