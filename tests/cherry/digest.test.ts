import { describe, expect, it } from 'vitest';
import { buildBriefingDoc, buildFaq, buildStudyGuide, digestSegments, suggestedChecks, summarizeText } from '../../src/cherry/notebook/digest.ts';
import { deriveSkillFromTranscript } from '../../src/cherry/skillgraph/auto-draft.ts';
import type { TranscriptSegment } from '../../src/cherry/watch/watch-model.ts';

function segment(index: number, start: number, text: string): TranscriptSegment {
  return { id: `s${index}`, workspaceId: 'ws', lessonId: 'ls', index, startSeconds: start, endSeconds: start + 20, text, source: 'user_text' };
}

const SEGMENTS = [
  segment(0, 5, 'Create a hero section with a real heading for the landing page.'),
  segment(1, 40, 'The hero section needs a main landmark so screen readers find the landing page content.'),
  segment(2, 80, 'Always check color contrast on the hero section before shipping the landing page.'),
  segment(3, 120, 'Add pill buttons under the heading and check the spacing.'),
];

describe('digestSegments', () => {
  it('produces an extractive summary of sentences that exist in the sources', () => {
    const digest = digestSegments(SEGMENTS, 2);
    expect(digest.summary).toHaveLength(2);
    const fullText = SEGMENTS.map((entry) => entry.text).join(' ');
    for (const sentence of digest.summary) {
      expect(fullText).toContain(sentence);
    }
  });

  it('finds the dominant topics including bigrams', () => {
    const digest = digestSegments(SEGMENTS);
    const joined = digest.topics.join(' ').toLowerCase();
    expect(joined).toContain('hero section');
    expect(digest.topics.length).toBeGreaterThanOrEqual(3);
    expect(digest.wordCount).toBeGreaterThan(30);
  });

  it('is deterministic', () => {
    expect(digestSegments(SEGMENTS)).toEqual(digestSegments(SEGMENTS));
  });
});

describe('summarizeText', () => {
  it('strips leading timestamps and returns the first substantial sentence', () => {
    expect(summarizeText('0:05 Create the frame for the hero.\n0:40 More content here later.')).toBe('Create the frame for the hero.');
  });

  it('caps length with an ellipsis', () => {
    const long = 'This is a very long sentence that keeps going on and on with lots of detail about everything imaginable in the whole entire world of design systems today.';
    expect(summarizeText(long, 60).length).toBeLessThanOrEqual(60);
    expect(summarizeText(long, 60).endsWith('…')).toBe(true);
  });
});

describe('studio output generators', () => {
  const draft = deriveSkillFromTranscript(SEGMENTS);
  const digest = digestSegments(SEGMENTS);
  const sources = [{ title: 'lesson.txt', summary: 'Hero section walkthrough', segmentCount: 4 }];

  it('suggested checks derive from verification steps and principles', () => {
    const checks = suggestedChecks(draft, digest);
    expect(checks.length).toBeGreaterThanOrEqual(1);
    expect(checks.length).toBeLessThanOrEqual(4);
    expect(checks.join(' ')).toMatch(/contrast|spacing|hero/i);
  });

  it('briefing doc contains overview, workflow with timestamps, and sources', () => {
    const doc = buildBriefingDoc('Hero lesson', sources, digest, draft);
    expect(doc).toContain('# Briefing: Hero lesson');
    expect(doc).toContain('## Workflow');
    expect(doc).toMatch(/\(source @ \d+:\d{2}\)/);
    expect(doc).toContain('lesson.txt');
    expect(doc).toContain('deterministic');
  });

  it('study guide is a real checklist; FAQ answers come from the sources', () => {
    const guide = buildStudyGuide('Hero lesson', sources, digest, draft);
    expect(guide.match(/- \[ \] /g)!.length).toBe(draft.steps.length);
    const faq = buildFaq('Hero lesson', sources, digest, draft);
    expect(faq).toContain('**What are the steps?**');
    expect(faq).toContain(draft.steps[0]!.title);
  });
});
