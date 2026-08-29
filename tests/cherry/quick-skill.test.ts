import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { deriveSkillFromTranscript } from '../../src/cherry/skillgraph/auto-draft.ts';
import { generateSkillFromLesson, previewQuickSkill } from '../../src/cherry/skillgraph/quick-skill.ts';
import { createMission, createWorkspace, updateMission } from '../../src/cherry/mission/mission-service.ts';
import { importTranscript, loadLesson } from '../../src/cherry/watch/lesson-service.ts';
import { listEvidence } from '../../src/cherry/evidence/evidence-service.ts';
import { requestSkillGraphApproval, decideSkillGraphApproval } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { compileSkillBundle } from '../../src/cherry/compiler/archive-builder.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import type { TranscriptSegment } from '../../src/cherry/watch/watch-model.ts';

function segment(index: number, start: number, text: string): TranscriptSegment {
  return { id: `s${index}`, workspaceId: 'ws', lessonId: 'ls', index, startSeconds: start, endSeconds: start + 20, text, source: 'user_text' };
}

describe('deriveSkillFromTranscript', () => {
  it('turns imperative sentences into steps and rule-like sentences into principles', () => {
    const draft = deriveSkillFromTranscript([
      segment(0, 5, 'Create a new index.html file for the project.'),
      segment(1, 40, 'Always make sure the page has a real h1 heading.'),
      segment(2, 80, 'Wrap the visible content in a main landmark element.'),
      segment(3, 120, 'Check the result with an accessibility pass.'),
      segment(4, 160, 'So that is basically the whole idea of the video.'),
    ]);
    expect(draft.steps.map((step) => step.kind)).toEqual(['build', 'build', 'verification']);
    expect(draft.steps[0]!.timestampSeconds).toBe(5);
    expect(draft.steps[0]!.title).toContain('Create a new index.html');
    expect(draft.principles.some((principle) => principle.includes('real h1'))).toBe(true);
  });

  it('caps steps at 10 with an even spread across the lesson', () => {
    const segments = Array.from({ length: 40 }, (_, index) =>
      segment(index, index * 30, `Create component number ${index} in the editor.`),
    );
    const draft = deriveSkillFromTranscript(segments);
    expect(draft.steps).toHaveLength(10);
    // Spread: last chosen step comes from the back half of the lesson.
    expect(draft.steps[9]!.timestampSeconds).toBeGreaterThan(500);
  });

  it('falls back to a single review step when nothing imperative exists', () => {
    const draft = deriveSkillFromTranscript([segment(0, 0, 'Welcome along, this is a relaxed talk about ideas and history.')]);
    expect(draft.steps).toHaveLength(1);
    expect(draft.steps[0]!.kind).toBe('research');
  });

  it('is deterministic', () => {
    const segments = [segment(0, 0, 'Open the settings panel now.'), segment(1, 30, 'Add a new token to the palette.')];
    expect(deriveSkillFromTranscript(segments)).toEqual(deriveSkillFromTranscript(segments));
  });
});

