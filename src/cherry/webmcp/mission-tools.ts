/**
 * Mission Control WebMCP tools: five bounded tools on the `control` surface.
 * A visiting agent can create an outcome mission, read its validated plan,
 * ask for a start, cancel, or request a human decision. Nothing here approves
 * anything, reads secrets, or runs a command; every call is logged in Agent
 * View by the registration manager.
 */

import { z } from 'zod';
import { guarded, objectSchema, toolError, toolText, type CherryToolDefinition } from './tool-contract.ts';
import type { ToolContext } from './tool-definitions.ts';
import { createWorkspace } from '../mission/mission-service.ts';
import {
  cancelMission,
  createMission,
  missionPlanForTool,
  requestMissionAction,
  startMission,
  type MissionView,
} from '../workforce/mission-control-service.ts';
import { MISSION_TEMPLATES } from '../workforce/mission-templates.ts';

export const MISSION_TOOL_NAMES = [
  'create_outcome_mission',
  'plan_current_mission',
  'start_current_mission',
  'cancel_current_mission',
  'request_mission_action',
] as const;

const FINISHED_STATUSES: ReadonlyArray<MissionView['card']['status']> = ['cancelled', 'succeeded', 'failed'];

function summary(view: MissionView) {
  // A finished mission has no work left to offer, whatever its nodes still say.
  const finished = FINISHED_STATUSES.includes(view.card.status);
  return {
    missionId: view.mission.id,
    planId: view.plan.id,
    revision: view.plan.revision,
    contentHash: view.plan.contentHash,
    status: view.card.status,
    column: view.card.column,
    requiresApproval: view.card.requiresApproval,
    approved: view.card.approved,
    runnerBound: view.card.runnerBound,
    activeWorkers: view.card.activeWorkers,
    pendingApprovals: finished ? 0 : view.card.pendingApprovals,
    readyNodeIds: finished ? [] : view.readyNodeIds.slice(0, 8),
    problems: view.problems.slice(0, 5),
    nodes: view.nodes.slice(0, 20).map((node) => ({ id: node.node.id, kind: node.node.kind, status: node.status, boundary: node.runner?.sandbox?.boundary ?? null, host: node.runner?.host?.kind ?? null })),
    boundary: 'No tool here approves, promotes trust, activates memory, or runs a command.',
  };
}

