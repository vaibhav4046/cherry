import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../setup.ts';
import { getDb } from '../../src/cherry/persistence/cherry-db.ts';
import { createMission, createWorkspace, deleteWorkspace, updateMission } from '../../src/cherry/mission/mission-service.ts';
import { decideSkillGraphApproval, draftSkillGraph, requestSkillGraphApproval } from '../../src/cherry/skillgraph/skillgraph-service.ts';
import { approveRoutine, draftRoutine, pauseRoutine, setRoutineSchedule } from '../../src/cherry/workforce/routines-service.ts';
import { addWorkMessage, createStarterCrew, createWorkItem, proposeHandoff } from '../../src/cherry/workforce/workforce-service.ts';
import { exportWorkspace, importWorkspace } from '../../src/cherry/persistence/workspace-archive.ts';
import { sha256CanonicalExcluding } from '../../src/cherry/core/hash.ts';
import { unwrap } from '../../src/cherry/core/result.ts';
import type { ExecutionHost } from '../../src/cherry/workforce/workforce-model.ts';

async function seedPortableWorkforce() {
  const workspace = unwrap(await createWorkspace({ name: 'Portable workforce' }));
  const mission = unwrap(await createMission({
    workspaceId: workspace.id,
    title: 'Portable project',
    objective: 'Keep the complete local workspace portable',
    definitionOfDone: ['Every workforce relation survives under new IDs'],
  }));
  const drafted = unwrap(await draftSkillGraph({
    workspaceId: workspace.id,
    missionId: mission.id,
    name: 'Portable skill',
    purpose: 'Back a routine in the portability fixture',
    nodes: [{ kind: 'build', title: 'Build', goal: 'Create the portable result' }],
  }));
  unwrap(await updateMission(mission.id, { skillGraphId: drafted.id }));
  const requested = unwrap(await requestSkillGraphApproval(drafted.id, 'Approve fixture skill', 'user'));
  const approvedGraph = unwrap(await decideSkillGraphApproval(requested.approval.id, 'approved', 'user')).graph;

  const { crew, profiles } = unwrap(await createStarterCrew(workspace.id));
  const host: ExecutionHost = {
    id: 'ho-portable-runner',
    workspaceId: workspace.id,
    kind: 'local-runner',
    name: 'Paired local runner',
    status: 'available',
    capabilities: ['command_execution', 'schedule', 'human_approval'],
    lastSeenAt: new Date().toISOString(),
    publicConfig: { endpoint: 'loopback', concurrency: 2, paired: true },
    revision: 1,
  };
  await getDb().executionHosts.add(host);
  await getDb().agentProfiles.update(profiles[0]!.id, {
    executionHostId: host.id,
    status: 'working',
    approvalMode: 'risk_based',
    allowedCapabilities: ['page_tools', 'human_approval'],
    skillGraphIds: [approvedGraph.id],
  });

  const routineDraft = unwrap(await draftRoutine({ workspaceId: workspace.id, skillGraphId: approvedGraph.id, name: 'Portable routine' }));
  await getDb().routines.update(routineDraft.id, { executionHostId: host.id });
  const routine = unwrap(await approveRoutine(workspace.id, routineDraft.id, routineDraft.revision));

  const parent = unwrap(await createWorkItem({
    workspaceId: workspace.id,
    title: 'Parent task',
    objective: 'Own the portable work',
    definitionOfDone: ['Child completes'],
    crewId: crew.id,
    assignedAgentIds: [profiles[0]!.id],
  }));
  const child = unwrap(await createWorkItem({
    workspaceId: workspace.id,
    title: 'Child task',
    objective: 'Exercise typed workforce references',
    definitionOfDone: ['Relations restore'],
    crewId: crew.id,
    assignedAgentIds: [profiles[1]!.id],
  }));
  await getDb().workItems.update(child.id, {
    missionId: mission.id,
    parentWorkItemId: parent.id,
    dependencyIds: [parent.id],
    status: 'RUNNING',
    requiredCapabilities: ['command_execution'],
    executionHostId: host.id,
    routineId: routine.id,
  });
  const message = unwrap(await addWorkMessage(workspace.id, child.id, {
    actorType: 'agent',
    actorId: profiles[1]!.id,
    kind: 'checkpoint',
    body: 'Portable checkpoint',
    referenceIds: ['opaque-user-reference'],
  }));
  const handoff = unwrap(await proposeHandoff(workspace.id, {
    workItemId: child.id,
    fromAgentId: profiles[1]!.id,
    toAgentId: profiles[2]!.id,
    reason: 'Continue the portable task',
    contextRefs: ['opaque-context-reference'],
  }));

  return { workspace, mission, approvedGraph, crew, profiles, host, routine, parent, child, message, handoff };
}

