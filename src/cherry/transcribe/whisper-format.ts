/**
 * Pure formatting for on-device Whisper output — kept dependency-free so unit
 * tests never load the model runtime. Output matches Cherry's timestamped
 * transcript format ("m:ss text" per line), ready for the existing parser.
 */

export interface WhisperChunk {
  /** [startSeconds, endSeconds] — end may be null on the final chunk. */
  timestamp: [number, number | null];
  text: string;
}

function stamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * Whisper chunks → "m:ss text" lines. `playbackRate` rescales capture-time
 * timestamps back to video time when the tab was captured at 1.5x/2x.
 */
export function formatWhisperChunks(chunks: WhisperChunk[], playbackRate = 1): string {
  const rate = playbackRate > 0 ? playbackRate : 1;
  const lines: string[] = [];
  for (const chunk of chunks) {
    const text = chunk.text.replace(/\s+/g, ' ').trim();
    if (text.length === 0) continue;
    lines.push(`${stamp(chunk.timestamp[0] * rate)} ${text}`);
  }
  return lines.join('\n');
}
