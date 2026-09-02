/**
 * Ingest pipeline over the content store and the record index.
 *
 *   read -> validate -> normalise -> hash -> dedupe by content hash ->
 *   trust label untrusted -> store -> index append -> near-duplicate link
 *
 * Every body is data. This module imports the file system, crypto, streams
 * and the storage modules only: no process spawning, no dynamic code, no
 * network. Bodies are streamed; the derived features of one record at a time
 * are in memory, plus the metadata index. Bytes are stored verbatim;
 * normalisation (NFC, case, line endings) applies to derived metadata only.
 */
import { createHash } from 'node:crypto';
import { createReadStream, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Readable } from 'node:stream';
import { canonicalize } from '../canonical.mjs';
import { ContentStore } from './cas.mjs';
import { RecordIndex } from './record-index.mjs';
import { LineScanner, ShingleSet, bottomK, isSafeName, jaccard, slug, tokenize } from './text.mjs';

export const KINDS = Object.freeze({ document: 'documents', media: 'media' });
export const DEFAULTS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxMetadataBytes: 64 * 1024,
  batchSize: 50,
  nearDuplicateThreshold: 0.9,
  shingleSize: 5,
  sketchSize: 32,
  maxCandidates: 5,
});
const LIMITS = Object.freeze({ title: 200, tags: 16, tagLength: 80, keys: 64, warnings: 8 });
const READ_CHUNK_BYTES = 64 * 1024;
const TIMING = /^\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/;
const STEP_IN_TEXT = /\bStep\s+(\d{1,4})\b/;

/** A problem with one record. Anything else thrown by the pipeline is an infrastructure failure and propagates. */
export class RecordProblem extends Error {
  constructor(reason, detail = '') {
    super(detail ? `${reason}: ${detail}` : reason);
    this.reason = reason;
    this.detail = detail;
  }
}

