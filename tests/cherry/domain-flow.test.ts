import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import {
  createMission,
  createWorkspace,
  transitionMission,
  updateMission,
  getMission,
} from '../../src/cherry/mission/mission-service.ts';
import { addEvidence, setEvidenceTrust, listEvidence } from '../../src/cherry/evidence/evidence-service.ts';
import { importTranscript, loadLesson, lessonCoverage, recordObservation, listTranscript, deleteTranscript } from '../../src/cherry/watch/lesson-service.ts';
import {
  decideSkillGraphApproval,
  draftSkillGraph,
  requestSkillGraphApproval,
  reviseSkillGraph,
  rollbackSkillGraph,
  listSkillGraphVersions,
} from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { compileCorrection, decideMemory, listMemories, proposeMemory } from '../../src/cherry/memory/memory-service.ts';
import { createArtifactSet, writeArtifactFile, listArtifactFiles, deleteArtifactFile } from '../../src/cherry/artifacts/artifact-service.ts';
import { runVerification, recordRepair } from '../../src/cherry/verify/verification-service.ts';
import { createProofReceipt } from '../../src/cherry/proof/proof-service.ts';
import { verifyReceipt } from '../../src/cherry/proof/proof-verifier.ts';
import { exportWorkspace, importWorkspace } from '../../src/cherry/persistence/workspace-archive.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { unwrap } from '../../src/cherry/core/result.ts';

async function seedWorkspaceAndMission() {
  const workspace = unwrap(await createWorkspace({ name: 'Test workspace' }));
  const mission = unwrap(
    await createMission({
      workspaceId: workspace.id,
      title: 'Learn the demo workflow',
      objective: 'Build a landing snippet the way the lesson teaches it',
      definitionOfDone: ['An index.html exists', 'Verification passes'],
    }),
  );
  return { workspace, mission };
}

describe('workspace and mission flow', () => {
  beforeEach(() => {
    freshDb();
  });

  it('creates workspace and mission with proof events in the ledger', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const events = await listProofEvents(workspace.id);
    expect(events.map((event) => event.type)).toEqual(['workspace.created', 'mission.created']);
    expect(events[0]!.sequence).toBe(1);
    expect(events[1]!.sequence).toBe(2);
    expect(mission.state).toBe('DRAFT');
  });

  it('rejects illegal transitions in the service, not just the UI', async () => {
    const { mission } = await seedWorkspaceAndMission();
    const jump = await transitionMission(mission.id, 'COMPLETE');
    expect(jump.ok).toBe(false);
    if (!jump.ok) expect(jump.error.code).toBe('conflict');
  });

  it('validates mission input', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const bad = await createMission({ workspaceId: workspace.id, title: '', objective: 'x', definitionOfDone: [] });
    expect(bad.ok).toBe(false);
  });
});

describe('evidence trust boundary', () => {
  beforeEach(() => {
    freshDb();
  });

  it('all evidence starts untrusted and only a human can raise trust', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const record = unwrap(
      await addEvidence(
        { workspaceId: workspace.id, sourceType: 'webpage', claim: 'The tutorial says to use flexbox', sourceUri: 'https://example.com/lesson' },
        'agent',
      ),
    );
    expect(record.trust).toBe('untrusted');

    const agentAttempt = await setEvidenceTrust(record.id, 'approved', 'agent');
    expect(agentAttempt.ok).toBe(false);

    const humanChange = unwrap(await setEvidenceTrust(record.id, 'reviewed', 'human'));
    expect(humanChange.trust).toBe('reviewed');
    expect(humanChange.history.some((entry) => entry.action === 'trust_changed')).toBe(true);
  });
});

