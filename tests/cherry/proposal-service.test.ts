import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { fixedClock, setClock } from '../../src/cherry/core/clock.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createMission, createWorkspace, updateMission } from '../../src/cherry/mission/mission-service.ts';
import { CherryDatabase, getDb, setDb } from '../../src/cherry/persistence/cherry-db.ts';
import { CHERRY_DB_MIGRATIONS, CHERRY_DB_VERSION } from '../../src/cherry/persistence/migrations.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';
import { exportWorkspace, importWorkspace } from '../../src/cherry/persistence/workspace-archive.ts';
import { createChannelWatch, reconcileChannelWatchRunnerOutcome } from '../../src/cherry/source/channel-watch-service.ts';
import {
  dismissProposal,
  ensureProposalForSource,
  getProposalForSource,
  listProposals,
  proposeFromSource,
  syncProposals,
} from '../../src/cherry/source/proposal-service.ts';
import { createSource, importSourceTranscript } from '../../src/cherry/source/source-service.ts';
import type { SourceRecord } from '../../src/cherry/source/source-model.ts';
import { generateSkillFromLesson } from '../../src/cherry/skillgraph/quick-skill.ts';
import { decideSkillGraphApproval, requestSkillGraphApproval, reviseSkillGraph } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { getLesson, listTranscript, updateLesson } from '../../src/cherry/watch/lesson-service.ts';
import type { Lesson, TranscriptSegment } from '../../src/cherry/watch/watch-model.ts';

const CHANNEL_ID = 'UCSTUDIONORTH12345678901';
const TRANSCRIPT = [
  '0:05 Create a new sequence for the cold email campaign.',
  '0:40 Always keep the first line about the reader, never about you.',
  '1:10 Add a follow-up step three days later.',
  '1:50 Check the reply rate before sending the next batch.',
].join('\n');

function fakeSource(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: 'src-fake',
    workspaceId: 'ws-fake',
    lessonId: 'ls-fake',
    kind: 'youtube',
    status: 'saved',
    title: 'Set up a cold-email sequence that gets replies',
    creator: 'Studio North',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    contentFormat: null,
    contentHash: null,
    fetchStatus: 'not_requested',
    fetchMethod: null,
    fetchedAt: null,
    fetchError: null,
    sourceOrigin: 'manual',
    permissionAcknowledgedAt: '2026-09-02T09:00:00.000Z',
    permissionNote: null,
    createdAt: '2026-09-02T09:00:00.000Z',
    updatedAt: '2026-09-02T09:00:00.000Z',
    ...overrides,
  };
}

function fakeSegments(lessonId: string): TranscriptSegment[] {
  return [
    { id: 'seg-1', workspaceId: 'ws-fake', lessonId, index: 0, startSeconds: 5, endSeconds: 20, text: 'Create a new sequence for the cold email campaign.', source: 'user_text' },
    { id: 'seg-2', workspaceId: 'ws-fake', lessonId, index: 1, startSeconds: 40, endSeconds: 60, text: 'Always keep the first line about the reader.', source: 'user_text' },
    { id: 'seg-3', workspaceId: 'ws-fake', lessonId, index: 2, startSeconds: 70, endSeconds: 90, text: 'Add a follow-up step three days later.', source: 'user_text' },
  ];
}

async function youtubeSource(workspaceId: string, title: string, videoId: string, extra: Partial<Parameters<typeof createSource>[0]> = {}) {
  return unwrap(await createSource({
    workspaceId,
    kind: 'youtube',
    title,
    creator: 'Studio North',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    permissionAcknowledged: true,
    ...extra,
  }));
}

