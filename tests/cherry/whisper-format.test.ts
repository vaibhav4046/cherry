import { describe, expect, it } from 'vitest';
import { formatWhisperChunks } from '../../src/cherry/transcribe/whisper-format.ts';

describe('formatWhisperChunks', () => {
  it('renders m:ss lines in document order and skips empty chunks', () => {
    const text = formatWhisperChunks([
      { timestamp: [0, 4], text: ' hi everyone ' },
      { timestamp: [65, 70], text: 'second   minute' },
      { timestamp: [80, 84], text: '   ' },
      { timestamp: [3700, null], text: 'over an hour' },
    ]);
    expect(text.split('\n')).toEqual(['0:00 hi everyone', '1:05 second minute', '1:01:40 over an hour']);
  });

  it('rescales capture-time timestamps by playback rate', () => {
    const text = formatWhisperChunks([{ timestamp: [30, 40], text: 'spoken at double speed' }], 2);
    expect(text).toBe('1:00 spoken at double speed');
  });

  it('handles the empty transcript honestly', () => {
    expect(formatWhisperChunks([])).toBe('');
  });
});
