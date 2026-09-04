import type { MissionState } from './mission-model.ts';

/**
 * Legal mission transitions. Both the manual UI and the WebMCP layer route
 * through this table, so an agent cannot skip a state the human interface
 * refuses to skip.
 */
export const MISSION_TRANSITIONS: Record<MissionState, readonly MissionState[]> = {
  DRAFT: ['LEARNING', 'PLANNING', 'CANCELLED', 'BLOCKED'],
  LEARNING: ['PLANNING', 'BLOCKED', 'CANCELLED'],
  PLANNING: ['AWAITING_APPROVAL', 'LEARNING', 'BLOCKED', 'CANCELLED'],
  AWAITING_APPROVAL: ['EXECUTING', 'PLANNING', 'BLOCKED', 'CANCELLED'],
  EXECUTING: ['VERIFYING', 'BLOCKED', 'CANCELLED'],
  VERIFYING: ['COMPLETE', 'EXECUTING', 'BLOCKED', 'CANCELLED'],
  COMPLETE: ['EXECUTING'],
  BLOCKED: ['DRAFT', 'LEARNING', 'PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'VERIFYING', 'CANCELLED'],
  CANCELLED: [],
};

export function canTransition(from: MissionState, to: MissionState): boolean {
  return MISSION_TRANSITIONS[from].includes(to);
}

export function nextStates(from: MissionState): readonly MissionState[] {
  return MISSION_TRANSITIONS[from];
}

/** Product state drives the WebMCP tool aperture and the Command Center. */
export type ProductState =
  | 'empty'
  | 'onboarding'
  | 'learning'
  | 'planning'
  | 'execution'
  | 'verification'
  | 'passed';

/**
 * The product state a running plan implies, or null when the plan says nothing
 * about it.
 *
 * Cherry has two ways to do work, and they advance different records. The
 * apprenticeship flow moves the legacy Mission through its own state machine.
 * The outcome flow builds a MissionPlan and starts it on the paired runner,
 * and that path deliberately never transitions the Mission: moving a Mission to
 * EXECUTING requires a human actor AND an approved skill graph at the current
 * revision, and a plan-based mission has no skill graph. That guard is a real
 * authority boundary, so the fix is to read both records here rather than to
 * weaken it.
 *
 * Without this, a plan could run to completion while the WebMCP aperture stayed
 * on onboarding tools, because the Mission was still DRAFT.
 */
function productStateForPlanStatus(status: MissionPlanStatusLike): ProductState | null {
  switch (status) {
    case 'draft':
      return null;
    case 'validated':
    case 'ready':
      return 'planning';
    case 'running':
      return 'execution';
    case 'waiting_for_human':
      // A person is being asked to decide, which is the approval surface.
      return 'planning';
    case 'verifying':
      return 'verification';
    case 'succeeded':
      return 'passed';
    case 'failed':
    case 'cancelled':
      // Failure returns the operator to the plan, not to a finished state.
      return 'planning';
    default:
      return null;
  }
}

/** Structurally typed so this module does not depend on the workforce layer. */
type MissionPlanStatusLike =
  | 'draft' | 'validated' | 'ready' | 'running' | 'waiting_for_human'
  | 'verifying' | 'succeeded' | 'failed' | 'cancelled';

/**
 * One projection over both records. A live plan wins over the Mission's own
 * state, because the plan is what is actually running; when there is no plan,
 * behaviour is exactly as before.
 */
export function productStateFor(
  state: MissionState | null,
  hasWorkspace: boolean,
  planStatus: MissionPlanStatusLike | null = null,
): ProductState {
  if (!hasWorkspace) return 'empty';
  const fromPlan = planStatus ? productStateForPlanStatus(planStatus) : null;
  if (fromPlan) return fromPlan;
  return productStateForMission(state, hasWorkspace);
}

export function productStateForMission(state: MissionState | null, hasWorkspace: boolean): ProductState {
  if (!hasWorkspace) return 'empty';
  if (!state) return 'onboarding';
  switch (state) {
    case 'DRAFT':
      return 'onboarding';
    case 'LEARNING':
      return 'learning';
    case 'PLANNING':
    case 'AWAITING_APPROVAL':
      return 'planning';
    case 'EXECUTING':
      return 'execution';
    case 'VERIFYING':
      return 'verification';
    case 'COMPLETE':
      return 'passed';
    default:
      return 'planning';
  }
}