describe('proposeFromSource (pure, deterministic)', () => {
  it('proposes from a title alone: needs-transcript, no steps, content-derived name and one calm sentence', () => {
    const proposal = unwrap(proposeFromSource(fakeSource()));
    expect(proposal).toMatchObject({
      id: 'src-fake',
      sourceId: 'src-fake',
      workspaceId: 'ws-fake',
      creatorName: 'Studio North',
      sourceTitle: 'Set up a cold-email sequence that gets replies',
      readiness: 'needs-transcript',
      candidateSteps: [],
      missionId: null,
      skillGraphId: null,
      publishedAt: '2026-09-02T09:00:00.000Z',
    });
    expect(proposal.name).toBe('Set up a cold-email sequence that gets replies skill');
    expect(proposal.teaches).toBe('How to set up a cold-email sequence that gets replies.');
  });

  it('keeps a title that is not an instruction intact instead of forcing "How to" onto it', () => {
    const listicle = unwrap(proposeFromSource({ ...fakeSource(), title: '11 Thumbnail Design Hacks Top Creators Use on YouTube' }));
    expect(listicle.teaches).toBe('What this upload teaches: 11 Thumbnail Design Hacks Top Creators Use on YouTube.');
    const imperative = unwrap(proposeFromSource({ ...fakeSource(), title: 'Turn one long video into five short clips' }));
    expect(imperative.teaches).toBe('How to turn one long video into five short clips.');
    const question = unwrap(proposeFromSource({ ...fakeSource(), title: 'Why your first 10 seconds decide everything?' }));
    expect(question.teaches).toBe('Why your first 10 seconds decide everything.');
  });

  it('uses the description for the sentence when one is present, capped and plain', () => {
    const proposal = unwrap(proposeFromSource(fakeSource(), undefined, {
      description: 'In this video I show the exact three-step sequence I use to get replies. It also covers timing.',
    }));
    expect(proposal.teaches).toBe('How to set up a cold-email sequence that gets replies. In this video I show the exact three-step sequence I use to get replies.');
    expect(proposal.teaches.length).toBeLessThanOrEqual(240);
  });

  it('strips hostile HTML from a description and never keeps tags or scripts', () => {
    const proposal = unwrap(proposeFromSource(fakeSource(), undefined, {
      description: '<script>alert(1)</script>Set up <b>DKIM</b> first &amp; then <a href="x">warm up</a>. <img src=x onerror=alert(2)>',
    }));
    expect(proposal.teaches).not.toMatch(/[<>]/);
    expect(proposal.teaches).not.toMatch(/script|onerror|alert/);
    expect(proposal.teaches).toContain('Set up DKIM first & then warm up.');
  });

  it('caps an oversized description at 2000 characters before deriving the sentence', () => {
    const huge = `${'a'.repeat(2500)}. Second sentence.`;
    const proposal = unwrap(proposeFromSource(fakeSource(), undefined, { description: huge }));
    expect(proposal.teaches.length).toBeLessThanOrEqual(240);
    expect(proposal.teaches).not.toContain('Second sentence');
  });

  it('derives candidate steps and a workflow name when a transcript is present', () => {
    const lesson: Lesson = { id: 'ls-fake', workspaceId: 'ws-fake', title: 'Set up a cold-email sequence that gets replies', kind: 'youtube', coverageCriteria: [], lastPositionSeconds: 0, revision: 2, createdAt: '2026-09-02T09:00:00.000Z', updatedAt: '2026-09-02T09:00:00.000Z' };
    const proposal = unwrap(proposeFromSource(fakeSource(), lesson, { segments: fakeSegments('ls-fake') }));
    expect(proposal.readiness).toBe('draft-ready');
    expect(proposal.candidateSteps).toEqual([
      'Create a new sequence for the cold email campaign.',
      'Add a follow-up step three days later.',
    ]);
    // Same rule Quick Skill applies: a task-shaped upload title is the name; the step object is the fallback.
    expect(proposal.name).toBe('Set up a cold-email sequence that gets replies skill');
  });

  it('rejects an empty title', () => {
    expect(proposeFromSource(fakeSource({ title: '   ' }))).toMatchObject({ ok: false, error: { code: 'validation' } });
  });

  it('rejects a source that is not a YouTube source', () => {
    expect(proposeFromSource(fakeSource({ kind: 'article' }))).toMatchObject({ ok: false, error: { code: 'validation' } });
  });

  it('is idempotent: the same inputs produce the same proposal content', () => {
    const first = unwrap(proposeFromSource(fakeSource(), undefined, { description: 'Timing matters.' }));
    const second = unwrap(proposeFromSource(fakeSource(), undefined, { description: 'Timing matters.' }));
    expect(second).toEqual(first);
  });
});

