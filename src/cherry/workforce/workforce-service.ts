/**
 * Workforce persistence: agent profiles, crews, work items, threads, and the
 * attention queue. Every mutation runs in withWorkspaceTx so its ProofEvent
 * lands in the same IndexedDB transaction — proof never describes work that
 * did not happen. Agents never approve, trust, or activate memory here.
 */

import { getDb } from '../persistence/cherry-db.ts';
import { withWorkspaceTx } from '../persistence/transactions.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import { fail as err, ok, type Result } from '../core/result.ts';
import { listApprovals } from '../skillgraph/skillgraph-service.ts';
import { listMemories } from '../memory/memory-service.ts';
import {
  STARTER_CREW_TEMPLATE,
  RUNTIME_CAPABILITIES,
  canTransition,
  sortAttention,
  type AgentProfile,
  type AttentionItem,
  type Crew,
  type WorkItem,
  type WorkItemStatus,
  type WorkMessage,
  type HandoffRecord,
  type RuntimeCapability,
} from './workforce-model.ts';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'agent';
}

// ---------------- Agent profiles ----------------

export interface NewAgentProfile {
  workspaceId: string;
  name: string;
  role: string;
  objective?: string;
  instructions?: string;
  capabilities?: AgentProfile['allowedCapabilities'];
}

export async function createAgentProfile(input: NewAgentProfile): Promise<Result<AgentProfile>> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 60) return err('validation', 'Agent name must be 1–60 characters.');
  const requestedCapabilities: readonly RuntimeCapability[] = input.capabilities ?? ['page_tools'];
  const capabilities = [...new Set<RuntimeCapability>(requestedCapabilities)];
  if (capabilities.some((capability) => !RUNTIME_CAPABILITIES.includes(capability))) {
    return err('validation', 'Agent capabilities contain an unsupported value.');
  }
  const now = isoNow();
  const profile: AgentProfile = {
    id: newId('ag'),
    workspaceId: input.workspaceId,
    name,
    slug: slugify(name),
    role: input.role.trim() || 'generalist',
    objective: input.objective?.trim() ?? '',
    instructions: input.instructions?.trim() ?? '',
    executionHostId: null,
    allowedCapabilities: capabilities,
    skillGraphIds: [],
    memoryScopes: [],
    maxParallelTasks: 1,
    approvalMode: 'always',
    status: 'idle',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  await withWorkspaceTx(input.workspaceId, ['agentProfiles'], async (ctx) => {
    await ctx.db.agentProfiles.add(profile);
    ctx.emit({ type: 'agent.profile_created', actorType: 'human', objectType: 'agentProfile', objectId: profile.id, summary: `Agent profile "${name}" (${profile.role}) created` });
  });
  return ok(profile);
}

