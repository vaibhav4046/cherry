import { describe, expect, it } from 'vitest';
import { productStateFor, productStateForMission } from '../../src/cherry/mission/mission-state.ts';

/**
 * Cherry advances two different records depending on how the work was started.
 * The apprenticeship flow moves the legacy Mission through its own states. The
 * outcome flow builds a MissionPlan and runs it on the paired runner, and it
 * deliberately never transitions the Mission, because moving a Mission to
 * EXECUTING requires a human actor and an approved skill graph at the current
 * revision, and a plan-based mission has no skill graph.
 *
 * The WebMCP aperture is derived from that product state. So if the projection
 * reads only the Mission, a plan can run to completion while the registered
 * tools are still the onboarding set. These tests pin the projection that keeps
 * the two in agreement.
 */
describe('product state projection', () => {
  it('keeps reading the mission when there is no plan', () => {
    // The apprenticeship path must behave exactly as it did before.
    expect(productStateFor('DRAFT', true, null)).toBe('onboarding');
    expect(productStateFor('LEARNING', true, null)).toBe('learning');
    expect(productStateFor('EXECUTING', true, null)).toBe('execution');
    expect(productStateFor('COMPLETE', true, null)).toBe('passed');
  });

  it('reports no workspace before anything else', () => {
    expect(productStateFor('EXECUTING', false, 'running')).toBe('empty');
  });

  it('follows a running plan even though its mission is still DRAFT', () => {
    // This is the defect: startMission records the plan as running and never
    // transitions the mission, so a mission-only projection answers onboarding.
    expect(productStateForMission('DRAFT', true)).toBe('onboarding');
    expect(productStateFor('DRAFT', true, 'running')).toBe('execution');
  });

  it('maps the rest of the plan lifecycle onto the same vocabulary', () => {
    expect(productStateFor('DRAFT', true, 'validated')).toBe('planning');
    expect(productStateFor('DRAFT', true, 'ready')).toBe('planning');
    expect(productStateFor('DRAFT', true, 'waiting_for_human')).toBe('planning');
    expect(productStateFor('DRAFT', true, 'verifying')).toBe('verification');
    expect(productStateFor('DRAFT', true, 'succeeded')).toBe('passed');
  });

  it('returns a failed or cancelled plan to planning rather than to a finished state', () => {
    // "failed" must not read as passed, and must not strand the operator in a
    // state whose tools cannot revise the plan.
    expect(productStateFor('DRAFT', true, 'failed')).toBe('planning');
    expect(productStateFor('DRAFT', true, 'cancelled')).toBe('planning');
  });

  it('lets a draft plan defer to the mission instead of overriding it', () => {
    // A drafted plan says nothing about what is happening yet, so the mission
    // remains the better answer.
    expect(productStateFor('LEARNING', true, 'draft')).toBe('learning');
    expect(productStateFor('DRAFT', true, 'draft')).toBe('onboarding');
  });
});
