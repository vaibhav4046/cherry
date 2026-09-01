import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import {
  loadExampleWorkspace,
  resetExampleWorkspaces,
} from '../../src/cherry/persistence/example-workspace-loader.ts';
import {
  createExampleWorkspace,
  createWorkspace,
  listWorkspaces,
} from '../../src/cherry/mission/mission-service.ts';

const goldenFixture = readFileSync(resolve(process.cwd(), 'public/examples/example-workspace.json'), 'utf8');

describe('labelled example workspace loader', () => {
  beforeEach(() => {
    freshDb();
  });

  it('imports a verified example once and reuses it on the next click', async () => {
    let requests = 0;
    const fetcher = async () => {
      requests += 1;
      return { ok: true, status: 200, text: async () => goldenFixture };
    };

    const first = await loadExampleWorkspace('golden-loop', fetcher);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.status).toBe('imported');
    expect(first.value.hashVerified).toBe(true);

    const second = await loadExampleWorkspace('golden-loop', fetcher);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.status).toBe('already-loaded');
    expect(second.value.workspaceId).toBe(first.value.workspaceId);
    expect(second.value.hashVerified).toBeNull();
    expect(requests).toBe(1);
    expect(await listWorkspaces()).toHaveLength(1);
  });

  it('coalesces concurrent requests for the same example into one import', async () => {
    let requests = 0;
    const fetcher = async () => {
      requests += 1;
      await Promise.resolve();
      return { ok: true, status: 200, text: async () => goldenFixture };
    };

    const [first, second] = await Promise.all([
      loadExampleWorkspace('golden-loop', fetcher),
      loadExampleWorkspace('golden-loop', fetcher),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.workspaceId).toBe(second.value.workspaceId);
    expect(requests).toBe(1);
    expect(await listWorkspaces()).toHaveLength(1);
  });

  it('resets persisted examples without deleting a user workspace whose name starts with EXAMPLE', async () => {
    const imported = await loadExampleWorkspace('golden-loop', async () => ({
      ok: true,
      status: 200,
      text: async () => goldenFixture,
    }));
    expect(imported.ok).toBe(true);
    expect((await createWorkspace({ name: 'EXAMPLE — my own production workspace' })).ok).toBe(true);

    const reset = await resetExampleWorkspaces();
    expect(reset).toEqual({ ok: true, value: { deleted: 1 } });
    const remaining = await listWorkspaces();
    expect(remaining.map((workspace) => workspace.name)).toEqual(['EXAMPLE — my own production workspace']);
  });

  it('does not delete an arbitrary workspace merely because it carries the example flag', async () => {
    const arbitrary = await createExampleWorkspace({
      name: 'Labelled by another feature',
      description: 'Not one of the registered shipped examples.',
    });
    expect(arbitrary.ok).toBe(true);

    const reset = await resetExampleWorkspaces();

    expect(reset).toEqual({ ok: true, value: { deleted: 0 } });
    expect((await listWorkspaces()).map((workspace) => workspace.name)).toEqual([
      'Labelled by another feature',
    ]);
  });

  it('returns a retryable, plain-language failure when the fixture is unavailable', async () => {
    const result = await loadExampleWorkspace('golden-loop', async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'temporary',
        message: 'The labelled example could not be loaded (503). Try again.',
      },
    });
  });
});
