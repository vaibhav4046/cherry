import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { createMission } from '../../src/cherry/mission/mission-service.ts';
import { draftSkillGraph } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { proposeMemory } from '../../src/cherry/memory/memory-service.ts';
import { buildMemoryGraph } from '../../src/cherry/memory/memory-graph.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';

describe('memory graph projection', () => {
  beforeEach(() => freshDb());
  it('projects persisted memory records with provenance', async () => {
    const ws = unwrap(await createWorkspace({ name: 'Graph' }));
    const memory = unwrap(await proposeMemory({ workspaceId: ws.id, type: 'procedure', title: 'T', content: 'C', scope: 'workspace', provenance: [{ sourceType: 'human', description: 'user' }] }));
    const graph = unwrap(await buildMemoryGraph(ws.id));
    const node = graph.nodes.find((n) => n.id === memory.id);
    expect(node?.kind).toBe('memory-proposal');
    expect(node?.provenance?.length).toBe(1);
  });
  it('keeps mission projections isolated and uses persisted IDs', async () => {
    const ws = unwrap(await createWorkspace({ name: 'Graph' }));
    const m1 = unwrap(await createMission({ workspaceId: ws.id, title: 'One', objective: 'one', definitionOfDone: ['done'] }));
    const m2 = unwrap(await createMission({ workspaceId: ws.id, title: 'Two', objective: 'two', definitionOfDone: ['done'] }));
    const g1 = unwrap(await draftSkillGraph({ workspaceId: ws.id, missionId: m1.id, name: 'G1', purpose: 'p', nodes: [{ kind: 'build', title: 'n', goal: 'g' }] }));
    const g2 = unwrap(await draftSkillGraph({ workspaceId: ws.id, missionId: m2.id, name: 'G2', purpose: 'p', nodes: [{ kind: 'build', title: 'n', goal: 'g' }] }));
    const graph = unwrap(await buildMemoryGraph(ws.id, m1.id));
    expect(graph.nodes.some((n) => n.id === g1.nodes[0]?.id)).toBe(true);
    expect(graph.nodes.some((n) => n.id === g2.nodes[0]?.id)).toBe(false);
    expect(graph.nodes.filter((n) => n.kind === 'source').every((n) => !n.id.startsWith('source:'))).toBe(true);
  });
  it('projects artifact file metadata from the persisted file record', async () => {
    const ws = unwrap(await createWorkspace({ name: 'Artifacts' }));
    const mission = unwrap(await createMission({ workspaceId: ws.id, title: 'M', objective: 'm', definitionOfDone: ['done'] }));
    await getDb().artifactSets.add({ id: 'as-1', workspaceId: ws.id, missionId: mission.id, name: 'A', entryPath: 'index.html', revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await getDb().artifactFiles.add({ id: 'af-1', workspaceId: ws.id, artifactSetId: 'as-1', path: 'index.html', mediaType: 'text/html', content: '<p>x</p>', sizeBytes: 8, sha256: 'a'.repeat(64), revision: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'human' });
    const graph = unwrap(await buildMemoryGraph(ws.id, mission.id));
    expect(graph.nodes.find((n) => n.id === 'af-1')?.revision).toBe(2);
  });
});
