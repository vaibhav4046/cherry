import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { STARTER_LIBRARY_MANIFEST } from '../fixtures/starter-library-manifest.ts';
import { listMissions, listWorkspaces } from '../../src/cherry/mission/mission-service.ts';
import { listSources } from '../../src/cherry/source/source-service.ts';
import { listLessons, listTranscript } from '../../src/cherry/watch/lesson-service.ts';
import { listEvidence } from '../../src/cherry/evidence/evidence-service.ts';
import {
  listApprovals,
  listSkillGraphs,
  listSkillGraphVersions,
} from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { importShippedExampleWorkspace, importWorkspace, type WorkspaceExport } from '../../src/cherry/persistence/workspace-archive.ts';
import { exportSkillFile, listLibraryEntries, rankSkillsForTask } from '../../src/cherry/library/library-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import type { EvidenceRecord } from '../../src/cherry/evidence/evidence-model.ts';
import type { SkillGraph } from '../../src/cherry/skillgraph/skillgraph-model.ts';
import type { Lesson } from '../../src/cherry/watch/watch-model.ts';

const FIXTURE_PATH = resolve(process.cwd(), 'public/examples/starter-library-workspace.json');
const SAMPLE_CREATOR = 'Sample Creator (synthetic)';
const SAMPLE_CHANNEL_ID = 'UCsampleCreatorCherry001';

function timestampSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

