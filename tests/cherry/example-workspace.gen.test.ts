import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { freshDb } from '../setup.ts';
import { createMission, createWorkspace, transitionMission, updateMission } from '../../src/cherry/mission/mission-service.ts';
import { loadLesson, importTranscript, recordObservation, addCoverageCriterion } from '../../src/cherry/watch/lesson-service.ts';
import { addEvidence, setEvidenceTrust } from '../../src/cherry/evidence/evidence-service.ts';
import { draftSkillGraph, decideSkillGraphApproval, requestSkillGraphApproval } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { proposeMemory, decideMemory } from '../../src/cherry/memory/memory-service.ts';
import { createArtifactSet, writeArtifactFile } from '../../src/cherry/artifacts/artifact-service.ts';
import { runVerification } from '../../src/cherry/verify/verification-service.ts';
import { createProofReceipt } from '../../src/cherry/proof/proof-service.ts';
import { exportWorkspace } from '../../src/cherry/persistence/workspace-archive.ts';
import { unwrap } from '../../src/cherry/core/result.ts';

/**
 * Generates the shipped importable example workspace from REAL domain
 * operations — it is a genuine export, not hand-written fake state. Run with:
 *   GENERATE_EXAMPLE=1 npx vitest run tests/cherry/example-workspace.gen.test.ts
 */
describe('example workspace generator', () => {
  it.skipIf(!process.env.GENERATE_EXAMPLE)('generates public/examples/example-workspace.json', async () => {
    freshDb();
    const workspace = unwrap(await createWorkspace({ name: 'EXAMPLE — Learn a landing page workflow', description: 'Shipped example workspace. Safe to delete. Everything in it was produced by real Cherry operations.' }));
    const mission = unwrap(
      await createMission({
        workspaceId: workspace.id,
        title: 'Build a landing snippet the lesson way',
        objective: 'Learn the transferable process from a permitted lesson and produce an accessible landing snippet with proof.',
        definitionOfDone: ['index.html exists with an h1', 'Verification passes with zero blocking failures'],
      }),
    );
    const lesson = unwrap(
      await loadLesson({ workspaceId: workspace.id, missionId: mission.id, title: 'Accessible landing pages (example lesson)', kind: 'manual' }),
    );
    unwrap(await updateMission(mission.id, { lessonId: lesson.id }));
    unwrap(await transitionMission(mission.id, 'LEARNING'));
    unwrap(
      await importTranscript(
        lesson.id,
        '[0:05] Start from a blank index.html file\n\n[0:40] Wrap the visible content in a main landmark\n\n[1:20] The page heading must be a real h1, not styled text\n\n[2:00] Check the result with an accessibility pass before shipping',
        'user_text',
      ),
    );
    unwrap(await recordObservation({ lessonId: lesson.id, timestampSeconds: 40, kind: 'visual', text: 'Presenter drags content inside a main element', transferability: 'transferable' }));
    unwrap(await recordObservation({ lessonId: lesson.id, timestampSeconds: 80, kind: 'spoken', text: 'A real h1 matters for screen readers and SEO', transferability: 'transferable' }));
    unwrap(await addCoverageCriterion(lesson.id, { label: 'Setup and structure', startSeconds: 0, endSeconds: 120 }));
    const evidence = unwrap(
      await addEvidence({
        workspaceId: workspace.id,
        missionId: mission.id,
        lessonId: lesson.id,
        sourceType: 'transcript',
        claim: 'Semantic landmarks (main, h1) are the transferable core of the lesson',
        provenanceMethod: 'user_typed',
        transferability: 'transferable',
        confidence: 0.9,
      }),
    );
    unwrap(await setEvidenceTrust(evidence.id, 'reviewed', 'human'));

    const graph = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        missionId: mission.id,
        name: 'Accessible landing snippet',
        purpose: 'Build small landing snippets with semantic landmarks and verified accessibility basics.',
        nodes: [
          { kind: 'build', title: 'Write index.html with landmarks', goal: 'Create the page with main and a real h1', evidenceIds: [] },
          { kind: 'verification', title: 'Run deterministic checks', goal: 'File, DOM, hash, and accessibility assertions pass' },
        ],
      }),
    );
    unwrap(await updateMission(mission.id, { skillGraphId: graph.id }));
    unwrap(await transitionMission(mission.id, 'PLANNING'));
    const request = unwrap(await requestSkillGraphApproval(graph.id, 'Example: review the drafted skill', 'user'));
    unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));
    unwrap(await transitionMission(mission.id, 'AWAITING_APPROVAL'));
    unwrap(await transitionMission(mission.id, 'EXECUTING'));

    const artifactSet = unwrap(await createArtifactSet(workspace.id, mission.id, 'Landing snippet artifacts'));
    unwrap(await updateMission(mission.id, { artifactSetId: artifactSet.id }));
    unwrap(
      await writeArtifactFile(
        artifactSet.id,
        'index.html',
        '<html lang="en"><head><title>Example landing snippet</title></head><body><main><h1>Ship with landmarks</h1><p>Produced inside the Cherry example workspace.</p></main></body></html>',
        'human',
        'Example artifact',
      ),
    );
    unwrap(await transitionMission(mission.id, 'VERIFYING'));
    const verification = unwrap(await runVerification({ missionId: mission.id }));
    expect(verification.status).toBe('passed');
    unwrap(await transitionMission(mission.id, 'COMPLETE'));
    unwrap(await createProofReceipt(mission.id));

    const memory = unwrap(
      await proposeMemory({
        workspaceId: workspace.id,
        missionId: mission.id,
        type: 'procedure',
        title: 'Landing snippets always get main + h1',
        content: 'When building landing snippets, wrap content in a main landmark and use a real h1 before any styling work.',
        scope: 'workspace',
        provenance: [{ sourceType: 'video-transcript', trust: 'reviewed', description: 'Example lesson transcript, 0:40–1:20' }],
      }),
    );
    unwrap(await decideMemory(memory.id, 'approved', 'user'));

    const exported = unwrap(await exportWorkspace(workspace.id));
    mkdirSync('public/examples', { recursive: true });
    writeFileSync('public/examples/example-workspace.json', JSON.stringify(exported, null, 2));
    expect(exported.integrity.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
