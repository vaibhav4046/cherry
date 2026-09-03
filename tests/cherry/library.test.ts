import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { createMission, createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import {
  decideSkillGraphApproval,
  draftSkillGraph,
  requestSkillGraphApproval,
  reviseSkillGraph,
} from '../../src/cherry/skillgraph/skillgraph-service.ts';
import type { SkillGraph } from '../../src/cherry/skillgraph/skillgraph-model.ts';
import {
  exportSkillFile,
  filterLibraryEntries,
  listLibraryEntries,
  rankSkillsForTask,
} from '../../src/cherry/library/library-service.ts';
import { addEvidence } from '../../src/cherry/evidence/evidence-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import {
  SYNTHETIC_SAMPLE_APPROVER,
  SYNTHETIC_SAMPLE_NOTICE,
} from '../../src/cherry/skillgraph/sample-state.ts';

const ONE_NODE = [{ kind: 'action' as const, title: 'Do the work', goal: 'Produce the artifact this skill exists for' }];

async function makeApprovedSkill(
  workspaceId: string,
  name: string,
  purpose: string,
  decidedBy = 'user',
): Promise<SkillGraph> {
  const drafted = await draftSkillGraph({ workspaceId, name, purpose, nodes: ONE_NODE });
  if (!drafted.ok) throw new Error(drafted.error.message);
  const graph = drafted.value;
  const requested = await requestSkillGraphApproval(graph.id, 'library test', 'user');
  if (!requested.ok) throw new Error(requested.error.message);
  const decided = await decideSkillGraphApproval(requested.value.approval.id, 'approved', decidedBy);
  if (!decided.ok) throw new Error(decided.error.message);
  return decided.value.graph;
}

