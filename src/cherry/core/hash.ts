import { canonicalize, omitPaths } from './canonical-json.ts';

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/** SHA-256 of arbitrary bytes. Uses the platform Web Crypto implementation. */
export async function sha256Bytes(data: Uint8Array | ArrayBuffer): Promise<string> {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  const buffer = new ArrayBuffer(view.byteLength);
  new Uint8Array(buffer).set(view);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return toHex(digest);
}

export async function sha256Text(text: string): Promise<string> {
  return sha256Bytes(encoder.encode(text));
}

/** SHA-256 of the RFC 8785 canonical form of a JSON value. */
export async function sha256Canonical(value: unknown): Promise<string> {
  return sha256Text(canonicalize(value));
}

/** Hash a record while excluding self-referential fields such as `receiptHash`. */
export async function sha256CanonicalExcluding(
  value: Record<string, unknown>,
  exclusions: readonly string[],
): Promise<string> {
  return sha256Canonical(omitPaths(value, exclusions));
}

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}