describe('quick skill pipeline', () => {
  beforeEach(() => {
    freshDb();
  });

  async function seededLesson() {
    const workspace = unwrap(await createWorkspace({ name: 'Quick workspace' }));
    const mission = unwrap(
      await createMission({
        workspaceId: workspace.id,
        title: 'Quick mission',
        objective: 'Learn the video workflow',
        definitionOfDone: ['SkillGraph approved', 'Verification passes'],
      }),
    );
    const lesson = unwrap(
      await loadLesson({
        workspaceId: workspace.id,
        missionId: mission.id,
        title: 'Layout basics',
        kind: 'youtube',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        permissionAcknowledged: true,
      }),
    );
    unwrap(await updateMission(mission.id, { lessonId: lesson.id }));
    return { workspace, mission, lesson };
  }

  it('refuses to generate without a transcript', async () => {
    const { lesson } = await seededLesson();
    const preview = await previewQuickSkill(lesson.id);
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.error.message).toContain('transcript');
  });

  it('generates evidence-linked graph from a transcript, end to end through compile', async () => {
    const { workspace, mission, lesson } = await seededLesson();
    unwrap(
      await importTranscript(
        lesson.id,
        [
          '[0:05] Create a new frame for the hero section.',
          '',
          '[0:40] Always keep the heading a real h1 for accessibility.',
          '',
          '[1:10] Add the navigation bar with pill buttons.',
          '',
          '[1:50] Check the spacing against the 4px grid.',
        ].join('\n'),
        'user_text',
      ),
    );

    const preview = unwrap(await previewQuickSkill(lesson.id));
    expect(preview.steps.length).toBeGreaterThanOrEqual(3);

    const generated = unwrap(await generateSkillFromLesson({ lessonId: lesson.id, name: 'Hero Section Workflow' }));
    expect(generated.graph.name).toBe('Hero Section Workflow');
    expect(generated.graph.nodes.length).toBe(preview.steps.length);
    expect(generated.evidenceCount).toBe(preview.steps.length);

    // Every node carries transcript evidence with a timestamp; evidence is untrusted.
    const evidence = await listEvidence(workspace.id, { missionId: mission.id });
    const transcriptEvidence = evidence.filter((record) => record.sourceType === 'transcript');
    expect(transcriptEvidence.length).toBe(generated.evidenceCount);
    for (const record of transcriptEvidence) {
      expect(record.trust).toBe('untrusted');
      expect(typeof record.timestampSeconds).toBe('number');
      expect(record.sourceUri).toContain('youtube.com');
    }
    for (const node of generated.graph.nodes) {
      expect(node.evidenceIds.length).toBeGreaterThan(0);
    }

    // Human approval still required, then the bundle compiles for real.
    const bad = await compileSkillBundle(generated.graph.id);
    expect(bad.ok).toBe(false);
    const request = unwrap(await requestSkillGraphApproval(generated.graph.id, 'Quick skill review', 'user'));
    unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));
    const bundle = unwrap(await compileSkillBundle(generated.graph.id));
    expect(bundle.fileName).toBe('hero-section-workflow-v0.1.0.zip');
  });

  it('respects kept step selection and validates emptiness', async () => {
    const { lesson } = await seededLesson();
    unwrap(await importTranscript(lesson.id, '[0:05] Create the frame.\n\n[0:40] Add the header.\n\n[1:10] Check alignment.', 'user_text'));
    const preview = unwrap(await previewQuickSkill(lesson.id));
    expect(preview.steps.length).toBe(3);

    const partial = unwrap(await generateSkillFromLesson({ lessonId: lesson.id, name: 'Partial', keepStepIndices: [0, 2] }));
    expect(partial.graph.nodes).toHaveLength(2);

    const none = await generateSkillFromLesson({ lessonId: lesson.id, name: 'None', keepStepIndices: [] });
    expect(none.ok).toBe(false);
  });
});

describe('multi-source ingestion and auto-naming', () => {
  beforeEach(() => {
    freshDb();
  });

  it('append mode adds a second source after the first, shifting untimed content', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Sources workspace' }));
    const lesson = unwrap(await loadLesson({ workspaceId: workspace.id, title: 'Multi-source', kind: 'manual' }));
    unwrap(await importTranscript(lesson.id, '0:05 Create the frame\n0:40 Add the header', 'user_text'));
    const appended = unwrap(
      await importTranscript(lesson.id, 'Check contrast before shipping the page.', 'user_upload', 'notes.txt', 'human', 'append'),
    );
    expect(appended.totalSegments).toBe(3);
    const { listTranscript } = await import('../../src/cherry/watch/lesson-service.ts');
    const segments = await listTranscript(lesson.id);
    expect(segments).toHaveLength(3);
    // The untimed note lands after the timed content, keeping the timeline monotonic.
    expect(segments[2]!.startSeconds).toBeGreaterThan(segments[1]!.endSeconds);
    expect(segments[2]!.source).toBe('user_upload');
  });

  it('auto-names the skill from content when no name is given', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Autoname workspace' }));
    const lesson = unwrap(await loadLesson({ workspaceId: workspace.id, title: 'Untitled paste', kind: 'manual' }));
    unwrap(await importTranscript(lesson.id, '0:05 Create a responsive pricing table with three tiers\n0:40 Check alignment on mobile', 'user_text'));
    const generated = unwrap(await generateSkillFromLesson({ lessonId: lesson.id }));
    expect(generated.graph.name.toLowerCase()).toContain('pricing table');
    expect(generated.graph.name).toContain('workflow');
    expect(generated.graph.name.length).toBeLessThanOrEqual(120);
  });
});