export async function listAgentProfiles(workspaceId: string): Promise<AgentProfile[]> {
  const profiles = await getDb().agentProfiles.where('workspaceId').equals(workspaceId).toArray();
  return profiles.filter((profile) => profile.status !== 'archived').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function archiveAgentProfile(workspaceId: string, agentId: string): Promise<Result<void>> {
  return withWorkspaceTx(workspaceId, ['agentProfiles'], async (ctx) => {
    const profile = await ctx.db.agentProfiles.get(agentId);
    if (!profile || profile.workspaceId !== workspaceId) return err('not_found', 'Agent profile not found.');
    await ctx.db.agentProfiles.update(agentId, { status: 'archived', revision: profile.revision + 1, updatedAt: isoNow() });
    ctx.emit({ type: 'agent.profile_archived', actorType: 'human', objectType: 'agentProfile', objectId: agentId, summary: `Agent profile "${profile.name}" archived` });
    return ok(undefined);
  });
}

// ---------------- Crews ----------------

export async function createStarterCrew(workspaceId: string): Promise<Result<{ crew: Crew; profiles: AgentProfile[] }>> {
  const existing = await listAgentProfiles(workspaceId);
  if (existing.length > 0) return err('conflict', 'This workspace already has agent profiles. The starter crew only seeds an empty crew.');

  const profiles: AgentProfile[] = [];
  for (const template of STARTER_CREW_TEMPLATE) {
    const created = await createAgentProfile({
      workspaceId,
      name: template.name,
      role: template.role,
      objective: template.objective,
      capabilities: template.capabilities,
    });
    if (!created.ok) return created;
    profiles.push(created.value);
  }

  const now = isoNow();
  const crew: Crew = {
    id: newId('cw'),
    workspaceId,
    name: 'Starter crew',
    coordinatorAgentId: profiles[0]!.id,
    memberAgentIds: profiles.map((profile) => profile.id),
    maxConcurrentWorkItems: 2,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  await withWorkspaceTx(workspaceId, ['crews'], async (ctx) => {
    await ctx.db.crews.add(crew);
    ctx.emit({ type: 'crew.created', actorType: 'human', objectType: 'crew', objectId: crew.id, summary: `Crew "${crew.name}" created with ${profiles.length} agents` });
  });
  return ok({ crew, profiles });
}

export async function listCrews(workspaceId: string): Promise<Crew[]> {
  return getDb().crews.where('workspaceId').equals(workspaceId).toArray();
}

// ---------------- Work items ----------------

export interface NewWorkItem {
  workspaceId: string;
  title: string;
  objective: string;
  definitionOfDone: string[];
  priority?: WorkItem['priority'];
  riskLevel?: WorkItem['riskLevel'];
  crewId?: string | null;
  assignedAgentIds?: string[];
  contextRefs?: string[];
}

export async function createWorkItem(input: NewWorkItem): Promise<Result<WorkItem>> {
  const title = input.title.trim();
  if (title.length === 0 || title.length > 160) return err('validation', 'Work item title must be 1–160 characters.');
  if (input.objective.trim().length === 0) return err('validation', 'A work item needs an objective.');
  const definitionOfDone = input.definitionOfDone.map((line) => line.trim()).filter(Boolean);
  if (definitionOfDone.length === 0) return err('validation', 'Definition of done needs at least one line.');

  const now = isoNow();
  const item: WorkItem = {
    id: newId('wk'),
    workspaceId: input.workspaceId,
    missionId: null,
    parentWorkItemId: null,
    title,
    objective: input.objective.trim(),
    definitionOfDone,
    priority: input.priority ?? 'normal',
    riskLevel: input.riskLevel ?? 'low',
    status: 'DRAFT',
    assignedAgentIds: input.assignedAgentIds ?? [],
    crewId: input.crewId ?? null,
    dependencyIds: [],
    requiredCapabilities: [],
    executionHostId: null,
    routineId: null,
    currentRunId: null,
    contextRefs: input.contextRefs ?? [],
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  await withWorkspaceTx(input.workspaceId, ['workItems'], async (ctx) => {
    await ctx.db.workItems.add(item);
    ctx.emit({ type: 'work.item_created', actorType: 'human', objectType: 'workItem', objectId: item.id, summary: `Work item "${title}" handed off (${item.priority}, risk ${item.riskLevel})` });
  });
  return ok(item);
}

export async function listWorkItems(workspaceId: string): Promise<WorkItem[]> {
  const items = await getDb().workItems.where('workspaceId').equals(workspaceId).toArray();
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getWorkItem(workspaceId: string, workItemId: string): Promise<WorkItem | null> {
  const item = await getDb().workItems.get(workItemId);
  return item && item.workspaceId === workspaceId ? item : null;
}

export interface TransitionOptions {
  actorType?: 'human' | 'agent' | 'system';
  actorId?: string;
  expectedRevision?: number;
  reason?: string;
}

export async function transitionWorkItem(
  workspaceId: string,
  workItemId: string,
  to: WorkItemStatus,
  options: TransitionOptions = {},
): Promise<Result<WorkItem>> {
  return withWorkspaceTx(workspaceId, ['workItems', 'workMessages'], async (ctx) => {
    const item = await ctx.db.workItems.get(workItemId);
    if (!item || item.workspaceId !== workspaceId) return err('not_found', 'Work item not found.');
    if (options.expectedRevision !== undefined && options.expectedRevision !== item.revision) {
      return err('conflict', `Work item is at revision ${item.revision}, not ${options.expectedRevision}. Re-read before acting.`);
    }
    if (to === 'SUCCEEDED' && options.actorType === 'agent') {
      return err('approval_required', 'Agents cannot mark work as succeeded. Success is reached through verification recorded by the system or the human.');
    }
    if (!canTransition(item.status, to)) {
      return err('conflict', `${item.status} → ${to} is not a legal work-item transition.`);
    }
    // Verification success is earned, never asserted: SUCCEEDED is reached only
    // through VERIFYING and the verifier records the evidence message first.
    const updated: WorkItem = { ...item, status: to, revision: item.revision + 1, updatedAt: isoNow() };
    await ctx.db.workItems.put(updated);
    ctx.emit({
      type: 'work.item_transitioned',
      actorType: options.actorType ?? 'human',
      ...(options.actorId ? { actorId: options.actorId } : {}),
      objectType: 'workItem',
      objectId: workItemId,
      summary: `Work item "${item.title}": ${item.status} → ${to}${options.reason ? ` (${options.reason})` : ''}`,
    });
    return ok(updated);
  });
}

export async function assignWorkItem(
  workspaceId: string,
  workItemId: string,
  agentIds: string[],
): Promise<Result<WorkItem>> {
  return withWorkspaceTx(workspaceId, ['workItems', 'agentProfiles'], async (ctx) => {
    const item = await ctx.db.workItems.get(workItemId);
    if (!item || item.workspaceId !== workspaceId) return err('not_found', 'Work item not found.');
    for (const agentId of agentIds) {
      const profile = await ctx.db.agentProfiles.get(agentId);
      if (!profile || profile.workspaceId !== workspaceId || profile.status === 'archived') {
        return err('validation', `Agent ${agentId} does not exist in this workspace.`);
      }
    }
    const updated: WorkItem = { ...item, assignedAgentIds: [...new Set(agentIds)], revision: item.revision + 1, updatedAt: isoNow() };
    await ctx.db.workItems.put(updated);
    ctx.emit({ type: 'work.item_assigned', actorType: 'human', objectType: 'workItem', objectId: workItemId, summary: `Work item "${item.title}" assigned to ${agentIds.length} agent(s)` });
    return ok(updated);
  });
}

// ---------------- Work thread ----------------

export async function addWorkMessage(
  workspaceId: string,
  workItemId: string,
  input: { actorType: WorkMessage['actorType']; actorId?: string | null; kind: WorkMessage['kind']; body: string; referenceIds?: string[] },
): Promise<Result<WorkMessage>> {
  const body = input.body.trim();
  if (body.length === 0) return err('validation', 'Message body cannot be empty.');
  const message: WorkMessage = {
    id: newId('wm'),
    workspaceId,
    workItemId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    kind: input.kind,
    body,
    referenceIds: input.referenceIds ?? [],
    createdAt: isoNow(),
  };
  return withWorkspaceTx(workspaceId, ['workMessages', 'workItems'], async (ctx) => {
    const item = await ctx.db.workItems.get(workItemId);
    if (!item || item.workspaceId !== workspaceId) return err('not_found', 'Work item not found.');
    await ctx.db.workMessages.add(message);
    ctx.emit({ type: 'work.message_added', actorType: input.actorType, objectType: 'workMessage', objectId: message.id, summary: `${input.kind} on "${item.title}"` });
    return ok(message);
  });
}

export async function listWorkMessages(workspaceId: string, workItemId: string): Promise<WorkMessage[]> {
  const messages = await getDb().workMessages.where('workItemId').equals(workItemId).toArray();
  return messages.filter((message) => message.workspaceId === workspaceId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateAgentProfileRole(
  workspaceId: string,
  agentId: string,
  updates: { role?: string; objective?: string; instructions?: string },
): Promise<Result<AgentProfile>> {
  return withWorkspaceTx(workspaceId, ['agentProfiles'], async (ctx) => {
    const profile = await ctx.db.agentProfiles.get(agentId);
    if (!profile || profile.workspaceId !== workspaceId || profile.status === 'archived') {
      return err('not_found', 'Agent profile not found.');
    }
    const updated: AgentProfile = {
      ...profile,
      ...(updates.role !== undefined ? { role: updates.role.trim() || profile.role } : {}),
      ...(updates.objective !== undefined ? { objective: updates.objective.trim() } : {}),
      ...(updates.instructions !== undefined ? { instructions: updates.instructions.trim() } : {}),
      revision: profile.revision + 1,
      updatedAt: isoNow(),
    };
    await ctx.db.agentProfiles.put(updated);
    ctx.emit({ type: 'agent.profile_created', actorType: 'agent', objectType: 'agentProfile', objectId: agentId, summary: `Agent profile "${profile.name}" updated (r${updated.revision})` });
    return ok(updated);
  });
}

export async function proposeHandoff(
  workspaceId: string,
  input: { workItemId: string; fromAgentId?: string | null; toAgentId: string; reason: string; contextRefs?: string[] },
): Promise<Result<HandoffRecord>> {
  const reason = input.reason.trim();
  if (reason.length === 0) return err('validation', 'A handoff needs a reason.');
  return withWorkspaceTx(workspaceId, ['handoffs', 'workItems', 'agentProfiles'], async (ctx) => {
    const item = await ctx.db.workItems.get(input.workItemId);
    if (!item || item.workspaceId !== workspaceId) return err('not_found', 'Work item not found.');
    const target = await ctx.db.agentProfiles.get(input.toAgentId);
    if (!target || target.workspaceId !== workspaceId || target.status === 'archived') {
      return err('validation', 'Target agent does not exist in this workspace.');
    }
    const now = isoNow();
    const record: HandoffRecord = {
      id: newId('hf'),
      workspaceId,
      workItemId: input.workItemId,
      fromAgentId: input.fromAgentId ?? null,
      toAgentId: input.toAgentId,
      reason,
      contextRefs: input.contextRefs ?? [],
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
    };
    await ctx.db.handoffs.add(record);
    ctx.emit({ type: 'work.item_assigned', actorType: 'agent', objectType: 'workItem', objectId: input.workItemId, summary: `Handoff proposed to "${target.name}": ${reason.slice(0, 80)}` });
    return ok(record);
  });
}

// ---------------- Attention queue ----------------

/** One honest queue: everything that genuinely needs the human, sorted by consequence then age. */
export async function attentionQueue(workspaceId: string): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];

  const approvals = (await listApprovals(workspaceId)).filter((approval) => approval.decision === 'pending');
  for (const approval of approvals) {
    items.push({
      id: `att-${approval.id}`,
      kind: 'approval',
      title: `Approval requested: ${approval.objectType} r${approval.objectRevision}`,
      objectType: approval.objectType,
      objectId: approval.objectId,
      consequence: 90,
      createdAt: approval.requestedAt,
    });
  }

  const workItems = await listWorkItems(workspaceId);
  for (const item of workItems) {
    if (item.status === 'WAITING_FOR_HUMAN') {
      items.push({ id: `att-wait-${item.id}`, kind: 'waiting_for_human', title: `Waiting on you: "${item.title}"`, objectType: 'workItem', objectId: item.id, consequence: 80, createdAt: item.updatedAt });
    }
    if (item.status === 'FAILED') {
      items.push({ id: `att-fail-${item.id}`, kind: 'failed_run', title: `Failed: "${item.title}"`, objectType: 'workItem', objectId: item.id, consequence: 70, createdAt: item.updatedAt });
    }
  }

  const proposals = await listMemories(workspaceId, { status: 'proposed' });
  for (const memory of proposals) {
    items.push({ id: `att-mem-${memory.id}`, kind: 'memory_proposal', title: 'Memory proposal awaiting your decision', objectType: 'memory', objectId: memory.id, consequence: 40, createdAt: memory.updatedAt });
  }

  return sortAttention(items);
}
