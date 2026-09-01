import type { SourceContentFormat } from './source-model.ts';

export const MAX_LOCAL_TEXT_FILE_BYTES = 2 * 1024 * 1024;

const FORMAT_BY_EXTENSION: Readonly<Record<string, SourceContentFormat>> = {
  '.txt': 'plain',
  '.md': 'markdown',
  '.srt': 'srt',
  '.vtt': 'vtt',
};

type LocalTextFileInspection =
  | { ok: true; value: { contentFormat: SourceContentFormat } }
  | { ok: false; error: string };

/** Validate a user-selected text file before any browser read occurs. */
export function inspectLocalTextFile(file: Pick<File, 'name' | 'size'>): LocalTextFileInspection {
  const lowerName = file.name.toLowerCase();
  const extension = Object.keys(FORMAT_BY_EXTENSION).find((candidate) => lowerName.endsWith(candidate));
  if (!extension) return { ok: false, error: 'Choose a .txt, .md, .srt, or .vtt file.' };
  if (file.size === 0) return { ok: false, error: 'That file is empty. Choose a text file with content.' };
  if (file.size > MAX_LOCAL_TEXT_FILE_BYTES) {
    return { ok: false, error: 'That file is larger than 2 MiB. Choose a smaller text file.' };
  }
  return { ok: true, value: { contentFormat: FORMAT_BY_EXTENSION[extension]! } };
}

export function decodeLocalTextBytes(bytes: Uint8Array): { ok: true; value: string } | { ok: false; error: string } {
  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: 'That file is not valid UTF-8 text. Save it as UTF-8 and try again.' };
  }
}

export function inspectLocalTextContent(content: string): { ok: true } | { ok: false; error: string } {
  if (!content.trim()) return { ok: false, error: 'That file contains no readable text. Choose another file.' };
  if (content.includes('\0')) return { ok: false, error: 'That file does not look like text. Choose another file.' };
  return { ok: true };
}