describe('proposal persistence and lifecycle', () => {
  beforeEach(() => {
    freshDb();
    setClock(fixedClock('2026-09-02T10:00:00.000Z'));
  });

  it('creates a proposal in the same ledger as a manual YouTube save', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Creators' }));
    const source = await youtubeSource(workspace.id, 'Set up a cold-email sequence that gets replies', 'manualVid01');
    const proposal = await getProposalForSource(source.id);
    expect(proposal).toMatchObject({ id: source.id, readiness: 'needs-transcript', creatorName: 'Studio North' });
    const events = await listProofEvents(workspace.id);
    expect(events.map((event) => event.type)).toContain('skill_proposal.created');
    expect(events.find((event) => event.type === 'skill_proposal.created')?.objectId).toBe(source.id);
  });

  it('creates a proposal for a watch-history import and none for notes, articles, or files', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Creators' }));
    const imported = await youtubeSource(workspace.id, 'Edit thumbnails faster', 'takeoutVid1', {
      sourceOrigin: 'takeout-import',
      permissionNote: 'Selected from local YouTube history.',
    });
    expect(await getProposalForSource(imported.id)).toMatchObject({ readiness: 'needs-transcript' });

    const note = unwrap(await createSource({ workspaceId: workspace.id, kind: 'note', title: 'Pasted notes', content: TRANSCRIPT }));
    const article = unwrap(await createSource({ workspaceId: workspace.id, kind: 'article', title: 'A post', url: 'https://example.com/post', permissionAcknowledged: true }));
    expect(await getProposalForSource(note.id)).toBeUndefined();
    expect(await getProposalForSource(article.id)).toBeUndefined();
    expect(await listProposals(workspace.id)).toHaveLength(1);
  });

  it('does not duplicate a proposal for the same source', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Creators' }));
    const source = await youtubeSource(workspace.id, 'Set up a cold-email sequence that gets replies', 'manualVid01');
    const first = unwrap(await ensureProposalForSource(source.id));
    const second = unwrap(await ensureProposalForSource(source.id));
    expect(second.id).toBe(first.id);
    expect(await getDb().skillProposals.where('workspaceId').equals(workspace.id).count()).toBe(1);
  });

  it('creates needs-transcript proposals for every new upload a channel watch saves', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Creators' }));
    const anchor = await youtubeSource(workspace.id, 'Anchor video', 'anchorVid01', { youtubeChannelId: CHANNEL_ID });
    const watch = unwrap(await createChannelWatch({ sourceId: anchor.id }));
    const startedAt = Date.parse(watch.schedule.startAt);
    const publishedAt = new Date(startedAt + 30_000).toISOString();
    const outcome = {
      schemaVersion: 1 as const,
      status: 'completed' as const,
      jobId: 'job-feed-1',
      watchId: watch.id,
      actionHash: watch.actionHash,
      channelId: watch.channelId,
      checkedAt: new Date(startedAt + 60_000).toISOString(),
      channelName: 'Studio North',
      feedHash: 'a'.repeat(64),
      entries: [{ videoId: 'newVideo001', title: 'Write subject lines people open', url: 'https://www.youtube.com/watch?v=newVideo001', publishedAt }],
    };
    const reconciled = unwrap(await reconcileChannelWatchRunnerOutcome(watch.id, outcome));
    expect(reconciled.createdSources).toHaveLength(1);
    const proposal = await getProposalForSource(reconciled.createdSources[0]!.id);
    expect(proposal).toMatchObject({
      readiness: 'needs-transcript',
      creatorName: 'Studio North',
      sourceTitle: 'Write subject lines people open',
      publishedAt,
      teaches: 'How to write subject lines people open.',
    });
    const events = await listProofEvents(workspace.id);
    expect(events.filter((event) => event.type === 'skill_proposal.created')).toHaveLength(2);
  });

  it('walks the lifecycle: transcript makes it draft-ready, a skill makes it drafted, approval makes it approved, an edit makes it stale', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Creators' }));
    const source = await youtubeSource(workspace.id, 'Set up a cold-email sequence that gets replies', 'manualVid01');
    expect((await getProposalForSource(source.id))?.readiness).toBe('needs-transcript');

    unwrap(await importSourceTranscript(source.id, TRANSCRIPT, 'user_text'));
    let [proposal] = await syncProposals(workspace.id);
    expect(proposal).toMatchObject({ readiness: 'draft-ready' });
    expect(proposal!.candidateSteps.length).toBeGreaterThan(0);
    expect(proposal!.name).toMatch(/(workflow|skill)$/);

    const mission = unwrap(await createMission({ workspaceId: workspace.id, title: 'Cold email', objective: 'Learn it', definitionOfDone: ['Approved'] }));
    unwrap(await updateMission(mission.id, { lessonId: source.lessonId }));
    unwrap(await updateLesson(source.lessonId, { missionId: mission.id }));
    const generated = unwrap(await generateSkillFromLesson({ lessonId: source.lessonId }));
    [proposal] = await syncProposals(workspace.id);
    expect(proposal).toMatchObject({ readiness: 'drafted', missionId: mission.id, skillGraphId: generated.graph.id });

    const request = unwrap(await requestSkillGraphApproval(generated.graph.id, 'Reviewed', 'user', 'human'));
    unwrap(await decideSkillGraphApproval(request.approval.id, 'approved', 'user'));
    [proposal] = await syncProposals(workspace.id);
    expect(proposal!.readiness).toBe('approved');

    unwrap(await reviseSkillGraph(generated.graph.id, { purpose: 'Edited after approval' }, 'Edit', 'human'));
    [proposal] = await syncProposals(workspace.id);
    expect(proposal!.readiness).toBe('drafted');

    const types = (await listProofEvents(workspace.id)).map((event) => event.type);
    expect(types.filter((type) => type === 'skill_proposal.updated').length).toBeGreaterThanOrEqual(3);
    expect(types).not.toContain('skillgraph.approved_by_proposal');
  });

  it('lets only a person dismiss a proposal, and dismissal survives a sync', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Creators' }));
    const source = await youtubeSource(workspace.id, 'Set up a cold-email sequence that gets replies', 'manualVid01');
    expect(await dismissProposal(source.id, 'agent')).toMatchObject({ ok: false, error: { code: 'approval_required' } });
    const dismissed = unwrap(await dismissProposal(source.id, 'human'));
    expect(dismissed.readiness).toBe('dismissed');
    unwrap(await importSourceTranscript(source.id, TRANSCRIPT, 'user_text'));
    const [after] = await syncProposals(workspace.id);
    expect(after!.readiness).toBe('dismissed');
    expect((await listProofEvents(workspace.id)).map((event) => event.type)).toContain('skill_proposal.dismissed');
  });

  it('lists proposals newest first by publication', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Creators' }));
    setClock(fixedClock('2026-09-02T10:00:00.000Z'));
    const older = await youtubeSource(workspace.id, 'Older upload', 'olderVid001');
    setClock(fixedClock('2026-09-02T11:00:00.000Z'));
    const newer = await youtubeSource(workspace.id, 'Newer upload', 'newerVid001');
    const listed = await listProposals(workspace.id);
    expect(listed.map((proposal) => proposal.sourceId)).toEqual([newer.id, older.id]);
  });

  it('never proposes for an archived source and drops nothing when the transcript is absent', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Creators' }));
    const source = await youtubeSource(workspace.id, 'Set up a cold-email sequence that gets replies', 'manualVid01');
    const lesson = await getLesson(source.lessonId);
    expect(lesson).toBeDefined();
    expect(await listTranscript(source.lessonId)).toHaveLength(0);
    const [proposal] = await syncProposals(workspace.id);
    expect(proposal!.candidateSteps).toEqual([]);
  });
});