/** Enumerates <corpusDir>/documents/*.json and <corpusDir>/media/*.json in sorted order. */
export function listSources(corpusDir) {
  const root = resolve(corpusDir);
  const sources = [];
  for (const [kind, folder] of Object.entries(KINDS)) {
    const dir = join(root, folder);
    if (!lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
    const names = readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
    for (const name of names) {
      sources.push({ id: name.slice(0, -'.json'.length), kind, dir, metaPath: join(dir, name), sourceId: `file:${folder}/${name}` });
    }
  }
  return sources;
}

export class IngestPipeline {
  constructor({ storeDir, maxBytes = DEFAULTS.maxBytes, maxMetadataBytes = DEFAULTS.maxMetadataBytes, batchSize = DEFAULTS.batchSize, nearDuplicateThreshold = DEFAULTS.nearDuplicateThreshold, shingleSize = DEFAULTS.shingleSize, sketchSize = DEFAULTS.sketchSize, now = () => new Date().toISOString() } = {}) {
    if (typeof storeDir !== 'string' || storeDir.length === 0) throw new TypeError('storeDir is required');
    if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes must be a positive integer');
    this.storeDir = storeDir;
    this.maxBytes = maxBytes;
    this.maxMetadataBytes = maxMetadataBytes;
    this.batchSize = batchSize;
    this.nearDuplicateThreshold = nearDuplicateThreshold;
    this.shingleSize = shingleSize;
    this.sketchSize = sketchSize;
    this.now = now;
    this.cas = new ContentStore(storeDir);
    this.index = new RecordIndex(join(storeDir, 'metadata', 'records.jsonl'));
    // ponytail: sketch owners live in memory (sketchSize entries per record); persist them when the index outgrows RAM.
    this.sketchOwners = new Map();
    for (const record of this.index.records()) this.#registerSketch(record);
  }

  /**
   * Bounded batches, records processed one at a time. The signal is checked
   * before every record; a hook that throws propagates like a crash.
   */
  async run(sources, { signal = null, batchSize = this.batchSize, onBatch = null, onRecord = null } = {}) {
    if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError('batchSize must be a positive integer');
    const summary = { status: 'completed', processed: 0, accepted: 0, duplicates: 0, isolated: 0, skipped: 0, batches: 0, outcomes: [] };
    const counters = { accepted: 'accepted', duplicate: 'duplicates', isolated: 'isolated', skipped: 'skipped' };
    for (let start = 0; start < sources.length; start += batchSize) {
      const batch = [];
      for (const source of sources.slice(start, start + batchSize)) {
        if (signal?.aborted) {
          summary.status = 'cancelled';
          return summary;
        }
        const outcome = await this.ingestOne(source);
        batch.push(outcome);
        summary.outcomes.push(outcome);
        summary.processed += 1;
        summary[counters[outcome.status]] += 1;
        if (onRecord) onRecord(outcome, summary.processed);
      }
      summary.batches += 1;
      if (onBatch) await onBatch({ batch: summary.batches, outcomes: batch, memory: process.memoryUsage() });
    }
    return summary;
  }

  async ingestOne(source) {
    const started = performance.now();
    let outcome;
    try {
      outcome = await this.#ingest(source);
    } catch (error) {
      if (!(error instanceof RecordProblem)) throw error;
      outcome = { status: 'isolated', reason: error.reason, detail: error.detail };
    }
    return { id: source.id, kind: source.kind, sourceId: source.sourceId, ...outcome, latencyMs: performance.now() - started };
  }

  async #ingest(source) {
    if (!isSafeName(source.id)) throw new RecordProblem('unsafe_id');
    if (this.index.findById(source.id)) return { status: 'skipped', reason: 'already_indexed' };
    const meta = this.#readMetadata(source);
    const body = this.#resolveBody(source, meta);
    const scan = await scanBody(body.path ? createReadStream(body.path, { highWaterMark: READ_CHUNK_BYTES }) : Readable.from([body.bytes]), {
      kind: source.kind,
      metadataOnly: body.metadataOnly,
      shingleSize: this.shingleSize,
    });
    if (scan.invalidUtf8) throw new RecordProblem('invalid_utf8');
    if (scan.byteLength !== body.byteLength) throw new RecordProblem('source_changed', 'size changed while reading');
    const existing = this.index.findByContentHash(scan.contentHash);
    if (existing) return { status: 'duplicate', duplicateOf: existing.id, contentHash: scan.contentHash, byteLength: scan.byteLength };
    const sketch = bottomK(scan.shingles.hashes, this.sketchSize);
    this.lastCandidateCount = 0;
    const near = await this.#findNearDuplicate(scan, sketch);
    const put = body.path ? await this.cas.putStream(createReadStream(body.path, { highWaterMark: READ_CHUNK_BYTES })) : this.cas.putBytes(body.bytes);
    if (put.hash !== scan.contentHash) throw new RecordProblem('source_changed', 'content changed while storing');
    const record = {
      id: source.id,
      kind: source.kind,
      contentHash: scan.contentHash,
      sourceId: source.sourceId,
      trust: 'untrusted',
      byteLength: scan.byteLength,
      createdAt: this.now(),
      meta: buildMeta(meta, scan, sketch, body.metadataOnly),
    };
    if (near) record.nearDuplicateOf = near.id;
    const stored = this.index.append(record);
    this.#registerSketch(stored);
    return {
      status: 'accepted',
      contentHash: scan.contentHash,
      byteLength: scan.byteLength,
      created: put.created,
      nearDuplicateOf: near?.id,
      similarity: near?.similarity,
      candidatesChecked: this.lastCandidateCount,
      warnings: stored.meta.warnings,
    };
  }

  #readMetadata(source) {
    const stats = lstatSync(source.metaPath, { throwIfNoEntry: false });
    if (!stats) throw new RecordProblem('missing_metadata');
    if (stats.isSymbolicLink()) throw new RecordProblem('symlink_refused', 'metadata file is a symlink');
    if (!stats.isFile()) throw new RecordProblem('not_a_file', 'metadata path is not a regular file');
    if (stats.size > this.maxMetadataBytes) throw new RecordProblem('metadata_too_large');
    let meta;
    try {
      meta = JSON.parse(readFileSync(source.metaPath, 'utf8'));
    } catch (error) {
      throw new RecordProblem('invalid_metadata', error.message);
    }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new RecordProblem('invalid_metadata', 'not an object');
    if (!isSafeName(meta.id)) throw new RecordProblem('unsafe_id');
    if (meta.id !== source.id) throw new RecordProblem('id_mismatch');
    if (meta.kind !== source.kind) throw new RecordProblem('kind_mismatch');
    return meta;
  }

  #resolveBody(source, meta) {
    const bodyName = source.kind === 'media' ? meta.transcript : meta.body;
    if (bodyName === null || bodyName === undefined) {
      if (source.kind !== 'media') throw new RecordProblem('missing_body');
      const bytes = Buffer.from(metadataBody(meta), 'utf8');
      return { bytes, byteLength: bytes.length, metadataOnly: true, path: null };
    }
    if (!isSafeName(bodyName)) throw new RecordProblem('unsafe_body_path');
    const path = join(source.dir, bodyName);
    const stats = lstatSync(path, { throwIfNoEntry: false });
    if (!stats) throw new RecordProblem('missing_body');
    if (stats.isSymbolicLink()) throw new RecordProblem('symlink_refused', 'body file is a symlink');
    if (!stats.isFile()) throw new RecordProblem('not_a_file', 'body path is not a regular file');
    if (stats.size === 0) throw new RecordProblem('empty_body');
    if (stats.size > this.maxBytes) throw new RecordProblem('oversized', `${stats.size} bytes exceeds maxBytes ${this.maxBytes}`);
    return { bytes: null, byteLength: stats.size, metadataOnly: false, path };
  }

  /** Bottom-k sketch overlap picks candidates; exact shingle Jaccard over both bodies confirms. */
  async #findNearDuplicate(scan, sketch) {
    if (sketch.length === 0) return null;
    const shared = new Map();
    for (const hash of sketch) {
      const owners = this.sketchOwners.get(hash);
      if (!owners) continue;
      for (const id of owners) shared.set(id, (shared.get(id) ?? 0) + 1);
    }
    const minimumShared = Math.max(1, Math.ceil(sketch.length / 2));
    const candidates = [...shared.entries()]
      .filter(([, count]) => count >= minimumShared)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, DEFAULTS.maxCandidates);
    let best = null;
    for (const [id] of candidates) {
      const candidate = this.index.findById(id);
      const other = await scanBody(this.cas.readStream(candidate.contentHash), { kind: candidate.kind, metadataOnly: candidate.meta.metadataOnly === true, shingleSize: this.shingleSize });
      const similarity = jaccard(scan.shingles.hashes, other.shingles.hashes);
      if (similarity > this.nearDuplicateThreshold && (best === null || similarity > best.similarity)) best = { id, similarity };
    }
    this.lastCandidateCount = candidates.length;
    return best;
  }

  #registerSketch(record) {
    if (!Array.isArray(record.meta.sketch)) return;
    for (const hash of record.meta.sketch) {
      let owners = this.sketchOwners.get(hash);
      if (!owners) {
        owners = [];
        this.sketchOwners.set(hash, owners);
      }
      owners.push(record.id);
    }
  }
}

