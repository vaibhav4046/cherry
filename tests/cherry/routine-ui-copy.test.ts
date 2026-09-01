import { describe, expect, it } from 'vitest';
import { plainRoutineMessage } from '../../src/pages/studio/routine-copy.ts';

describe('routine UI copy', () => {
  it('turns stale skill approval errors into a plain next step', () => {
    expect(plainRoutineMessage('Routine requires approval of the current skill graph revision.')).toBe(
      'The approved skill changed. Open the skill, approve the current version, then try again.',
    );
  });

  it('turns routine version conflicts into a reload instruction', () => {
    expect(plainRoutineMessage('Routine changed to revision 4 while approving r3.')).toBe(
      'This routine changed while you were working. Reload the page and try again.',
    );
  });

  it('preserves an external runner diagnostic without changing the stored value', () => {
    const stored = 'Git workspace revision not found.';
    const visible = plainRoutineMessage(stored);

    expect(visible).toBe(stored);
    expect(stored).toBe('Git workspace revision not found.');
  });
});
