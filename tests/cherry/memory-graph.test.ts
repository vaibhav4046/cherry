import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { proposeMemory } from '../../src/cherry/memory/memory-service.ts';
import { buildMemoryGraph } from '../../src/cherry/memory/memory-graph.ts';

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
});
