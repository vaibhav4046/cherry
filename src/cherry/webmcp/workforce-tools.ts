/**
 * Workforce WebMCP tools, selected by SURFACE (route) rather than mission
 * state: inbox, crew, and active-run apertures, each capped at five tools on
 * top of the global reads. Hard boundaries hold everywhere: no tool approves,
 * promotes trust, activates memory, or marks success.
 */

import { z } from 'zod';
import { guarded, objectSchema, toolError, toolText, type CherryToolDefinition } from './tool-contract.ts';
import type { ToolContext } from './tool-definitions.ts';
import {
  addWorkMessage,
  assignWorkItem,
  attentionQueue,
  createAgentProfile,
  createWorkItem,
  getWorkItem,
  listAgentProfiles,
  listWorkItems,
  listWorkMessages,
  proposeHandoff,
  transitionWorkItem,
  updateAgentProfileRole,
} from '../workforce/workforce-service.ts';
import {
  describeSchedule,
  draftRoutine,
  listApprovedSkillGraphs,
  listRoutines,
  pauseRoutine,
  requestRunNow,
  setRoutineSchedule,
} from '../workforce/routines-service.ts';
import { validateSchedule, type ScheduleSpec } from '../workforce/workforce-model.ts';

export type ToolSurface = 'default' | 'inbox' | 'crew' | 'routines' | 'run' | 'sources';

export const TOOL_SURFACE_TABLE: Record<Exclude<ToolSurface, 'default'>, string[]> = {
  inbox: ['create_work_item', 'read_attention_queue', 'read_work_thread', 'assign_work_item', 'request_work_run'],
  crew: ['list_agent_profiles', 'propose_agent_profile', 'assign_agent_role', 'read_agent_context', 'propose_handoff'],
  routines: ['list_routines', 'draft_routine', 'set_routine_schedule', 'run_routine_now', 'pause_routine'],
  run: ['read_run_status', 'record_run_checkpoint', 'record_task_result', 'request_human_action', 'request_verification'],
  sources: ['list_sources', 'save_source', 'request_source_fetch', 'archive_source', 'prepare_source_for_skill'],
};

function requireWorkspace(context: ToolContext): string | null {
  return context.getActiveWorkspaceId();
}

