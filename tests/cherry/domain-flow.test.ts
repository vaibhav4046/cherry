import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from '../setup.ts';
import {
  createExampleWorkspace,
  createMission,
  createWorkspace,
  getWorkspace,
  transitionMission,
  updateMission,
  getMission,
} from '../../src/cherry/mission/mission-service.ts';
import { addEvidence, deleteEvidence, setEvidenceTrust, listEvidence } from '../../src/cherry/evidence/evidence-service.ts';
import { importTranscript, loadLesson, lessonCoverage, recordObservation, listTranscript, deleteTranscript } from '../../src/cherry/watch/lesson-service.ts';
import {
  decideSkillGraphApproval,
  draftSkillGraph,
  requestSkillGraphApproval,
  reviseSkillGraph,
  rollbackSkillGraph,
  listSkillGraphVersions,
} from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { compileCorrection, decideMemory, deleteMemory, listMemories, proposeMemory } from '../../src/cherry/memory/memory-service.ts';
import {
  createArtifactSet,
  writeArtifactFile,
  listArtifactFiles,
  listArtifactVersions,
  deleteArtifactFile,
  getArtifactHistoryStorage,
  purgeArtifactVersionContents,
} from '../../src/cherry/artifacts/artifact-service.ts';
import { runVerification, recordRepair } from '../../src/cherry/verify/verification-service.ts';
import { createProofReceipt } from '../../src/cherry/proof/proof-service.ts';
import { verifyReceipt } from '../../src/cherry/proof/proof-verifier.ts';
import {
  exportWorkspace,
  importWorkspace,
  MAX_WORKSPACE_IMPORT_FILE_BYTES,
  readWorkspaceArchiveFile,
} from '../../src/cherry/persistence/workspace-archive.ts';
import { ALL_STORES, getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { sha256Canonical, sha256CanonicalExcluding, sha256Text } from '../../src/cherry/core/hash.ts';
import { createSource } from '../../src/cherry/source/source-service.ts';

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

  it('rejects invalid archive files before reading their bytes', async () => {
    let reads = 0;
    const oversized = {
      name: 'workspace.json',
      size: MAX_WORKSPACE_IMPORT_FILE_BYTES + 1,
      arrayBuffer: async () => {
        reads += 1;
        return new ArrayBuffer(0);
      },
    };

    await expect(readWorkspaceArchiveFile(oversized)).resolves.toEqual({
      ok: false,
      error: 'That file is larger than 64 MiB. Choose a smaller Cherry export.',
    });
    expect(reads).toBe(0);

    await expect(readWorkspaceArchiveFile({ ...oversized, name: 'workspace.txt', size: 12 })).resolves.toEqual({
      ok: false,
      error: 'Choose a Cherry .json export.',
    });
    expect(reads).toBe(0);

    await expect(readWorkspaceArchiveFile({ ...oversized, name: 'empty.json', size: 0 })).resolves.toEqual({
      ok: false,
      error: 'That Cherry export is empty. Choose another file.',
    });
    expect(reads).toBe(0);

    const bytes = new TextEncoder().encode('{"schemaVersion":"1.0.0"}');
    await expect(readWorkspaceArchiveFile({
      name: 'workspace.JSON',
      size: bytes.byteLength,
      arrayBuffer: async () => {
        reads += 1;
        return bytes.buffer;
      },
    })).resolves.toEqual({ ok: true, value: '{"schemaVersion":"1.0.0"}' });
    expect(reads).toBe(1);
  });

  it('distinguishes archive read failures from invalid UTF-8', async () => {
    await expect(readWorkspaceArchiveFile({
      name: 'workspace.json',
      size: 1,
      arrayBuffer: async () => { throw new Error('device unavailable'); },
    })).resolves.toEqual({ ok: false, error: 'That Cherry export could not be read. Choose it again.' });
    await expect(readWorkspaceArchiveFile({
      name: 'workspace.json',
      size: 4,
      arrayBuffer: async () => Uint8Array.from([0xff, 0xfe, 0xff, 0xfe]).buffer,
    })).resolves.toEqual({
      ok: false,
      error: 'That Cherry export is not valid UTF-8 JSON. Export it again and retry.',
    });
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

  it('does not let the general workspace API assign the example flag', async () => {
    const workspace = unwrap(await createWorkspace({
      name: 'Ordinary workspace',
      isExample: true,
    } as Parameters<typeof createWorkspace>[0]));

    expect(workspace.isExample).toBeUndefined();
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
    const ledgerEvents = await listProofEvents(workspace.id);
    const missionCreated = ledgerEvents.find((event) => event.type === 'mission.created');
    const receiptMissionCreated = receipt.events.find((event) => event.id === missionCreated?.id);
    expect(missionCreated?.payload).toBeDefined();
    expect(receiptMissionCreated?.payloadHash).toBe(await sha256Canonical(missionCreated!.payload));

    const verification = unwrap(await verifyReceipt(receipt, new Map([['index.html', '<html lang="en"><head><title>Demo</title></head><body><main><h1>Demo</h1></main></body></html>']])));
    expect(verification.verdict).toBe('valid');
    expect(verification.hashMatches).toBe(true);
    expect(verification.eventsMonotonic).toBe(true);

    const missingArtifact = unwrap(await verifyReceipt(receipt, new Map()));
    expect(missingArtifact.verdict).toBe('tampered');
    expect(missingArtifact.artifactChecks).toEqual([
      expect.objectContaining({ path: 'index.html', matches: false }),
    ]);

    const exclusionAttack = structuredClone(receipt);
    exclusionAttack.canonicalization.exclusions = ['receiptHash', 'events'];
    exclusionAttack.events[0]!.summary += ' hidden by a forged exclusion';
    exclusionAttack.receiptHash = await sha256CanonicalExcluding(
      exclusionAttack as unknown as Record<string, unknown>,
      exclusionAttack.canonicalization.exclusions,
    );
    await expect(verifyReceipt(exclusionAttack)).resolves.toMatchObject({
      ok: false,
      error: { code: 'validation' },
    });

    const exported = unwrap(await exportWorkspace(workspace.id));
    const exportedMissionCreated = (exported.proofEvents as Array<{ id: string; payloadHash?: string }>)
      .find((event) => event.id === missionCreated?.id);
    for (const event of exported.proofEvents as Array<{ payload?: Record<string, unknown>; payloadHash?: string }>) {
      if (event.payload) expect(event.payloadHash).toBe(await sha256Canonical(event.payload));
    }
    const exportedReceipt = (exported.proofReceipts as typeof exported.proofReceipts)
      .find((candidate) => (candidate as { receiptId?: string }).receiptId === receipt.receiptId) as typeof receipt | undefined;
    expect(exportedMissionCreated?.payloadHash).toBe(receiptMissionCreated?.payloadHash);
    expect(exportedReceipt?.events.find((event) => event.id === missionCreated?.id)?.payloadHash)
      .toBe(receiptMissionCreated?.payloadHash);
    const imported = unwrap(await importWorkspace(JSON.stringify(exported)));
    const importedReceipt = await getDb().receipts.where('workspaceId').equals(imported.workspaceId).first();
    expect(importedReceipt).toBeUndefined();
    expect(await getDb().verifications.where('workspaceId').equals(imported.workspaceId).count()).toBe(0);
    expect(await getDb().runs.where('workspaceId').equals(imported.workspaceId).count()).toBe(0);
    expect(await getDb().proofEvents.where('workspaceId').equals(imported.workspaceId).count()).toBe(1);

    // One-byte tamper flips the verdict.
    const tampered = structuredClone(receipt);
    tampered.assertions[0]!.status = 'passed';
    tampered.events[0]!.summary = tampered.events[0]!.summary + '!';
    const tamperCheck = unwrap(await verifyReceipt(tampered));
    expect(tamperCheck.verdict).toBe('tampered');
  });

  it('refuses to launder a tampered stored receipt during export', async () => {
    const { workspace, mission } = await fullMission();
    unwrap(await runVerification({ missionId: mission.id }));
    const receipt = unwrap(await createProofReceipt(mission.id));
    const tampered = structuredClone(receipt);
    tampered.events[0]!.summary += ' changed after receipt creation';
    await getDb().receipts.put(tampered);

    await expect(exportWorkspace(workspace.id)).resolves.toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/invalid proof hash/i) },
    });
  });

  it('refuses to launder a mismatched proof-event payload hash during export', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const event = (await listProofEvents(workspace.id)).find((entry) => entry.payload);
    expect(event).toBeDefined();
    await getDb().proofEvents.update(event!.id, { payloadHash: '0'.repeat(64) });

    await expect(exportWorkspace(workspace.id)).resolves.toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/payload hash/i) },
    });
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

  it('purges only old artifact bodies while preserving current files and version evidence', async () => {
    const { workspace, artifactSet } = await fullMission();
    const first = unwrap(await writeArtifactFile(artifactSet.id, 'app.js', 'console.log(1)', 'human'));
    const second = unwrap(await writeArtifactFile(artifactSet.id, 'app.js', 'console.log(2)', 'human'));
    const deleted = unwrap(await writeArtifactFile(artifactSet.id, 'deleted.js', 'remove me', 'human'));
    unwrap(await deleteArtifactFile(artifactSet.id, deleted.path));

    const beforeFile = await getDb().artifactFiles.get(second.id);
    const beforeVersions = await listArtifactVersions(first.id);
    const deletedVersions = await listArtifactVersions(deleted.id);
    const expectedBytes = [...beforeVersions, ...deletedVersions].reduce((sum, version) => sum + version.sizeBytes, 0);
    await expect(getArtifactHistoryStorage(workspace.id)).resolves.toEqual({
      versionCount: 3,
      versionsWithContent: 3,
      contentBytes: expectedBytes,
    });

    const purged = unwrap(await purgeArtifactVersionContents(workspace.id, 'human'));
    expect(purged).toEqual({ purgedVersions: 3, purgedBytes: expectedBytes });
    expect(await getDb().artifactFiles.get(second.id)).toEqual(beforeFile);
    const afterVersions = await getDb().artifactVersions.where('workspaceId').equals(workspace.id).toArray();
    expect(afterVersions).toHaveLength(3);
    expect(afterVersions.every((version) => version.content === null && typeof version.contentPurgedAt === 'string')).toBe(true);
    expect(afterVersions.map(({ id, path, revision, sha256, sizeBytes, changeSummary }) => ({ id, path, revision, sha256, sizeBytes, changeSummary })))
      .toEqual([...beforeVersions, ...deletedVersions].map(({ id, path, revision, sha256, sizeBytes, changeSummary }) => ({ id, path, revision, sha256, sizeBytes, changeSummary })));
    expect((await listProofEvents(workspace.id)).filter((event) => event.type === 'artifact.history_purged')).toHaveLength(1);

    await expect(purgeArtifactVersionContents(workspace.id, 'human')).resolves.toEqual({
      ok: true,
      value: { purgedVersions: 0, purgedBytes: 0 },
    });
    expect((await listProofEvents(workspace.id)).filter((event) => event.type === 'artifact.history_purged')).toHaveLength(1);
  });
});

