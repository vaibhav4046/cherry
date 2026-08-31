import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import { createWorkspace } from '../../src/cherry/mission/mission-service.ts';
import { proposeMemory, decideMemory, setMemoryPinned } from '../../src/cherry/memory/memory-service.ts';
import { selectMemoriesForContext } from '../../src/cherry/memory/memory-policy.ts';
import { listProofEvents } from '../../src/cherry/persistence/transactions.ts';

describe('memory policy and lifecycle', () => {
  beforeEach(() => freshDb());
  it('round-trips projectId and filters approved in-scope memories', async () => {
    const ws = unwrap(await createWorkspace({ name: 'Memory' }));
    const memory = unwrap(await proposeMemory({ workspaceId: ws.id, projectId: 'p1', type: 'preference', title: 'T', content: 'C', scope: 'project', sensitivity: 'private', provenance: [{ sourceType: 'human', description: 'user' }] }));
    expect(memory.projectId).toBe('p1');
    unwrap(await decideMemory(memory.id, 'approved', 'user'));
    expect((await selectMemoriesForContext({ workspaceId: ws.id, projectId: 'p1' })).map((m) => m.id)).toContain(memory.id);
    unwrap(await setMemoryPinned(memory.id, true));
    expect((await listProofEvents(ws.id)).some((e) => e.type === 'memory.pinned')).toBe(true);
  });
  it('refuses agent decisions', async () => {
    const ws = unwrap(await createWorkspace({ name: 'Memory' }));
    const memory = unwrap(await proposeMemory({ workspaceId: ws.id, type: 'preference', title: 'T', content: 'C', scope: 'workspace', provenance: [{ sourceType: 'human', description: 'user' }] }));
    const refused = await decideMemory(memory.id, 'approved', 'agent-1', 'agent');
    expect(refused.ok).toBe(false);
  });
});