export function buildWorkforceToolDefinitions(context: ToolContext): CherryToolDefinition[] {
  const definitions: CherryToolDefinition[] = [];
  const define = <I>(definition: CherryToolDefinition<I>): void => {
    definitions.push(definition as CherryToolDefinition);
  };

  const noWorkspace = () => toolError('conflict', 'No active workspace. The human creates one in the Command Center.');

  // ---------- Inbox surface ----------

  const createWorkItemSchema = z.object({
    title: z.string().min(1).max(160),
    objective: z.string().min(1).max(2000),
    definitionOfDone: z.array(z.string().min(1)).min(1).max(20),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  });
  define({
    name: 'create_work_item',
    description:
      'Hand a work objective to the crew: title, objective, definition of done, optional priority and risk. The item starts in DRAFT — a real state machine governs everything after.',
    inputSchema: objectSchema(
      {
        title: { type: 'string' },
        objective: { type: 'string' },
        definitionOfDone: { type: 'array', items: { type: 'string' }, description: 'One completion criterion per entry.' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      ['title', 'objective', 'definitionOfDone'],
    ),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: createWorkItemSchema,
    execute: guarded(createWorkItemSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const created = await createWorkItem({ workspaceId, ...input, definitionOfDone: input.definitionOfDone });
      if (!created.ok) return toolError(created.error.code, created.error.message);
      return toolText({ workItemId: created.value.id, status: created.value.status, note: 'DRAFT until readied; running requires a real execution host lease.' });
    }),
  });

  define({
    name: 'read_attention_queue',
    description: 'Read everything that genuinely needs the human right now — approvals, items waiting on a person, failures, memory proposals — sorted by consequence then age.',
    inputSchema: objectSchema({}, []),
    annotations: { readOnlyHint: true },
    states: [],
    zodSchema: z.object({}),
    execute: guarded(z.object({}), async () => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const queue = await attentionQueue(workspaceId);
      return toolText({ count: queue.length, items: queue.slice(0, 20) });
    }),
  });

  const threadSchema = z.object({ workItemId: z.string().min(1) });
  define({
    name: 'read_work_thread',
    description: 'Read one work item in full: status, definition of done, assignments, and the message thread.',
    inputSchema: objectSchema({ workItemId: { type: 'string' } }, ['workItemId']),
    annotations: { readOnlyHint: true },
    states: [],
    zodSchema: threadSchema,
    execute: guarded(threadSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const item = await getWorkItem(workspaceId, input.workItemId);
      if (!item) return toolError('not_found', 'Work item not found.');
      const messages = await listWorkMessages(workspaceId, input.workItemId);
      return toolText({ item, messages: messages.slice(-30) });
    }),
  });

  const assignSchema = z.object({ workItemId: z.string().min(1), agentIds: z.array(z.string().min(1)).min(1).max(10) });
  define({
    name: 'assign_work_item',
    description: 'Assign a work item to one or more existing agent profiles. Profiles must exist in this workspace; assignment never starts execution.',
    inputSchema: objectSchema(
      { workItemId: { type: 'string' }, agentIds: { type: 'array', items: { type: 'string' } } },
      ['workItemId', 'agentIds'],
    ),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: assignSchema,
    execute: guarded(assignSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const assigned = await assignWorkItem(workspaceId, input.workItemId, input.agentIds);
      if (!assigned.ok) return toolError(assigned.error.code, assigned.error.message);
      return toolText({ workItemId: assigned.value.id, assignedAgentIds: assigned.value.assignedAgentIds, revision: assigned.value.revision });
    }),
  });

  const runRequestSchema = z.object({ workItemId: z.string().min(1) });
  define({
    name: 'request_work_run',
    description:
      'Move a work item toward execution: DRAFT becomes READY, READY becomes QUEUED. Actual running requires an execution host to lease the job — this tool never fakes progress past QUEUED.',
    inputSchema: objectSchema({ workItemId: { type: 'string' } }, ['workItemId']),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: runRequestSchema,
    execute: guarded(runRequestSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const item = await getWorkItem(workspaceId, input.workItemId);
      if (!item) return toolError('not_found', 'Work item not found.');
      const target = item.status === 'DRAFT' ? 'READY' : item.status === 'READY' ? 'QUEUED' : null;
      if (!target) {
        return toolError('conflict', `Work item is ${item.status}; request_work_run only advances DRAFT or READY items.`);
      }
      const moved = await transitionWorkItem(workspaceId, input.workItemId, target, { actorType: 'agent', reason: 'agent requested run' });
      if (!moved.ok) return toolError(moved.error.code, moved.error.message);
      return toolText({ workItemId: moved.value.id, status: moved.value.status, note: target === 'QUEUED' ? 'Queued. It runs when an approved execution host leases it.' : 'Ready. Call again to queue it.' });
    }),
  });

  // ---------- Crew surface ----------

  define({
    name: 'list_agent_profiles',
    description: 'List the crew: every agent profile with role, capabilities, and honest status (a profile shows working only under a real lease).',
    inputSchema: objectSchema({}, []),
    annotations: { readOnlyHint: true },
    states: [],
    zodSchema: z.object({}),
    execute: guarded(z.object({}), async () => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const profiles = await listAgentProfiles(workspaceId);
      return toolText({
        count: profiles.length,
        profiles: profiles.map((profile) => ({ id: profile.id, name: profile.name, role: profile.role, status: profile.status, capabilities: profile.allowedCapabilities, revision: profile.revision })),
      });
    }),
  });

  const proposeProfileSchema = z.object({
    name: z.string().min(1).max(60),
    role: z.string().min(1).max(40),
    objective: z.string().max(500).optional(),
  });
  define({
    name: 'propose_agent_profile',
    description: 'Create a new agent profile (a configuration, not a running model). It starts idle with page_tools capability only; the human widens capabilities in the Crew page.',
    inputSchema: objectSchema(
      { name: { type: 'string' }, role: { type: 'string' }, objective: { type: 'string' } },
      ['name', 'role'],
    ),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: proposeProfileSchema,
    execute: guarded(proposeProfileSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const created = await createAgentProfile({ workspaceId, name: input.name, role: input.role, ...(input.objective ? { objective: input.objective } : {}) });
      if (!created.ok) return toolError(created.error.code, created.error.message);
      return toolText({ agentId: created.value.id, name: created.value.name, status: created.value.status });
    }),
  });

  const roleSchema = z.object({
    agentId: z.string().min(1),
    role: z.string().min(1).max(40).optional(),
    objective: z.string().max(500).optional(),
    instructions: z.string().max(4000).optional(),
  });
  define({
    name: 'assign_agent_role',
    description: 'Update an agent profile\'s role, objective, or operating instructions. Capabilities and hosts stay human-controlled.',
    inputSchema: objectSchema(
      { agentId: { type: 'string' }, role: { type: 'string' }, objective: { type: 'string' }, instructions: { type: 'string' } },
      ['agentId'],
    ),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: roleSchema,
    execute: guarded(roleSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const updated = await updateAgentProfileRole(workspaceId, input.agentId, input);
      if (!updated.ok) return toolError(updated.error.code, updated.error.message);
      return toolText({ agentId: updated.value.id, role: updated.value.role, revision: updated.value.revision });
    }),
  });

  const agentContextSchema = z.object({ agentId: z.string().min(1) });
  define({
    name: 'read_agent_context',
    description: 'Read one agent profile plus its currently assigned work items — the context pack a receiving agent is allowed to see.',
    inputSchema: objectSchema({ agentId: { type: 'string' } }, ['agentId']),
    annotations: { readOnlyHint: true },
    states: [],
    zodSchema: agentContextSchema,
    execute: guarded(agentContextSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const profiles = await listAgentProfiles(workspaceId);
      const profile = profiles.find((candidate) => candidate.id === input.agentId);
      if (!profile) return toolError('not_found', 'Agent profile not found.');
      const items = (await listWorkItems(workspaceId)).filter((item) => item.assignedAgentIds.includes(profile.id));
      return toolText({
        profile,
        assignedWorkItems: items.map((item) => ({ id: item.id, title: item.title, status: item.status })),
        boundaries: 'Approvals, trust promotion, and memory activation are human-only.',
      });
    }),
  });

  const handoffSchema = z.object({
    workItemId: z.string().min(1),
    toAgentId: z.string().min(1),
    reason: z.string().min(1).max(500),
    fromAgentId: z.string().min(1).optional(),
  });
  define({
    name: 'propose_handoff',
    description: 'Propose handing a work item to another agent, with a reason. The handoff is recorded as proposed; it takes effect when accepted.',
    inputSchema: objectSchema(
      { workItemId: { type: 'string' }, toAgentId: { type: 'string' }, reason: { type: 'string' }, fromAgentId: { type: 'string' } },
      ['workItemId', 'toAgentId', 'reason'],
    ),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: handoffSchema,
    execute: guarded(handoffSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const proposed = await proposeHandoff(workspaceId, input);
      if (!proposed.ok) return toolError(proposed.error.code, proposed.error.message);
      return toolText({ handoffId: proposed.value.id, status: proposed.value.status });
    }),
  });

  // ---------- Active-run surface ----------

  define({
    name: 'read_run_status',
    description: 'Read the live status of a work item in flight: state, revision, and the latest thread entries.',
    inputSchema: objectSchema({ workItemId: { type: 'string' } }, ['workItemId']),
    annotations: { readOnlyHint: true },
    states: [],
    zodSchema: threadSchema,
    execute: guarded(threadSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const item = await getWorkItem(workspaceId, input.workItemId);
      if (!item) return toolError('not_found', 'Work item not found.');
      const messages = await listWorkMessages(workspaceId, input.workItemId);
      return toolText({ status: item.status, revision: item.revision, latest: messages.slice(-10) });
    }),
  });

  const checkpointSchema = z.object({ workItemId: z.string().min(1), note: z.string().min(1).max(2000) });
  define({
    name: 'record_run_checkpoint',
    description: 'Record a checkpoint on a work item thread — what was just completed or observed. A record, never a claim of verification.',
    inputSchema: objectSchema({ workItemId: { type: 'string' }, note: { type: 'string' } }, ['workItemId', 'note']),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: checkpointSchema,
    execute: guarded(checkpointSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const added = await addWorkMessage(workspaceId, input.workItemId, { actorType: 'agent', kind: 'checkpoint', body: input.note });
      if (!added.ok) return toolError(added.error.code, added.error.message);
      return toolText({ messageId: added.value.id });
    }),
  });

  const humanActionSchema = z.object({ workItemId: z.string().min(1), question: z.string().min(1).max(2000) });
  define({
    name: 'request_human_action',
    description: 'Ask the human for a decision. Posts the question to the thread and, if the item is RUNNING, honestly parks it in WAITING_FOR_HUMAN.',
    inputSchema: objectSchema({ workItemId: { type: 'string' }, question: { type: 'string' } }, ['workItemId', 'question']),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: humanActionSchema,
    execute: guarded(humanActionSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const added = await addWorkMessage(workspaceId, input.workItemId, { actorType: 'agent', kind: 'question', body: input.question });
      if (!added.ok) return toolError(added.error.code, added.error.message);
      const item = await getWorkItem(workspaceId, input.workItemId);
      let parked = false;
      if (item?.status === 'RUNNING') {
        const moved = await transitionWorkItem(workspaceId, input.workItemId, 'WAITING_FOR_HUMAN', { actorType: 'agent', reason: 'agent requested human action' });
        parked = moved.ok;
      }
      return toolText({ messageId: added.value.id, parkedWaitingForHuman: parked });
    }),
  });

  define({
    name: 'request_verification',
    description: 'Move a RUNNING work item to VERIFYING. Verification itself is deterministic and outside agent control — its outcome decides success or failure.',
    inputSchema: objectSchema({ workItemId: { type: 'string' } }, ['workItemId']),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: runRequestSchema,
    execute: guarded(runRequestSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const moved = await transitionWorkItem(workspaceId, input.workItemId, 'VERIFYING', { actorType: 'agent', reason: 'agent requested verification' });
      if (!moved.ok) return toolError(moved.error.code, moved.error.message);
      return toolText({ status: moved.value.status, note: 'Verification outcome — not this call — decides SUCCEEDED or FAILED.' });
    }),
  });

  // ---------- Routines surface ----------

  define({
    name: 'list_routines',
    description: 'List routines with schedule, enabled state, next and last run — plus the approved skill graphs a new routine could be drafted from.',
    inputSchema: objectSchema({}, []),
    annotations: { readOnlyHint: true },
    states: [],
    zodSchema: z.object({}),
    execute: guarded(z.object({}), async () => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const routines = await listRoutines(workspaceId);
      const graphs = await listApprovedSkillGraphs(workspaceId);
      return toolText({
        routines: routines.map((routine) => ({ id: routine.id, name: routine.name, schedule: describeSchedule(routine.schedule), enabled: routine.enabled, nextRunAt: routine.nextRunAt, lastRunAt: routine.lastRunAt, revision: routine.revision })),
        approvedSkillGraphs: graphs.map((graph) => ({ id: graph.id, name: graph.name })),
        note: 'Enabling a routine requires exact-revision human approval in the Routines page.',
      });
    }),
  });

  const draftRoutineSchema = z.object({ skillGraphId: z.string().min(1), name: z.string().min(1).max(120).optional() });
  define({
    name: 'draft_routine',
    description: 'Draft a routine from an APPROVED skill graph. It starts disabled with a manual schedule; only the human can approve and enable it.',
    inputSchema: objectSchema({ skillGraphId: { type: 'string' }, name: { type: 'string' } }, ['skillGraphId']),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: draftRoutineSchema,
    execute: guarded(draftRoutineSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const drafted = await draftRoutine({ workspaceId, skillGraphId: input.skillGraphId, ...(input.name ? { name: input.name } : {}) });
      if (!drafted.ok) return toolError(drafted.error.code, drafted.error.message);
      return toolText({ routineId: drafted.value.id, enabled: drafted.value.enabled, note: 'Disabled until the human approves it at this exact revision.' });
    }),
  });

  const scheduleSchema = z.object({
    routineId: z.string().min(1),
    schedule: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('manual') }),
      z.object({ kind: z.literal('once'), runAt: z.string() }),
      z.object({ kind: z.literal('interval'), everyMinutes: z.number().int(), startAt: z.string() }),
      z.object({ kind: z.literal('daily'), localTime: z.string(), timeZone: z.string() }),
      z.object({ kind: z.literal('weekly'), weekdays: z.array(z.number().int()), localTime: z.string(), timeZone: z.string() }),
    ]),
    missedRunPolicy: z.enum(['skip', 'run_once_on_reconnect']).optional(),
  });
  define({
    name: 'set_routine_schedule',
    description: 'Propose a schedule for a routine (5 min to 30 days; IANA time zone for daily/weekly). Saving clears any approval and disables the routine until the human re-approves.',
    inputSchema: objectSchema(
      {
        routineId: { type: 'string' },
        schedule: { type: 'object', description: 'One of: {kind:manual} | {kind:once,runAt} | {kind:interval,everyMinutes,startAt} | {kind:daily,localTime,timeZone} | {kind:weekly,weekdays,localTime,timeZone}' },
        missedRunPolicy: { type: 'string', enum: ['skip', 'run_once_on_reconnect'] },
      },
      ['routineId', 'schedule'],
    ),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: scheduleSchema,
    execute: guarded(scheduleSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const problems = validateSchedule(input.schedule as ScheduleSpec);
      if (problems.length > 0) return toolError('validation', problems.join('; '));
      const updated = await setRoutineSchedule(workspaceId, input.routineId, input.schedule as ScheduleSpec, input.missedRunPolicy ?? 'skip');
      if (!updated.ok) return toolError(updated.error.code, updated.error.message);
      return toolText({ routineId: updated.value.id, schedule: describeSchedule(updated.value.schedule), enabled: updated.value.enabled, note: 'Approval cleared — the human must approve this revision before it runs.' });
    }),
  });

  const routineIdSchema = z.object({ routineId: z.string().min(1) });
  define({
    name: 'run_routine_now',
    description: 'Request an immediate run of a routine. The request is recorded; execution happens only when an approved execution host picks it up.',
    inputSchema: objectSchema({ routineId: { type: 'string' } }, ['routineId']),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: routineIdSchema,
    execute: guarded(routineIdSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const requested = await requestRunNow(workspaceId, input.routineId, 'agent');
      if (!requested.ok) return toolError(requested.error.code, requested.error.message);
      return toolText(requested.value);
    }),
  });

  define({
    name: 'pause_routine',
    description: 'Pause a routine (risk-reducing, always allowed). The human approval is kept; resuming is a human action in the Routines page.',
    inputSchema: objectSchema({ routineId: { type: 'string' } }, ['routineId']),
    annotations: { readOnlyHint: false },
    states: [],
    zodSchema: routineIdSchema,
    execute: guarded(routineIdSchema, async (input) => {
      const workspaceId = requireWorkspace(context);
      if (!workspaceId) return noWorkspace();
      const paused = await pauseRoutine(workspaceId, input.routineId);
      if (!paused.ok) return toolError(paused.error.code, paused.error.message);
      return toolText({ routineId: input.routineId, enabled: false, note: 'Paused. Approval kept; resume is human-only.' });
    }),
  });

  return definitions;
}