export function buildMissionToolDefinitions(context: ToolContext): CherryToolDefinition[] {
  const definitions: CherryToolDefinition[] = [];
  const define = <I>(definition: CherryToolDefinition<I>): void => {
    definitions.push(definition as CherryToolDefinition);
  };

  const createSchema = z.object({
    outcome: z.string().min(8).max(2000),
    constraints: z.array(z.string().min(1).max(300)).max(10).optional(),
    templateId: z.enum(MISSION_TEMPLATES.map((template) => template.id) as [string, ...string[]]).optional(),
    repositoryRoot: z.string().min(1).max(400).optional(),
  });
  define({
    name: 'create_outcome_mission',
    description: 'Turn one outcome into a validated mission graph (tasks, dependencies, checks, hosts). Creates the space if none exists. Nothing runs and nothing is approved by this call.',
    inputSchema: objectSchema(
      {
        outcome: { type: 'string', description: 'The result the person wants, in one or two sentences.' },
        constraints: { type: 'array', items: { type: 'string' }, description: 'Rules the plan must respect, one per entry (at most 10).' },
        templateId: { type: 'string', enum: MISSION_TEMPLATES.map((template) => template.id), description: 'Mission template to instantiate; matched from the outcome when omitted.' },
        repositoryRoot: { type: 'string', description: 'Optional repository folder under a runner root.' },
      },
      ['outcome'],
    ),
    annotations: { readOnlyHint: false, sideEffect: 'write' },
    states: [],
    zodSchema: createSchema,
    execute: guarded(createSchema, async (input) => {
      let workspaceId = context.getActiveWorkspaceId();
      let workspaceCreated = false;
      if (!workspaceId) {
        const created = await createWorkspace({ name: 'Missions' }, 'agent');
        if (!created.ok) return toolError(created.error.code, created.error.message);
        workspaceId = created.value.id;
        workspaceCreated = true;
        context.setActiveIds?.({ workspaceId });
      }
      const result = await createMission({ workspaceId, outcome: input.outcome, constraints: input.constraints ?? [], ...(input.templateId ? { templateId: input.templateId } : {}), repositoryRoot: input.repositoryRoot ?? null, actorType: 'agent' });
      if (!result.ok) return toolError(result.error.code, result.error.message);
      context.setActiveIds?.({ workspaceId, missionId: result.value.mission.id });
      return toolText({
        missionId: result.value.mission.id,
        planId: result.value.plan.id,
        templateId: result.value.templateId,
        revision: result.value.plan.revision,
        contentHash: result.value.plan.contentHash,
        nodes: result.value.plan.nodes.map((node) => ({ id: node.id, kind: node.kind, after: node.dependencyIds })),
        workspaceCreated,
        note: 'Planned only. Read it with plan_current_mission; a person approves consequential plans; start_current_mission needs a paired runner.',
      });
    }),
  });

  const missionSchema = z.object({ missionId: z.string().min(1).optional() });
  const missionIdProperty = { type: 'string', description: 'Mission id from create_outcome_mission; defaults to the current mission.' };
  define({
    name: 'plan_current_mission',
    description: 'Read the validated plan of the current mission (or a given missionId): revision, content hash, node states, ready nodes, problems, and whether a person must approve it.',
    inputSchema: objectSchema({ missionId: missionIdProperty }, []),
    annotations: { readOnlyHint: true },
    states: [],
    zodSchema: missionSchema,
    execute: guarded(missionSchema, async (input) => {
      const workspaceId = context.getActiveWorkspaceId();
      if (!workspaceId) return toolError('conflict', 'No active space. Create a mission first with create_outcome_mission.');
      const view = await missionPlanForTool(workspaceId, input.missionId ?? context.getActiveMissionId());
      if (!view.ok) return toolError(view.error.code, view.error.message);
      return toolText(summary(view.value));
    }),
  });

  const startSchema = z.object({ missionId: z.string().min(1).optional(), expectedRevision: z.number().int().min(1) });
  define({
    name: 'start_current_mission',
    description: 'Ask Cherry to start the mission on the paired local runner at an exact plan revision. Refuses honestly when the runner is unpaired, the plan hash is stale, or a person has not approved a consequential plan.',
    inputSchema: objectSchema({ missionId: missionIdProperty, expectedRevision: { type: 'integer', minimum: 1, description: 'The plan revision you last read; a stale revision is refused.' } }, ['expectedRevision']),
    annotations: { readOnlyHint: false, sideEffect: 'execute' },
    states: [],
    zodSchema: startSchema,
    execute: guarded(startSchema, async (input) => {
      const workspaceId = context.getActiveWorkspaceId();
      if (!workspaceId) return toolError('conflict', 'No active space.');
      const view = await missionPlanForTool(workspaceId, input.missionId ?? context.getActiveMissionId());
      if (!view.ok) return toolError(view.error.code, view.error.message);
      const started = await startMission(workspaceId, view.value.mission.id, input.expectedRevision);
      if (!started.ok) return toolError(started.error.code, started.error.message);
      return toolText({ ...summary(started.value), note: 'Running on the paired runner while it stays online. Success comes only from Cherry’s own checks.' });
    }),
  });

  define({
    name: 'cancel_current_mission',
    description: 'Cancel the current mission (or a given missionId) on the runner and locally. Finished work stays recorded.',
    inputSchema: objectSchema({ missionId: missionIdProperty }, []),
    annotations: { readOnlyHint: false, sideEffect: 'write' },
    states: [],
    zodSchema: missionSchema,
    execute: guarded(missionSchema, async (input) => {
      const workspaceId = context.getActiveWorkspaceId();
      if (!workspaceId) return toolError('conflict', 'No active space.');
      const view = await missionPlanForTool(workspaceId, input.missionId ?? context.getActiveMissionId());
      if (!view.ok) return toolError(view.error.code, view.error.message);
      const cancelled = await cancelMission(workspaceId, view.value.mission.id, 'agent');
      if (!cancelled.ok) return toolError(cancelled.error.code, cancelled.error.message);
      return toolText(summary(cancelled.value));
    }),
  });

  const actionSchema = z.object({ missionId: z.string().min(1).optional(), nodeId: z.string().min(1).max(40), question: z.string().min(1).max(1000) });
  define({
    name: 'request_mission_action',
    description: 'Ask the person for a decision on one mission task. Parks a running task as Needs you. This never approves, grants, or decides anything.',
    inputSchema: objectSchema(
      {
        missionId: missionIdProperty,
        nodeId: { type: 'string', description: 'Plan node id from plan_current_mission (the task the decision is about).' },
        question: { type: 'string', description: 'The decision you need from the person, in one sentence.' },
      },
      ['nodeId', 'question'],
    ),
    // Asking a question needs no approval of its own; the person's answer is the decision.
    annotations: { readOnlyHint: false, sideEffect: 'write', requiresApproval: false },
    states: [],
    zodSchema: actionSchema,
    execute: guarded(actionSchema, async (input) => {
      const workspaceId = context.getActiveWorkspaceId();
      if (!workspaceId) return toolError('conflict', 'No active space.');
      const view = await missionPlanForTool(workspaceId, input.missionId ?? context.getActiveMissionId());
      if (!view.ok) return toolError(view.error.code, view.error.message);
      const requested = await requestMissionAction(workspaceId, view.value.mission.id, input.nodeId, input.question, 'agent');
      if (!requested.ok) return toolError(requested.error.code, requested.error.message);
      return toolText({ ...requested.value, note: 'A person decides in Mission Control. Approval is human-only.' });
    }),
  });

  return definitions;
}
