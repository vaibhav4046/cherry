import { invalid } from '../core/errors.ts';
import { ok, type Result } from '../core/result.ts';
import { parseYouTubeUrl } from '../watch/youtube-url.ts';

export const MAX_WATCH_HISTORY_CHARACTERS = 16 * 1024 * 1024;
export const MAX_WATCH_HISTORY_FILE_BYTES = 16 * 1024 * 1024;
const MAX_WATCH_HISTORY_ROWS = 20_000;
const MAX_KEYWORDS_PER_TITLE = 16;
const MAX_TRACKED_KEYWORDS = 4_096;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 90 * DAY_MS;

export interface WatchHistoryEntry {
  videoId: string;
  canonicalUrl: string;
  title: string;
  channel: string | null;
  watchedAt: string | null;
}

export interface WatchHistoryParse {
  entries: WatchHistoryEntry[];
  skippedRows: number;
  truncated?: boolean;
}

export interface WatchHistoryCandidate {
  id: string;
  kind: 'channel' | 'keyword' | 'video';
  label: string;
  reason: string;
  representative: WatchHistoryEntry;
  count: number;
  score: number;
}

type UnknownRecord = Record<string, unknown>;

const STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'before', 'build', 'for', 'from',
  'how', 'into', 'its', 'part', 'that', 'the', 'their', 'this', 'through', 'use',
  'using', 'video', 'what', 'when', 'where', 'with', 'you', 'your', 'youtube',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function rowArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  if (Array.isArray(value['items'])) return value['items'];
  if (Array.isArray(value['watchHistory'])) return value['watchHistory'];
  return null;
}

function channelFromRow(row: UnknownRecord): string | null {
  const subtitles = row['subtitles'];
  if (Array.isArray(subtitles)) {
    for (const subtitle of subtitles) {
      if (!isRecord(subtitle)) continue;
      const name = boundedString(subtitle['name'], 200);
      if (name) return name;
    }
  }
  return boundedString(row['channelName'], 200) ?? boundedString(row['channel'], 200);
}

