import { parseTranscript } from '../../src/cherry/watch/transcript-parser.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import type { TranscriptSegment } from '../../src/cherry/watch/watch-model.ts';

export interface LandingPageLine {
  readonly atSeconds: number;
  readonly text: string;
}

/**
 * A landing-page teardown the way a person actually pastes one: ordinary
 * declarative prose, not a list of imperative clicks. Five ideas carry the
 * lesson and none of them opens with a build verb, which is exactly why the
 * draft used to collapse the whole transcript into one "Review the lesson
 * material" node. Narration and filler are kept in on purpose - a fixture that
 * only contains guidance would not prove the heuristic can tell them apart.
 */
export const LANDING_PAGE_LINES: readonly LandingPageLine[] = [
  { atSeconds: 0, text: 'Right, let me walk you through a landing page teardown.' },
  { atSeconds: 14, text: 'The headline should lead with the outcome the visitor gets, not the feature you shipped.' },
  { atSeconds: 32, text: 'Nobody wakes up wanting a feature list. They want the after state.' },
  { atSeconds: 51, text: 'One clear call to action per page. Every extra button splits the decision.' },
  { atSeconds: 72, text: 'Put the proof next to the claim it supports, so the testimonial sits beside the promise it backs.' },
  { atSeconds: 96, text: 'A visitor should understand what you sell within five seconds of the page loading.' },
  { atSeconds: 115, text: 'I test that by showing the page to someone for five seconds and asking what it does.' },
  { atSeconds: 134, text: 'Cut generic copy like innovative solutions and world-class platform, because it says nothing.' },
  { atSeconds: 153, text: 'Never make a visitor scroll to work out what you sell.' },
  { atSeconds: 168, text: 'That is the whole teardown, so go and try it on your own page.' },
];

/** The five ideas the lesson teaches, matched as substrings so wording can move. */
export const LANDING_PAGE_IDEAS = {
  outcomeFirst: 'lead with the outcome',
  singleCallToAction: 'call to action per page',
  proofBesideClaim: 'proof next to the claim',
  fiveSecondClarity: 'within five seconds',
  noGenericCopy: 'generic copy',
} as const;

/** The rule the presenter states outright, rather than demonstrates. */
export const LANDING_PAGE_PRINCIPLE = 'Never make a visitor scroll';

function stamp(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The pasted form, in the `[m:ss] text` paragraph shape the importer accepts. */
export function landingPageTranscript(): string {
  return LANDING_PAGE_LINES.map((line) => `[${stamp(line.atSeconds)}] ${line.text}`).join('\n\n');
}

/**
 * The same transcript as stored segments. Built through the real parser rather
 * than by hand, so a derivation test and a pipeline test see identical windows.
 */
export function landingPageSegments(workspaceId = 'ws', lessonId = 'ls'): TranscriptSegment[] {
  return unwrap(parseTranscript(landingPageTranscript())).segments.map((segment) => ({
    id: `seg-landing-${segment.index}`,
    workspaceId,
    lessonId,
    index: segment.index,
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    text: segment.text,
    source: 'user_text',
  }));
}
