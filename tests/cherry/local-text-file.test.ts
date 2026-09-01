import { describe, expect, it } from 'vitest';
import {
  decodeLocalTextBytes,
  inspectLocalTextContent,
  inspectLocalTextFile,
  MAX_LOCAL_TEXT_FILE_BYTES,
  readLocalTextFile,
} from '../../src/cherry/source/local-text-file.ts';

describe('local Cherry text files', () => {
  it.each([
    ['notes.txt', 'plain'],
    ['method.MD', 'markdown'],
    ['captions.srt', 'srt'],
    ['captions.VTT', 'vtt'],
  ] as const)('accepts %s and records the matching format', (name, contentFormat) => {
    expect(inspectLocalTextFile({ name, size: 42 })).toEqual({
      ok: true,
      value: { contentFormat },
    });
  });

  it.each(['export.json', 'notes.md.exe', 'captions.csv', 'README'])('rejects unsupported file %s', (name) => {
    expect(inspectLocalTextFile({ name, size: 42 })).toEqual({
      ok: false,
      error: 'Choose a .txt, .md, .srt, or .vtt file.',
    });
  });

  it('rejects empty and oversized files before reading them', () => {
    expect(inspectLocalTextFile({ name: 'empty.txt', size: 0 })).toEqual({
      ok: false,
      error: 'That file is empty. Choose a text file with content.',
    });
    expect(inspectLocalTextFile({ name: 'large.txt', size: MAX_LOCAL_TEXT_FILE_BYTES + 1 })).toEqual({
      ok: false,
      error: 'That file is larger than 2 MiB. Choose a smaller text file.',
    });
  });

  it('does not read rejected files and returns validated UTF-8 content for accepted files', async () => {
    let reads = 0;
    const oversized = {
      name: 'large.txt',
      size: MAX_LOCAL_TEXT_FILE_BYTES + 1,
      arrayBuffer: async () => {
        reads += 1;
        return new ArrayBuffer(0);
      },
    };
    await expect(readLocalTextFile(oversized)).resolves.toEqual({
      ok: false,
      error: 'That file is larger than 2 MiB. Choose a smaller text file.',
    });
    expect(reads).toBe(0);

    await expect(readLocalTextFile({ ...oversized, name: 'empty.txt', size: 0 })).resolves.toEqual({
      ok: false,
      error: 'That file is empty. Choose a text file with content.',
    });
    await expect(readLocalTextFile({ ...oversized, name: 'renamed.exe', size: 12 })).resolves.toEqual({
      ok: false,
      error: 'Choose a .txt, .md, .srt, or .vtt file.',
    });
    expect(reads).toBe(0);

    const bytes = new TextEncoder().encode('A review checklist.');
    await expect(readLocalTextFile({
      name: 'method.md',
      size: bytes.byteLength,
      arrayBuffer: async () => {
        reads += 1;
        return bytes.buffer;
      },
    })).resolves.toEqual({
      ok: true,
      value: { content: 'A review checklist.', contentFormat: 'markdown' },
    });
    expect(reads).toBe(1);
  });

  it('rejects decoded content that is blank, BOM-only, or binary-looking', () => {
    expect(inspectLocalTextContent('  \r\n\t')).toEqual({
      ok: false,
      error: 'That file contains no readable text. Choose another file.',
    });
    expect(inspectLocalTextContent('\uFEFF  \n')).toEqual({
      ok: false,
      error: 'That file contains no readable text. Choose another file.',
    });
    expect(inspectLocalTextContent('text\0more text')).toEqual({
      ok: false,
      error: 'That file does not look like text. Choose another file.',
    });
    expect(inspectLocalTextContent('WEBVTT\n\n00:00.000 --> 00:02.000\nReview the source.')).toEqual({ ok: true });
  });

  it('decodes UTF-8 strictly instead of turning renamed binary into replacement characters', () => {
    expect(decodeLocalTextBytes(new TextEncoder().encode('A valid UTF-8 method.'))).toEqual({
      ok: true,
      value: 'A valid UTF-8 method.',
    });
    expect(decodeLocalTextBytes(Uint8Array.from([0xff, 0xfe, 0xff, 0xfe]))).toEqual({
      ok: false,
      error: 'That file is not valid UTF-8 text. Save it as UTF-8 and try again.',
    });
  });
});
