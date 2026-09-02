/**
 * Append-only JSONL metadata index. One record per line; bodies live in the
 * content store and are referenced by hash, so the index holds metadata only.
 *
 * In memory: the records in file order, an id map, a content-hash map for
 * dedupe, and a small inverted index over title and tags for lexical search.
 * recover() re-reads the file and tolerates a truncated or corrupt line
 * (skipped with a warning). A crash mid-append never poisons later appends:
 * the next append always starts on a fresh line.
 */
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readSync } from 'node:fs';
import { dirname } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { isSafeName, tokenize } from './text.mjs';

export const TRUST_LEVELS = Object.freeze(['untrusted', 'reviewed', 'approved']);
const HASH = /^[0-9a-f]{64}$/;
const KNOWN_FIELDS = new Set(['id', 'kind', 'contentHash', 'sourceId', 'trust', 'byteLength', 'createdAt', 'meta', 'nearDuplicateOf']);
const MAX_LINE_BYTES = 16 * 1024;
const READ_CHUNK_BYTES = 1024 * 1024;
const MAX_PAGE = 10_000;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

export function assertHash(hash) {
  if (typeof hash !== 'string' || !HASH.test(hash)) throw new TypeError('hash must be 64 lowercase hex characters');
  return hash;
}

export function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('record must be an object');
  for (const key of Object.keys(record)) if (!KNOWN_FIELDS.has(key)) throw new TypeError(`unknown record field ${key}`);
  if (!isSafeName(record.id)) throw new TypeError('id must be a safe name');
  if (typeof record.kind !== 'string' || record.kind.length === 0 || record.kind.length > 40) throw new TypeError('kind must be a short string');
  if (typeof record.contentHash !== 'string' || !HASH.test(record.contentHash)) throw new TypeError('contentHash must be 64 lowercase hex characters');
  if (typeof record.sourceId !== 'string' || record.sourceId.length === 0 || record.sourceId.length > 512) throw new TypeError('sourceId is required');
  if (!TRUST_LEVELS.includes(record.trust)) throw new TypeError(`trust must be one of ${TRUST_LEVELS.join(', ')}`);
  if (!Number.isInteger(record.byteLength) || record.byteLength < 0) throw new TypeError('byteLength must be a non-negative integer');
  if (typeof record.createdAt !== 'string' || Number.isNaN(Date.parse(record.createdAt))) throw new TypeError('createdAt must be an ISO date string');
  if (!record.meta || typeof record.meta !== 'object' || Array.isArray(record.meta)) throw new TypeError('meta must be an object');
  if (record.nearDuplicateOf !== undefined && !isSafeName(record.nearDuplicateOf)) throw new TypeError('nearDuplicateOf must be a safe name');
}

export class RecordIndex {
  constructor(filePath) {
    if (typeof filePath !== 'string' || filePath.length === 0) throw new TypeError('filePath is required');
    this.path = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    this.recover();
  }

