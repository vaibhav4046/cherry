import { beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { freshDb } from '../setup.ts';
import { createMission, createWorkspace, updateMission } from '../../src/cherry/mission/mission-service.ts';
import { draftSkillGraph, decideSkillGraphApproval, requestSkillGraphApproval, reviseSkillGraph } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { createArtifactSet, writeArtifactFile } from '../../src/cherry/artifacts/artifact-service.ts';
import { runVerification } from '../../src/cherry/verify/verification-service.ts';
import { compileSkillBundle, validateBundleZip } from '../../src/cherry/compiler/archive-builder.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { sha256Bytes } from '../../src/cherry/core/hash.ts';
import { addEvidence } from '../../src/cherry/evidence/evidence-service.ts';
import {
  SYNTHETIC_SAMPLE_APPROVER,
  SYNTHETIC_SAMPLE_NOTICE,
} from '../../src/cherry/skillgraph/sample-state.ts';

async function approvedSkillFixture(decidedBy = 'user') {
  const workspace = unwrap(await createWorkspace({ name: 'Bundle workspace' }));
  const mission = unwrap(
    await createMission({
      workspaceId: workspace.id,
      title: 'Bundle mission',
      objective: 'Produce a compilable skill',
      definitionOfDone: ['Bundle compiles'],
    }),
  );
  const referencedEvidence = unwrap(
    await addEvidence({
      workspaceId: workspace.id,
      missionId: mission.id,
      sourceType: 'webpage',
      sourceTitle: 'Referenced source',
      sourceUri: 'https://example.com/referenced',
      claim: 'Use semantic landmarks in the generated page.',
      provenanceMethod: 'user_typed',
    }),
  );
  await addEvidence({
    workspaceId: workspace.id,
    missionId: mission.id,
    sourceType: 'webpage',
    sourceTitle: 'Unrelated project source',
    sourceUri: 'https://example.com/unrelated',
    claim: 'This project note is not part of the compiled skill.',
    provenanceMethod: 'user_typed',
  });
  const graph = unwrap(
    await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Landing Snippet Builder',
      purpose: 'Builds accessible landing snippets from lesson principles',
      nodes: [{
        kind: 'build',
        title: 'Write the page',
        goal: 'Create index.html with landmarks',
        evidenceIds: [referencedEvidence.id],
      }],
    }),
  );
  const artifactSet = unwrap(await createArtifactSet(workspace.id, mission.id, 'Bundle artifacts'));
  unwrap(await updateMission(mission.id, { skillGraphId: graph.id, artifactSetId: artifactSet.id }));
  unwrap(
    await writeArtifactFile(
      artifactSet.id,
      'index.html',
      '<html lang="en"><head><title>x</title></head><body><main><h1>x</h1></main></body></html>',
      'human',
    ),
  );
  unwrap(await runVerification({ missionId: mission.id }));
  const request = unwrap(await requestSkillGraphApproval(graph.id, 'ready', 'user'));
  const decided = unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', decidedBy));
  return { workspace, mission, artifactSet, graph: decided.graph };
}