async function rehash(archive: Record<string, unknown>) {
  const integrity = archive['integrity'] as Record<string, unknown>;
  integrity['payloadSha256'] = await sha256CanonicalExcluding(archive, ['integrity']);
}

describe('whole-workspace portability', () => {
  beforeEach(() => freshDb());

  it('exports every workforce store in v1.1 and restores relations under non-runnable local IDs', async () => {
    const seeded = await seedPortableWorkforce();
    const exported = unwrap(await exportWorkspace(seeded.workspace.id));

    expect(exported.schemaVersion).toBe('1.2.0');
    for (const key of ['agentProfiles', 'crews', 'workItems', 'workMessages', 'handoffs', 'executionHosts', 'routines'] as const) {
      expect(exported[key]!.length).toBeGreaterThan(0);
    }

    const imported = unwrap(await importWorkspace(JSON.stringify(exported)));
    const db = getDb();
    const profiles = await db.agentProfiles.where('workspaceId').equals(imported.workspaceId).toArray();
    const crews = await db.crews.where('workspaceId').equals(imported.workspaceId).toArray();
    const items = await db.workItems.where('workspaceId').equals(imported.workspaceId).toArray();
    const messages = await db.workMessages.where('workspaceId').equals(imported.workspaceId).toArray();
    const handoffs = await db.handoffs.where('workspaceId').equals(imported.workspaceId).toArray();
    const hosts = await db.executionHosts.where('workspaceId').equals(imported.workspaceId).toArray();
    const routines = await db.routines.where('workspaceId').equals(imported.workspaceId).toArray();
    const importedGraphs = await db.skillGraphs.where('workspaceId').equals(imported.workspaceId).toArray();
    const importedMissions = await db.missions.where('workspaceId').equals(imported.workspaceId).toArray();

    expect(profiles).toHaveLength(seeded.profiles.length);
    expect(crews).toHaveLength(1);
    expect(items).toHaveLength(2);
    expect(messages).toHaveLength(1);
    expect(handoffs).toHaveLength(1);
    expect(hosts).toHaveLength(1);
    expect(routines).toHaveLength(1);
    expect(profiles.some((profile) => seeded.profiles.some((old) => old.id === profile.id))).toBe(false);

    const importedCrew = crews[0]!;
    expect(profiles.map((profile) => profile.id)).toContain(importedCrew.coordinatorAgentId);
    expect(importedCrew.memberAgentIds.every((id) => profiles.some((profile) => profile.id === id))).toBe(true);
    const importedChild = items.find((item) => item.title === seeded.child.title)!;
    const importedParent = items.find((item) => item.title === seeded.parent.title)!;
    expect(importedChild.parentWorkItemId).toBe(importedParent.id);
    expect(importedChild.dependencyIds).toEqual([importedParent.id]);
    expect(importedChild.assignedAgentIds.every((id) => profiles.some((profile) => profile.id === id))).toBe(true);
    expect(importedChild.crewId).toBe(importedCrew.id);
    expect(messages[0]).toMatchObject({ workItemId: importedChild.id, referenceIds: ['opaque-user-reference'] });
    expect(profiles.map((profile) => profile.id)).toContain(messages[0]!.actorId);
    expect(handoffs[0]).toMatchObject({ workItemId: importedChild.id, contextRefs: ['opaque-context-reference'] });
    expect(profiles.map((profile) => profile.id)).toContain(handoffs[0]!.toAgentId);
    expect(routines[0]!.skillGraphId).toBe(importedGraphs[0]!.id);
    expect(routines[0]!.missionId).toBe(importedMissions[0]!.id);
    expect(routines[0]!.executionHostId).toBe(hosts[0]!.id);

    expect(profiles.every((profile) => profile.executionHostId === null && profile.approvalMode === 'always')).toBe(true);
    expect(profiles.every((profile) => profile.status === 'idle' || profile.status === 'archived')).toBe(true);
    expect(profiles.every((profile) => profile.allowedCapabilities.length === 0)).toBe(true);
    expect(hosts[0]).toMatchObject({ status: 'unpaired', capabilities: [], lastSeenAt: null, publicConfig: {} });
    expect(importedChild).toMatchObject({ status: 'DRAFT', executionHostId: null, routineId: null, currentRunId: null });
    expect(routines[0]).toMatchObject({ enabled: false, approvalId: null, approvedActionHash: null, nextRunAt: null, lastRunAt: null });
    expect(await db.approvals.where('workspaceId').equals(imported.workspaceId).count()).toBe(0);
  });

  it('accepts legacy v1.0 archives without optional source and workforce arrays', async () => {
    const workspace = unwrap(await createWorkspace({ name: 'Legacy portable space' }));
    const legacy = structuredClone(unwrap(await exportWorkspace(workspace.id))) as unknown as Record<string, unknown>;
    legacy['schemaVersion'] = '1.0.0';
    for (const key of ['sourceRecords', 'channelWatches', 'agentProfiles', 'crews', 'workItems', 'workMessages', 'handoffs', 'executionHosts', 'routines']) delete legacy[key];
    await rehash(legacy);

    const imported = unwrap(await importWorkspace(JSON.stringify(legacy)));
    const db = getDb();
    for (const key of ['agentProfiles', 'crews', 'workItems', 'workMessages', 'handoffs', 'executionHosts', 'routines'] as const) {
      expect(await db[key].where('workspaceId').equals(imported.workspaceId).count()).toBe(0);
    }
  });

  it('canonicalizes every schedule that the routine service accepts before export', async () => {
    const seeded = await seedPortableWorkforce();
    const once = unwrap(await setRoutineSchedule(
      seeded.workspace.id,
      seeded.routine.id,
      { kind: 'once', runAt: '2026-09-03T12:00:00Z' },
      'skip',
    ));
    expect(once.schedule).toEqual({ kind: 'once', runAt: '2026-09-03T12:00:00.000Z' });
    const weekly = unwrap(await setRoutineSchedule(
      seeded.workspace.id,
      seeded.routine.id,
      { kind: 'weekly', weekdays: [5, 1, 5], localTime: '09:30', timeZone: 'Europe/London' },
      'skip',
    ));
    expect(weekly.schedule).toEqual({ kind: 'weekly', weekdays: [1, 5], localTime: '09:30', timeZone: 'Europe/London' });
    await expect(exportWorkspace(seeded.workspace.id)).resolves.toMatchObject({ ok: true });
  });

  it('rejects incomplete or unknown v1.1 root fields with zero writes', async () => {
    const { workspace } = await seedPortableWorkforce();
    const exported = unwrap(await exportWorkspace(workspace.id));
    const before = await getDb().workspaces.count();

    const missing = structuredClone(exported) as unknown as Record<string, unknown>;
    delete missing['routines'];
    await rehash(missing);
    await expect(importWorkspace(JSON.stringify(missing))).resolves.toMatchObject({ ok: false });

    const unknown = structuredClone(exported) as unknown as Record<string, unknown>;
    unknown['futureAuthority'] = [];
    await rehash(unknown);
    await expect(importWorkspace(JSON.stringify(unknown))).resolves.toMatchObject({ ok: false });

    const forgedRoutine = structuredClone(exported) as unknown as Record<string, unknown>;
    const forgedHash = '0'.repeat(64);
    (forgedRoutine['routines'] as Array<Record<string, unknown>>)[0]!['approvedActionHash'] = forgedHash;
    const routineApproval = (forgedRoutine['approvals'] as Array<Record<string, unknown>>)
      .find((approval) => approval['objectType'] === 'routine')!;
    routineApproval['contentHash'] = forgedHash;
    await rehash(forgedRoutine);
    await expect(importWorkspace(JSON.stringify(forgedRoutine))).resolves.toMatchObject({ ok: false });

    const danglingMessage = structuredClone(exported) as unknown as Record<string, unknown>;
    (danglingMessage['workMessages'] as Array<Record<string, unknown>>)[0]!['workItemId'] = 'wk-foreign';
    await rehash(danglingMessage);
    await expect(importWorkspace(JSON.stringify(danglingMessage))).resolves.toMatchObject({ ok: false });

    const malformedSchedule = structuredClone(exported) as unknown as Record<string, unknown>;
    (malformedSchedule['routines'] as Array<Record<string, unknown>>)[0]!['schedule'] = { kind: 'interval', everyMinutes: 0, startAt: 'not-a-date' };
    await rehash(malformedSchedule);
    await expect(importWorkspace(JSON.stringify(malformedSchedule))).resolves.toMatchObject({ ok: false });
    expect(await getDb().workspaces.count()).toBe(before);
  });

  it('deletes every workspace-scoped workforce record', async () => {
    const { workspace, routine } = await seedPortableWorkforce();
    await expect(deleteWorkspace(workspace.id)).resolves.toMatchObject({
      ok: false,
      error: { code: 'conflict', message: expect.stringMatching(/pause every routine/i) },
    });
    unwrap(await pauseRoutine(workspace.id, routine.id));
    unwrap(await deleteWorkspace(workspace.id));
    const db = getDb();
    for (const key of ['agentProfiles', 'crews', 'workItems', 'workMessages', 'handoffs', 'executionHosts', 'routines'] as const) {
      expect(await db[key].where('workspaceId').equals(workspace.id).count()).toBe(0);
    }
  });
});