function watchedAtFromRow(row: UnknownRecord): string | null {
  const raw = boundedString(row['time'], 100)
    ?? boundedString(row['watchedAt'], 100)
    ?? boundedString(row['date'], 100);
  if (!raw || !/^\d{4}-\d{2}-\d{2}T/.test(raw)) return null;
  const milliseconds = Date.parse(raw);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function entryFromRow(value: unknown): WatchHistoryEntry | null {
  if (!isRecord(value)) return null;
  const rawUrl = boundedString(value['titleUrl'], 2048)
    ?? boundedString(value['title_url'], 2048)
    ?? boundedString(value['url'], 2048);
  if (!rawUrl) return null;
  const parsed = parseYouTubeUrl(rawUrl);
  if (!parsed.ok) return null;

  const rawTitle = boundedString(value['title'], 300);
  const title = rawTitle?.replace(/^Watched\s+/i, '').trim() || `YouTube video ${parsed.value.videoId}`;
  return {
    videoId: parsed.value.videoId,
    canonicalUrl: parsed.value.canonicalUrl,
    title,
    channel: channelFromRow(value),
    watchedAt: watchedAtFromRow(value),
  };
}

export function parseTakeoutWatchHistory(raw: string): Result<WatchHistoryParse> {
  if (raw.length > MAX_WATCH_HISTORY_CHARACTERS) {
    return invalid('YouTube history files must be 16 MiB or smaller');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return invalid('This is not valid YouTube Takeout JSON');
  }
  const rows = rowArray(parsed);
  if (!rows) return invalid('This file does not contain a YouTube watch-history list');
  if (rows.length > MAX_WATCH_HISTORY_ROWS) {
    return invalid(`YouTube history is limited to ${MAX_WATCH_HISTORY_ROWS.toLocaleString('en-US')} rows per import`);
  }

  const entries: WatchHistoryEntry[] = [];
  let skippedRows = 0;
  for (const row of rows) {
    const entry = entryFromRow(row);
    if (entry) entries.push(entry);
    else skippedRows += 1;
  }
  return ok({ entries, skippedRows });
}

export function parsePastedYouTubeUrls(raw: string): WatchHistoryParse {
  if (raw.length > MAX_WATCH_HISTORY_CHARACTERS) return { entries: [], skippedRows: 1, truncated: true };
  const entries: WatchHistoryEntry[] = [];
  const seen = new Set<string>();
  const lines: string[] = [];
  let overflowed = false;
  let lineStart = 0;

  // Scan only until the first non-empty row beyond the import limit. This keeps
  // newline-heavy input from allocating an unbounded array of derived strings.
  for (let index = 0; index <= raw.length; index += 1) {
    if (index !== raw.length && raw.charCodeAt(index) !== 10) continue;
    const line = raw.slice(lineStart, index).trim();
    lineStart = index + 1;
    if (!line) continue;
    if (lines.length === MAX_WATCH_HISTORY_ROWS) {
      overflowed = true;
      break;
    }
    lines.push(line);
  }

  let skippedRows = overflowed ? 1 : 0;
  for (const line of lines) {
    const parsed = parseYouTubeUrl(line);
    if (!parsed.ok || !/^https?:\/\//i.test(line) || seen.has(parsed.value.videoId)) {
      skippedRows += 1;
      continue;
    }
    seen.add(parsed.value.videoId);
    entries.push({
      videoId: parsed.value.videoId,
      canonicalUrl: parsed.value.canonicalUrl,
      title: `YouTube video ${parsed.value.videoId}`,
      channel: null,
      watchedAt: null,
    });
  }
  return { entries, skippedRows, ...(overflowed ? { truncated: true } : {}) };
}

function milliseconds(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function preferRepresentative(left: WatchHistoryEntry, right: WatchHistoryEntry): WatchHistoryEntry {
  const leftTime = milliseconds(left.watchedAt) ?? Number.NEGATIVE_INFINITY;
  const rightTime = milliseconds(right.watchedAt) ?? Number.NEGATIVE_INFINITY;
  if (leftTime !== rightTime) return leftTime > rightTime ? left : right;
  const leftKey = `${left.canonicalUrl}\u0000${left.title}\u0000${left.channel ?? ''}`;
  const rightKey = `${right.canonicalUrl}\u0000${right.title}\u0000${right.channel ?? ''}`;
  return compareText(leftKey, rightKey) <= 0 ? left : right;
}

function uniqueVideos(entries: readonly WatchHistoryEntry[]): WatchHistoryEntry[] {
  const byVideo = new Map<string, WatchHistoryEntry>();
  for (let index = 0; index < entries.length && index < MAX_WATCH_HISTORY_ROWS; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const current = byVideo.get(entry.videoId);
    byVideo.set(entry.videoId, current ? preferRepresentative(current, entry) : entry);
  }
  return [...byVideo.values()].sort((left, right) => compareText(left.videoId, right.videoId));
}

function keywords(title: string): string[] {
  const tokens = normalizedKey(title.slice(0, 300))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  return [...new Set(tokens)].sort(compareText).slice(0, MAX_KEYWORDS_PER_TITLE);
}

function groupStats(entries: readonly WatchHistoryEntry[], referenceTime: number | null): {
  count: number;
  recentCount: number;
  recencyBonus: number;
  representative: WatchHistoryEntry;
} {
  const unique = uniqueVideos(entries);
  const representative = unique.reduce(preferRepresentative);
  const latest = milliseconds(representative.watchedAt);
  const recentCount = referenceTime === null ? 0 : unique.filter((entry) => {
    const time = milliseconds(entry.watchedAt);
    return time !== null && referenceTime - time >= 0 && referenceTime - time <= RECENT_WINDOW_MS;
  }).length;
  const ageDays = referenceTime !== null && latest !== null ? Math.floor((referenceTime - latest) / DAY_MS) : 90;
  return {
    count: unique.length,
    recentCount,
    recencyBonus: Math.max(0, 90 - ageDays),
    representative,
  };
}

function groupCandidate(
  kind: 'channel' | 'keyword',
  key: string,
  label: string,
  entries: readonly WatchHistoryEntry[],
  referenceTime: number | null,
): WatchHistoryCandidate {
  const stats = groupStats(entries, referenceTime);
  const videos = stats.recentCount || stats.count;
  const period = stats.recentCount ? ' in 90 days' : '';
  const reason = kind === 'channel'
    ? `${videos} video${videos === 1 ? '' : 's'} from this channel${period}`
    : `${stats.count} videos share \u201c${label}\u201d in their titles`;
  return {
    id: `${kind}:${key}`,
    kind,
    label,
    reason,
    representative: stats.representative,
    count: stats.count,
    score: stats.recentCount * 1000 + stats.count * 100 + stats.recencyBonus,
  };
}

export function rankWatchHistoryCandidates(
  entries: readonly WatchHistoryEntry[],
  limit = 10,
): WatchHistoryCandidate[] {
  if (limit <= 0) return [];
  const unique = uniqueVideos(entries);
  const validTimes = unique.map((entry) => milliseconds(entry.watchedAt)).filter((value): value is number => value !== null);
  const referenceTime = validTimes.length ? Math.max(...validTimes) : null;
  const channelGroups = new Map<string, WatchHistoryEntry[]>();
  const channelLabels = new Map<string, string>();
  const keywordGroups = new Map<string, WatchHistoryEntry[]>();

  for (const entry of unique) {
    if (entry.channel) {
      const key = normalizedKey(entry.channel);
      const group = channelGroups.get(key) ?? [];
      group.push(entry);
      channelGroups.set(key, group);
      const currentLabel = channelLabels.get(key);
      if (!currentLabel || compareText(entry.channel, currentLabel) < 0) channelLabels.set(key, entry.channel);
    }
    for (const keyword of keywords(entry.title)) {
      const existing = keywordGroups.get(keyword);
      if (!existing && keywordGroups.size >= MAX_TRACKED_KEYWORDS) continue;
      const group = existing ?? [];
      group.push(entry);
      keywordGroups.set(keyword, group);
    }
  }

  const patternCandidates: WatchHistoryCandidate[] = [];
  for (const [key, group] of channelGroups) {
    if (uniqueVideos(group).length >= 2) patternCandidates.push(groupCandidate('channel', key, channelLabels.get(key) ?? key, group, referenceTime));
  }
  for (const [key, group] of keywordGroups) {
    if (uniqueVideos(group).length >= 3) patternCandidates.push(groupCandidate('keyword', key, key, group, referenceTime));
  }
  const videoCandidates: WatchHistoryCandidate[] = [];
  for (const entry of unique) {
    const stats = groupStats([entry], referenceTime);
    videoCandidates.push({
      id: `video:${entry.videoId}`,
      kind: 'video',
      label: entry.title,
      reason: entry.title === `YouTube video ${entry.videoId}` ? 'From the URL list you pasted.' : 'A recent video from your history.',
      representative: entry,
      count: 1,
      score: stats.recentCount * 1000 + 100 + stats.recencyBonus,
    });
  }

  const kindOrder = { channel: 0, keyword: 1, video: 2 } as const;
  const compareCandidate = (left: WatchHistoryCandidate, right: WatchHistoryCandidate) => (
    right.score - left.score
    || kindOrder[left.kind] - kindOrder[right.kind]
    || compareText(left.id, right.id)
    || compareText(left.representative.videoId, right.representative.videoId)
  );
  const cappedLimit = Math.min(limit, 10);
  patternCandidates.sort(compareCandidate);
  videoCandidates.sort(compareCandidate);

  // Repeated channels and topics are the import's useful signal. One-off videos
  // fill remaining space, but cannot crowd those patterns out of the bounded list.
  return [...patternCandidates, ...videoCandidates].slice(0, cappedLimit);
}
