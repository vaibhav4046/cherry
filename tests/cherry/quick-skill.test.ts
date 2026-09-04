import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { deriveSkillFromTranscript } from '../../src/cherry/skillgraph/auto-draft.ts';
import { generateSkillFromLesson, previewQuickSkill } from '../../src/cherry/skillgraph/quick-skill.ts';
import { createMission, createWorkspace, updateMission } from '../../src/cherry/mission/mission-service.ts';
import { importTranscript, loadLesson } from '../../src/cherry/watch/lesson-service.ts';
import { addEvidence, listEvidence } from '../../src/cherry/evidence/evidence-service.ts';
import { LANDING_PAGE_IDEAS, LANDING_PAGE_PRINCIPLE, landingPageTranscript } from '../fixtures/landing-page-transcript.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { listApprovals, requestSkillGraphApproval, decideSkillGraphApproval } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { compileSkillBundle } from '../../src/cherry/compiler/archive-builder.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import type { TranscriptSegment } from '../../src/cherry/watch/watch-model.ts';
import { runVerification } from '../../src/cherry/verify/verification-service.ts';

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
    unwrap(await runVerification({ missionId: mission.id }));
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

  it('labels runner-fetched transcript evidence as a tool result', async () => {
    const { workspace, lesson } = await seededLesson();
    unwrap(await importTranscript(lesson.id, '0:05 Create the frame.\n\n0:40 Check alignment.', 'runner_fetch', undefined, 'runner'));
    unwrap(await generateSkillFromLesson({ lessonId: lesson.id, name: 'Runner evidence' }));
    const evidence = await listEvidence(workspace.id);
    expect(evidence.every((record) => record.provenanceMethod === 'tool_result')).toBe(true);
  });

  it('preserves local transcription provenance through generated evidence', async () => {
    const { workspace, lesson } = await seededLesson();
    unwrap(await importTranscript(lesson.id, '0:05 Create the frame.\n\n0:40 Check alignment.', 'local_transcription'));
    unwrap(await generateSkillFromLesson({ lessonId: lesson.id, name: 'Local transcription' }));
    const evidence = await listEvidence(workspace.id);
    expect(evidence.every((record) => record.provenanceMethod === 'local_transcription')).toBe(true);
  });

  it('maps each mixed transcript step to its own provenance rather than the latest import', async () => {
    const { workspace, lesson } = await seededLesson();
    unwrap(await importTranscript(lesson.id, '0:05 Create the pasted frame.', 'user_text'));
    unwrap(await importTranscript(lesson.id, '0:40 Check the uploaded alignment.', 'user_upload', 'notes.txt', 'human', 'append'));
    const generated = unwrap(await generateSkillFromLesson({ lessonId: lesson.id, name: 'Mixed provenance' }));
    const evidence = await listEvidence(workspace.id);
    expect(generated.evidenceCount).toBe(2);
    expect(evidence.find((record) => record.claim.includes('pasted frame'))?.provenanceMethod).toBe('user_typed');
    expect(evidence.find((record) => record.claim.includes('uploaded alignment'))?.provenanceMethod).toBe('user_upload');
  });

  it('records approval requests as a human action while retaining the named requester', async () => {
    const { workspace, lesson } = await seededLesson();
    unwrap(await importTranscript(lesson.id, '0:05 Create the frame.\n\n0:40 Check alignment.', 'user_text'));
    const generated = unwrap(await generateSkillFromLesson({ lessonId: lesson.id, name: 'Human approval' }));
    unwrap(await requestSkillGraphApproval(generated.graph.id, 'Reviewed by the person', 'user', 'human'));
    const event = (await listProofEvents(workspace.id)).find((candidate) => candidate.type === 'skillgraph.approval_requested');
    expect(event?.actorType).toBe('human');
    expect((await listApprovals(workspace.id))[0]?.requestedBy).toBe('user');
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

describe('autoNameSkill', () => {
  it('keeps a task-shaped lesson title and never strands a possessive step object', async () => {
    const { autoNameSkill } = await import('../../src/cherry/skillgraph/quick-skill.ts');
    const draft = {
      steps: [{ kind: 'build', title: 'Open your calendar and add three recording slots for the week.' }],
      principles: [],
    } as unknown as Parameters<typeof autoNameSkill>[1];
    expect(autoNameSkill('Plan a week of content in one sitting', draft)).toBe('Plan a week of content in one sitting skill');
    expect(autoNameSkill('Ep. 12', draft)).toBe('Ep. 12 skill');
    const hero = {
      steps: [{ kind: 'build', title: 'Create a new frame for the hero section, then name it.' }],
      principles: [],
    } as unknown as Parameters<typeof autoNameSkill>[1];
    expect(autoNameSkill('Ep. 12', hero)).toBe('Frame for the hero section workflow');
  });

  it('names a guidance-only lesson from its title or its rules, never from the placeholder step', async () => {
    const { autoNameSkill } = await import('../../src/cherry/skillgraph/quick-skill.ts');
    const { FALLBACK_STEP_TITLE } = await import('../../src/cherry/skillgraph/auto-draft.ts');
    const draft = {
      steps: [{ kind: 'research', title: FALLBACK_STEP_TITLE }],
      principles: ['Never make a visitor scroll to work out what you sell.'],
    } as unknown as Parameters<typeof autoNameSkill>[1];
    expect(autoNameSkill('Landing page teardown', draft)).toBe('Landing page teardown skill');
    // Too thin a title to name anything: the rule the source insists on names it instead.
    expect(autoNameSkill('Ep. 12', draft)).toContain('visitor scroll');
    expect(autoNameSkill('Ep. 12', draft)).not.toContain('Review the lesson material');
  });
});

describe('landing-page transcript regression', () => {
  beforeEach(() => {
    freshDb();
  });

  /** What a person or agent already recorded while watching, before Quick Skill ran. */
  const RECORDED_WHILE_WATCHING: ReadonlyArray<{ claim: string; timestampSeconds: number }> = [
    // Two verbatim quotes of transcript lines Quick Skill also turns into steps.
    { claim: 'The headline should lead with the outcome the visitor gets, not the feature you shipped.', timestampSeconds: 14 },
    { claim: 'Cut generic copy like innovative solutions and world-class platform, because it says nothing.', timestampSeconds: 134 },
    // Three notes in the watcher's own words, timed to the moment they came from.
    { claim: 'One call to action keeps the decision single.', timestampSeconds: 51 },
    { claim: 'Proof and claim sit side by side on the page.', timestampSeconds: 72 },
    { claim: 'Five seconds is the comprehension budget.', timestampSeconds: 96 },
  ];

  async function landingLesson() {
    const workspace = unwrap(await createWorkspace({ name: 'Landing workspace' }));
    const lesson = unwrap(await loadLesson({ workspaceId: workspace.id, title: 'Landing page teardown', kind: 'manual' }));
    unwrap(await importTranscript(lesson.id, landingPageTranscript(), 'user_text'));
    for (const note of RECORDED_WHILE_WATCHING) {
      unwrap(
        await addEvidence(
          { workspaceId: workspace.id, lessonId: lesson.id, sourceType: 'transcript', provenanceMethod: 'agent_observation', ...note },
          'agent',
        ),
      );
    }
    return { workspace, lesson };
  }

  it('turns declarative prose into a node per idea instead of one review node', async () => {
    const { lesson } = await landingLesson();
    const generated = unwrap(await generateSkillFromLesson({ lessonId: lesson.id }));

    expect(generated.graph.nodes.length).toBeGreaterThan(1);
    const covered = generated.graph.nodes.map((node) => node.goal).join(' ').toLowerCase();
    for (const [idea, phrase] of Object.entries(LANDING_PAGE_IDEAS)) {
      expect(covered, idea).toContain(phrase.toLowerCase());
    }
    expect(generated.graph.name).not.toBe('Review the lesson material workflow');
    expect(generated.graph.purpose).toContain(LANDING_PAGE_PRINCIPLE);
    // Every node still traces back to the transcript it came from.
    const transcript = landingPageTranscript();
    for (const step of generated.draft.steps) {
      expect(transcript).toContain(step.sourceText);
    }
  });

  it('counts the evidence the lesson already carried and stores no claim twice', async () => {
    const { workspace, lesson } = await landingLesson();
    const generated = unwrap(await generateSkillFromLesson({ lessonId: lesson.id }));

    const cited = new Set(generated.graph.nodes.flatMap((node) => node.evidenceIds));
    expect(generated.evidenceCount).toBe(cited.size);
    expect(generated.evidenceCount).toBeGreaterThan(generated.graph.nodes.length);

    const stored = await listEvidence(workspace.id, { lessonId: lesson.id });
    // The two verbatim notes are reused, not duplicated.
    expect(new Set(stored.map((record) => record.claim)).size).toBe(stored.length);
    for (const id of cited) {
      expect(stored.some((record) => record.id === id), id).toBe(true);
    }
    // A watcher's note is cited by the node built from the moment it was recorded.
    const proofNode = generated.graph.nodes.find((node) => node.goal.includes('proof next to the claim'));
    const proofNote = stored.find((record) => record.claim === 'Proof and claim sit side by side on the page.');
    expect(proofNode?.evidenceIds).toContain(proofNote!.id);

    // Generating a second time reuses the same claims instead of growing the ledger.
    unwrap(await generateSkillFromLesson({ lessonId: lesson.id }));
    expect((await listEvidence(workspace.id, { lessonId: lesson.id })).length).toBe(stored.length);
  });
});