describe('skill bundle compiler', () => {
  beforeEach(() => {
    freshDb();
  });

  it('refuses to compile an unapproved graph', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'W' }));
    const graph = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        name: 'Unapproved',
        purpose: 'Should not compile',
        nodes: [{ kind: 'build', title: 'X', goal: 'Y' }],
      }),
    );
    const result = await compileSkillBundle(graph.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('approval_required');
  });

  it('compiles a valid Agent Skills bundle with matching frontmatter, manifest, and receipt', async () => {
    const { graph } = await approvedSkillFixture();
    const bundle = unwrap(await compileSkillBundle(graph.id));

    expect(bundle.fileName).toBe('landing-snippet-builder-v0.1.0.zip');
    expect(bundle.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.receiptId).toBeTruthy();

    const validation = unwrap(await validateBundleZip(bundle.blob));
    expect(validation.directory).toBe('landing-snippet-builder');
    for (const required of ['SKILL.md', 'cherry.json', 'skillgraph.json', 'receipt.json', 'MANIFEST.json', 'scripts/verify.mjs', 'references/evidence.md', 'policies/safety.md', 'evals/acceptance-tests.json', 'targets/codex/AGENTS.md', 'targets/claude-code/CLAUDE.md']) {
      expect(validation.files, required).toContain(required);
    }

    // SKILL.md frontmatter name matches the directory and stays within limits.
    const zip = await JSZip.loadAsync(bundle.blob as never);
    const skillMd = await zip.file('landing-snippet-builder/SKILL.md')!.async('string');
    expect(skillMd.startsWith('---\nname: landing-snippet-builder\n')).toBe(true);
    expect(skillMd.split('\n').length).toBeLessThan(500);
    expect(skillMd).toContain('Referenced source');
    expect(skillMd).not.toContain('Unrelated project source');

    const evidenceMd = await zip.file('landing-snippet-builder/references/evidence.md')!.async('string');
    expect(evidenceMd).toContain('Use semantic landmarks in the generated page.');
    expect(evidenceMd).not.toContain('This project note is not part of the compiled skill.');

    const observations = await zip.file('landing-snippet-builder/references/observations.json')!.async('string');
    expect(observations).toContain('Use semantic landmarks in the generated page.');
    expect(observations).not.toContain('This project note is not part of the compiled skill.');

    // Manifest hashes recompute for every listed file.
    const manifest = JSON.parse(await zip.file('landing-snippet-builder/MANIFEST.json')!.async('string')) as {
      files: Record<string, string>;
    };
    for (const [path, expected] of Object.entries(manifest.files)) {
      const content = await zip.file(`landing-snippet-builder/${path}`)!.async('uint8array');
      expect(await sha256Bytes(content), path).toBe(expected);
    }

    // Receipt inside the bundle carries a recomputable hash.
    const receipt = JSON.parse(await zip.file('landing-snippet-builder/receipt.json')!.async('string')) as {
      receiptHash: string;
      status: string;
    };
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.status).toBe('verified');
  });

  it('refuses a newly approved skill revision until that exact revision is checked', async () => {
    const { graph, mission } = await approvedSkillFixture();
    const revised = unwrap(await reviseSkillGraph(graph.id, { purpose: `${graph.purpose}. Revised.` }, 'Revise after verification'));
    const request = unwrap(await requestSkillGraphApproval(revised.id, 'Approve the revision', 'user'));
    const approved = unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user')).graph;

    const stale = await compileSkillBundle(approved.id);
    expect(stale).toMatchObject({ ok: false, error: { code: 'validation' } });
    if (!stale.ok) expect(stale.error.message).toContain('current skill and files');

    unwrap(await runVerification({ missionId: mission.id }));
    expect((await compileSkillBundle(approved.id)).ok).toBe(true);
  });

  it('refuses changed artifacts until their exact current manifest is checked', async () => {
    const { graph, mission, artifactSet } = await approvedSkillFixture();
    unwrap(await writeArtifactFile(
      artifactSet.id,
      'index.html',
      '<html lang="en"><head><title>changed</title></head><body><main><h1>changed</h1></main></body></html>',
      'human',
      'Changed after verification',
    ));

    const stale = await compileSkillBundle(graph.id);
    expect(stale).toMatchObject({ ok: false, error: { code: 'validation' } });
    if (!stale.ok) expect(stale.error.message).toContain('current skill and files');

    unwrap(await runVerification({ missionId: mission.id }));
    expect((await compileSkillBundle(graph.id)).ok).toBe(true);
  });

  it('refuses to compile a graph after its mission is repointed to another skill', async () => {
    const { workspace, graph, mission } = await approvedSkillFixture();
    const replacement = unwrap(await draftSkillGraph({
      workspaceId: workspace.id,
      missionId: mission.id,
      name: 'Replacement skill',
      purpose: 'Replace the mission skill without authorizing the old bundle',
      nodes: [{ kind: 'build', title: 'Replace', goal: 'Use the replacement' }],
    }));
    unwrap(await updateMission(mission.id, { skillGraphId: replacement.id }));
    unwrap(await runVerification({ missionId: mission.id }));
    const request = unwrap(await requestSkillGraphApproval(replacement.id, 'ready', 'user'));
    unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));

    const stale = await compileSkillBundle(graph.id);
    expect(stale).toMatchObject({ ok: false, error: { code: 'validation' } });
  });

  it('carries synthetic sample disclosure inside the bundle and target files', async () => {
    const { graph } = await approvedSkillFixture(SYNTHETIC_SAMPLE_APPROVER);
    const bundle = unwrap(await compileSkillBundle(graph.id));
    const zip = await JSZip.loadAsync(bundle.blob as never);
    const root = 'landing-snippet-builder/';

    for (const path of [
      'SKILL.md',
      'policies/approvals.md',
      'targets/codex/AGENTS.md',
      'targets/claude-code/CLAUDE.md',
    ]) {
      const content = await zip.file(`${root}${path}`)!.async('string');
      expect(content, path).toContain(SYNTHETIC_SAMPLE_NOTICE);
    }
    const metadata = JSON.parse(await zip.file(`${root}cherry.json`)!.async('string')) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      sample: true,
      approvalKind: 'synthetic-sample-state',
      sampleNotice: SYNTHETIC_SAMPLE_NOTICE,
    });
  });

  it('rejects archives with traversal paths or mismatched names', async () => {
    const evil = new JSZip();
    evil.file('../escape/SKILL.md', 'nope');
    const evilBlob = await evil.generateAsync({ type: 'blob' });
    expect((await validateBundleZip(evilBlob)).ok).toBe(false);

    const mismatch = new JSZip();
    mismatch.file('dir-a/SKILL.md', '---\nname: dir-b\ndescription: x\n---\n');
    mismatch.file('dir-a/cherry.json', '{}');
    mismatch.file('dir-a/skillgraph.json', '{}');
    mismatch.file('dir-a/scripts/verify.mjs', '// x');
    mismatch.file('dir-a/MANIFEST.json', '{}');
    const mismatchBlob = await mismatch.generateAsync({ type: 'blob' });
    const result = await validateBundleZip(mismatchBlob);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('does not match directory');
  });
});
