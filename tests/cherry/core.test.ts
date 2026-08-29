import { describe, expect, it } from 'vitest';
import { canonicalize, omitPaths } from '../../src/cherry/core/canonical-json.ts';
import { sha256Canonical, sha256CanonicalExcluding, sha256Text } from '../../src/cherry/core/hash.ts';
import { newId, isValidId, ulid } from '../../src/cherry/core/ids.ts';
import { canTransition, MISSION_TRANSITIONS, productStateForMission } from '../../src/cherry/mission/mission-state.ts';

describe('canonical JSON (RFC 8785)', () => {
  it('sorts object keys and drops undefined members', () => {
    expect(canonicalize({ b: 1, a: 2, c: undefined })).toBe('{"a":2,"b":1}');
  });

  it('serialises nested structures deterministically', () => {
    const value = { z: [3, 1, { b: true, a: null }], a: 'x' };
    expect(canonicalize(value)).toBe('{"a":"x","z":[3,1,{"a":null,"b":true}]}');
  });

  it('normalises -0 and rejects NaN', () => {
    expect(canonicalize(-0)).toBe('0');
    expect(() => canonicalize(Number.NaN)).toThrow();
  });

  it('escapes strings the way JSON.stringify does', () => {
    expect(canonicalize('a"b\n')).toBe('"a\\"b\\n"');
  });

  it('omitPaths removes a top-level and a nested path without mutating input', () => {
    const original = { keep: 1, drop: 2, nested: { keep: 3, drop: 4 } };
    const result = omitPaths(original, ['drop', 'nested.drop']);
    expect(result).toEqual({ keep: 1, nested: { keep: 3 } });
    expect(original.drop).toBe(2);
    expect(original.nested.drop).toBe(4);
  });
});

describe('hashing', () => {
  it('produces the known SHA-256 of "abc"', async () => {
    expect(await sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is stable across key order', async () => {
    expect(await sha256Canonical({ a: 1, b: 2 })).toBe(await sha256Canonical({ b: 2, a: 1 }));
  });

  it('changes when excluded field is included', async () => {
    const record = { data: 'x', receiptHash: 'deadbeef' };
    const excluded = await sha256CanonicalExcluding(record, ['receiptHash']);
    const included = await sha256Canonical(record);
    expect(excluded).not.toBe(included);
    expect(excluded).toBe(await sha256Canonical({ data: 'x' }));
  });
});

describe('identifiers', () => {
  it('generates schema-compatible prefixed ids', () => {
    const id = newId('ws');
    expect(isValidId(id)).toBe(true);
    expect(id.startsWith('ws-')).toBe(true);
  });

  it('ulid time component sorts chronologically', () => {
    const early = ulid(1000000);
    const late = ulid(2000000000);
    expect(early.slice(0, 10) < late.slice(0, 10)).toBe(true);
  });

  it('rejects invalid ids', () => {
    expect(isValidId('')).toBe(false);
    expect(isValidId('-leading-dash')).toBe(false);
    expect(isValidId('has space')).toBe(false);
    expect(isValidId('a'.repeat(161))).toBe(false);
  });
});

describe('mission state machine', () => {
  it('allows the golden path', () => {
    const path = ['DRAFT', 'LEARNING', 'PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'VERIFYING', 'COMPLETE'] as const;
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransition(path[index]!, path[index + 1]!)).toBe(true);
    }
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('DRAFT', 'COMPLETE')).toBe(false);
    expect(canTransition('LEARNING', 'EXECUTING')).toBe(false);
    expect(canTransition('CANCELLED', 'DRAFT')).toBe(false);
    expect(canTransition('AWAITING_APPROVAL', 'COMPLETE')).toBe(false);
  });

  it('every state has a defined transition list', () => {
    for (const targets of Object.values(MISSION_TRANSITIONS)) {
      expect(Array.isArray(targets)).toBe(true);
    }
  });

  it('maps mission state to product state', () => {
    expect(productStateForMission(null, false)).toBe('empty');
    expect(productStateForMission(null, true)).toBe('onboarding');
    expect(productStateForMission('LEARNING', true)).toBe('learning');
    expect(productStateForMission('AWAITING_APPROVAL', true)).toBe('planning');
    expect(productStateForMission('COMPLETE', true)).toBe('passed');
  });
});
