import { invalid } from '../core/errors.ts';
import { ok, type Result } from '../core/result.ts';

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const CHANNEL_HOSTS = new Set(['youtube.com', 'www.youtube.com']);

export interface ParsedYouTubeChannelId {
  channelId: string;
  canonicalUrl: string;
}
/**
 * Accepts only a bare YouTube channel id or the corresponding official,
 * ID-shaped channel URL. Handles and custom names cannot identify an RSS feed
 * without another lookup, so they deliberately fail here.
 */
export function parseYouTubeChannelId(raw: string): Result<ParsedYouTubeChannelId> {
  const trimmed = raw.trim();
  if (!trimmed) return invalid('Enter a YouTube channel ID or /channel/ URL');
  if (CHANNEL_ID_PATTERN.test(trimmed)) {
    return ok({ channelId: trimmed, canonicalUrl: `https://www.youtube.com/channel/${trimmed}` });
  }
  if (trimmed.length > 2048) return invalid('YouTube channel URL is too long');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return invalid('Enter the channel ID from an official YouTube /channel/ URL');
  }

  if (url.protocol !== 'https:') return invalid('YouTube channel URLs must use https');
  if (url.username || url.password) return invalid('YouTube channel URLs cannot contain credentials');
  if (url.port) return invalid('YouTube channel URLs cannot use a custom port');
  if (!CHANNEL_HOSTS.has(url.hostname.toLowerCase())) return invalid('Use an official youtube.com/channel URL');
  if (url.search || url.hash) return invalid('Use the exact youtube.com/channel URL without query or fragment');
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2 || segments[0] !== 'channel' || !CHANNEL_ID_PATTERN.test(segments[1] ?? '')) {
    return invalid('YouTube handles are not channel IDs; paste the /channel/UC… URL');
  }
  const channelId = segments[1]!;
  return ok({ channelId, canonicalUrl: `https://www.youtube.com/channel/${channelId}` });
}
