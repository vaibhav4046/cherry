import { fail, ok, type Result } from '../core/result.ts';
import { loadLesson, importTranscript } from '../watch/lesson-service.ts';
import { generateSkillFromLesson } from '../skillgraph/quick-skill.ts';
import type { SkillGraph } from '../skillgraph/skillgraph-model.ts';
import { catalogAttribution, getCatalogSkill, type CatalogSkill } from './skill-catalog.ts';

export interface CatalogInstallResult {
  graph: SkillGraph;
  lessonId: string;
  source: CatalogSkill;
  segmentCount: number;
  evidenceCount: number;
}

/**
 * Install a catalog entry as a real, citable skill.
 *
 * This deliberately runs the SAME path a human-taught lesson runs: the upstream
 * SKILL.md becomes a lesson transcript, and the ordinary deterministic
 * derivation turns it into a DRAFT SkillGraph with evidence pointing back at the
 * upstream file. The result is a draft, not an approved method — a human still
 * approves it before it can be used, exactly as with anything else in Cherry.
 *
 * The alternative (writing a SkillGraph straight into the database) was
 * rejected: it would fabricate a graph nobody derived, skip the evidence trail,
 * and let a catalog entry masquerade as a taught skill.
 */
export async function installCatalogSkill(
  workspaceId: string,
  catalogId: string,
  options: { missionId?: string | null; actorType?: 'human' | 'agent' } = {},
): Promise<Result<CatalogInstallResult>> {
  const skill = await getCatalogSkill(catalogId);
  if (!skill) {
    return fail('not_found', `No catalog skill with id ${catalogId}. Call recommend_skills and use an id from its catalogSkills list.`);
  }

  const actorType = options.actorType ?? 'agent';
  const lesson = await loadLesson(
    {
      workspaceId,
      missionId: options.missionId ?? null,
      // The lesson title carries the upstream name so every downstream artifact
      // (evidence, citations, compiled bundle) names what it actually came from.
      title: `${skill.name} (${skill.repo})`.slice(0, 160),
      kind: 'manual',
    },
    actorType,
  );
  if (!lesson.ok) return lesson;

  // 'user_upload' is the honest source label: this is a shipped file, not text a
  // person typed and not captions a creator authorised.
  const imported = await importTranscript(
    lesson.value.id,
    withAttribution(skill),
    'user_upload',
    `${skill.id.replace(/\//g, '__')}.SKILL.md`,
    actorType,
    'replace',
  );
  if (!imported.ok) return imported;

  const generated = await generateSkillFromLesson({
    lessonId: lesson.value.id,
    name: skill.name.slice(0, 120),
    purpose: skill.description.slice(0, 400),
  });
  if (!generated.ok) return generated;

  return ok({
    graph: generated.value.graph,
    lessonId: lesson.value.id,
    source: skill,
    segmentCount: imported.value.totalSegments,
    evidenceCount: generated.value.evidenceCount,
  });
}

/**
 * Prepend a provenance header so the attribution travels with the text itself,
 * not just in metadata a later export could drop. CC-BY-SA and Apache-2.0 both
 * require the attribution to survive redistribution.
 */
function withAttribution(skill: CatalogSkill): string {
  const header = [
    `Source: ${catalogAttribution(skill)}`,
    `Upstream: https://github.com/${skill.repo}`,
    `License: ${skill.license}. Published by ${skill.publisher}.`,
    `sha256: ${skill.sha256}`,
    'This is third-party reference material imported into Cherry, not an approved method.',
    '',
  ].join('\n');
  return `${header}\n${markdownToLessonText(skill.content)}`;
}

/**
 * Flatten a SKILL.md into the shape the derivation actually reads.
 *
 * Derivation classifies a sentence by its opening word: an imperative verb earns
 * a build step, a "should/must" earns a research step. Markdown hides both. In
 * "- Parse the Received headers" the sentence opens on "-", and a fenced code
 * block is not prose at all. Left as-is, an 11k-character document collapsed to
 * a single fallback node.
 *
 * So this strips the syntax and keeps the words. It deliberately does NOT
 * rewrite, summarise or reorder anything — every surviving line is still the
 * source's own sentence, which is what keeps the derived steps quotable back to
 * the upstream file. Fenced code is dropped rather than flattened: it is not
 * instruction prose, and feeding it in produced junk steps.
 */
export function markdownToLessonText(markdown: string): string {
  const lines: string[] = [];
  let inFence = false;

  // HTML comments go first, and not only because they are not prose: the plain
  // transcript sniffer treats ANY "-->" as an SRT cue marker, so a single
  // "<!-- note -->" made the whole document parse as subtitles, yield zero cue
  // blocks, and fail the install outright with "No transcript segments".
  const body = stripFrontmatter(markdown).replace(/<!--[\s\S]*?-->/g, ' ');

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;

    let text = line.trim();
    if (!text) continue;
    if (/^(-{3,}|\*{3,}|={3,}|\|)/.test(text)) continue;   // rules and table rows
    if (/^---$/.test(text)) continue;                       // front-matter fence

    text = text
      .replace(/^#{1,6}\s+/, '')                            // heading marker
      .replace(/^\s*[-*+]\s+/, '')                          // bullet marker
      .replace(/^\s*\d+[.)]\s+/, '')                        // ordered marker
      .replace(/^\s*>\s?/, '')                              // block quote
      .replace(/^\s*\[[ xX]\]\s*/, '')                      // task checkbox
      .replace(/`([^`]+)`/g, '$1')                          // inline code
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')              // links keep their text
      .replace(/(\*\*|__|\*|_)(?=\S)([^*_]*?)\1/g, '$2')    // emphasis
      .replace(/-->/g, '→')                                 // never let prose sniff as SRT
      .trim();

    if (text.length < 12) continue;                         // headings like "Usage"
    if (/^[a-z][a-z0-9_-]{2,20}:\s/i.test(text) && !/\s(the|a|an|to|your|this)\s/i.test(text)) continue; // stray "key: value" metadata
    // Give the derivation a sentence terminator to split on; without one, several
    // consecutive lines merge into a single unclassifiable run-on.
    lines.push(/[.!?:]$/.test(text) ? text : `${text}.`);
  }

  // Blank-line separated, because parsePlainText splits plain transcripts on
  // blank lines and collapses whitespace inside each block. Joined with single
  // newlines the whole document arrived as ONE segment, the deriver saw one
  // run-on sentence, and every install produced the single fallback node.
  return lines.join('\n\n');
}

/**
 * Remove YAML front matter. Its name/description/tags are already captured as
 * catalog metadata; left in the body they read as prose and the deriver turned
 * "description: Parse and analyze email headers…" into a workflow step.
 */
function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const close = markdown.indexOf('\n---', 3);
  if (close < 0) return markdown;
  const afterFence = markdown.indexOf('\n', close + 1);
  return afterFence < 0 ? '' : markdown.slice(afterFence + 1);
}
