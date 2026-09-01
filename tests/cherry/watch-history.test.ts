import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_WATCH_HISTORY_CHARACTERS,
  parsePastedYouTubeUrls,
  parseTakeoutWatchHistory,
  rankWatchHistoryCandidates,
} from '../../src/cherry/source/watch-history.ts';
import { parseYouTubeChannelId } from '../../src/cherry/source/youtube-channel-id.ts';

const fixture = readFileSync(resolve(process.cwd(), 'tests/fixtures/watch-history.sample.json'), 'utf8');

describe('YouTube channel id parsing', () => {
  it('accepts only a bare channel id or an exact official id-shaped URL', () => {
    const channelId = 'UCSTUDIONORTH12345678901';
    expect(parseYouTubeChannelId(channelId)).toMatchObject({ ok: true, value: { channelId } });
    expect(parseYouTubeChannelId(`https://www.youtube.com/channel/${channelId}`)).toMatchObject({ ok: true, value: { channelId } });
    expect(parseYouTubeChannelId(`https://youtube.com/channel/${channelId}/`)).toMatchObject({ ok: true, value: { channelId } });
  });

  it('rejects handles, lookalikes, credentials, query data, extra paths, and malformed ids', () => {
    const channelId = 'UCSTUDIONORTH12345678901';
    const rejected = [
      '@StudioNorth',
      'https://www.youtube.com/@StudioNorth',
      `https://youtube.com.evil.example/channel/${channelId}`,
      `https://user:secret@www.youtube.com/channel/${channelId}`,
      `https://www.youtube.com/channel/${channelId}?view=1`,
      `https://www.youtube.com/channel/${channelId}/videos`,
      'UC_TOO_SHORT',
    ];
    expect(rejected.map((value) => parseYouTubeChannelId(value).ok)).toEqual(rejected.map(() => false));
  });
});

describe('YouTube watch-history parsing', () => {
  it('reads the bounded Takeout array, canonicalizes official URLs, and skips malformed rows', () => {
    const parsed = parseTakeoutWatchHistory(fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.entries).toHaveLength(8);
    expect(parsed.value.skippedRows).toBe(2);
    expect(parsed.value.entries[0]).toEqual({
      videoId: 'studioN0001',
      canonicalUrl: 'https://www.youtube.com/watch?v=studioN0001',
      title: 'Practical lighting for small rooms',
      channel: 'Studio North',
      youtubeChannelId: 'UCSTUDIONORTH12345678901',
      watchedAt: '2026-08-30T10:00:00.000Z',
    });
    expect(JSON.stringify(parsed.value)).not.toContain('Unselected Takeout details stay transient');
  });

  it('accepts bounded wrapper and field aliases without retaining arbitrary input fields', () => {
    const raw = JSON.stringify({
      items: [{
        title: 'Watched A careful workflow',
        title_url: 'https://music.youtube.com/watch?v=workflow001',
        watchedAt: '2026-08-01T12:00:00.000Z',
        channelName: 'Careful Creator',
        secret: 'do not persist me',
      }],
    });
    const parsed = parseTakeoutWatchHistory(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({
      entries: [{
        videoId: 'workflow001',
        canonicalUrl: 'https://www.youtube.com/watch?v=workflow001',
        title: 'A careful workflow',
        channel: 'Careful Creator',
        youtubeChannelId: null,
        watchedAt: '2026-08-01T12:00:00.000Z',
      }],
      skippedRows: 0,
    });
    expect(JSON.stringify(parsed.value)).not.toContain('secret');

    const legacy = parseTakeoutWatchHistory(JSON.stringify({ watchHistory: [{
      title: 'Watched Legacy row',
      url: 'https://youtu.be/legacyVid01',
      date: '2026-07-01T12:00:00.000Z',
      subtitles: [{ name: 'Legacy Creator' }],
    }] }));
    expect(legacy.ok && legacy.value.entries[0]?.videoId).toBe('legacyVid01');
  });

  it('returns validation failures for malformed JSON, unsupported roots, and oversized input', () => {
    for (const raw of ['{broken', JSON.stringify({ rows: [] }), 'x'.repeat(MAX_WATCH_HISTORY_CHARACTERS + 1)]) {
      const parsed = parseTakeoutWatchHistory(raw);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error.code).toBe('validation');
    }
  });

  it('turns only official YouTube URLs into bounded fallback entries', () => {
    const parsed = parsePastedYouTubeUrls([
      'https://youtu.be/pastedVid01',
      'https://www.youtube.com/watch?v=pastedVid02',
      'https://youtube.com.evil.example/watch?v=badhost0001',
      'javascript:alert(1)',
      'https://youtu.be/pastedVid01',
    ].join('\n'));

    expect(parsed.entries.map((entry) => entry.videoId)).toEqual(['pastedVid01', 'pastedVid02']);
    expect(parsed.skippedRows).toBe(3);
    expect(parsed.entries.every((entry) => entry.title === `YouTube video ${entry.videoId}`)).toBe(true);
  });

  it('bounds newline-heavy pasted input before allocating derived rows', () => {
    const parsed = parsePastedYouTubeUrls(Array.from({ length: 25_000 }, () => 'not-a-youtube-url').join('\n'));

    expect(parsed.entries).toEqual([]);
    expect(parsed.skippedRows).toBe(20_001);
    expect(parsed.truncated).toBe(true);
  });
});