describe('lesson, transcript, and observations', () => {
  beforeEach(() => {
    freshDb();
  });

  it('requires permission acknowledgement for YouTube lessons', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const refused = await loadLesson({
      workspaceId: workspace.id,
      title: 'Video lesson',
      kind: 'youtube',
      url: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(refused.ok).toBe(false);

    const loaded = unwrap(
      await loadLesson({
        workspaceId: workspace.id,
        title: 'Video lesson',
        kind: 'youtube',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        permissionAcknowledged: true,
      }),
    );
    expect(loaded.videoId).toBe('dQw4w9WgXcQ');
    expect(loaded.permissionAcknowledgedAt).toBeTruthy();
  });

  it('imports, lists, and deletes a transcript; coverage reflects it', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const lesson = unwrap(await loadLesson({ workspaceId: workspace.id, title: 'Manual lesson', kind: 'manual' }));
    const srt = ['1', '00:00:00,000 --> 00:01:40,000', 'Intro segment'].join('\n');
    const imported = unwrap(await importTranscript(lesson.id, srt, 'user_upload', 'lesson.srt'));
    expect(imported.segmentCount).toBe(1);

    const segments = await listTranscript(lesson.id);
    expect(segments[0]!.source).toBe('user_upload');

    unwrap(await recordObservation({ lessonId: lesson.id, timestampSeconds: 30, kind: 'visual', text: 'Presenter drags the layer panel' }));
    const coverage = unwrap(await lessonCoverage(lesson.id));
    expect(coverage.transcriptSegmentCount).toBe(1);
    expect(coverage.visualObservationCount).toBe(1);
    expect(coverage.complete).toBe(false);

    unwrap(await deleteTranscript(lesson.id));
    expect(await listTranscript(lesson.id)).toHaveLength(0);
  });
});

describe('skillgraph approval lifecycle', () => {
  beforeEach(() => {
    freshDb();
  });

  async function draftGraph() {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const graph = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        missionId: mission.id,
        name: 'Landing snippet skill',
        purpose: 'Build a small landing snippet following the lesson principles',
        nodes: [
          { kind: 'build', title: 'Write index.html', goal: 'Create the landing page skeleton' },
          { kind: 'verification', title: 'Verify output', goal: 'Run deterministic checks' },
        ],
      }),
    );
    return { workspace, mission, graph };
  }

  it('drafts with a version snapshot and validation gate', async () => {
    const { graph } = await draftGraph();
    expect(graph.revision).toBe(1);
    expect(graph.status).toBe('draft');
    const versions = await listSkillGraphVersions(graph.id);
    expect(versions).toHaveLength(1);
  });

  it('stale approvals are rejected after a new revision', async () => {
    const { graph } = await draftGraph();
    const request = unwrap(await requestSkillGraphApproval(graph.id, 'Ready for review', 'agent'));
    // Graph changes AFTER the approval request:
    unwrap(await reviseSkillGraph(graph.id, { purpose: 'Updated purpose statement' }, 'Tighten purpose'));
    const decision = await decideSkillGraphApproval(request.approval.id, 'approved', 'user');
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.error.code).toBe('conflict');
  });

  it('approval binds to the exact revision and revision invalidates it', async () => {
    const { graph } = await draftGraph();
    const request = unwrap(await requestSkillGraphApproval(graph.id, 'Ready', 'agent'));
    const decided = unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));
    expect(decided.graph.status).toBe('approved');
    expect(decided.graph.approvedRevision).toBe(decided.graph.revision);

    const revised = unwrap(await reviseSkillGraph(graph.id, { purpose: 'Changed again' }, 'Post-approval edit'));
    expect(revised.status).toBe('proposed');
    expect(revised.revision).toBe(decided.graph.revision + 1);
  });

  it('rollback restores an old snapshot as a new unapproved revision', async () => {
    const { graph } = await draftGraph();
    unwrap(await reviseSkillGraph(graph.id, { purpose: 'Second purpose' }, 'Edit'));
    const rolled = unwrap(await rollbackSkillGraph(graph.id, 1));
    expect(rolled.revision).toBe(3);
    expect(rolled.purpose).toContain('landing snippet');
    expect(rolled.approvedRevision).toBeNull();
  });

  it('optimistic concurrency rejects mismatched expected revision', async () => {
    const { graph } = await draftGraph();
    const conflicted = await reviseSkillGraph(graph.id, {}, 'Concurrent edit', 'agent', 99);
    expect(conflicted.ok).toBe(false);
    if (!conflicted.ok) expect(conflicted.error.code).toBe('conflict');
  });
});