describe('workspace export/import round trip', () => {
  beforeEach(() => {
    freshDb();
  });

  async function snapshotDatabase() {
    const db = getDb();
    return Object.fromEntries(
      await Promise.all(
        ALL_STORES.map(async (storeName) => [storeName, await db.table(storeName).toArray()]),
      ),
    );
  }

  async function recomputeArchiveHash(archive: Record<string, unknown>) {
    const integrity = archive['integrity'] as Record<string, unknown>;
    integrity['payloadSha256'] = await sha256CanonicalExcluding(archive, ['integrity']);
  }

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

  it('reuses one imported space when the exact same archive is selected repeatedly', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const raw = JSON.stringify(unwrap(await exportWorkspace(workspace.id)));

    const imports = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      imports.push(unwrap(await importWorkspace(raw)));
    }

    expect(new Set(imports.map((result) => result.workspaceId)).size).toBe(1);
    expect(imports[0]?.status).toBe('imported');
    expect(imports.slice(1).every((result) => result.status === 'already-imported')).toBe(true);
    expect(await getDb().workspaces.get(imports[0]!.workspaceId)).toBeDefined();
  });

  it('coalesces concurrent imports of the same archive into one local space', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const raw = JSON.stringify(unwrap(await exportWorkspace(workspace.id)));
    const results = await Promise.all(Array.from({ length: 5 }, () => importWorkspace(raw)));

    expect(results.every((result) => result.ok)).toBe(true);
    const imported = results.map((result) => unwrap(result));
    expect(new Set(imported.map((result) => result.workspaceId)).size).toBe(1);
    expect(imported.filter((result) => result.status === 'imported')).toHaveLength(1);
    expect(imported.filter((result) => result.status === 'already-imported')).toHaveLength(4);
  });

  it('does not preserve an archive-supplied example flag during an ordinary import', async () => {
    const source = unwrap(await createExampleWorkspace({ name: 'Fixture source' }));
    const exported = unwrap(await exportWorkspace(source.id));
    expect(exported.workspace['isExample']).toBe(true);

    const imported = unwrap(await importWorkspace(JSON.stringify(exported)));
    const importedWorkspace = await getWorkspace(imported.workspaceId);

    expect(importedWorkspace?.isExample).toBeUndefined();
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

  it('rejects a structurally malformed skill archive with zero writes even when its hash matches', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const graph = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        missionId: mission.id,
        name: 'Import safety skill',
        purpose: 'Keep malformed state out of the library',
        nodes: [{ kind: 'build', title: 'Validate the archive', goal: 'Reject unsafe rows' }],
      }),
    );
    unwrap(await updateMission(mission.id, { skillGraphId: graph.id }));
    const archive = structuredClone(unwrap(await exportWorkspace(workspace.id))) as unknown as Record<string, unknown>;
    const skillGraph = (archive['skillGraphs'] as Array<Record<string, unknown>>)[0]!;
    delete skillGraph['targets'];
    await recomputeArchiveHash(archive);
    const before = await snapshotDatabase();

    const result = await importWorkspace(JSON.stringify(archive));

    expect(result.ok).toBe(false);
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('returns a validation result for every malformed archive table and requires current integrity', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const exported = unwrap(await exportWorkspace(workspace.id));
    const before = await snapshotDatabase();
    const arrayKeys = [
      'missions',
      'missionTasks',
      'lessons',
      'transcriptSegments',
      'observations',
      'evidence',
      'skillGraphs',
      'skillVersions',
      'memories',
      'memoryVersions',
      'approvals',
      'artifactSets',
      'artifactFiles',
      'artifactVersions',
      'verifications',
      'runs',
      'proofEvents',
      'proofReceipts',
      'sourceRecords',
      'channelWatches',
      'agentProfiles',
      'crews',
      'workItems',
      'workMessages',
      'handoffs',
      'executionHosts',
      'routines',
    ] as const;

    for (const key of arrayKeys) {
      const malformed = structuredClone(exported) as unknown as Record<string, unknown>;
      malformed[key] = {};
      await recomputeArchiveHash(malformed);
      await expect(importWorkspace(JSON.stringify(malformed))).resolves.toMatchObject({ ok: false });
      expect(await snapshotDatabase()).toEqual(before);
    }

    const withoutIntegrity = structuredClone(exported) as unknown as Record<string, unknown>;
    delete withoutIntegrity['integrity'];
    await expect(importWorkspace(JSON.stringify(withoutIntegrity))).resolves.toMatchObject({ ok: false });
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('removes imported approval and trust state until a person reviews it here', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const evidence = unwrap(await addEvidence({
      workspaceId: workspace.id,
      missionId: mission.id,
      sourceType: 'user_statement',
      claim: 'A claim approved in the source browser',
    }));
    unwrap(await setEvidenceTrust(evidence.id, 'approved'));
    const draftedGraph = unwrap(await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Imported approval boundary',
      purpose: 'Prove imports cannot grant execution authority',
      nodes: [{ kind: 'build', title: 'Check the boundary', goal: 'Require a local review', evidenceIds: [evidence.id] }],
    }));
    const graph = unwrap(await reviseSkillGraph(draftedGraph.id, {
      knowledge: [{ evidenceId: evidence.id, use: 'Authority boundary', trust: 'approved' }],
    }, 'Attach reviewed evidence'));
    const request = unwrap(await requestSkillGraphApproval(graph.id, 'Review in the source browser', 'agent'));
    unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));
    const memory = unwrap(await proposeMemory({
      workspaceId: workspace.id,
      missionId: mission.id,
      type: 'procedure',
      title: 'Imported method',
      content: 'Review external imports locally.',
      scope: 'mission',
      provenance: [{ sourceType: 'human', trust: 'approved', description: 'Approved in the source browser' }],
    }));
    unwrap(await decideMemory(memory.id, 'approved', 'user'));

    const imported = unwrap(await importWorkspace(JSON.stringify(unwrap(await exportWorkspace(workspace.id)))));
    const db = getDb();
    const importedGraph = await db.skillGraphs.where('workspaceId').equals(imported.workspaceId).first();
    const importedMemory = await db.memories.where('workspaceId').equals(imported.workspaceId).first();
    const importedEvidence = await db.evidence.where('workspaceId').equals(imported.workspaceId).first();
    const importedApprovals = await db.approvals.where('workspaceId').equals(imported.workspaceId).toArray();
    const importedGraphVersions = await db.skillVersions.where('workspaceId').equals(imported.workspaceId).toArray();
    const importedMemoryVersions = await db.memoryVersions.where('workspaceId').equals(imported.workspaceId).toArray();
    const importedMission = await db.missions.where('workspaceId').equals(imported.workspaceId).first();

    expect(importedGraph).toMatchObject({ status: 'draft', approvedRevision: null, approvedBy: null, approvedAt: null });
    expect(importedGraph?.knowledge?.every((reference) => reference.trust === 'untrusted')).toBe(true);
    expect(importedGraphVersions.every((version) => (
      version.status === 'draft'
      && version.actorType === 'system'
      && version.snapshot.status === 'draft'
      && version.snapshot.knowledge?.every((reference) => reference.trust === 'untrusted') !== false
      && version.versionHash === version.snapshot.versionHash
    ))).toBe(true);
    expect(importedMemory).toMatchObject({ status: 'proposed', approvedRevision: null, approvedBy: null, approvedAt: null });
    expect(importedMemory).toMatchObject({ pinned: false, lastUsedAt: null, useCount: 0, runId: null });
    expect(importedMemory?.provenance.every((source) => source.trust === 'untrusted' && source.sourceType === 'import')).toBe(true);
    expect(importedMemoryVersions.every((version) => (
      version.snapshot.approvedRevision === null
      && version.snapshot.provenance.every((source) => source.trust === 'untrusted' && source.sourceType === 'import')
    ))).toBe(true);
    expect(importedEvidence?.trust).toBe('untrusted');
    expect(importedEvidence).toMatchObject({ provenanceMethod: 'unknown', transferability: 'unknown' });
    expect(importedEvidence?.history).toEqual([
      expect.objectContaining({ actorType: 'system', summary: 'Imported as untrusted external evidence' }),
    ]);
    expect(importedMission?.state).toBe('DRAFT');
    expect(importedApprovals).toEqual([]);
  });

  it('preserves opaque content while remapping references and recomputing graph hashes', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const graph = unwrap(await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Reference-safe import',
      purpose: 'Keep user content byte-for-byte',
      nodes: [{ kind: 'build', title: 'Preserve content', goal: 'Remap identifiers only' }],
    }));
    unwrap(await reviseSkillGraph(graph.id, {
      evaluations: [
        ...graph.evaluations,
        {
          id: 'eval-opaque-config',
          name: 'Opaque configuration stays exact',
          type: 'manual',
          severity: 'info',
          config: { missionId: mission.id },
        },
      ],
    }, 'Add opaque configuration'));
    const artifactSet = unwrap(await createArtifactSet(workspace.id, mission.id, 'Opaque content'));
    unwrap(await writeArtifactFile(artifactSet.id, 'opaque.txt', mission.id, 'human'));

    const imported = unwrap(await importWorkspace(JSON.stringify(unwrap(await exportWorkspace(workspace.id)))));
    const db = getDb();
    const importedFile = await db.artifactFiles.where('workspaceId').equals(imported.workspaceId).first();
    const importedGraph = await db.skillGraphs.where('workspaceId').equals(imported.workspaceId).first();

    expect(importedFile?.content).toBe(mission.id);
    expect(importedGraph?.id).not.toBe(graph.id);
    expect(importedGraph?.missionId).not.toBe(mission.id);
    expect(importedGraph?.versionHash).toBe(await sha256Canonical({ ...importedGraph, versionHash: undefined }));
    expect(importedGraph?.evaluations.find((evaluation) => evaluation.id === 'eval-opaque-config')?.config).toEqual({ missionId: mission.id });
  });

  it('rejects unsafe artifact paths and artifact quotas with zero writes', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const artifactSet = unwrap(await createArtifactSet(workspace.id, mission.id, 'Portable files'));
    unwrap(await writeArtifactFile(artifactSet.id, 'notes.txt', 'bounded content', 'human'));
    const exported = unwrap(await exportWorkspace(workspace.id));
    const before = await snapshotDatabase();

    const rejectMutation = async (mutate: (archive: Record<string, unknown>) => Promise<void> | void) => {
      const archive = structuredClone(exported) as unknown as Record<string, unknown>;
      await mutate(archive);
      await recomputeArchiveHash(archive);
      await expect(importWorkspace(JSON.stringify(archive))).resolves.toMatchObject({ ok: false });
      expect(await snapshotDatabase()).toEqual(before);
    };

    await rejectMutation((archive) => {
      (archive['artifactFiles'] as Array<Record<string, unknown>>)[0]!['path'] = '../escape.txt';
    });
    await rejectMutation(async (archive) => {
      const file = (archive['artifactFiles'] as Array<Record<string, unknown>>)[0]!;
      const content = 'x'.repeat(512 * 1024 + 1);
      file['content'] = content;
      file['sizeBytes'] = content.length;
      file['sha256'] = await sha256Text(content);
    });
    await rejectMutation((archive) => {
      const original = (archive['artifactFiles'] as Array<Record<string, unknown>>)[0]!;
      archive['artifactFiles'] = Array.from({ length: 201 }, (_, index) => ({
        ...original,
        id: index === 0 ? original['id'] : `af-import-overflow-${index}`,
        path: index === 0 ? original['path'] : `overflow-${index}.txt`,
      }));
    });
    await rejectMutation((archive) => {
      (archive['artifactVersions'] as Array<Record<string, unknown>>)[0]!['content'] = null;
    });
    await rejectMutation((archive) => {
      (archive['artifactVersions'] as Array<Record<string, unknown>>)[0]!['contentPurgedAt'] = new Date().toISOString();
    });
  });

  it('recovers a legally accumulated workspace that exceeded the portable export limit', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const artifactSet = unwrap(await createArtifactSet(workspace.id, mission.id, 'Large history'));
    const content = 'x'.repeat(512 * 1024);
    const file = unwrap(await writeArtifactFile(artifactSet.id, 'history.txt', content, 'human'));
    const firstVersion = (await getDb().artifactVersions.where('artifactFileId').equals(file.id).first())!;
    await getDb().artifactVersions.bulkAdd(Array.from({ length: 128 }, (_, index) => ({
      ...firstVersion,
      id: `af-history-${index + 2}`,
      revision: index + 2,
    })));

    const tooLarge = await exportWorkspace(workspace.id);
    expect(tooLarge).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('64 MiB portable export limit') },
    });

    unwrap(await purgeArtifactVersionContents(workspace.id, 'human'));
    const exported = unwrap(await exportWorkspace(workspace.id));
    expect(exported.artifactVersions).toHaveLength(129);
    expect((exported.artifactVersions as Array<Record<string, unknown>>).every((version) => (
      version['content'] === null && typeof version['contentPurgedAt'] === 'string'
    ))).toBe(true);
    const imported = unwrap(await importWorkspace(JSON.stringify(exported)));
    const importedVersions = await getDb().artifactVersions.where('workspaceId').equals(imported.workspaceId).toArray();
    expect(importedVersions).toHaveLength(129);
    expect(importedVersions.every((version) => version.content === null && typeof version.contentPurgedAt === 'string')).toBe(true);
  }, 20_000);

  it('rejects malformed nested skill fields even when the archive hash matches', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    unwrap(await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Nested validation',
      purpose: 'Reject route-crashing values',
      nodes: [{ kind: 'build', title: 'Validate', goal: 'Stay renderable' }],
    }));
    const malformed = structuredClone(unwrap(await exportWorkspace(workspace.id))) as unknown as Record<string, unknown>;
    const graph = (malformed['skillGraphs'] as Array<Record<string, unknown>>)[0]!;
    const node = (graph['nodes'] as Array<Record<string, unknown>>)[0]!;
    node['kind'] = { boom: true };
    await recomputeArchiveHash(malformed);
    const before = await snapshotDatabase();

    await expect(importWorkspace(JSON.stringify(malformed))).resolves.toMatchObject({ ok: false });
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('round-trips draft skill text states that the revision service can legally persist', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const graph = unwrap(await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Editable draft',
      purpose: 'Exercise draft edits',
      nodes: [{ kind: 'build', title: 'Editable node', goal: 'Stay portable' }],
    }));
    unwrap(await reviseSkillGraph(graph.id, {
      name: '',
      purpose: '',
      nodes: graph.nodes.map((node) => ({ ...node, title: '', goal: '' })),
    }, 'Keep an unfinished draft'));

    const exported = unwrap(await exportWorkspace(workspace.id));
    const imported = unwrap(await importWorkspace(JSON.stringify(exported)));
    const importedGraph = await getDb().skillGraphs.where('workspaceId').equals(imported.workspaceId).first();
    expect(importedGraph).toMatchObject({ name: '', purpose: '' });
    expect(importedGraph?.nodes[0]).toMatchObject({ title: '', goal: '' });
  });

  it('rejects route-crashing schema and foreign memory snapshot fields', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    unwrap(await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Runtime-safe schema',
      purpose: 'Keep detail routes renderable',
      nodes: [{ kind: 'build', title: 'Validate', goal: 'Reject malformed schemas' }],
    }));
    unwrap(await proposeMemory({
      workspaceId: workspace.id,
      missionId: mission.id,
      type: 'procedure',
      title: 'Safe memory snapshot',
      content: 'Keep workspace ownership exact.',
      scope: 'mission',
      provenance: [{ sourceType: 'human', trust: 'untrusted', description: 'Local test' }],
    }));
    const exported = unwrap(await exportWorkspace(workspace.id));
    const before = await snapshotDatabase();

    const malformedSchema = structuredClone(exported) as unknown as Record<string, unknown>;
    const graph = (malformedSchema['skillGraphs'] as Array<Record<string, unknown>>)[0]!;
    (graph['inputSchema'] as Record<string, unknown>)['required'] = {};
    await recomputeArchiveHash(malformedSchema);
    await expect(importWorkspace(JSON.stringify(malformedSchema))).resolves.toMatchObject({ ok: false });
    expect(await snapshotDatabase()).toEqual(before);

    const foreignSnapshot = structuredClone(exported) as unknown as Record<string, unknown>;
    const memoryVersion = (foreignSnapshot['memoryVersions'] as Array<Record<string, unknown>>)[0]!;
    (memoryVersion['snapshot'] as Record<string, unknown>)['workspaceId'] = 'ws-foreign';
    await recomputeArchiveHash(foreignSnapshot);
    await expect(importWorkspace(JSON.stringify(foreignSnapshot))).resolves.toMatchObject({ ok: false });
    expect(await snapshotDatabase()).toEqual(before);
  });

  it('rejects imported source URLs that disguise private networks', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    unwrap(await createSource({
      workspaceId: workspace.id,
      kind: 'article',
      title: 'Public source before tampering',
      url: 'https://example.com/article',
      permissionAcknowledged: true,
    }));
    const exported = unwrap(await exportWorkspace(workspace.id));
    const before = await snapshotDatabase();

    for (const url of ['http://[::]/', 'http://[::ffff:127.0.0.1]/', 'http://[2001:db8::1]/']) {
      const archive = structuredClone(exported) as unknown as Record<string, unknown>;
      (archive['sourceRecords'] as Array<Record<string, unknown>>)[0]!['url'] = url;
      await recomputeArchiveHash(archive);
      await expect(importWorkspace(JSON.stringify(archive))).resolves.toMatchObject({ ok: false });
      expect(await snapshotDatabase()).toEqual(before);
    }
  });

  it('imports an archive Cherry can produce after referenced evidence is deleted', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const evidence = unwrap(await addEvidence({
      workspaceId: workspace.id,
      missionId: mission.id,
      sourceType: 'user_statement',
      claim: 'A removable source claim',
    }));
    const graph = unwrap(await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Historical evidence gap',
      purpose: 'Keep the honest gap visible',
      nodes: [{ kind: 'research', title: 'Read evidence', goal: 'Record the source', evidenceIds: [evidence.id] }],
    }));
    unwrap(await deleteEvidence(evidence.id));

    const imported = unwrap(await importWorkspace(JSON.stringify(unwrap(await exportWorkspace(workspace.id)))));
    const importedGraph = await getDb().skillGraphs.where('workspaceId').equals(imported.workspaceId).first();
    const importedVersion = await getDb().skillVersions.where('workspaceId').equals(imported.workspaceId).first();
    expect(importedGraph?.nodes[0]?.evidenceIds[0]).not.toBe(evidence.id);
    expect(importedGraph?.nodes[0]?.evidenceIds[0]).toBe(importedVersion?.snapshot.nodes[0]?.evidenceIds[0]);
    expect(graph.nodes[0]?.evidenceIds[0]).toBe(evidence.id);
  });

  it('round-trips deleted memory and artifact histories without cross-workspace aliases', async () => {
    const { workspace, mission } = await seedWorkspaceAndMission();
    const memory = unwrap(await proposeMemory({
      workspaceId: workspace.id,
      missionId: mission.id,
      type: 'procedure',
      title: 'Disposable method',
      content: 'Delete this after recording the history.',
      scope: 'mission',
      provenance: [{ sourceType: 'human', trust: 'untrusted', description: 'Local test' }],
    }));
    await getDb().missions.update(mission.id, { requiredMemoryIds: [memory.id] });
    unwrap(await deleteMemory(memory.id));
    const artifactSet = unwrap(await createArtifactSet(workspace.id, mission.id, 'Deleted file history'));
    const file = unwrap(await writeArtifactFile(artifactSet.id, 'deleted.txt', 'historical content', 'human'));
    unwrap(await deleteArtifactFile(artifactSet.id, file.path));

    const imported = unwrap(await importWorkspace(JSON.stringify(unwrap(await exportWorkspace(workspace.id)))));
    const importedMemoryVersions = await getDb().memoryVersions.where('workspaceId').equals(imported.workspaceId).toArray();
    const importedArtifactVersions = await getDb().artifactVersions.where('workspaceId').equals(imported.workspaceId).toArray();
    const importedMission = await getDb().missions.where('workspaceId').equals(imported.workspaceId).first();

    expect(await getDb().memories.where('workspaceId').equals(imported.workspaceId).count()).toBe(0);
    expect(importedMemoryVersions.some((version) => version.snapshot.status === 'deleted')).toBe(true);
    expect(new Set(importedMemoryVersions.map((version) => version.memoryId)).has(memory.id)).toBe(false);
    expect(importedMission?.requiredMemoryIds[0]).toBe(importedMemoryVersions[0]?.memoryId);
    expect(await getDb().artifactFiles.where('workspaceId').equals(imported.workspaceId).count()).toBe(0);
    expect(importedArtifactVersions).toHaveLength(1);
    expect(importedArtifactVersions[0]?.artifactFileId).not.toBe(file.id);
  });

  it('rolls back every imported row when the atomic proof write fails', async () => {
    const { workspace } = await seedWorkspaceAndMission();
    const archive = unwrap(await exportWorkspace(workspace.id));
    const before = await snapshotDatabase();
    const proofWrite = vi.spyOn(getDb().proofEvents, 'bulkAdd')
      .mockResolvedValueOnce('pe-imported' as never)
      .mockRejectedValueOnce(new Error('quota denied'));

    await expect(importWorkspace(JSON.stringify(archive))).resolves.toMatchObject({ ok: false });
    expect(await snapshotDatabase()).toEqual(before);
    proofWrite.mockRestore();
  });
});
