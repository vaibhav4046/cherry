import { describe, expect, it } from 'vitest';
import { GLOBAL_TOOLS, TOOL_STATE_TABLE } from '../../src/cherry/webmcp/tool-definitions.ts';

/**
 * A visiting agent's first contact with Cherry used to be a dead end. On a fresh
 * browser the cross-workspace library is empty, so `recommend_skills` returned
 * an empty list, and the entry's whole claim is that the site sends an agent
 * away more capable than it arrived.
 *
 * `load_starter_library` closes that gap: it installs the shipped, labelled
 * reference methods so `recommend_skills` and `get_skill` have real ids to
 * resolve. It is deliberately NOT a global tool, because the aperture contract
 * is exactly seven always-on tools, and it is only offered in the two states
 * where the library can plausibly be empty.
 */
describe('load_starter_library', () => {
  it('is offered where the library can be empty, and nowhere else', () => {
    expect(TOOL_STATE_TABLE.empty).toContain('load_starter_library');
    expect(TOOL_STATE_TABLE.onboarding).toContain('load_starter_library');

    const laterStates = ['learning', 'planning', 'execution', 'verification', 'passed'] as const;
    for (const state of laterStates) {
      expect(TOOL_STATE_TABLE[state] ?? []).not.toContain('load_starter_library');
    }
  });

  it('does not become an eighth always-on tool', () => {
    // The seven-global bound is a published claim; adding a global here would
    // silently break it.
    expect(GLOBAL_TOOLS).toHaveLength(7);
    expect(GLOBAL_TOOLS as readonly string[]).not.toContain('load_starter_library');
  });

  it('keeps every state inside the five-contextual-tool aperture', () => {
    for (const [state, tools] of Object.entries(TOOL_STATE_TABLE)) {
      expect(tools.length, `${state} exceeds the contextual bound`).toBeLessThanOrEqual(5);
    }
  });

  it('leaves the empty-library guidance pointing at a tool that exists', () => {
    // The note recommend_skills returns when it finds nothing now names this
    // tool. If the tool were ever removed, that advice would send an agent to a
    // call it cannot make.
    const offered = new Set([...(TOOL_STATE_TABLE.empty ?? []), ...(TOOL_STATE_TABLE.onboarding ?? [])]);
    expect(offered.has('load_starter_library')).toBe(true);
  });
});
