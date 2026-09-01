import { ok, type Result } from '../core/result.ts';
import { invalid } from '../core/errors.ts';

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const ALLOWED_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

/** The deliberately small set of official YouTube hosts Cherry recognises. */
export function isYouTubeHost(host: string): boolean {
  return ALLOWED_HOSTS.has(host.toLowerCase().replace(/\.$/, ''));
}

/** Broader safety boundary used for fetch policy; parsing remains allowlisted. */
export function isYouTubeFamilyHost(host: string): boolean {
  const value = host.toLowerCase().replace(/\.$/, '');
  return value === 'youtu.be' || value.endsWith('.youtu.be') || value === 'youtube.com' || value.endsWith('.youtube.com') || value === 'youtube-nocookie.com' || value.endsWith('.youtube-nocookie.com');
}

export interface ParsedYouTubeUrl {
  videoId: string;
  canonicalUrl: string;
  startSeconds: number | null;
}

function parseStart(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/**
 * Accepts standard YouTube URL shapes (watch, share, shorts, embed, live) or a
 * bare 11-character video id. Rejects anything else — the id is the only data
 * Cherry keeps, and only the official iframe player ever plays it.
 */
export function parseYouTubeUrl(raw: string): Result<ParsedYouTubeUrl> {
  const trimmed = raw.trim();
  if (!trimmed) return invalid('Enter a YouTube URL or video id');
  if (trimmed.length > 2048) return invalid('URL is too long');

  if (VIDEO_ID_PATTERN.test(trimmed)) {
    return ok({ videoId: trimmed, canonicalUrl: `https://www.youtube.com/watch?v=${trimmed}`, startSeconds: null });
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return invalid('Not a valid URL or 11-character YouTube video id');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return invalid('Only http(s) YouTube URLs are supported');
  }
  const host = url.hostname.toLowerCase();
  if (!isYouTubeHost(host)) {
    return invalid(`Host ${host} is not a recognised YouTube domain`);
  }

  let videoId: string | null = null;
  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'watch') {
      videoId = url.searchParams.get('v');
    } else if (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live' || segments[0] === 'v') {
      videoId = segments[1] ?? null;
    } else if (url.searchParams.get('v')) {
      videoId = url.searchParams.get('v');
    }
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    return invalid('Could not find an 11-character video id in that URL');
  }

  const startSeconds = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return ok({
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    startSeconds,
  });
}

/** Embed URL for the official iframe player, pinned to the app origin. */
export function embedUrl(videoId: string, origin: string): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    origin,
    rel: '0',
    modestbranding: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}