describe('starter library manifest', () => {
  it('curates between eight and ten real creator skills', () => {
    expect(STARTER_LIBRARY_MANIFEST.skills.length).toBeGreaterThanOrEqual(8);
    expect(STARTER_LIBRARY_MANIFEST.skills.length).toBeLessThanOrEqual(10);

    const urls = STARTER_LIBRARY_MANIFEST.skills.map((seed) => seed.source.canonicalUrl);
    expect(new Set(urls).size).toBe(urls.length);
    for (const seed of STARTER_LIBRARY_MANIFEST.skills) {
      expect(seed.source.creator.trim()).not.toBe('');
      expect(seed.source.title.trim()).not.toBe('');
      expect(seed.source.canonicalUrl).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
      expect(seed.chapters.length).toBeGreaterThanOrEqual(3);
      for (const chapter of seed.chapters) {
        expect(timestampSeconds(chapter.timestamp)).toBe(chapter.timestampSeconds);
        expect(chapter.claim).not.toBe(chapter.chapterTitle);
        expect(chapter.claim).not.toMatch(/['"\u2018\u2019\u201c\u201d]/);
      }
    }
  });
});

describe('shipped starter library workspace', () => {
  it('imports with a verified hash and serves only approved, cited skills', async () => {
    const fixtureExists = existsSync(FIXTURE_PATH);
    expect(fixtureExists, 'Run with GENERATE_STARTER_LIBRARY=1 to create the shipped fixture').toBe(true);
    if (!fixtureExists) return;

    const raw = readFileSync(FIXTURE_PATH, 'utf8');
    const archive = JSON.parse(raw) as WorkspaceExport;
    const archivedGraphs = archive.skillGraphs as SkillGraph[];
    const archivedEvidence = archive.evidence as EvidenceRecord[];
    const archivedLessons = archive.lessons as Lesson[];

    expect(archive.workspace).toMatchObject({
      name: 'EXAMPLE — Creator skills starter library',
      isExample: true,
    });
    expect(String(archive.workspace['description'])).toContain('starter-library-v1');
    expect(String(archive.workspace['description'])).toContain('synthetic reference snapshot');
    expect(String(archive.workspace['description'])).toContain('not proof of a live user decision');
    expect(raw).not.toContain('human-reviewed');
    expect(raw).not.toContain('"actorType": "human"');
    expect(archivedGraphs.length).toBeGreaterThanOrEqual(8);
    expect(archivedGraphs.length).toBeLessThanOrEqual(10);
    // The eight curated skills carry no transcript. The only transcript in the archive belongs to
    // the synthetic sample creator's anchor upload, and the only channel watch is that creator's
    // labelled sample watch, which was never registered with a runner and is stopped on reset.
    const sampleSources = (archive.sourceRecords as Array<Record<string, unknown>>).filter((source) => source['creator'] === SAMPLE_CREATOR);
    expect(sampleSources).toHaveLength(2);
    expect(sampleSources.map((source) => source['sourceOrigin']).sort()).toEqual(['manual', 'rss-watch']);
    expect(sampleSources.every((source) => source['youtubeChannelId'] === SAMPLE_CHANNEL_ID && /sampleVid0[12]$/.test(String(source['url'])))).toBe(true);
    const sampleLessonIds = new Set(sampleSources.map((source) => source['lessonId']));
    expect((archive.transcriptSegments as Array<Record<string, unknown>>).every((segment) => sampleLessonIds.has(segment['lessonId']))).toBe(true);
    expect((archive.transcriptSegments as unknown[]).length).toBeGreaterThan(0);
    expect(archive.channelWatches).toHaveLength(1);
    expect((archive.channelWatches as Array<Record<string, unknown>>)[0]).toMatchObject({ channelId: SAMPLE_CHANNEL_ID, channelName: SAMPLE_CREATOR, enabled: true });
    expect(archivedLessons.filter((lesson) => !sampleLessonIds.has(lesson.id)).every((lesson) => lesson.transcriptSource === null && lesson.transcriptImportedAt === null)).toBe(true);
    const proposals = (archive as unknown as { skillProposals: Array<Record<string, unknown>> }).skillProposals;
    expect(proposals.filter((proposal) => proposal['readiness'] === 'approved')).toHaveLength(archivedGraphs.length);
    expect(proposals.filter((proposal) => proposal['readiness'] === 'draft-ready')).toHaveLength(1);
    expect(proposals.filter((proposal) => proposal['readiness'] === 'needs-transcript')).toHaveLength(1);
    expect(archivedEvidence.length).toBeGreaterThan(archivedGraphs.length);
    expect(archivedEvidence.every((evidence) => (
      evidence.sourceType === 'video'
      && evidence.trust === 'reviewed'
      && evidence.provenanceMethod === 'user_typed'
      && typeof evidence.sourceUri === 'string'
      && /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(evidence.sourceUri)
      && typeof evidence.sourceCreator === 'string'
      && evidence.sourceCreator.length > 0
      && typeof evidence.sourceTitle === 'string'
      && evidence.sourceTitle.length > 0
      && typeof evidence.timestampSeconds === 'number'
      && Number.isInteger(evidence.timestampSeconds)
      && evidence.timestampSeconds >= 0
      && evidence.history.some((entry) => entry.action === 'trust_changed' && entry.actorType === 'system')
      && typeof evidence.detail === 'string'
      && evidence.detail.startsWith('Metadata basis: creator-authored chapter at ')
      && !/['"\u2018\u2019\u201c\u201d]/.test(`${evidence.claim} ${evidence.detail}`)
    ))).toBe(true);
    expect(archivedGraphs.every((graph) => (
      graph.status === 'approved'
      && graph.revision === 2
      && graph.approvedRevision === graph.revision
      && graph.approvedBy === 'sample-fixture-state'
      && graph.nodes.every((node) => node.evidenceIds.length > 0)
      && graph.nodes.every((node) => node.evidenceIds.every((id) => graph.knowledge?.some((ref) => ref.evidenceId === id)))
    ))).toBe(true);

    // The ordinary portable-import path strips every approval/trust capability,
    // including labelled fixture state. Only the exact shipped-example path may
    // preserve demonstrative approvals, so an arbitrary rehashed archive cannot
    // make itself install-ready.
    freshDb();
    unwrap(await importWorkspace(raw));
    const [portableWorkspace] = await listWorkspaces();
    expect(portableWorkspace!.isExample).not.toBe(true);
    const portableEntries = await listLibraryEntries();
    expect(portableEntries).toHaveLength(STARTER_LIBRARY_MANIFEST.skills.length);
    expect(portableEntries.every((entry) => !entry.sample && !entry.installReady && entry.approvalHash === null)).toBe(true);
    expect((await exportSkillFile(portableEntries[0]!.skillId, 'skill-md')).ok).toBe(false);

    freshDb();
    const imported = unwrap(await importShippedExampleWorkspace(raw, 'starter-library'));
    expect(imported.hashVerified).toBe(true);

    const [entries, graphs, approvals, evidence, lessons, missions, sources] = await Promise.all([
      listLibraryEntries(),
      listSkillGraphs(imported.workspaceId),
      listApprovals(imported.workspaceId),
      listEvidence(imported.workspaceId),
      listLessons(imported.workspaceId),
      listMissions(imported.workspaceId),
      listSources(imported.workspaceId),
    ]);
    expect(entries).toHaveLength(STARTER_LIBRARY_MANIFEST.skills.length);
    expect(entries.every((entry) => entry.sample && entry.installReady && entry.approvedRevision === entry.revision && entry.approvalHash)).toBe(true);
    expect(approvals).toHaveLength(entries.length);
    expect(approvals.every((approval) => (
      approval.decision === 'approved'
      && approval.decidedBy === 'sample-fixture-state'
      && approval.comment?.includes('synthetic fixture') === true
      && approval.objectRevision === 2
      && typeof approval.contentHash === 'string'
    ))).toBe(true);
    expect(evidence).toHaveLength(archivedEvidence.length);
    expect(sources).toHaveLength(entries.length + 2);
    expect(lessons).toHaveLength(entries.length + 2);
    expect(missions).toHaveLength(entries.length);
    expect(sources.filter((source) => source.creator === SAMPLE_CREATOR)).toHaveLength(2);
    expect(sources.filter((source) => source.creator !== SAMPLE_CREATOR).every((source) => (
      source.kind === 'youtube'
      && source.sourceOrigin === 'manual'
      && source.contentHash === null
      && source.fetchMethod === null
      && source.fetchStatus === 'not_requested'
      && lessons.some((lesson) => lesson.id === source.lessonId && lesson.missionId)
    ))).toBe(true);
    expect(missions.every((mission) => (
      mission.state === 'EXECUTING'
      && lessons.some((lesson) => lesson.id === mission.lessonId && lesson.missionId === mission.id)
      && graphs.some((graph) => graph.id === mission.skillGraphId && graph.missionId === mission.id)
    ))).toBe(true);
    const skillLessons = lessons.filter((lesson) => !sources.some((source) => source.creator === SAMPLE_CREATOR && source.lessonId === lesson.id));
    const importedTranscripts = (await Promise.all(skillLessons.map((lesson) => listTranscript(lesson.id)))).flat();
    expect(importedTranscripts).toEqual([]);
    for (const graph of graphs) {
      const versions = await listSkillGraphVersions(graph.id);
      expect(versions.some((version) => version.revision === 2 && version.status === 'approved')).toBe(true);
    }

    const recommendations = rankSkillsForTask(entries, 'I need a thumbnail for my video');
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0]).toMatchObject({ sample: true, installReady: true, status: 'approved' });
    expect(`${recommendations[0]!.name} ${recommendations[0]!.purpose}`.toLowerCase()).toContain('thumbnail');
    const installFile = unwrap(await exportSkillFile(recommendations[0]!.skillId, 'skill-md'));
    expect(installFile.content.toLowerCase()).toContain('thumbnail');

    const tampered = raw.replace('starter-library-v1', 'starter-library-v2');
    const rejected = await importShippedExampleWorkspace(tampered, 'starter-library');
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.message).toContain('integrity hash');
  });
});
