import type { ActorType } from '../core/domain-event.ts';
import { isoNow } from '../core/clock.ts';
import { approvalRequired, invalid, notFound } from '../core/errors.ts';
import { ok, type Result } from '../core/result.ts';
import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx, type MutationContext } from '../persistence/transactions.ts';
import { deriveSkillFromTranscript } from '../skillgraph/auto-draft.ts';
import { autoNameSkill } from '../skillgraph/quick-skill.ts';
import type { Lesson, TranscriptSegment } from '../watch/watch-model.ts';
import {
  isProposalEligibleSource,
  MAX_PROPOSAL_DESCRIPTION_CHARS,
  MAX_PROPOSAL_NAME_CHARS,
  MAX_PROPOSAL_STEP_CHARS,
  MAX_PROPOSAL_STEPS,
  MAX_PROPOSAL_TEACHES_CHARS,
  type ProposalReadiness,
  type SkillProposal,
} from './proposal-model.ts';
import type { SourceRecord } from './source-model.ts';

export interface ProposeOptions {
  /** Transcript segments a person supplied or transcribed on this device. */
  segments?: readonly TranscriptSegment[];
  /** Plain-text description from the public feed; untrusted, capped, tags removed. */
  description?: string;
  publishedAt?: string;
  /** Timestamp for createdAt/updatedAt; defaults to the source's own createdAt. */
  now?: string;
}

const QUESTION_WORDS = /^(how|why|what|when|where|which|who)\b/i;
/** Imperative openers that read naturally after "How to". Anything else keeps the title intact. */
const IMPERATIVE_OPENERS =
  /^(create|add|open|make|build|write|set|use|wrap|run|click|install|import|export|test|check|verify|start|go|select|drag|drop|copy|paste|type|save|name|choose|apply|configure|enable|disable|remove|delete|update|edit|adjust|place|position|align|group|duplicate|connect|link|draw|fill|style|format|publish|deploy|upload|download|turn|plan|grow|get|find|stop|fix|learn|record|cut|film|script|launch|sell|price|pitch|design|ship|schedule|repurpose|rank|optimi[sz]e|automate|manage|organi[sz]e|track|measure|improve|boost|double|triple|scale|hire|prepare|handle|avoid|clean|batch|outline|structure|host|monetize|monetise|negotiate|research|validate|review|plan|map|draft|shoot|light|mix|master|animate|post|reply|answer|convert|close|book|sign|land|win|keep|hold|reach|send|pin|tag|label|sort|rename|resize|crop|trim|sync|back)\b/i;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const MIN_SENTENCE_CHARS = 12;

/** Untrusted text becomes plain text: elements with bodies go first, then tags, then entities. */
export function stripMarkup(text: string): string {
  return text
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]{0,500}>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '')
    .replace(/&gt;/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd();
}