  /** Re-read the file. Corrupt or truncated lines are skipped and reported in `warnings`. */
  recover() {
    this.entries = [];
    this.byId = new Map();
    this.byHash = new Map();
    this.postings = new Map();
    this.lengths = [];
    this.totalTokens = 0;
    this.warnings = [];
    this.endsWithNewline = true;
    if (!existsSync(this.path)) return { records: 0, warnings: [] };
    let lineNumber = 0;
    for (const { line, terminated } of readLines(this.path)) {
      lineNumber += 1;
      this.endsWithNewline = terminated;
      if (line.trim().length === 0) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
        validateRecord(parsed);
      } catch (error) {
        this.warnings.push(`line ${lineNumber} skipped (${terminated ? 'corrupt' : 'truncated tail'}): ${error.message}`);
        continue;
      }
      if (this.byId.has(parsed.id)) {
        this.warnings.push(`line ${lineNumber} skipped (duplicate id ${parsed.id})`);
        continue;
      }
      this.#admit(parsed);
    }
    return { records: this.entries.length, warnings: [...this.warnings] };
  }

  append(record) {
    validateRecord(record);
    if (this.byId.has(record.id)) throw new Error(`duplicate id ${record.id}`);
    const stored = {
      id: record.id,
      kind: record.kind,
      contentHash: record.contentHash,
      sourceId: record.sourceId,
      trust: record.trust,
      byteLength: record.byteLength,
      createdAt: record.createdAt,
      meta: structuredClone(record.meta),
    };
    if (record.nearDuplicateOf !== undefined) stored.nearDuplicateOf = record.nearDuplicateOf;
    const line = JSON.stringify(stored);
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (lineBytes > MAX_LINE_BYTES) throw new RangeError(`record ${record.id} is too large for the index (${lineBytes} bytes, limit ${MAX_LINE_BYTES})`);
    appendFileSync(this.path, `${this.endsWithNewline ? '' : '\n'}${line}\n`);
    this.endsWithNewline = true;
    return this.#admit(stored);
  }

  findByContentHash(hash) {
    return this.byHash.get(assertHash(hash));
  }

  findById(id) {
    return this.byId.get(id);
  }

  count() {
    return this.entries.length;
  }

  /** Metadata records in file order. */
  records() {
    return this.entries.values();
  }

  page({ cursor = null, limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) throw new RangeError(`limit must be an integer from 1 to ${MAX_PAGE}`);
    const start = cursor === null || cursor === undefined ? 0 : decodeCursor(cursor);
    const records = this.entries.slice(start, start + limit);
    const next = start + records.length;
    return { records, nextCursor: next < this.entries.length ? encodeCursor(next) : null };
  }

  /** Lexical BM25 over tokenised title and tags. Bodies are never indexed here. */
  search(terms, { limit = 10 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) throw new RangeError(`limit must be an integer from 1 to ${MAX_PAGE}`);
    const queryTokens = [...new Set(Array.isArray(terms) ? terms.flatMap((term) => tokenize(String(term))) : tokenize(String(terms ?? '')))];
    if (queryTokens.length === 0 || this.entries.length === 0) return [];
    const total = this.entries.length;
    const averageLength = this.totalTokens / total || 1;
    const scores = new Map();
    for (const token of queryTokens) {
      const posting = this.postings.get(token);
      if (!posting) continue;
      const idf = Math.log(1 + (total - posting.size + 0.5) / (posting.size + 0.5));
      for (const [offset, tf] of posting) {
        const norm = BM25_K1 * (1 - BM25_B + (BM25_B * this.lengths[offset]) / averageLength);
        scores.set(offset, (scores.get(offset) ?? 0) + idf * ((tf * (BM25_K1 + 1)) / (tf + norm)));
      }
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, limit)
      .map(([offset, score]) => ({ record: this.entries[offset], score }));
  }

  #admit(stored) {
    Object.freeze(stored.meta);
    Object.freeze(stored);
    const offset = this.entries.length;
    this.entries.push(stored);
    this.byId.set(stored.id, stored);
    if (!this.byHash.has(stored.contentHash)) this.byHash.set(stored.contentHash, stored);
    // ponytail: in-memory postings over title and tags; move to SQLite FTS when the index outgrows RAM.
    const tokens = tokenize(searchableText(stored.meta));
    this.lengths[offset] = tokens.length;
    this.totalTokens += tokens.length;
    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    for (const [token, tf] of counts) {
      let posting = this.postings.get(token);
      if (!posting) {
        posting = new Map();
        this.postings.set(token, posting);
      }
      posting.set(offset, tf);
    }
    return stored;
  }
}

function searchableText(meta) {
  const parts = [];
  if (typeof meta.title === 'string') parts.push(meta.title);
  if (Array.isArray(meta.tags)) for (const tag of meta.tags) if (typeof tag === 'string') parts.push(tag);
  return parts.join(' ');
}

/** Synchronous chunked line reader; memory is bounded by one chunk plus one line. */
function* readLines(path) {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    const decoder = new StringDecoder('utf8');
    let carry = '';
    for (;;) {
      const read = readSync(fd, buffer, 0, READ_CHUNK_BYTES, null);
      if (read === 0) break;
      const parts = (carry + decoder.write(buffer.subarray(0, read))).split('\n');
      carry = parts.pop();
      for (const part of parts) yield { line: part, terminated: true };
    }
    carry += decoder.end();
    if (carry.length > 0) yield { line: carry, terminated: false };
  } finally {
    closeSync(fd);
  }
}

function encodeCursor(offset) {
  return Buffer.from(`offset:${offset}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length === 0) throw new TypeError('invalid cursor');
  const match = /^offset:(\d{1,12})$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!match) throw new TypeError('invalid cursor');
  return Number(match[1]);
}
