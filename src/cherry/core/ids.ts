/**
 * Identifiers are lexicographically sortable, collision-resistant, and match the
 * canonical schema pattern ^[A-Za-z0-9][A-Za-z0-9._:-]*$ (no underscores).
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function encodeTime(now: number): string {
  let time = now;
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out = ALPHABET[time % 32]! + out;
    time = Math.floor(time / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = randomBytes(16);
  let out = '';
  for (const byte of bytes) {
    out += ALPHABET[byte % 32]!;
  }
  return out;
}

/** ULID-compatible monotonic-ish identifier. */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

export type IdPrefix =
  | 'ws'
  | 'ms'
  | 'tk'
  | 'ls'
  | 'seg'
  | 'obs'
  | 'ev'
  | 'sg'
  | 'sv'
  | 'mem'
  | 'ap'
  | 'as'
  | 'af'
  | 'run'
  | 'pe'
  | 'rc'
  | 'job'
  | 'vr'
  | 'ag'
  | 'cw'
  | 'wk'
  | 'wm'
  | 'ho'
  | 'rt'
  | 'hf'
  | 'src'
  | 'pl'
  | 'er'
  | 'ai'
  | 'cb';

export function newId(prefix: IdPrefix, now?: number): string {
  return `${prefix}-${ulid(now)}`;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 160 && ID_PATTERN.test(value);
}