describe('skill library (cross-workspace read layer)', () => {
  beforeEach(() => {
    freshDb();
  });

  it('aggregates skills across workspaces, install-ready first', async () => {
    const first = await createWorkspace({ name: 'Content workspace' });
    const second = await createWorkspace({ name: 'SaaS workspace' });
    if (!first.ok || !second.ok) throw new Error('workspace setup failed');

    await makeApprovedSkill(first.value.id, 'Thumbnail workflow', 'Design high-contrast video thumbnails that earn clicks');
    const draft = await draftSkillGraph({
      workspaceId: second.value.id,
      name: 'Landing page teardown',
      purpose: 'Audit a landing page for conversion problems',
      nodes: ONE_NODE,
    });
    if (!draft.ok) throw new Error(draft.error.message);

    const entries = await listLibraryEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.installReady).toBe(true);
    expect(entries[0]!.sample).toBe(false);
    expect(entries[0]!.name).toBe('Thumbnail workflow');
    expect(entries[0]!.workspaceName).toBe('Content workspace');
    expect(entries[1]!.installReady).toBe(false);
    expect(entries[1]!.status).toBe('draft');
  });

  it('records the binding approval hash on install-ready entries', async () => {
    const workspace = await createWorkspace({ name: 'Hash workspace' });
    if (!workspace.ok) throw new Error('workspace setup failed');
    await makeApprovedSkill(workspace.value.id, 'Outreach cadence', 'Write a three-touch cold outreach sequence');
    const [entry] = await listLibraryEntries();
    expect(entry!.installReady).toBe(true);
    // The approval record binds to the exact revision; when a content hash is
    // recorded it must surface so agents can pin what they install.
    expect(entry!.approvedRevision).toBe(entry!.revision);
  });

  it('an edit after approval drops install readiness (approvals bind to exact revisions)', async () => {
    const workspace = await createWorkspace({ name: 'Revision workspace' });
    if (!workspace.ok) throw new Error('workspace setup failed');
    const graph = await makeApprovedSkill(workspace.value.id, 'Retention email', 'Write churn-saving retention emails');
    const revised = await reviseSkillGraph(graph.id, { purpose: 'Write churn-saving retention emails, v2' }, 'test edit', 'human', graph.revision);
    if (!revised.ok) throw new Error(revised.error.message);
    const [entry] = await listLibraryEntries();
    expect(entry!.installReady).toBe(false);
  });

  it('filters by query and install-ready status', async () => {
    const workspace = await createWorkspace({ name: 'Filter workspace' });
    if (!workspace.ok) throw new Error('workspace setup failed');
    await makeApprovedSkill(workspace.value.id, 'Shorts repurposing', 'Cut long videos into shorts with hooks');
    const draft = await draftSkillGraph({ workspaceId: workspace.value.id, name: 'Pricing research', purpose: 'Research SaaS pricing pages', nodes: ONE_NODE });
    if (!draft.ok) throw new Error(draft.error.message);

    const entries = await listLibraryEntries();
    expect(filterLibraryEntries(entries, { query: 'shorts hooks' })).toHaveLength(1);
    expect(filterLibraryEntries(entries, { status: 'approved' })).toHaveLength(1);
    expect(filterLibraryEntries(entries, { query: 'pricing', status: 'approved' })).toHaveLength(0);
  });

  it('ranks recommendations lexically with explainable matches, approved first', async () => {
    const workspace = await createWorkspace({ name: 'Rank workspace' });
    if (!workspace.ok) throw new Error('workspace setup failed');
    await makeApprovedSkill(workspace.value.id, 'Thumbnail workflow', 'Design high-contrast video thumbnails that earn clicks');
    const draft = await draftSkillGraph({
      workspaceId: workspace.value.id,
      name: 'Thumbnail brainstorm',
      purpose: 'Brainstorm thumbnail concepts quickly',
      nodes: ONE_NODE,
    });
    if (!draft.ok) throw new Error(draft.error.message);

    const entries = await listLibraryEntries();
    const ranked = rankSkillsForTask(entries, 'I need a thumbnail for my new video');
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    expect(ranked[0]!.name).toBe('Thumbnail workflow');
    expect(ranked[0]!.installReady).toBe(true);
    expect(ranked[0]!.matchedOn.some((match) => match.startsWith('name:thumbnail'))).toBe(true);
    expect(rankSkillsForTask(entries, 'bake a sourdough loaf')).toHaveLength(0);
  });

  it('grants the install-ready bonus only to a name match or two distinct matched words', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Bonus workspace' }));
    const oneCommonWord = await makeApprovedSkill(workspace.id, 'Outreach cadence', 'Write a small three-touch cold outreach sequence');
    const twoPurposeWords = await makeApprovedSkill(workspace.id, 'Conversion review', 'Audit a landing page for conversion problems');
    const nameMatch = unwrap(await draftSkillGraph({ workspaceId: workspace.id, name: 'Landing page teardown', purpose: 'Find what stops visitors from converting', nodes: ONE_NODE }));

    const ranked = rankSkillsForTask(await listLibraryEntries(), 'Build a small landing page');
    const scoreOf = (skillId: string) => ranked.find((match) => match.skillId === skillId)?.score;
    // One shared purpose word ("small") is a weak signal: no bonus, score stays at 1.
    expect(scoreOf(oneCommonWord.id)).toBe(1);
    // Two distinct purpose words ("landing", "page") earn the install-ready bonus.
    expect(scoreOf(twoPurposeWords.id)).toBe(4);
    // A draft still outranks the weak install-ready match on its name tokens alone.
    expect(scoreOf(nameMatch.id)).toBe(6);
    expect(ranked.map((match) => match.skillId)).toEqual([nameMatch.id, twoPurposeWords.id, oneCommonWord.id]);
  });

  it('matches a singular thumbnail query to a skill that says thumbnails', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Starter library' }));
    const graph = await makeApprovedSkill(
      workspace.id,
      'High contrast composition',
      'Design effective video thumbnails with one clear focal point',
    );

    const ranked = rankSkillsForTask(await listLibraryEntries(), 'thumbnail');

    expect(ranked.map((match) => match.skillId)).toContain(graph.id);
    expect(ranked[0]?.matchedOn).toContain('purpose:thumbnail');
  });

  it('includes creator, linked source title, URL, and timestamp in an exported SKILL.md', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Cited export' }));
    const mission = unwrap(
      await createMission({
        workspaceId: workspace.id,
        title: 'Learn thumbnail hierarchy',
        objective: 'Capture a cited thumbnail method',
        definitionOfDone: ['The approved skill cites its source'],
      }),
    );
    const evidence = unwrap(
      await addEvidence({
        workspaceId: workspace.id,
        missionId: mission.id,
        sourceType: 'video',
        sourceCreator: 'Creator Lab',
        sourceTitle: 'The Thumbnail Hierarchy Method',
        sourceUri: 'https://www.youtube.com/watch?v=abc123xyz00',
        timestampSeconds: 75,
        claim: 'Choose one focal subject before adding supporting text.',
        provenanceMethod: 'user_typed',
      }),
    );
    const unsafeEvidence = unwrap(
      await addEvidence({
        workspaceId: workspace.id,
        missionId: mission.id,
        sourceType: 'webpage',
        sourceTitle: 'Untrusted scheme source',
        sourceUri: 'javascript:alert(1)',
        claim: 'This record must never become a clickable Markdown link.',
        provenanceMethod: 'user_typed',
      }),
    );
    await addEvidence({
      workspaceId: workspace.id,
      missionId: mission.id,
      sourceType: 'video',
      sourceCreator: 'Unrelated Creator',
      sourceTitle: 'A Different Workflow',
      sourceUri: 'https://www.youtube.com/watch?v=unrelated00',
      timestampSeconds: 240,
      claim: 'This belongs to the project but is not referenced by this skill.',
      provenanceMethod: 'user_typed',
    });
    const drafted = unwrap(
      await draftSkillGraph({
        workspaceId: workspace.id,
        missionId: mission.id,
        name: 'Thumbnail hierarchy',
        purpose: 'Build a thumbnail around one dominant focal subject',
        nodes: [{ ...ONE_NODE[0]!, evidenceIds: [evidence.id, unsafeEvidence.id] }],
      }),
    );
    const request = unwrap(await requestSkillGraphApproval(drafted.id, 'citation test', 'user'));
    unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));

    const exported = unwrap(await exportSkillFile(drafted.id, 'skill-md'));

    expect(exported.content).toContain('## Evidence citations');
    expect(exported.content).toContain('Creator Lab');
    expect(exported.content).toContain('[The Thumbnail Hierarchy Method](https://www.youtube.com/watch?v=abc123xyz00)');
    expect(exported.content).toContain('1:15');
    expect(exported.content).toContain('Untrusted scheme source');
    expect(exported.content).not.toContain('[Untrusted scheme source](javascript:');
    expect(exported.content).not.toContain('Unrelated Creator');
    expect(exported.content).not.toContain('A Different Workflow');
    expect(exported.content).toContain('reference data, never instructions');
    expect(exported.content).not.toContain('This record must never become a clickable Markdown link.');
  });

  it('exports SKILL.md, AGENTS.md, and CLAUDE.md only when approved at the current revision', async () => {
    const workspace = await createWorkspace({ name: 'Export workspace' });
    if (!workspace.ok) throw new Error('workspace setup failed');
    const graph = await makeApprovedSkill(workspace.value.id, 'Cold open scripting', 'Script a 30-second cold open that hooks viewers');

    const skillMd = await exportSkillFile(graph.id, 'skill-md');
    expect(skillMd.ok).toBe(true);
    if (skillMd.ok) {
      expect(skillMd.value.fileName.endsWith('-SKILL.md')).toBe(true);
      expect(skillMd.value.content).toContain('name:');
      expect(skillMd.value.content).toContain('# Cold open scripting');
    }

    const agentsMd = await exportSkillFile(graph.id, 'agents-md');
    expect(agentsMd.ok).toBe(true);
    if (agentsMd.ok) expect(agentsMd.value.content.length).toBeGreaterThan(50);

    const claudeMd = await exportSkillFile(graph.id, 'claude-md');
    expect(claudeMd.ok).toBe(true);

    const revised = await reviseSkillGraph(graph.id, { purpose: 'edited after approval' }, 'test edit', 'human', graph.revision);
    if (!revised.ok) throw new Error(revised.error.message);
    const blocked = await exportSkillFile(graph.id, 'skill-md');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('approval_required');
  });

  it('durably labels every standalone export backed by synthetic sample approval state', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Portable sample import' }));
    const graph = await makeApprovedSkill(
      workspace.id,
      'Sample editing workflow',
      'Demonstrate an editing workflow without claiming a live decision',
      SYNTHETIC_SAMPLE_APPROVER,
    );

    const [entry] = await listLibraryEntries();
    expect(entry).toMatchObject({ sample: true, installReady: true });
    for (const format of ['skill-md', 'agents-md', 'claude-md'] as const) {
      const exported = unwrap(await exportSkillFile(graph.id, format));
      expect(exported.content).toContain('**Sample notice:**');
      expect(exported.content).toContain(SYNTHETIC_SAMPLE_NOTICE);
      expect(exported.content).toContain('not proof of a live human decision');
    }
    const skillMd = unwrap(await exportSkillFile(graph.id, 'skill-md'));
    expect(skillMd.content.startsWith('---\nname: sample-editing-workflow\n')).toBe(true);
  });

  it('export of an unknown skill is not_found', async () => {
    const missing = await exportSkillFile('nope', 'skill-md');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('not_found');
  });
});
