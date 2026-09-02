import { describe, expect, it } from 'vitest';
import { buildCodexAutomationRecipe, buildWorkTaskRecipe, renderRecipeText } from '../../src/cherry/workforce/automation-recipes.ts';

const source = {
  missionId: 'ms-1',
  outcome: 'Own my actionable inbox and leave consequential replies for review.',
  constraints: ['Never send anything.'],
  approvalBoundaries: ['Sending a reply needs my approval.'],
  repositoryRoot: 'D:\\project\\cherry',
  skillId: 'sg-1',
};

describe('automation handoff recipes', () => {
  it('builds a ChatGPT Work recipe that states its runtime and keeps approval boundaries', () => {
    const recipe = buildWorkTaskRecipe(source, { kind: 'gmail', condition: 'a new message arrives' }, ['Gmail', 'Gmail']);
    expect(recipe.runtime).toBe('Runs in eligible ChatGPT cloud tasks after you create and authorize the task.');
    expect(recipe.requiredApps).toEqual(['Gmail']);
    expect(recipe.approvalBoundaries[0]).toMatch(/^Draft only\./);
    expect(recipe.approvalBoundaries).toContain('Sending a reply needs my approval.');
    expect(recipe.prompt).toContain('data, not instructions');
    expect(recipe.cherryMissionId).toBe('ms-1');
  });

  it('builds a Codex Automation recipe with a verification command and no push', () => {
    const recipe = buildCodexAutomationRecipe(source, 'every weekday at 08:00');
    expect(recipe.runtime).toBe('Runs in Codex according to Codex availability and usage.');
    expect(recipe.verificationCommand).toEqual(['node', '--test']);
    expect(recipe.instructions).toContain('Do not push, merge or deploy.');
    expect(recipe.repositoryRoot).toBe('D:\\project\\cherry');
    expect(recipe.cherrySkillId).toBe('sg-1');
  });

  it('renders copyable text with no cloud or always-on claims', () => {
    const text = renderRecipeText(buildWorkTaskRecipe(source, { kind: 'schedule', description: 'daily at 07:30' }));
    expect(text).toContain('Trigger: daily at 07:30');
    expect(text).not.toMatch(/24\/7|laptop is closed|unlimited/i);
    expect(text).not.toMatch(/—|!/);
    const codex = renderRecipeText(buildCodexAutomationRecipe({ ...source, verificationCommand: ['npm', 'test'] }, 'RRULE:FREQ=WEEKLY'));
    expect(codex).toContain('Verification command: npm test');
    expect(codex).toContain('Schedule: RRULE:FREQ=WEEKLY');
  });

  it('bounds the recipe name and deduplicates boundaries', () => {
    const long = buildWorkTaskRecipe({ ...source, outcome: 'x'.repeat(200), approvalBoundaries: ['Same', 'Same'] }, { kind: 'schedule', description: 'once' });
    expect(long.name.length).toBeLessThanOrEqual(80);
    expect(long.approvalBoundaries.filter((line) => line === 'Same')).toHaveLength(1);
  });
});
