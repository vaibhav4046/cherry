import { fail, ok, type Result } from '../core/result.ts';
import { getLesson, listTranscript } from '../watch/lesson-service.ts';
import { addEvidence } from '../evidence/evidence-service.ts';
import { draftSkillGraph, reviseSkillGraph } from './skillgraph-service.ts';
import { updateMission } from '../mission/mission-service.ts';
import type { Evaluation } from './skillgraph-model.ts';
import type { SkillGraph } from './skillgraph-model.ts';
import { deriveSkillFromTranscript, type DerivedSkillDraft } from './auto-draft.ts';
import type { TranscriptSource } from '../watch/watch-model.ts';
import type { ProvenanceMethod } from '../evidence/evidence-model.ts';

const provenanceForTranscriptSource: Record<TranscriptSource, ProvenanceMethod> = {
  user_text: 'user_typed',
  user_upload: 'user_upload',
  creator_authorized_captions: 'creator_authorized_captions',
  local_transcription: 'local_transcription',
  runner_fetch: 'tool_result',
  unknown: 'unknown',
};

export interface QuickSkillInput {
  lessonId: string;
  /** Blank = Cherry derives a name from the content (NotebookLM-style). */
  name?: string;
  purpose?: string;
  /** Indices into the derived steps the user kept (default: all). */
  keepStepIndices?: number[];
}

/** Derive a human-friendly skill name from the lesson + first concrete step. */
export function autoNameSkill(lessonTitle: string, draft: DerivedSkillDraft): string {
  const step = draft.steps.find((candidate) => candidate.kind === 'build') ?? draft.steps[0];
  if (step) {
    // "Create a new frame for the hero section." → "Frame for the hero section workflow"
    const stripped = step.title
      .replace(/^\W*(create|add|open|make|build|write|set|use|wrap|run|click|install|import|export|start|go|select|choose|apply|configure)\s+(a|an|the|new)?\s*/i, '')
      .replace(/[.!?…]+$/, '')
      .trim();
    if (stripped.length >= 6) {
      const base = stripped.charAt(0).toUpperCase() + stripped.slice(1);
      return `${base.slice(0, 90)} workflow`;
    }
  }
  const title = lessonTitle.replace(/[.!?…]+$/, '').trim();
  return `${(title || 'Learned').slice(0, 100)} skill`;
}

export interface QuickSkillResult {
  graph: SkillGraph;
  draft: DerivedSkillDraft;
  evidenceCount: number;
}

/** Preview what would be generated, without writing anything. */
export async function previewQuickSkill(lessonId: string): Promise<Result<DerivedSkillDraft>> {
  const lesson = await getLesson(lessonId);
  if (!lesson) return fail('not_found', `Lesson ${lessonId} not found`);
  const segments = await listTranscript(lessonId);
  if (segments.length === 0) {
    return fail('validation', 'Import a transcript first — Cherry derives the skill from it, deterministically.');
  }
  return ok(deriveSkillFromTranscript(segments));
}

/**
 * The Quick Skill pipeline: transcript → evidence records (untrusted, with
 * timestamps) → drafted SkillGraph with standing evaluations. Everything is
 * persisted through the same domain services the manual flow uses; the human
 * still reviews, approves, verifies, and compiles.
 */
export async function generateSkillFromLesson(input: QuickSkillInput): Promise<Result<QuickSkillResult>> {
  const lesson = await getLesson(input.lessonId);
  if (!lesson) return fail('not_found', `Lesson ${input.lessonId} not found`);

  const preview = await previewQuickSkill(input.lessonId);
  if (!preview.ok) return preview;

  const name = (input.name?.trim() || autoNameSkill(lesson.title, preview.value)).slice(0, 120);
  if (name.length === 0) {
    return fail('validation', 'Skill name must be 1-120 characters');
  }
  const allSteps = preview.value.steps;
  const kept = input.keepStepIndices
    ? allSteps.filter((_, index) => input.keepStepIndices!.includes(index))
    : allSteps;
  if (kept.length === 0) {
    return fail('validation', 'Keep at least one step — a skill needs a workflow.');
  }

  // One evidence record per kept step, honestly labelled: transcript-derived,
  // untrusted until a human raises it.
  const nodes: Array<{ kind: (typeof kept)[number]['kind']; title: string; goal: string; evidenceIds: string[] }> = [];
  let evidenceCount = 0;
  for (const step of kept) {
    const evidence = await addEvidence(
      {
        workspaceId: lesson.workspaceId,
        missionId: lesson.missionId ?? null,
        lessonId: lesson.id,
        sourceType: 'transcript',
        claim: step.sourceText.slice(0, 2000),
        provenanceMethod: provenanceForTranscriptSource[lesson.transcriptSource ?? 'unknown'],
        timestampSeconds: step.timestampSeconds,
        transferability: 'unknown',
        ...(lesson.canonicalUrl ? { sourceUri: lesson.canonicalUrl } : {}),
      },
      'system',
    );
    if (!evidence.ok) return evidence;
    evidenceCount += 1;
    nodes.push({ kind: step.kind, title: step.title, goal: step.goal, evidenceIds: [evidence.value.id] });
  }

  const purpose =
    input.purpose?.trim() ||
    `Workflow learned from "${lesson.title}"${preview.value.principles.length > 0 ? `. Key principles: ${preview.value.principles.slice(0, 3).join(' ')}` : ''}`;

  const drafted = await draftSkillGraph(
    {
      workspaceId: lesson.workspaceId,
      missionId: lesson.missionId ?? null,
      name,
      purpose: purpose.slice(0, 2000),
      nodes,
    },
    'system',
  );
  if (!drafted.ok) return drafted;

  const standing: Evaluation[] = [
    { id: 'std-hash', name: 'Artifact hashes recompute', type: 'hash', severity: 'blocking', config: {} },
    { id: 'std-policy', name: 'No unresolved placeholder markers', type: 'policy', severity: 'blocking', config: {} },
  ];
  const withChecks = await reviseSkillGraph(
    drafted.value.id,
    { evaluations: [...drafted.value.evaluations, ...standing] },
    'Standing checks added by Quick Skill',
    'system',
  );
  if (!withChecks.ok) return withChecks;

  if (lesson.missionId) {
    await updateMission(lesson.missionId, { skillGraphId: drafted.value.id }, 'system');
  }

  return ok({ graph: withChecks.value, draft: { steps: kept, principles: preview.value.principles }, evidenceCount });
}
