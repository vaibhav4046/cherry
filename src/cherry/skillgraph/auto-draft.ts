import type { TranscriptSegment } from '../watch/watch-model.ts';
import type { NodeKind } from './skillgraph-model.ts';

export interface DerivedStep {
  title: string;
  goal: string;
  kind: NodeKind;
  timestampSeconds: number;
  /** Segment window end, so a node stays traceable to the exact source moment. */
  endSeconds: number;
  sourceText: string;
  /** Provenance belongs to the segment, not the lesson's last import. */
  transcriptSource: TranscriptSegment['source'];
}

export interface DerivedSkillDraft {
  steps: DerivedStep[];
  principles: string[];
}

const ACTION_VERBS =
  /^(create|add|open|make|build|write|set|use|wrap|run|click|install|import|export|test|check|verify|start|go|select|drag|drop|copy|paste|type|save|name|choose|apply|configure|enable|disable|remove|delete|update|edit|adjust|place|position|align|group|duplicate|connect|link|draw|fill|style|format|publish|deploy|upload|download|put|cut|lead|show|keep|move|swap|replace|trim|shorten|rewrite|answer|prove|highlight)\b/i;

const VERIFY_VERBS = /^(check|verify|test|validate|confirm|inspect|review)\b/i;
const PRINCIPLE_MARKERS = /\b(always|never|important|remember|key is|rule|principle|best practice|make sure|tip)\b/i;

/**
 * Declarative guidance: prose that states what has to hold without opening on an
 * imperative verb ("The headline should lead with the outcome"). Most of a real
 * lesson is shaped this way, and treating it as silence was what collapsed whole
 * transcripts into a single review node. Narration carries none of these markers,
 * so filler still falls through instead of becoming an invented step.
 */
const GUIDANCE_MARKERS = /\b(should|must|needs?|has to|have to|ought to|avoid|don't|do not)\b/i;
/** A rule stated as a count, with no verb at all: "One call to action per page." */
const COUNT_RULE = /^(one|two|three|only one|exactly one|a single|no more than|at most|at least)\b[^.!?]*\bper\b/i;

const MAX_STEPS = 10;
const MIN_TEXT_LENGTH = 12;

/** The single node a transcript with no derivable workflow still yields. */
export const FALLBACK_STEP_TITLE = 'Review the lesson material';

function sentenceCase(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * What kind of workflow node a sentence earns, or null when it is narration.
 * Verification is checked before the build verbs so "Validate the export"
 * classifies on its own rather than depending on the build list containing it.
 */
function stepKind(sentence: string): NodeKind | null {
  if (VERIFY_VERBS.test(sentence)) return 'verification';
  if (ACTION_VERBS.test(sentence)) return 'build';
  if (GUIDANCE_MARKERS.test(sentence) || COUNT_RULE.test(sentence)) return 'research';
  return null;
}

/**
 * Deterministically derives workflow steps and transferable principles from a
 * user-supplied transcript. Heuristic, not AI: imperative sentences become
 * build/verification steps, declarative guidance becomes research steps, and
 * rule-like sentences become principles. Nothing is paraphrased or invented —
 * every step keeps its own sentence, timestamp and provenance. The user
 * reviews and approves the result — Cherry never pretends this is
 * understanding, it is structure extraction the human then owns.
 */
export function deriveSkillFromTranscript(segments: TranscriptSegment[]): DerivedSkillDraft {
  const steps: DerivedStep[] = [];
  const principles: string[] = [];

  for (const segment of segments) {
    // A segment may hold several sentences; evaluate each.
    const sentences = segment.text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= MIN_TEXT_LENGTH);

    for (const sentence of sentences) {
      if (PRINCIPLE_MARKERS.test(sentence) && principles.length < 12) {
        principles.push(sentenceCase(truncate(sentence, 200)));
        continue;
      }
      const kind = stepKind(sentence);
      if (kind && steps.length < MAX_STEPS * 3) {
        steps.push({
          title: sentenceCase(truncate(sentence, 70)),
          goal: sentenceCase(truncate(sentence, 300)),
          kind,
          timestampSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          sourceText: sentence,
          transcriptSource: segment.source,
        });
      }
    }
  }

  // Too many candidate steps: keep an even spread across the lesson so the
  // draft covers the whole workflow, not just the intro.
  let chosen = steps;
  if (steps.length > MAX_STEPS) {
    chosen = [];
    const stride = steps.length / MAX_STEPS;
    for (let index = 0; index < MAX_STEPS; index += 1) {
      chosen.push(steps[Math.floor(index * stride)]!);
    }
  }

  // A skill needs at least one step; fall back to a single review step built
  // from the first substantial segment so the user always gets an editable
  // starting point — clearly labelled as needing review.
  if (chosen.length === 0) {
    const first = segments.find((segment) => segment.text.trim().length >= MIN_TEXT_LENGTH);
    if (first) {
      chosen = [
        {
          title: FALLBACK_STEP_TITLE,
          goal: `Work through the lesson content starting from: "${truncate(first.text.trim(), 140)}"`,
          kind: 'research',
          timestampSeconds: first.startSeconds,
          endSeconds: first.endSeconds,
          sourceText: first.text.trim(),
          transcriptSource: first.source,
        },
      ];
    }
  }

  return { steps: chosen, principles };
}
