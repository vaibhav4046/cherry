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
import { importShippedExampleWorkspace } from '../../src/cherry/persistence/workspace-archive.ts';
import { ALL_STORES, getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { sha256CanonicalExcluding } from '../../src/cherry/core/hash.ts';

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
    const graphs = await getDb().skillGraphs.where('workspaceId').equals(first.value.workspaceId).toArray();
    const graphHashes = new Map(graphs.map((graph) => [graph.id, graph.versionHash]));
    const receipts = await getDb().receipts.where('workspaceId').equals(first.value.workspaceId).toArray();
    expect(receipts.flatMap((receipt) => receipt.approvals)
      .filter((approval) => approval.objectType === 'skillgraph')
      .every((approval) => approval.contentHash === graphHashes.get(approval.objectId))).toBe(true);

    const importedApprovals = await getDb().approvals.where('workspaceId').equals(first.value.workspaceId).toArray();
    const importedApprovalIds = new Set(importedApprovals.map((approval) => approval.id));
    const originalApprovalIds = new Set((JSON.parse(goldenFixture) as {
      approvals: Array<{ id: string }>;
    }).approvals.map((approval) => approval.id));
    const events = await getDb().proofEvents.where('workspaceId').equals(first.value.workspaceId).toArray();
    const payloadApprovalIds = events
      .map((event) => event.payload?.approvalId)
      .filter((approvalId): approvalId is string => typeof approvalId === 'string');
    expect(payloadApprovalIds).toHaveLength(2);
    expect(payloadApprovalIds.every((approvalId) => importedApprovalIds.has(approvalId))).toBe(true);
    expect(payloadApprovalIds.some((approvalId) => originalApprovalIds.has(approvalId))).toBe(false);
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

  it('rejects a wrong-kind or self-rehashed imitation with zero writes', async () => {
    const snapshot = async () => Object.fromEntries(await Promise.all(
      ALL_STORES.map(async (store) => [store, await getDb().table(store).toArray()]),
    ));
    const before = await snapshot();

    await expect(importShippedExampleWorkspace(goldenFixture, 'starter-library')).resolves.toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);

    const imitation = JSON.parse(goldenFixture) as Record<string, unknown>;
    (imitation['workspace'] as Record<string, unknown>)['description'] = 'Shipped labelled example workspace — modified';
    (imitation['integrity'] as Record<string, unknown>)['payloadSha256'] = await sha256CanonicalExcluding(imitation, ['integrity']);
    await expect(importShippedExampleWorkspace(JSON.stringify(imitation), 'golden-loop')).resolves.toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(before);
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