describe('memory inbox', () => {
  beforeEach(() => {
    freshDb();
  });

  it('proposals require approval before becoming active', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const proposal = unwrap(
      await proposeMemory(
        {
          workspaceId: workspace.id,
          type: 'preference',
          title: 'Prefers TypeScript strict mode',
          content: 'Always enable strict mode in new projects',
          scope: 'workspace',
          provenance: [{ sourceType: 'human', trust: 'reviewed', description: 'Stated during mission setup' }],
        },
        'agent',
      ),
    );
    expect(proposal.status).toBe('proposed');
    const inbox = await listMemories(workspace.id, { status: 'proposed' });
    expect(inbox).toHaveLength(1);

    const approved = unwrap(await decideMemory(proposal.id, 'approved', 'user'));
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('user');

    const doubleDecide = await decideMemory(proposal.id, 'approved', 'user');
    expect(doubleDecide.ok).toBe(false);
  });

  it('correction compiler creates a scoped proposal linked to the failure', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const compiled = unwrap(
      await compileCorrection({
        workspaceId: workspace.id,
        missionId: mission.id,
        correctionClass: 'mission_rule',
        whatFailed: 'Generated HTML had no title element',
        approvedFix: 'Always include a descriptive <title>',
      }),
    );
    expect(compiled.memory.status).toBe('proposed');
    expect(compiled.memory.scope).toBe('mission');
    expect(compiled.memory.type).toBe('correction');
    expect(compiled.createsAssertion).toBe(false);
  });
});

