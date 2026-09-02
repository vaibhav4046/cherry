/**
 * Text helpers shared by the storage layer: safe names, tokens, slugs, word
 * shingles and a line scanner for streamed bodies. Pure functions over
 * strings. Nothing here interprets, executes or dispatches what it reads.
 */

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const TOKEN = /[\p{L}\p{N}\p{M}]+/gu;
const NOT_SLUG = /[^\p{L}\p{N}]+/gu;
const SHINGLE_SEPARATOR = String.fromCharCode(1);

/** Identifiers and file names: one path segment, no traversal, no separators. */
export function isSafeName(value) {
  return typeof value === 'string' && SAFE_NAME.test(value) && !value.includes('..');
}

/** NFC-normalised, lower-cased runs of letters, digits and combining marks. */
export function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  return text.normalize('NFC').toLowerCase().match(TOKEN) ?? [];
}

export function slug(text) {
  return String(text).normalize('NFC').toLowerCase().replace(NOT_SLUG, '-').replace(/^-+|-+$/g, '');
}

/** FNV-1a over UTF-16 code units, 32-bit unsigned. Deterministic across platforms. */
export function hash32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Word shingles hashed to 32-bit integers. Feed tokens in order, read `hashes`. */
export class ShingleSet {
  constructor(size = 5) {
    this.size = size;
    this.window = [];
    this.hashes = new Set();
  }

  push(token) {
    this.window.push(token);
    if (this.window.length > this.size) this.window.shift();
    if (this.window.length === this.size) this.hashes.add(hash32(this.window.join(SHINGLE_SEPARATOR)));
  }

  pushAll(tokens) {
    for (const token of tokens) this.push(token);
  }
}

export function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const value of small) if (large.has(value)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** The k smallest hashes, ascending: a bottom-k sketch used as a similarity candidate filter. */
export function bottomK(hashes, k) {
  const keep = [];
  for (const hash of hashes) {
    if (keep.length === k && hash >= keep[k - 1]) continue;
    let low = 0;
    let high = keep.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (keep[middle] < hash) low = middle + 1;
      else high = middle;
    }
    if (keep[low] === hash) continue;
    keep.splice(low, 0, hash);
    if (keep.length > k) keep.pop();
  }
  return keep;
}

/** Splits streamed text into complete lines; the partial tail waits for the next chunk. */
export class LineScanner {
  constructor() {
    this.carry = '';
  }

  push(text) {
    const parts = (this.carry + text).split('\n');
    this.carry = parts.pop();
    return parts;
  }

  flush() {
    const last = this.carry;
    this.carry = '';
    return last.length > 0 ? last : null;
  }
}
