/**
 * RFC 8785 (JCS) canonicalisation.
 *
 * Proof receipts, workspace exports, and skill bundles are hashed from this
 * representation so an independent verifier can recompute the same digest.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function serializeString(value: string): string {
  // JSON.stringify already implements the RFC 8785 string production for the
  // escape set (\", \, \b, \f, \n, \r, \t and \u00xx control characters).
  return JSON.stringify(value);
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError('Canonical JSON cannot encode NaN or Infinity');
  }
  if (Object.is(value, -0)) {
    return '0';
  }
  return String(value);
}

/** Sort object member names by UTF-16 code unit, as required by RFC 8785. */
function sortKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') return serializeNumber(value as number);
  if (type === 'string') return serializeString(value as string);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item === undefined ? null : item)).join(',')}]`;
  }
  if (type === 'object') {
    const record = value as Record<string, unknown>;
    const keys = sortKeys(Object.keys(record).filter((key) => record[key] !== undefined));
    return `{${keys.map((key) => `${serializeString(key)}:${canonicalize(record[key])}`).join(',')}}`;
  }
  throw new TypeError(`Canonical JSON cannot encode value of type ${type}`);
}

/** Remove keys (top-level dotted paths) before canonicalisation, e.g. a self-referential hash. */
export function omitPaths<T extends Record<string, unknown>>(value: T, paths: readonly string[]): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...value };
  for (const path of paths) {
    const segments = path.split('.');
    let cursor: Record<string, unknown> | undefined = clone;
    for (let i = 0; i < segments.length - 1 && cursor; i += 1) {
      const next = cursor[segments[i]!];
      if (next && typeof next === 'object' && !Array.isArray(next)) {
        cursor[segments[i]!] = { ...(next as Record<string, unknown>) };
        cursor = cursor[segments[i]!] as Record<string, unknown>;
      } else {
        cursor = undefined;
      }
    }
    if (cursor) {
      delete cursor[segments[segments.length - 1]!];
    }
  }
  return clone;
}
