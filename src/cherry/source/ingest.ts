import type { SourceKind } from './source-model.ts';

export const CHERRY_PRODUCTION_ORIGIN = 'https://cherry-wine.vercel.app';

export interface IngestDraft {
  kind: Extract<SourceKind, 'youtube' | 'article' | 'note'>;
  title: string;
  url: string;
  text: string;
  requiresPermission: boolean;
}

/** Classify capture URLs without accepting lookalike YouTube domains. */
export function classifyIngestUrl(raw: string): IngestDraft['kind'] {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'article';
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') ? 'youtube' : 'article';
  } catch {
    return 'article';
  }
}

/** Read only the values explicitly sent by the capture URL. */
export function ingestDraftFromSearch(search: string): IngestDraft | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const url = params.get('url')?.trim() ?? '';
  const text = params.get('text') ?? '';
  if (!url && !text.trim()) return null;
  return {
    kind: url ? classifyIngestUrl(url) : 'note',
    title: params.get('title')?.trim() ?? '',
    url,
    text,
    requiresPermission: Boolean(url),
  };
}

/** A deterministic, draggable bookmarklet. No page data leaves until it is opened. */
export function bookmarkletHref(origin: string): string {
  const base = new URL(origin).origin;
  return `javascript:(()=>{window.open('${base}/ingest?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank','noopener');})();`;
}

export function bookmarkletOrigin(runtimeOrigin: string): string {
  const runtime = new URL(runtimeOrigin);
  return runtime.hostname === 'localhost' || runtime.hostname.startsWith('127.')
    ? runtime.origin
    : CHERRY_PRODUCTION_ORIGIN;
}
