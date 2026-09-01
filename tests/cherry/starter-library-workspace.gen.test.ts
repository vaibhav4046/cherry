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
import { importWorkspace, type WorkspaceExport } from '../../src/cherry/persistence/workspace-archive.ts';
import { exportSkillFile, listLibraryEntries, rankSkillsForTask } from '../../src/cherry/library/library-service.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import type { EvidenceRecord } from '../../src/cherry/evidence/evidence-model.ts';
import type { SkillGraph } from '../../src/cherry/skillgraph/skillgraph-model.ts';
import type { Lesson } from '../../src/cherry/watch/watch-model.ts';
import { SYNTHETIC_SAMPLE_NOTICE } from '../../src/cherry/skillgraph/sample-state.ts';

const FIXTURE_PATH = resolve(process.cwd(), 'public/examples/starter-library-workspace.json');

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
    expect(archive.transcriptSegments).toEqual([]);
    expect(archive.channelWatches).toEqual([]);
    expect(archivedLessons.every((lesson) => lesson.transcriptSource === null && lesson.transcriptImportedAt === null)).toBe(true);
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

    // The ordinary portable-import path intentionally strips the resettable
    // workspace flag. The synthetic approval actor must preserve honest sample
    // classification in the library and in files that leave Cherry.
    freshDb();
    unwrap(await importWorkspace(raw));
    const [portableWorkspace] = await listWorkspaces();
    expect(portableWorkspace!.isExample).not.toBe(true);
    const portableEntries = await listLibraryEntries();
    expect(portableEntries).toHaveLength(STARTER_LIBRARY_MANIFEST.skills.length);
    expect(portableEntries.every((entry) => entry.sample)).toBe(true);
    const portableExport = unwrap(await exportSkillFile(portableEntries[0]!.skillId, 'skill-md'));
    expect(portableExport.content).toContain(SYNTHETIC_SAMPLE_NOTICE);

    freshDb();
    const imported = unwrap(await importWorkspace(raw, { markExample: true }));
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
    expect(sources).toHaveLength(entries.length);
    expect(lessons).toHaveLength(entries.length);
    expect(missions).toHaveLength(entries.length);
    expect(sources.every((source) => (
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
    const importedTranscripts = (await Promise.all(lessons.map((lesson) => listTranscript(lesson.id)))).flat();
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
    const rejected = await importWorkspace(tampered, { markExample: true });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.message).toContain('integrity hash');
  });
});
