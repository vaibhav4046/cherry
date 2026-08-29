import { ok, type Result } from '../core/result.ts';
import { invalid } from '../core/errors.ts';
import type { TranscriptSource } from './watch-model.ts';

export interface ParsedTranscriptSegment {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface ParsedTranscript {
  format: 'srt' | 'vtt' | 'plain';
  segments: ParsedTranscriptSegment[];
}

export const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;
export const MAX_TRANSCRIPT_SEGMENTS = 20000;

function timeToSeconds(value: string): number | null {
  // Accepts HH:MM:SS.mmm, HH:MM:SS,mmm, MM:SS.mmm, MM:SS
  const match = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = match[4] ? Number(match[4].padEnd(3, '0')) : 0;
  if (minutes >= 60 || seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/** Strips markup-ish angle-bracket tags from cue text without executing anything. */
function cleanCueText(text: string): string {
  return text
    .replace(/<[^>]{0,200}>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCueBlocks(lines: string[], allowVttArrow: boolean): ParsedTranscriptSegment[] {
  const segments: ParsedTranscriptSegment[] = [];
  let index = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    const arrow = allowVttArrow ? line.split('-->') : line.split(/\s*-->\s*/);
    if (line.includes('-->') && arrow.length === 2) {
      const start = timeToSeconds(arrow[0]!.trim().split(' ')[0]!);
      const end = timeToSeconds(arrow[1]!.trim().split(' ')[0]!);
      const textLines: string[] = [];
      i += 1;
      while (i < lines.length && lines[i]!.trim() !== '') {
        textLines.push(lines[i]!);
        i += 1;
      }
      if (start !== null && end !== null && end >= start) {
        const text = cleanCueText(textLines.join(' '));
        if (text) {
          segments.push({ index, startSeconds: start, endSeconds: end, text });
          index += 1;
        }
      }
    }
    i += 1;
  }
  return segments;
}

function parsePlainText(content: string): ParsedTranscriptSegment[] {
  // Plain text: split into paragraphs; support optional leading [mm:ss] markers.
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const segments: ParsedTranscriptSegment[] = [];
  let cursor = 0;
  paragraphs.forEach((paragraph, index) => {
    const marker = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.*)$/.exec(paragraph);
    let start = cursor;
    let text = paragraph;
    if (marker) {
      const parsedTime = timeToSeconds(marker[1]!.length <= 5 ? `0:${marker[1]!}` : marker[1]!);
      if (parsedTime !== null) {
        start = parsedTime;
        text = marker[2]!;
      }
    }
    const end = start + Math.max(4, Math.min(30, Math.round(text.length / 12)));
    segments.push({ index, startSeconds: start, endSeconds: end, text });
    cursor = end;
  });
  return segments;
}

/**
 * Parses .srt, .vtt, or plain pasted text into timed segments. Runs entirely
 * locally; the content is treated as untrusted data, never as instructions.
 */
export function parseTranscript(content: string, fileName?: string): Result<ParsedTranscript> {
  if (!content.trim()) return invalid('Transcript is empty');
  if (new TextEncoder().encode(content).length > MAX_TRANSCRIPT_BYTES) {
    return invalid('Transcript exceeds the 2 MiB limit');
  }

  const normalized = content.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const lines = normalized.split('\n');
  const lowerName = (fileName ?? '').toLowerCase();

  let format: ParsedTranscript['format'];
  if (normalized.trimStart().startsWith('WEBVTT') || lowerName.endsWith('.vtt')) {
    format = 'vtt';
  } else if (lowerName.endsWith('.srt') || /\n\d+\n\d{2}:\d{2}/.test(`\n${normalized}`)) {
    format = 'srt';
  } else if (normalized.includes('-->')) {
    format = 'srt';
  } else {
    format = 'plain';
  }

  const segments = format === 'plain' ? parsePlainText(normalized) : parseCueBlocks(lines, format === 'vtt');
  if (segments.length === 0) {
    return invalid('No transcript segments could be parsed from that content');
  }
  if (segments.length > MAX_TRANSCRIPT_SEGMENTS) {
    return invalid(`Transcript has ${segments.length} segments; the limit is ${MAX_TRANSCRIPT_SEGMENTS}`);
  }
  return ok({ format, segments });
}

export function inferTranscriptSource(fileName?: string): TranscriptSource {
  if (!fileName) return 'user_text';
  return 'user_upload';
}
