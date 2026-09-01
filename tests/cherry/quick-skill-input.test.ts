import { describe, expect, it } from 'vitest';
import { classifyQuickSkillMaterial } from '../../src/pages/studio/QuickSkill.tsx';

describe('classifyQuickSkillMaterial', () => {
  it('routes only complete YouTube hosts to the official-player path', () => {
    expect(classifyQuickSkillMaterial('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    expect(classifyQuickSkillMaterial('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(classifyQuickSkillMaterial('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBe('article');
  });

  it('keeps public pages and pasted material on their distinct paths', () => {
    expect(classifyQuickSkillMaterial('https://example.com/guide')).toBe('article');
    expect(classifyQuickSkillMaterial('Create a review checklist before release.')).toBe('raw');
    expect(classifyQuickSkillMaterial('   ')).toBe('raw');
  });
});
