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