function endWithPeriod(sentence: string): string {
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function firstSentence(text: string): string | null {
  const sentence = text.split(SENTENCE_SPLIT)[0]?.trim() ?? '';
  return sentence.length >= MIN_SENTENCE_CHARS ? sentence : null;
}

/** One calm sentence: the title as a "how to", plus the first plain sentence of a description. */
export function teachesSentence(title: string, description?: string): string {
  const cleanTitle = stripMarkup(title).replace(/[.!?…]+$/, '').trim();
  const lead = QUESTION_WORDS.test(cleanTitle)
    ? cleanTitle
    : IMPERATIVE_OPENERS.test(cleanTitle)
      ? `How to ${cleanTitle.charAt(0).toLowerCase()}${cleanTitle.slice(1)}`
      : `What this upload teaches: ${cleanTitle}`;
  let teaches = endWithPeriod(lead);
  if (description) {
    const plain = stripMarkup(description.slice(0, MAX_PROPOSAL_DESCRIPTION_CHARS));
    const sentence = firstSentence(plain);
    if (sentence) teaches = `${teaches} ${endWithPeriod(sentence)}`;
  }
  return truncate(teaches, MAX_PROPOSAL_TEACHES_CHARS);
}

function candidateStepsFrom(segments: readonly TranscriptSegment[]): string[] {
  if (segments.length === 0) return [];
  return deriveSkillFromTranscript([...segments]).steps
    .slice(0, MAX_PROPOSAL_STEPS)
    .map((step) => truncate(step.title, MAX_PROPOSAL_STEP_CHARS));
}

/**
 * Deterministic proposal from metadata plus whatever transcript a person
 * supplied. Never fetches anything and never calls a model.
 */
export function proposeFromSource(
  source: SourceRecord,
  lesson?: Lesson,
  options: ProposeOptions = {},
): Result<SkillProposal> {
  if (source.kind !== 'youtube') return invalid('Only a YouTube source can carry a skill proposal');
  const title = stripMarkup(source.title);
  if (!title) return invalid('A proposal needs a source title');
  const segments = options.segments ?? [];
  const draft = segments.length > 0 ? deriveSkillFromTranscript([...segments]) : { steps: [], principles: [] };
  const name = truncate(autoNameSkill(lesson?.title ?? title, draft), MAX_PROPOSAL_NAME_CHARS);
  const now = options.now ?? source.createdAt;
  return ok({
    id: source.id,
    workspaceId: source.workspaceId,
    sourceId: source.id,
    creatorName: source.creator ?? lesson?.creator ?? null,
    sourceTitle: title,
    publishedAt: options.publishedAt ?? source.createdAt,
    name,
    teaches: teachesSentence(title, options.description),
    candidateSteps: candidateStepsFrom(segments),
    readiness: segments.length > 0 ? 'draft-ready' : 'needs-transcript',
    missionId: lesson?.missionId ?? null,
    skillGraphId: null,
    createdAt: now,
    updatedAt: now,
  });
}

interface ReadinessFacts {
  readiness: ProposalReadiness;
  missionId: string | null;
  skillGraphId: string | null;
  segments: TranscriptSegment[];
  lesson: Lesson | undefined;
}

/** Readiness is computed from persisted facts, never asserted. Dismissal sticks. */
async function readinessFacts(ctx: MutationContext, source: SourceRecord, current: SkillProposal | undefined): Promise<ReadinessFacts> {
  const lesson = await ctx.db.lessons.get(source.lessonId);
  const segments = lesson ? await ctx.db.transcriptSegments.where('lessonId').equals(lesson.id).toArray() : [];
  const mission = lesson?.missionId ? await ctx.db.missions.get(lesson.missionId) : undefined;
  const graph = mission?.skillGraphId ? await ctx.db.skillGraphs.get(mission.skillGraphId) : undefined;
  const missionId = mission?.id ?? null;
  const skillGraphId = graph?.id ?? null;
  if (current?.readiness === 'dismissed') return { readiness: 'dismissed', missionId, skillGraphId, segments, lesson };
  if (graph && graph.status === 'approved' && graph.approvedRevision === graph.revision) {
    return { readiness: 'approved', missionId, skillGraphId, segments, lesson };
  }
  if (graph) return { readiness: 'drafted', missionId, skillGraphId, segments, lesson };
  if (segments.length > 0) return { readiness: 'draft-ready', missionId, skillGraphId, segments, lesson };
  return { readiness: 'needs-transcript', missionId, skillGraphId, segments, lesson };
}

function proposalEventPayload(proposal: SkillProposal, source: SourceRecord) {
  return {
    sourceId: proposal.sourceId,
    readiness: proposal.readiness,
    name: proposal.name,
    candidateSteps: proposal.candidateSteps.length,
    missionId: proposal.missionId,
    skillGraphId: proposal.skillGraphId,
    sourceOrigin: source.sourceOrigin ?? 'manual',
  };
}

/**
 * Creates the proposal inside the caller's transaction so it lands in the same
 * ledger entry as the source that produced it. Returns null for ineligible
 * sources or when a proposal already exists.
 */
export async function createProposalInTx(
  ctx: MutationContext,
  source: SourceRecord,
  lesson: Lesson | undefined,
  options: ProposeOptions = {},
  actorType: ActorType = 'system',
): Promise<SkillProposal | null> {
  if (!isProposalEligibleSource(source)) return null;
  const existing = await ctx.db.skillProposals.get(source.id);
  if (existing) return null;
  const proposed = proposeFromSource(source, lesson, options);
  if (!proposed.ok) return null;
  const proposal = proposed.value;
  await ctx.db.skillProposals.add(proposal);
  ctx.emit({
    type: 'skill_proposal.created', actorType, objectType: 'skill_proposal', objectId: proposal.id,
    summary: `Skill proposed from "${proposal.sourceTitle}" (${proposal.readiness})`,
    payload: proposalEventPayload(proposal, source),
  });
  return proposal;
}

export async function getProposalForSource(sourceId: string): Promise<SkillProposal | undefined> {
  return getDb().skillProposals.get(sourceId);
}

export async function listProposals(workspaceId: string): Promise<SkillProposal[]> {
  const rows = await getDb().skillProposals.where('workspaceId').equals(workspaceId).toArray();
  return rows.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || right.createdAt.localeCompare(left.createdAt));
}