describe('YouTube watch-history candidate ranking', () => {
  it('is input-order independent, bounded to ten, and explains channel and recurring-keyword groups', () => {
    const parsed = parseTakeoutWatchHistory(fixture);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const forward = rankWatchHistoryCandidates(parsed.value.entries);
    const reverse = rankWatchHistoryCandidates([...parsed.value.entries].reverse());
    expect(reverse).toEqual(forward);
    expect(forward.length).toBeLessThanOrEqual(10);
    expect(forward.find((candidate) => candidate.id === 'channel:studio north')).toMatchObject({
      kind: 'channel',
      label: 'Studio North',
      count: 4,
      reason: '4 videos from this channel in 90 days',
      representative: { videoId: 'studioN0001' },
    });
    expect(forward.find((candidate) => candidate.id === 'keyword:lighting')).toMatchObject({
      kind: 'keyword', label: 'lighting', count: 3,
    });
  });

  it('requires three unique videos for keywords and does not inflate groups with a repeated video', () => {
    const rows = ([
      ['repeatVid01', 'Design reliable cards', 'Channel A', '2026-08-03T00:00:00.000Z'],
      ['repeatVid01', 'Design reliable cards', 'Channel A', '2026-08-02T00:00:00.000Z'],
      ['secondVid01', 'Design reliable forms', 'Channel A', '2026-08-01T00:00:00.000Z'],
    ] as const).map(([videoId, title, channel, watchedAt]) => ({ videoId, title, channel, youtubeChannelId: null, watchedAt, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}` }));
    const ranked = rankWatchHistoryCandidates(rows);

    expect(ranked.find((candidate) => candidate.id === 'channel:channel a')?.count).toBe(2);
    expect(ranked.some((candidate) => candidate.id === 'keyword:design')).toBe(false);
    expect(ranked.some((candidate) => candidate.id === 'keyword:reliable')).toBe(false);
  });

  it('returns stable individual candidates for pasted URLs without inventing metadata', () => {
    const parsed = parsePastedYouTubeUrls([
      'https://youtu.be/pastedVid03',
      'https://youtu.be/pastedVid02',
      'https://youtu.be/pastedVid01',
    ].join('\n'));
    const first = rankWatchHistoryCandidates(parsed.entries);
    const second = rankWatchHistoryCandidates([...parsed.entries].reverse());

    expect(second).toEqual(first);
    expect(first).toHaveLength(3);
    expect(first.every((candidate) => candidate.kind === 'video')).toBe(true);
    expect(first[0]).toMatchObject({ kind: 'video', reason: 'From the URL list you pasted.' });
  });

  it('keeps recurring patterns ahead of newer one-off videos', () => {
    const recurring = ['patternVid1', 'patternVid2', 'patternVid3'].map((videoId, index) => ({
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Durable evidence workflow ${index + 1}`,
      channel: null,
      youtubeChannelId: null,
      watchedAt: `2025-01-0${index + 1}T00:00:00.000Z`,
    }));
    const oneOffs = Array.from({ length: 10 }, (_, index) => {
      const videoId = `oneOffVid${String(index).padStart(2, '0')}`;
      return {
        videoId,
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        title: `Unique topic ${index}`,
        channel: null,
        youtubeChannelId: null,
        watchedAt: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      };
    });

    const ranked = rankWatchHistoryCandidates([...oneOffs, ...recurring]);
    expect(ranked.some((candidate) => candidate.id === 'keyword:durable')).toBe(true);
    expect(ranked.some((candidate) => candidate.id === 'keyword:evidence')).toBe(true);
    expect(ranked.some((candidate) => candidate.id === 'keyword:workflow')).toBe(true);
  });
});
