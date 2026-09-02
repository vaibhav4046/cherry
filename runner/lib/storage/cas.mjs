/**
 * Content-addressed store: immutable blobs keyed by SHA-256, written
 * atomically (temp file + rename), deduplicated by hash, never deleted.
 *
 *   <root>/objects/sha256/<aa>/<full hash>   one immutable object per hash
 *   <root>/tmp/                              in-flight writes only
 *
 * Bodies are opaque bytes to this module. It never interprets them.
 * Garbage collection is out of scope: nothing here removes an object.
 */
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

const HASH = /^[0-9a-f]{64}$/;
const SHARD = /^[0-9a-f]{2}$/;
const MAX_PAGE = 10_000;

export function assertHash(hash) {
  if (typeof hash !== 'string' || !HASH.test(hash)) throw new TypeError('hash must be 64 lowercase hex characters');
  return hash;
}

export class ContentStore {
  constructor(rootDir) {
    if (typeof rootDir !== 'string' || rootDir.length === 0) throw new TypeError('rootDir is required');
    this.root = rootDir;
    this.objectsDir = join(rootDir, 'objects', 'sha256');
    this.tmpDir = join(rootDir, 'tmp');
    mkdirSync(this.objectsDir, { recursive: true });
    mkdirSync(this.tmpDir, { recursive: true });
  }

  objectPath(hash) {
    assertHash(hash);
    return join(this.objectsDir, hash.slice(0, 2), hash);
  }

  has(hash) {
    return existsSync(this.objectPath(hash));
  }

  /** Idempotent: a second put of identical bytes writes nothing and reports created:false. */
  putBytes(bytes) {
    if (!Buffer.isBuffer(bytes)) throw new TypeError('putBytes expects a Buffer');
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (this.has(hash)) return { hash, byteLength: bytes.length, created: false };
    const temporary = this.#temporaryPath();
    writeFileSync(temporary, bytes);
    return { hash, byteLength: bytes.length, created: this.#commit(temporary, hash) };
  }

  /** Hashes while writing to a temp file, then renames into place or discards on a duplicate. */
  async putStream(readable) {
    const hasher = createHash('sha256');
    const temporary = this.#temporaryPath();
    const fd = openSync(temporary, 'w');
    let byteLength = 0;
    try {
      for await (const chunk of readable) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        hasher.update(buffer);
        writeSync(fd, buffer);
        byteLength += buffer.length;
      }
    } catch (error) {
      closeSync(fd);
      unlinkSync(temporary);
      throw error;
    }
    closeSync(fd);
    const hash = hasher.digest('hex');
    if (this.has(hash)) {
      unlinkSync(temporary);
      return { hash, byteLength, created: false };
    }
    return { hash, byteLength, created: this.#commit(temporary, hash) };
  }

  readStream(hash) {
    const path = this.objectPath(hash);
    if (!existsSync(path)) throw new Error(`object ${hash} is not in the store`);
    return createReadStream(path);
  }

  stat(hash) {
    const stats = statSync(this.objectPath(hash), { throwIfNoEntry: false });
    if (!stats) throw new Error(`object ${hash} is not in the store`);
    return { hash, byteLength: stats.size, modifiedAt: stats.mtime.toISOString() };
  }

  /** Recomputes the digest from disk and compares it with the address. */
  async verify(hash) {
    const hasher = createHash('sha256');
    let byteLength = 0;
    for await (const chunk of this.readStream(hash)) {
      hasher.update(chunk);
      byteLength += chunk.length;
    }
    const actual = hasher.digest('hex');
    return { ok: actual === hash, expected: hash, actual, byteLength };
  }

  /**
   * Pages through object hashes in lexical order. The cursor is opaque. Memory
   * is bounded by one shard directory listing plus one page; no whole-store scan.
   */
  list({ cursor = null, limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE) throw new RangeError(`limit must be an integer from 1 to ${MAX_PAGE}`);
    const after = cursor === null || cursor === undefined ? null : decodeCursor(cursor);
    const shards = readdirSync(this.objectsDir).filter((name) => SHARD.test(name)).sort();
    const hashes = [];
    for (const shard of shards) {
      if (after !== null && shard < after.slice(0, 2)) continue;
      // ponytail: one readdir per shard is the page unit; switch to opendir if a shard ever holds millions of objects.
      const names = readdirSync(join(this.objectsDir, shard)).filter((name) => HASH.test(name) && name.startsWith(shard)).sort();
      for (const name of names) {
        if (after !== null && name <= after) continue;
        hashes.push(name);
        if (hashes.length === limit) return { hashes, nextCursor: encodeCursor(name) };
      }
    }
    return { hashes, nextCursor: null };
  }

  #temporaryPath() {
    return join(this.tmpDir, `${randomBytes(12).toString('hex')}.tmp`);
  }

  /** Rename the temp file into place. If the object appeared meanwhile, keep the existing one. */
  #commit(temporary, hash) {
    const finalPath = this.objectPath(hash);
    mkdirSync(join(this.objectsDir, hash.slice(0, 2)), { recursive: true });
    if (existsSync(finalPath)) {
      unlinkSync(temporary);
      return false;
    }
    renameSync(temporary, finalPath);
    return true;
  }
}

function encodeCursor(hash) {
  return Buffer.from(hash, 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length === 0) throw new TypeError('invalid cursor');
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!HASH.test(decoded)) throw new TypeError('invalid cursor');
  return decoded;
}
