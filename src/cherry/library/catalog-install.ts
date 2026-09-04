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
    return fail('not_found', `No catalog skill with id ${catalogId}. Use search_skill_catalog first.`);
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
  return `${header}\n${skill.content}`;
}
