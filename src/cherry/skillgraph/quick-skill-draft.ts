import type { HumanTranscriptSource } from '../source/source-service.ts';

export const QUICK_SKILL_DRAFT_STORAGE_KEY = 'cherry.quickSkillDraft.v1';
export const QUICK_SKILL_DRAFT_KEY = QUICK_SKILL_DRAFT_STORAGE_KEY;
export const QUICK_SKILL_DRAFT_MAX_BYTES = 2 * 1024 * 1024;
export const QUICK_SKILL_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_ID_LENGTH = 200;
const MAX_MATERIAL_LENGTH = 1_000_000;
const MAX_TRANSCRIPT_LENGTH = 1_500_000;
const MAX_ADDITIONAL_SOURCE_LENGTH = 1_000_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const transcriptSources = new Set<HumanTranscriptSource>([
  'user_text',
  'user_upload',
  'creator_authorized_captions',
  'local_transcription',
]);

export interface QuickSkillDraftSelection {
  lessonId: string;
  lessonRevision: number;
  indices: number[];
}

/**
 * Recovery state only. Durable records, approval authority, file handles,
 * media, runner credentials, and verification state never belong here.
 */
export interface QuickSkillDraft {
  schemaVersion: 1;
  savedAt: string;
  workspaceId: string | null;
  sourceId: string | null;
  material: string;
  sourceChoice: 'paste' | 'transcribe' | null;
  transcriptText: string;
  transcriptSource: HumanTranscriptSource;
  additionalSourceText: string;
  skillName: string;
  kept: QuickSkillDraftSelection | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedId(value: unknown, nullable = false): string | null | undefined {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_ID_LENGTH) return undefined;
  return value;
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.length <= maxLength ? value : undefined;
}

function normalizeSelection(value: unknown): QuickSkillDraftSelection | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const lessonId = boundedId(value['lessonId']);
  const lessonRevision = value['lessonRevision'];
  const rawIndices = value['indices'];
  if (
    typeof lessonId !== 'string'
    || !Number.isSafeInteger(lessonRevision)
    || (lessonRevision as number) < 1
    || !Array.isArray(rawIndices)
    || rawIndices.length > 100
    || rawIndices.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= 100)
  ) return undefined;
  const indices = [...new Set(rawIndices as number[])].sort((a, b) => a - b);
  return { lessonId, lessonRevision: lessonRevision as number, indices };
}

function normalizeDraft(value: unknown, nowMs: number, enforceAge: boolean): QuickSkillDraft | null {
  if (!isRecord(value) || value['schemaVersion'] !== 1) return null;
  const savedAt = value['savedAt'];
  if (typeof savedAt !== 'string') return null;
  const savedAtMs = Date.parse(savedAt);
  if (!Number.isFinite(savedAtMs) || new Date(savedAtMs).toISOString() !== savedAt) return null;
  if (savedAtMs > nowMs + MAX_CLOCK_SKEW_MS) return null;
  if (enforceAge && nowMs - savedAtMs > QUICK_SKILL_DRAFT_MAX_AGE_MS) return null;

  const workspaceId = boundedId(value['workspaceId'], true);
  const sourceId = boundedId(value['sourceId'], true);
  const material = boundedText(value['material'], MAX_MATERIAL_LENGTH);
  const transcriptText = boundedText(value['transcriptText'], MAX_TRANSCRIPT_LENGTH);
  const additionalSourceText = boundedText(value['additionalSourceText'], MAX_ADDITIONAL_SOURCE_LENGTH);
  const skillName = boundedText(value['skillName'], 120);
  const sourceChoice = value['sourceChoice'];
  const transcriptSource = value['transcriptSource'];
  const kept = normalizeSelection(value['kept']);
  if (
    workspaceId === undefined
    || sourceId === undefined
    || material === undefined
    || transcriptText === undefined
    || additionalSourceText === undefined
    || skillName === undefined
    || (sourceChoice !== null && sourceChoice !== 'paste' && sourceChoice !== 'transcribe')
    || typeof transcriptSource !== 'string'
    || !transcriptSources.has(transcriptSource as HumanTranscriptSource)
    || kept === undefined
  ) return null;

  return {
    schemaVersion: 1,
    savedAt,
    workspaceId,
    sourceId,
    material,
    sourceChoice,
    transcriptText,
    transcriptSource: transcriptSource as HumanTranscriptSource,
    additionalSourceText,
    skillName,
    kept,
  };
}

export function parseQuickSkillDraft(raw: string, nowMs = Date.now()): QuickSkillDraft | null {
  if (raw.length === 0 || raw.length > QUICK_SKILL_DRAFT_MAX_BYTES) return null;
  try {
    return normalizeDraft(JSON.parse(raw) as unknown, nowMs, true);
  } catch {
    return null;
  }
}

export function serializeQuickSkillDraft(draft: QuickSkillDraft): string | null {
  const savedAtMs = Date.parse(draft.savedAt);
  const normalized = normalizeDraft(draft, Number.isFinite(savedAtMs) ? savedAtMs : Date.now(), false);
  if (!normalized) return null;
  const raw = JSON.stringify(normalized);
  return raw.length <= QUICK_SKILL_DRAFT_MAX_BYTES ? raw : null;
}

export function quickSkillDraftMatches(
  draft: QuickSkillDraft,
  workspaceId: string | null,
  sourceId?: string | null,
): boolean {
  if (draft.workspaceId !== workspaceId) return false;
  return sourceId === undefined || draft.sourceId === sourceId;
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readQuickSkillDraft(storage: DraftStorage, nowMs = Date.now()): QuickSkillDraft | null {
  try {
    const raw = storage.getItem(QUICK_SKILL_DRAFT_STORAGE_KEY);
    return raw === null ? null : parseQuickSkillDraft(raw, nowMs);
  } catch {
    return null;
  }
}

export function writeQuickSkillDraft(storage: DraftStorage, draft: QuickSkillDraft): boolean {
  const raw = serializeQuickSkillDraft(draft);
  if (raw === null) return false;
  try {
    storage.setItem(QUICK_SKILL_DRAFT_STORAGE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearQuickSkillDraft(storage: DraftStorage): boolean {
  try {
    storage.removeItem(QUICK_SKILL_DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function keptIndicesForLesson(
  draft: QuickSkillDraft,
  lessonId: string,
  lessonRevision: number,
  stepCount: number,
): number[] | null {
  if (!draft.kept || draft.kept.lessonId !== lessonId || draft.kept.lessonRevision !== lessonRevision) return null;
  return draft.kept.indices.filter((index) => index < stepCount);
}

export function hasQuickSkillDraftContent(draft: QuickSkillDraft): boolean {
  return Boolean(
    draft.sourceId
    || draft.material
    || draft.sourceChoice
    || draft.transcriptText
    || draft.additionalSourceText
    || draft.skillName
    || draft.kept,
  );
}
