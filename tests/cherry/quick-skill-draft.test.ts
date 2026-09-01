import { describe, expect, it } from 'vitest';
import {
  QUICK_SKILL_DRAFT_MAX_AGE_MS,
  clearQuickSkillDraft,
  hasQuickSkillDraftContent,
  keptIndicesForLesson,
  parseQuickSkillDraft,
  quickSkillDraftMatches,
  readQuickSkillDraft,
  serializeQuickSkillDraft,
  writeQuickSkillDraft,
  type QuickSkillDraft,
} from '../../src/cherry/skillgraph/quick-skill-draft.ts';

const savedAt = '2026-09-01T20:00:00.000Z';

function draft(overrides: Partial<QuickSkillDraft> = {}): QuickSkillDraft {
  return {
    schemaVersion: 1,
    savedAt,
    workspaceId: 'ws_one',
    sourceId: 'src_one',
    material: '',
    sourceChoice: 'paste',
    transcriptText: '0:05 Check the evidence before release.',
    transcriptSource: 'user_text',
    additionalSourceText: '',
    skillName: 'Release review',
    kept: { lessonId: 'lesson_one', lessonRevision: 4, indices: [0, 2] },
    ...overrides,
  };
}

describe('Quick Skill local draft', () => {
  it('round-trips only the bounded, versioned recovery fields', () => {
    const encoded = serializeQuickSkillDraft(draft());
    expect(encoded).not.toBeNull();

    const parsed = parseQuickSkillDraft(encoded!, Date.parse(savedAt) + 60_000);
    expect(parsed).toEqual(draft());
    expect(parsed).not.toHaveProperty('graphId');
    expect(parsed).not.toHaveProperty('approval');
  });

  it('fails closed for unknown versions, stale drafts, invalid selections, and oversized content', () => {
    expect(parseQuickSkillDraft(JSON.stringify({ ...draft(), schemaVersion: 2 }), Date.parse(savedAt))).toBeNull();
    expect(parseQuickSkillDraft(JSON.stringify(draft()), Date.parse(savedAt) + QUICK_SKILL_DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(parseQuickSkillDraft(JSON.stringify({ ...draft(), kept: { lessonId: 'lesson_one', lessonRevision: 0, indices: [-1] } }), Date.parse(savedAt))).toBeNull();
    expect(serializeQuickSkillDraft(draft({ transcriptText: 'x'.repeat(2_100_000) }))).toBeNull();
  });

  it('requires the exact workspace and, when supplied, exact source anchor', () => {
    const value = draft();
    expect(quickSkillDraftMatches(value, 'ws_one')).toBe(true);
    expect(quickSkillDraftMatches(value, 'ws_one', 'src_one')).toBe(true);
    expect(quickSkillDraftMatches(value, 'ws_two')).toBe(false);
    expect(quickSkillDraftMatches(value, 'ws_one', 'src_two')).toBe(false);
  });

  it('restores kept steps only for the exact lesson revision and current step range', () => {
    const value = draft();
    expect(keptIndicesForLesson(value, 'lesson_one', 4, 3)).toEqual([0, 2]);
    expect(keptIndicesForLesson(value, 'lesson_one', 5, 3)).toBeNull();
    expect(keptIndicesForLesson(value, 'lesson_two', 4, 3)).toBeNull();
    expect(keptIndicesForLesson(draft({ kept: { lessonId: 'lesson_one', lessonRevision: 4, indices: [0, 9] } }), 'lesson_one', 4, 3)).toEqual([0]);
  });

  it('treats blocked storage as a non-fatal missing draft', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(readQuickSkillDraft(storage, Date.parse(savedAt))).toBeNull();
    expect(writeQuickSkillDraft(storage, draft())).toBe(false);
    expect(clearQuickSkillDraft(storage)).toBe(false);
  });

  it('does not retain an empty new-flow draft after Teach another', () => {
    const empty = draft({
      workspaceId: null,
      sourceId: null,
      material: '',
      sourceChoice: null,
      transcriptText: '',
      additionalSourceText: '',
      skillName: '',
      kept: null,
    });
    expect(hasQuickSkillDraftContent(empty)).toBe(false);
    expect(hasQuickSkillDraftContent({ ...empty, material: 'notes' })).toBe(true);
    expect(hasQuickSkillDraftContent({ ...empty, sourceId: 'src_one' })).toBe(true);
  });
});