/** The stored body of a metadata-only record: canonical JSON of the metadata without its id. */
export function metadataBody(meta) {
  const { id: _id, ...rest } = meta;
  return canonicalize(rest);
}

/**
 * One streaming pass: SHA-256 over the raw bytes, strict UTF-8 validation,
 * word shingles, and per-kind structure (document keys or subtitle cues).
 */
export async function scanBody(readable, { kind, metadataOnly = false, shingleSize = DEFAULTS.shingleSize }) {
  const hasher = createHash('sha256');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const lines = new LineScanner();
  const shingles = new ShingleSet(shingleSize);
  const analyser = kind === 'media' && !metadataOnly ? new SubtitleAnalyser() : new DocumentAnalyser();
  let byteLength = 0;
  const onLine = (raw) => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    shingles.pushAll(tokenize(line));
    analyser.line(line);
  };
  for await (const chunk of readable) {
    byteLength += chunk.length;
    hasher.update(chunk);
    let text;
    try {
      text = decoder.decode(chunk, { stream: true });
    } catch {
      return { invalidUtf8: true, byteLength };
    }
    for (const line of lines.push(text)) onLine(line);
  }
  let tail;
  try {
    tail = decoder.decode();
  } catch {
    return { invalidUtf8: true, byteLength };
  }
  for (const line of lines.push(tail)) onLine(line);
  const last = lines.flush();
  if (last !== null) onLine(last);
  return { invalidUtf8: false, contentHash: hasher.digest('hex'), byteLength, shingles, ...analyser.result() };
}

class DocumentAnalyser {
  constructor() {
    this.title = null;
    this.keys = new Set();
    this.tools = [];
  }

