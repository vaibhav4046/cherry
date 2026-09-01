import { describe, expect, it } from 'vitest';
import { embedUrl, parseYouTubeUrl } from '../../src/cherry/watch/youtube-url.ts';
import { parseTranscript } from '../../src/cherry/watch/transcript-parser.ts';
import { computeCoverage } from '../../src/cherry/watch/coverage.ts';
import { validateArtifactPath } from '../../src/cherry/artifacts/artifact-path.ts';
import type { Lesson, Observation, TranscriptSegment } from '../../src/cherry/watch/watch-model.ts';

describe('YouTube URL parsing', () => {
  it('parses standard watch URLs', () => {
    const result = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.ok && result.value.videoId).toBe('dQw4w9WgXcQ');
  });

  it('parses official mobile, music, nocookie, share, path, and bare-id forms', () => {
    for (const url of [
      'https://youtu.be/dQw4w9WgXcQ?t=90',
      'youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
    ]) {
      const result = parseYouTubeUrl(url);
      expect(result.ok, url).toBe(true);
      if (result.ok) expect(result.value.videoId).toBe('dQw4w9WgXcQ');
    }
    const timed = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s');
    expect(timed.ok && timed.value.startSeconds).toBe(90);
  });

  it('rejects non-YouTube hosts and malformed ids', () => {
    expect(parseYouTubeUrl('https://evil.example.com/watch?v=dQw4w9WgXcQ').ok).toBe(false);
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=short').ok).toBe(false);
    expect(parseYouTubeUrl('javascript:alert(1)').ok).toBe(false);
    expect(parseYouTubeUrl('').ok).toBe(false);
  });

  it('rejects credentials and non-default ports on otherwise official hosts', () => {
    for (const url of [
      'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://user@youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com:444/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(parseYouTubeUrl(url).ok, url).toBe(false);
    }
  });

  it('rejects arbitrary YouTube paths that smuggle a video id in query or path data', () => {
    for (const url of [
      'https://www.youtube.com/?v=dQw4w9WgXcQ',
      'https://www.youtube.com/redirect?v=dQw4w9WgXcQ',
      'https://www.youtube.com/attribution_link?u=%2Fwatch%3Fv%3DdQw4w9WgXcQ&v=dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ/extra',
      'https://youtu.be/dQw4w9WgXcQ/extra',
    ]) {
      expect(parseYouTubeUrl(url).ok, url).toBe(false);
    }
  });

  it('builds a nocookie embed pinned to the app origin', () => {
    const url = embedUrl('dQw4w9WgXcQ', 'https://cherry.example');
    expect(url.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?')).toBe(true);
    expect(url).toContain('origin=https%3A%2F%2Fcherry.example');
    expect(url).toContain('enablejsapi=1');
  });
});

describe('transcript parsing', () => {
  it('parses SRT cues', () => {
    const srt = ['1', '00:00:01,000 --> 00:00:04,000', 'Hello world', '', '2', '00:00:05,500 --> 00:00:08,000', 'Second cue'].join('\n');
    const result = parseTranscript(srt, 'lesson.srt');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe('srt');
      expect(result.value.segments).toHaveLength(2);
      expect(result.value.segments[0]!.startSeconds).toBe(1);
      expect(result.value.segments[1]!.startSeconds).toBe(5.5);
      expect(result.value.segments[1]!.text).toBe('Second cue');
    }
  });

  it('parses WEBVTT with tags stripped', () => {
    const vtt = ['WEBVTT', '', '00:01.000 --> 00:03.000', 'Styled <b>text</b> here'].join('\n');
    const result = parseTranscript(vtt, 'lesson.vtt');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe('vtt');
      expect(result.value.segments[0]!.text).toBe('Styled text here');
    }
  });

  it('parses plain paragraphs with optional timestamps', () => {
    const plain = '[0:10] Intro remarks about the tool\n\nSecond paragraph without a marker';
    const result = parseTranscript(plain);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe('plain');
      expect(result.value.segments[0]!.startSeconds).toBe(10);
      expect(result.value.segments.length).toBe(2);
    }
  });

  it('rejects empty and oversized transcripts', () => {
    expect(parseTranscript('   ').ok).toBe(false);
    expect(parseTranscript('x'.repeat(2 * 1024 * 1024 + 10)).ok).toBe(false);
  });
});