describe('artifacts, verification, repair, proof', () => {
  beforeEach(() => {
    freshDb();
  });

  async function fullMission() {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const graph = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        missionId: mission.id,
        name: 'Landing snippet skill',
        purpose: 'Build a landing snippet',
        nodes: [{ kind: 'build', title: 'Write index.html', goal: 'Create the page' }],
      }),
    );
    const graphWithChecks = unwrap(
      await reviseSkillGraph(
        graph.id,
        {
          evaluations: [
            ...graph.evaluations,
            { id: 'eval-file', name: 'index.html exists with an h1', type: 'file', severity: 'blocking', config: { path: 'index.html', contains: '<h1' } },
            { id: 'eval-dom', name: 'entry has main landmark', type: 'dom', severity: 'error', config: { tag: 'main' } },
            { id: 'eval-hash', name: 'artifact hashes recompute', type: 'hash', severity: 'blocking', config: {} },
            { id: 'eval-policy', name: 'no placeholder markers', type: 'policy', severity: 'blocking', config: {} },
          ],
        },
        'Add acceptance checks',
      ),
    );
    const artifactSet = unwrap(await createArtifactSet(workspace.id, mission.id, 'Landing artifacts'));
    unwrap(await updateMission(mission.id, { skillGraphId: graph.id, artifactSetId: artifactSet.id }));
    return { workspace, mission, graph: graphWithChecks, artifactSet };
  }

  it('verification fails honestly, repair + rerun passes, receipt is recomputable, tamper detected', async () => {
    const { workspace, mission, graph, artifactSet } = await fullMission();

    // Write a bad artifact: missing h1 and main.
    unwrap(await writeArtifactFile(artifactSet.id, 'index.html', '<html lang="en"><head><title>Demo</title></head><body><p>hello</p></body></html>', 'agent'));

    const failing = unwrap(await runVerification({ missionId: mission.id }));
    expect(failing.status).toBe('failed');
    const failedAssertion = failing.results.find((assertion) => assertion.status === 'failed');
    expect(failedAssertion).toBeTruthy();
    expect(failedAssertion!.evidence.length).toBeGreaterThan(0);

    // Repair the artifact and re-verify.
    unwrap(await recordRepair(workspace.id, failing.id, failedAssertion!.id, 'Added h1 and main landmark'));
    unwrap(
      await writeArtifactFile(
        artifactSet.id,
        'index.html',
        '<html lang="en"><head><title>Demo</title></head><body><main><h1>Demo</h1></main></body></html>',
        'agent',
        'Repair: add h1 and main',
      ),
    );
    const passing = unwrap(await runVerification({ missionId: mission.id }));
    expect(passing.status).toBe('passed');
    expect(passing.blockingFailures).toBe(0);

    // Receipt derives from real state and recomputes.
    const receipt = unwrap(await createProofReceipt(mission.id));
    expect(receipt.status).toBe('verified');
    expect(receipt.skillGraphId).toBe(graph.id);
    expect(receipt.artifacts).toHaveLength(1);
    expect(receipt.failuresAndRepairs.length).toBeGreaterThan(0);

    const verification = unwrap(await verifyReceipt(receipt, new Map([['index.html', '<html lang="en"><head><title>Demo</title></head><body><main><h1>Demo</h1></main></body></html>']])));
    expect(verification.verdict).toBe('valid');
    expect(verification.hashMatches).toBe(true);
    expect(verification.eventsMonotonic).toBe(true);

    // One-byte tamper flips the verdict.
    const tampered = structuredClone(receipt);
    tampered.assertions[0]!.status = 'passed';
    tampered.events[0]!.summary = tampered.events[0]!.summary + '!';
    const tamperCheck = unwrap(await verifyReceipt(tampered));
    expect(tamperCheck.verdict).toBe('tampered');
  });

  it('artifact limits and deletion behave', async () => {
    const { artifactSet } = await fullMission();
    const oversized = await writeArtifactFile(artifactSet.id, 'big.js', 'x'.repeat(513 * 1024), 'human');
    expect(oversized.ok).toBe(false);

    unwrap(await writeArtifactFile(artifactSet.id, 'app.js', 'console.log(1)', 'human'));
    expect((await listArtifactFiles(artifactSet.id)).some((file) => file.path === 'app.js')).toBe(true);
    unwrap(await deleteArtifactFile(artifactSet.id, 'app.js'));
    expect((await listArtifactFiles(artifactSet.id)).some((file) => file.path === 'app.js')).toBe(false);
  });
});

describe('workspace export/import round trip', () => {
  beforeEach(() => {
    freshDb();
  });

  it('round-trips domain state and verifies the payload hash', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    unwrap(await addEvidence({ workspaceId: workspace.id, sourceType: 'user_statement', claim: 'Round trip claim' }));

    const exported = unwrap(await exportWorkspace(workspace.id));
    expect(exported.integrity.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    const raw = JSON.stringify(exported);

    const imported = unwrap(await importWorkspace(raw));
    expect(imported.hashVerified).toBe(true);
    expect(imported.workspaceId).not.toBe(workspace.id);

    const importedEvidence = await listEvidence(imported.workspaceId);
    expect(importedEvidence.some((record) => record.claim === 'Round trip claim')).toBe(true);
    const importedMission = await getMission(mission.id);
    expect(importedMission?.workspaceId).toBe(workspace.id); // original untouched
  });

  it('rejects corrupted and malformed imports without writing anything', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const exported = unwrap(await exportWorkspace(workspace.id));
    const raw = JSON.stringify(exported);

    const flipped = raw.replace('Test workspace', 'Tampered workspace');
    const corrupt = await importWorkspace(flipped);
    expect(corrupt.ok).toBe(false);

    expect((await importWorkspace('not json at all')).ok).toBe(false);
    expect((await importWorkspace('{"schemaVersion":"9.9.9"}')).ok).toBe(false);
  });
});