  line(line) {
    if (this.title === null && line.startsWith('# ')) this.title = line.slice(2).trim();
    let match;
    if ((match = /^Project:\s*(.+)$/.exec(line))) this.keys.add(`project:${slug(match[1])}`);
    else if ((match = /^Creator:\s*(.+)$/.exec(line))) this.keys.add(`creator:${slug(match[1])}`);
    else if ((match = /^Tools:\s*(.+)$/.exec(line))) {
      for (const tool of match[1].split(',')) {
        const name = tool.trim();
        if (!name) continue;
        this.keys.add(`tool:${slug(name)}`);
        if (this.tools.length < LIMITS.tags) this.tools.push(name);
      }
    } else if ((match = /^##\s+Step\s+(\d{1,4})\b/.exec(line))) this.keys.add(`step:${Number(match[1])}`);
  }

  result() {
    return { title: this.title, keys: this.keys, tools: this.tools, warnings: [], analysis: {} };
  }
}

/** SRT and WebVTT cue scanner: counts cues, tracks duration, flags structural defects. */
class SubtitleAnalyser {
  constructor() {
    this.format = null;
    this.block = [];
    this.cues = 0;
    this.maxEnd = 0;
    this.previousEnd = -Infinity;
    this.warnings = new Set();
    this.keys = new Set();
    this.lineNumber = 0;
  }

  line(line) {
    this.lineNumber += 1;
    if (this.lineNumber === 1 && line.startsWith('WEBVTT')) {
      this.format = 'vtt';
      return;
    }
    if (this.format === null) this.format = 'srt';
    if (line.trim() === '') {
      this.#flush();
      return;
    }
    this.block.push(line);
  }

  #flush() {
    const block = this.block;
    this.block = [];
    if (block.length === 0) return;
    if (this.format === 'vtt' && /^(NOTE|STYLE|REGION)\b/.test(block[0])) return;
    const timingAt = block.findIndex((line, position) => position < 2 && line.includes('-->'));
    if (timingAt === -1) {
      this.warnings.add('missing_timing');
      return;
    }
    if (this.format === 'srt' && (timingAt === 0 || !/^\d+$/.test(block[0].trim()))) this.warnings.add('missing_index');
    const timing = parseTiming(block[timingAt]);
    if (!timing) this.warnings.add('bad_timestamp');
    else {
      if (timing.end < timing.start) this.warnings.add('negative_duration');
      if (timing.start < this.previousEnd) this.warnings.add('overlap');
      this.previousEnd = Math.max(this.previousEnd, timing.end);
      this.maxEnd = Math.max(this.maxEnd, timing.end);
    }
    this.cues += 1;
    for (const text of block.slice(timingAt + 1)) {
      const match = STEP_IN_TEXT.exec(text);
      if (match) this.keys.add(`step:${Number(match[1])}`);
    }
  }

  result() {
    this.#flush();
    if (this.cues === 0) this.warnings.add('no_cues');
    return {
      title: null,
      keys: this.keys,
      tools: [],
      warnings: [...this.warnings].sort(),
      analysis: { format: this.format, cues: this.cues, durationSeconds: Math.round(this.maxEnd * 1000) / 1000 },
    };
  }
}

function parseTiming(line) {
  const match = TIMING.exec(line);
  if (!match) return null;
  const seconds = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  return { start: seconds(match[1], match[2], match[3], match[4]), end: seconds(match[5], match[6], match[7], match[8]) };
}

function buildMeta(meta, scan, sketch, metadataOnly) {
  const title = typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : (scan.title ?? '');
  const tags = [];
  const keys = new Set(scan.keys);
  for (const field of ['creator', 'project']) {
    if (typeof meta[field] !== 'string' || !meta[field].trim()) continue;
    tags.push(clip(meta[field].trim(), LIMITS.tagLength));
    keys.add(`${field}:${slug(meta[field])}`);
  }
  for (const tool of scan.tools) if (tags.length < LIMITS.tags) tags.push(clip(tool, LIMITS.tagLength));
  const sortedKeys = [...keys].sort();
  const result = {
    title: clip(title, LIMITS.title),
    tags,
    keys: sortedKeys.slice(0, LIMITS.keys),
    warnings: scan.warnings.slice(0, LIMITS.warnings),
    sketch,
    ...scan.analysis,
  };
  if (sortedKeys.length > LIMITS.keys) result.keysTruncated = sortedKeys.length;
  if (scan.warnings.length > LIMITS.warnings) result.warningsTruncated = scan.warnings.length;
  if (typeof meta.createdAt === 'string') result.sourceCreatedAt = clip(meta.createdAt, 64);
  if (metadataOnly) {
    result.metadataOnly = true;
    if (typeof meta.durationSeconds === 'number' && Number.isFinite(meta.durationSeconds)) result.durationSeconds = meta.durationSeconds;
  }
  return result;
}

function clip(text, length) {
  return text.length > length ? text.slice(0, length) : text;
}