/** Idempotent: the existing proposal wins; a missing one is created from the current facts. */
export async function ensureProposalForSource(sourceId: string, actorType: ActorType = 'system'): Promise<Result<SkillProposal>> {
  const source = await getDb().sourceRecords.get(sourceId);
  if (!source) return notFound('Source', sourceId);
  if (!isProposalEligibleSource(source)) return invalid('Only a live YouTube source can carry a skill proposal');
  const existing = await getDb().skillProposals.get(sourceId);
  if (existing) return ok(existing);
  return withWorkspaceTx(source.workspaceId, ['skillProposals', 'sourceRecords', 'lessons', 'transcriptSegments', 'missions', 'skillGraphs'], async (ctx) => {
    const anchor = await ctx.db.sourceRecords.get(sourceId);
    if (!anchor) return notFound('Source', sourceId);
    const already = await ctx.db.skillProposals.get(sourceId);
    if (already) return ok(already);
    const facts = await readinessFacts(ctx, anchor, undefined);
    const created = await createProposalInTx(ctx, anchor, facts.lesson, { segments: facts.segments, now: isoNow() }, actorType);
    if (!created) return invalid('A proposal could not be derived from this source');
    if (created.readiness !== facts.readiness || created.missionId !== facts.missionId || created.skillGraphId !== facts.skillGraphId) {
      const next: SkillProposal = { ...created, readiness: facts.readiness, missionId: facts.missionId, skillGraphId: facts.skillGraphId, updatedAt: isoNow() };
      await ctx.db.skillProposals.put(next);
      return ok(next);
    }
    return ok(created);
  });
}

/**
 * Re-derives every proposal in the workspace from persisted facts: sources that
 * arrived without one get one, readiness follows transcripts, drafts, and
 * exact-revision approvals, and a stale approval falls back to drafted.
 */
export async function syncProposals(workspaceId: string, actorType: ActorType = 'system'): Promise<SkillProposal[]> {
  await withWorkspaceTx(workspaceId, ['skillProposals', 'sourceRecords', 'lessons', 'transcriptSegments', 'missions', 'skillGraphs'], async (ctx) => {
    const sources = await ctx.db.sourceRecords.where('workspaceId').equals(workspaceId).toArray();
    for (const source of sources) {
      if (!isProposalEligibleSource(source)) continue;
      const current = await ctx.db.skillProposals.get(source.id);
      const facts = await readinessFacts(ctx, source, current);
      if (!current) {
        const created = await createProposalInTx(ctx, source, facts.lesson, { segments: facts.segments, now: isoNow() }, actorType);
        if (created && (created.readiness !== facts.readiness || created.missionId !== facts.missionId || created.skillGraphId !== facts.skillGraphId)) {
          await ctx.db.skillProposals.put({ ...created, readiness: facts.readiness, missionId: facts.missionId, skillGraphId: facts.skillGraphId });
        }
        continue;
      }
      const steps = current.candidateSteps.length === 0 && facts.segments.length > 0 ? candidateStepsFrom(facts.segments) : current.candidateSteps;
      const name = current.candidateSteps.length === 0 && facts.segments.length > 0
        ? truncate(autoNameSkill(facts.lesson?.title ?? current.sourceTitle, deriveSkillFromTranscript(facts.segments)), MAX_PROPOSAL_NAME_CHARS)
        : current.name;
      const changed = current.readiness !== facts.readiness
        || current.missionId !== facts.missionId
        || current.skillGraphId !== facts.skillGraphId
        || steps.length !== current.candidateSteps.length
        || name !== current.name;
      if (!changed) continue;
      const next: SkillProposal = {
        ...current,
        readiness: facts.readiness,
        missionId: facts.missionId,
        skillGraphId: facts.skillGraphId,
        candidateSteps: steps,
        name,
        updatedAt: isoNow(),
      };
      await ctx.db.skillProposals.put(next);
      ctx.emit({
        type: 'skill_proposal.updated', actorType, objectType: 'skill_proposal', objectId: next.id,
        summary: `Skill proposal "${next.name}" is now ${next.readiness}`,
        payload: { ...proposalEventPayload(next, source), previousReadiness: current.readiness },
      });
    }
  });
  return listProposals(workspaceId);
}

/** Only a person can set a proposal aside. It stays dismissed through later syncs. */
export async function dismissProposal(proposalId: string, actorType: ActorType = 'human'): Promise<Result<SkillProposal>> {
  if (actorType !== 'human') return approvalRequired('Only a person can dismiss a skill proposal');
  const current = await getDb().skillProposals.get(proposalId);
  if (!current) return notFound('Skill proposal', proposalId);
  if (current.readiness === 'dismissed') return ok(current);
  return withWorkspaceTx(current.workspaceId, ['skillProposals', 'sourceRecords'], async (ctx) => {
    const anchor = await ctx.db.skillProposals.get(proposalId);
    if (!anchor) return notFound('Skill proposal', proposalId);
    const source = await ctx.db.sourceRecords.get(anchor.sourceId);
    const next: SkillProposal = { ...anchor, readiness: 'dismissed', updatedAt: isoNow() };
    await ctx.db.skillProposals.put(next);
    ctx.emit({
      type: 'skill_proposal.dismissed', actorType, objectType: 'skill_proposal', objectId: next.id,
      summary: `Skill proposal "${next.name}" dismissed`,
      payload: source ? proposalEventPayload(next, source) : { sourceId: next.sourceId, readiness: next.readiness },
    });
    return ok(next);
  });
}