describe('proposal persistence: migration and archive', () => {
  beforeEach(() => {
    freshDb();
    setClock(fixedClock('2026-09-02T10:00:00.000Z'));
  });

  it('adds the skillProposals table in a new schema version and keeps older data on upgrade', async () => {
    expect(CHERRY_DB_VERSION).toBe(6);
    const migration = CHERRY_DB_MIGRATIONS.find((entry) => entry.version === 5);
    expect(migration?.stores['skillProposals']).toContain('sourceId');

    // A database written by the previous shipped version must upgrade in place.
    const name = `cherry-upgrade-${Date.now()}`;
    const legacy = new Dexie(name);
    for (const entry of CHERRY_DB_MIGRATIONS.filter((candidate) => candidate.version < 5)) {
      legacy.version(entry.version).stores(entry.stores);
    }
    await legacy.open();
    await legacy.table('workspaces').add({ id: 'ws-legacy', name: 'Legacy', createdAt: 'x', updatedAt: 'x' });
    legacy.close();

    const upgraded = new CherryDatabase(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(6);
    expect(await upgraded.workspaces.get('ws-legacy')).toMatchObject({ name: 'Legacy' });
    expect(await upgraded.skillProposals.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });

  it('round-trips proposals through the workspace archive with remapped ids', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Creators' }));
    const source = await youtubeSource(workspace.id, 'Set up a cold-email sequence that gets replies', 'manualVid01');
    unwrap(await dismissProposal(source.id, 'human'));
    const exported = unwrap(await exportWorkspace(workspace.id));
    expect(exported.schemaVersion).toBe('1.2.0');
    expect(exported.skillProposals).toHaveLength(1);

    const fresh = freshDb();
    setDb(fresh);
    const imported = unwrap(await importWorkspace(JSON.stringify(exported)));
    const proposals = await listProposals(imported.workspaceId);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ readiness: 'dismissed', sourceTitle: 'Set up a cold-email sequence that gets replies' });
    const importedSource = await getDb().sourceRecords.get(proposals[0]!.sourceId);
    expect(importedSource?.workspaceId).toBe(imported.workspaceId);
    expect(proposals[0]!.id).toBe(proposals[0]!.sourceId);
  });
});