function lessonFixture(criteria: Lesson['coverageCriteria']): Lesson {
  return {
    id: 'ls-1',
    workspaceId: 'ws-1',
    title: 'Fixture',
    kind: 'manual',
    coverageCriteria: criteria,
    lastPositionSeconds: 0,
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    durationSeconds: 600,
  };
}

function observationAt(seconds: number): Observation {
  return {
    id: `obs-${seconds}`,
    workspaceId: 'ws-1',
    lessonId: 'ls-1',
    timestampSeconds: seconds,
    kind: 'spoken',
    text: 'note',
    transferability: 'transferable',
    uncertainty: 'confident',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    actorType: 'human',
  };
}

describe('coverage', () => {
  const segments: TranscriptSegment[] = [
    { id: 's1', workspaceId: 'ws-1', lessonId: 'ls-1', index: 0, startSeconds: 0, endSeconds: 100, text: 'a', source: 'user_text' },
  ];

  it('cannot be complete without declared criteria', () => {
    const report = computeCoverage(lessonFixture([]), segments, [observationAt(10)]);
    expect(report.complete).toBe(false);
    expect(report.completenessNote).toContain('cannot be marked complete');
  });

  it('is complete only when every criterion has an observation', () => {
    const criteria = [
      { id: 'c1', label: 'Setup', startSeconds: 0, endSeconds: 60, satisfiedByObservationIds: [] },
      { id: 'c2', label: 'Result', startSeconds: 60, endSeconds: 120, satisfiedByObservationIds: [] },
    ];
    const partial = computeCoverage(lessonFixture(criteria), segments, [observationAt(10)]);
    expect(partial.complete).toBe(false);
    expect(partial.criteriaSatisfied).toBe(1);
    expect(partial.gaps.some((gap) => gap.reason === 'criterion_unmet')).toBe(true);

    const full = computeCoverage(lessonFixture(criteria), segments, [observationAt(10), observationAt(70)]);
    expect(full.complete).toBe(true);
    expect(full.completenessNote).toContain('not every video frame');
  });

  it('reports an uninspected tail beyond the transcript', () => {
    const report = computeCoverage(lessonFixture([]), segments, [observationAt(10)]);
    expect(report.gaps.some((gap) => gap.reason === 'uninspected')).toBe(true);
  });
});

describe('artifact path validation', () => {
  it('accepts normal relative paths', () => {
    for (const path of ['index.html', 'css/site.css', 'src/app.js', 'notes.md', 'data.json']) {
      expect(validateArtifactPath(path).ok, path).toBe(true);
    }
  });

  it('rejects traversal, absolute paths, and unsupported extensions', () => {
    for (const path of ['../escape.html', 'a/../../b.js', '/etc/passwd', 'C:/windows.html', 'nested/../../x.md', 'file.exe', 'noext', 'bad\\slash.html']) {
      expect(validateArtifactPath(path).ok, path).toBe(false);
    }
  });
});

describe('YouTube copied-transcript format', () => {
  it('parses alternating timestamp/text lines as segments', () => {
    const copied = ['0:05', 'Create a new frame for the hero section', '0:40', 'Always keep the heading a real h1', '1:10', 'Add the navigation bar'].join('\n');
    const result = parseTranscript(copied);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.segments).toHaveLength(3);
      expect(result.value.segments[0]!.startSeconds).toBe(5);
      expect(result.value.segments[0]!.text).toBe('Create a new frame for the hero section');
      expect(result.value.segments[2]!.startSeconds).toBe(70);
    }
  });

  it('parses single-line "0:05 text" rows without blank separators', () => {
    const rows = ['0:05 Create the frame', '0:40 Add the header', '1:50 Check the spacing'].join('\n');
    const result = parseTranscript(rows);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.segments).toHaveLength(3);
      expect(result.value.segments[1]!.text).toBe('Add the header');
    }
  });

  it('leaves prose without timestamps on the paragraph path', () => {
    const prose = 'First paragraph of notes here.\n\nSecond paragraph of notes.';
    const result = parseTranscript(prose);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.segments).toHaveLength(2);
  });
});
