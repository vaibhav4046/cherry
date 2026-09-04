import { fail, ok, type Result } from '../core/result.ts';
import { getLesson, listTranscript } from '../watch/lesson-service.ts';
import { addEvidence, listEvidence } from '../evidence/evidence-service.ts';
import { draftSkillGraph, reviseSkillGraph } from './skillgraph-service.ts';
import { updateMission } from '../mission/mission-service.ts';
import type { Evaluation } from './skillgraph-model.ts';
import type { SkillGraph } from './skillgraph-model.ts';
import { deriveSkillFromTranscript, FALLBACK_STEP_TITLE, type DerivedSkillDraft, type DerivedStep } from './auto-draft.ts';
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

const TASK_TITLE =
  /^(plan|turn|make|build|write|create|edit|record|film|script|design|grow|launch|ship|set|use|run|start|learn|repurpose|rank|optimi[sz]e|automate|manage|organi[sz]e|track|improve|double|scale|prepare|avoid|clean|batch|outline|structure|host|monetize|monetise|negotiate|research|review|map|draft|shoot|light|mix|master|animate|post|convert|close|book|land|win|keep|reach|send|sort|rename|resize|crop|trim|how to)\b/i;
/** A step whose object starts like this names nothing on its own ("Your calendar and add ..."). */
const WEAK_STEP_OBJECT = /^(your|my|our|their|his|her|its|this|that|these|those|it|them|one|some|each|every|all)\b/i;

/**
 * Derive a human-friendly skill name. A lesson title that already reads as a task
 * ("Plan a week of content in one sitting") is the best name there is; otherwise the
 * first concrete step lends its object, unless that object cannot stand alone.
 * Cherry's own placeholder step never names anything — a lesson that only stated
 * rules is named from the lesson title, or failing that from the first rule.
 */
export function autoNameSkill(lessonTitle: string, draft: DerivedSkillDraft): string {
  const title = lessonTitle.replace(/[.!?…]+$/, '').trim();
  if (title.length >= 12 && TASK_TITLE.test(title)) {
    return `${title.slice(0, 100)} skill`;
  }
  const step = draft.steps.find((candidate) => candidate.kind === 'build') ?? draft.steps[0];
  if (step && step.title !== FALLBACK_STEP_TITLE) {
    // "Create a new frame for the hero section." becomes "Frame for the hero section workflow"
    const firstClause = step.title.split(/\s+(?:and|then|,)\s+|[;,]\s+/i)[0] ?? step.title;
    const stripped = firstClause
      .replace(/^\W*(create|add|open|make|build|write|set|use|wrap|run|click|install|import|export|start|go|select|choose|apply|configure)\s+(?:(?:a|an|the)\s+)?(?:new\s+)?/i, '')
      .replace(/[.!?…]+$/, '')
      .trim();
    if (stripped.length >= 6 && !WEAK_STEP_OBJECT.test(stripped)) {
      const base = stripped.charAt(0).toUpperCase() + stripped.slice(1);
      return `${base.slice(0, 90)} workflow`;
    }
  }
  const principle = draft.principles[0];
  if (title.length < 12 && principle) {
    return `${principle.replace(/[.!?…]+$/, '').slice(0, 90)} skill`;
  }
  return `${(title || 'Learned').slice(0, 100)} skill`;
}

/** The claim a step records, bounded the way the evidence service bounds it. */
function claimFor(step: DerivedStep): string {
  return step.sourceText.slice(0, 2000).trim();
}

/** Comparison key only: stored claim text is never rewritten. */
function claimKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
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

  // Whatever a person or agent already recorded against this lesson counts too:
  // a record that quotes a step's own sentence is reused instead of stored a
  // second time, and any other record attaches to the step whose source window
  // it was taken in. A node never cites evidence from outside its own moment.
  const stored = await listEvidence(lesson.workspaceId, { lessonId: lesson.id });
  const attached = new Set<string>();

  // One evidence record per kept step, honestly labelled: transcript-derived,
  // untrusted until a human raises it.
  const nodes: Array<{ kind: DerivedStep['kind']; title: string; goal: string; evidenceIds: string[] }> = [];
  for (const step of kept) {
    const claim = claimFor(step);
    const quoted = stored.find((record) => !attached.has(record.id) && claimKey(record.claim) === claimKey(claim));
    let evidenceId: string;
    if (quoted) {
      attached.add(quoted.id);
      evidenceId = quoted.id;
    } else {
      const evidence = await addEvidence(
        {
          workspaceId: lesson.workspaceId,
          missionId: lesson.missionId ?? null,
          lessonId: lesson.id,
          sourceType: 'transcript',
          claim,
          provenanceMethod: provenanceForTranscriptSource[step.transcriptSource],
          timestampSeconds: step.timestampSeconds,
          transferability: 'unknown',
          ...(lesson.canonicalUrl ? { sourceUri: lesson.canonicalUrl } : {}),
        },
        'system',
      );
      if (!evidence.ok) return evidence;
      evidenceId = evidence.value.id;
    }
    nodes.push({ kind: step.kind, title: step.title, goal: step.goal, evidenceIds: [evidenceId] });
  }

  // Second pass, so a record quoting one step is never swallowed by an earlier
  // step that happens to share its source window.
  for (const record of stored) {
    const at = record.timestampSeconds;
    if (attached.has(record.id) || at === null || at === undefined) continue;
    const index = kept.findIndex((step) => at >= step.timestampSeconds && at <= step.endSeconds);
    if (index < 0) continue;
    attached.add(record.id);
    nodes[index]!.evidenceIds.push(record.id);
  }

  const evidenceCount = new Set(nodes.flatMap((node) => node.evidenceIds)).size;

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
