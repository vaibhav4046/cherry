import { describe, expect, it } from 'vitest';
import { deriveSkillFromTranscript, FALLBACK_STEP_TITLE } from '../../src/cherry/skillgraph/auto-draft.ts';
import {
  LANDING_PAGE_IDEAS,
  LANDING_PAGE_LINES,
  LANDING_PAGE_PRINCIPLE,
  landingPageSegments,
} from '../fixtures/landing-page-transcript.ts';
import type { TranscriptSegment } from '../../src/cherry/watch/watch-model.ts';

function segment(index: number, start: number, text: string): TranscriptSegment {
  return { id: `s${index}`, workspaceId: 'ws', lessonId: 'ls', index, startSeconds: start, endSeconds: start + 20, text, source: 'user_text' };
}

const TRANSCRIPT_TEXT = LANDING_PAGE_LINES.map((line) => line.text).join(' ');

describe('deriveSkillFromTranscript on declarative prose', () => {
  it('covers every idea the landing-page lesson teaches instead of one review node', () => {
    const draft = deriveSkillFromTranscript(landingPageSegments());
    const derived = draft.steps.map((step) => step.sourceText).join(' ');

    expect(draft.steps.length).toBeGreaterThan(1);
    for (const [idea, phrase] of Object.entries(LANDING_PAGE_IDEAS)) {
      expect(derived.toLowerCase(), idea).toContain(phrase.toLowerCase());
    }
    expect(draft.steps.some((step) => step.title === FALLBACK_STEP_TITLE)).toBe(false);
    expect(draft.principles.some((principle) => principle.includes(LANDING_PAGE_PRINCIPLE))).toBe(true);
  });

  it('hears guidance stated three different ways, not just the fixture wording', () => {
    const draft = deriveSkillFromTranscript([
      segment(0, 0, 'Lead with the outcome, not the feature.'),
      segment(1, 20, 'One call to action per page.'),
      segment(2, 40, 'Put the proof next to the claim.'),
    ]);
    expect(draft.steps.map((step) => step.sourceText)).toEqual([
      'Lead with the outcome, not the feature.',
      'One call to action per page.',
      'Put the proof next to the claim.',
    ]);
  });

  it('keeps the imperative and verification classification the pipeline relies on', () => {
    const draft = deriveSkillFromTranscript([
      segment(0, 5, 'Create a new index.html file for the project.'),
      segment(1, 40, 'The page must carry a real h1 heading.'),
      segment(2, 80, 'Check the result with an accessibility pass.'),
    ]);
    expect(draft.steps.map((step) => step.kind)).toEqual(['build', 'research', 'verification']);
  });

  it('invents nothing: every step quotes its own segment verbatim and keeps its provenance', () => {
    const segments = landingPageSegments();
    for (const step of deriveSkillFromTranscript(segments).steps) {
      expect(TRANSCRIPT_TEXT).toContain(step.sourceText);
      const source = segments.find((candidate) => candidate.startSeconds === step.timestampSeconds);
      expect(source, step.sourceText).toBeDefined();
      expect(source!.text).toContain(step.sourceText);
      expect(step.endSeconds).toBe(source!.endSeconds);
      expect(step.transcriptSource).toBe(source!.source);
    }
  });

  it('is deterministic across runs', () => {
    const segments = landingPageSegments();
    expect(deriveSkillFromTranscript(segments)).toEqual(deriveSkillFromTranscript(segments));
  });

  it('still falls back to a single review step when the material is only narration', () => {
    const draft = deriveSkillFromTranscript([
      segment(0, 0, 'Welcome along, this is a relaxed talk about ideas and history.'),
      segment(1, 30, 'I was in the studio yesterday and the light was lovely.'),
    ]);
    expect(draft.steps).toHaveLength(1);
    expect(draft.steps[0]!.title).toBe(FALLBACK_STEP_TITLE);
    expect(draft.steps[0]!.kind).toBe('research');
  });
});
