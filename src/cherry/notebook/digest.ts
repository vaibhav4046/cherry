import type { TranscriptSegment } from '../watch/watch-model.ts';
import type { DerivedSkillDraft } from '../skillgraph/auto-draft.ts';

/**
 * Deterministic source digestion — the NotebookLM-style overview without a
 * model call. Classic extractive summarisation: term-frequency scoring with a
 * position boost, top sentences returned in document order. Honest by
 * construction: every output sentence exists verbatim in the sources.
 */

const STOPWORDS = new Set(
  ('a an the and or but so of to in on at for with from by is are was were be been being this that these those it its as if then than you your we our i my me he she they them his her their what which who whom will would can could should shall may might must do does did done have has had having not no nor very just really also about into over under again once here there when where why how all any both each few more most other some such only own same too then now going gonna get got like okay ok right well yeah um uh let lets us thing things stuff way bit lot').split(' '),
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 15);
}

export interface SourceDigest {
  /** Extractive summary sentences, in document order. */
  summary: string[];
  /** Top topics: frequent unigrams and bigrams, title-cased. */
  topics: string[];
  /** Total words across sources. */
  wordCount: number;
}

export function digestSegments(segments: TranscriptSegment[], maxSentences = 4, maxTopics = 6): SourceDigest {
  const fullText = segments.map((segment) => segment.text).join(' ');
  const sentences = splitSentences(fullText);
  const frequency = new Map<string, number>();
  const bigrams = new Map<string, number>();

  for (const sentence of sentences) {
    const words = tokenize(sentence);
    for (let index = 0; index < words.length; index += 1) {
      frequency.set(words[index]!, (frequency.get(words[index]!) ?? 0) + 1);
      if (index > 0) {
        const bigram = `${words[index - 1]} ${words[index]}`;
        bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
      }
    }
  }

  const scored = sentences.map((sentence, index) => {
    const words = tokenize(sentence);
    const raw = words.reduce((sum, word) => sum + (frequency.get(word) ?? 0), 0);
    const lengthNormalised = words.length > 0 ? raw / Math.sqrt(words.length) : 0;
    const positionBoost = index === 0 ? 1.25 : index < 3 ? 1.1 : 1;
    return { sentence, index, score: lengthNormalised * positionBoost };
  });
  const summary = [...scored]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence);

  const titleCase = (phrase: string): string =>
    phrase
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  const topBigrams = [...bigrams.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.ceil(maxTopics / 2))
    .map(([phrase]) => titleCase(phrase));
  const bigramWords = new Set(topBigrams.flatMap((phrase) => phrase.toLowerCase().split(' ')));
  const topWords = [...frequency.entries()]
    .filter(([word]) => !bigramWords.has(word))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTopics - topBigrams.length)
    .map(([word]) => titleCase(word));

  return {
    summary,
    topics: [...topBigrams, ...topWords],
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
  };
}

/** Quick one-line summary of raw pasted text, for per-source cards. */
export function summarizeText(text: string, maxChars = 140): string {
  const sentence = splitSentences(text.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/gm, ''))[0] ?? text.trim();
  const clean = sentence.replace(/\s+/g, ' ').trim();
  return clean.length <= maxChars ? clean : `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Template-generated review prompts — labelled as generated, never as AI insight. */
export function suggestedChecks(draft: DerivedSkillDraft, digest: SourceDigest): string[] {
  const checks: string[] = [];
  for (const step of draft.steps.filter((candidate) => candidate.kind === 'verification').slice(0, 2)) {
    checks.push(`Did you ${step.sourceText.charAt(0).toLowerCase()}${step.sourceText.slice(1).replace(/[.!?]+$/, '')}?`);
  }
  for (const principle of draft.principles.slice(0, 2)) {
    checks.push(`Does the result respect: "${principle.replace(/[.!?]+$/, '')}"?`);
  }
  if (checks.length < 3 && digest.topics[0]) {
    checks.push(`Is "${digest.topics[0]}" handled the way the source shows it?`);
  }
  return checks.slice(0, 4);
}

// ---------------- Studio output generators (real markdown artifacts) ----------------

export interface SourceInfo {
  title: string;
  summary: string;
  segmentCount: number;
}

function stamp(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function header(kind: string, lessonTitle: string, sources: SourceInfo[]): string {
  return [
    `# ${kind}: ${lessonTitle}`,
    '',
    `> Generated by Cherry Wine from ${sources.length} source${sources.length === 1 ? '' : 's'} using deterministic`,
    '> extraction — every quoted line exists in your sources. Review before relying on it.',
    '',
  ].join('\n');
}

function sourcesSection(sources: SourceInfo[]): string {
  return ['## Sources', '', ...sources.map((source, index) => `${index + 1}. **${source.title}** (${source.segmentCount} segments) — ${source.summary}`), ''].join('\n');
}

export function buildBriefingDoc(lessonTitle: string, sources: SourceInfo[], digest: SourceDigest, draft: DerivedSkillDraft): string {
  return [
    header('Briefing', lessonTitle, sources),
    '## Overview',
    '',
    ...digest.summary.map((sentence) => `${sentence}`),
    '',
    `## Key topics`,
    '',
    digest.topics.map((topic) => `\`${topic}\``).join(' · '),
    '',
    '## Workflow',
    '',
    ...draft.steps.map((step, index) => `${index + 1}. **${step.title}** — ${step.goal} _(source @ ${stamp(step.timestampSeconds)})_`),
    '',
    ...(draft.principles.length > 0 ? ['## Principles', '', ...draft.principles.map((principle) => `- ${principle}`), ''] : []),
    sourcesSection(sources),
  ].join('\n');
}

export function buildStudyGuide(lessonTitle: string, sources: SourceInfo[], digest: SourceDigest, draft: DerivedSkillDraft): string {
  return [
    header('Study guide', lessonTitle, sources),
    '## Practice checklist',
    '',
    ...draft.steps.map((step) => `- [ ] ${step.title} _(rewatch @ ${stamp(step.timestampSeconds)})_`),
    '',
    '## Review questions',
    '',
    ...suggestedChecks(draft, digest).map((check, index) => `${index + 1}. ${check}`),
    '',
    sourcesSection(sources),
  ].join('\n');
}

export function buildFaq(lessonTitle: string, sources: SourceInfo[], digest: SourceDigest, draft: DerivedSkillDraft): string {
  const steps = draft.steps.map((step) => `- ${step.title} _(@ ${stamp(step.timestampSeconds)})_`);
  return [
    header('FAQ', lessonTitle, sources),
    '**What does this workflow produce?**',
    '',
    digest.summary[0] ?? draft.steps[0]?.goal ?? 'See the workflow steps below.',
    '',
    '**What are the steps?**',
    '',
    ...steps,
    '',
    '**What should I double-check?**',
    '',
    ...suggestedChecks(draft, digest).map((check) => `- ${check}`),
    '',
    ...(draft.principles.length > 0 ? ['**What rules does the source insist on?**', '', ...draft.principles.map((principle) => `- ${principle}`), ''] : []),
    sourcesSection(sources),
  ].join('\n');
}
