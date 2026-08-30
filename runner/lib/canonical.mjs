/**
 * Canonical JSON (stable sorted-key stringify, JCS-style) + hashing helpers.
 * The action hash of an execution envelope is SHA-256 hex over the canonical
 * JSON of the envelope with `actionHash` removed.
 */
import { createHash } from 'node:crypto';

export function canonicalize(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number');
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (type === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((item) => canonicalize(item === undefined ? null : item)).join(',') + ']';
  if (type === 'object') {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}';
  }
  throw new TypeError('cannot canonicalize ' + type);
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** SHA-256 hex over canonical JSON of the envelope minus `actionHash`. */
export function computeActionHash(envelope) {
  const clone = { ...envelope };
  delete clone.actionHash;
  return sha256Hex(canonicalize(clone));
}
