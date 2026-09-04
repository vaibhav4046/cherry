import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { guarded, objectSchema } from '../../src/cherry/webmcp/tool-contract.ts';

/**
 * Every Cherry tool advertises `additionalProperties: false` to the host, but a
 * plain `z.object()` strips unknown keys instead of rejecting them, so the
 * published contract and the runtime disagreed.
 *
 * A live ChatGPT host found this by sending `{"humanApproved": true}` to
 * get_skill: it was accepted and ignored. Nothing was approved, and the
 * approval path was never reachable that way, but silence is the wrong answer
 * to approval-shaped input. An agent that sends it must be told no, not left to
 * assume it worked.
 */
const never = async () => {
  throw new Error('handler must not run when validation fails');
};

const liveSignal = () => new AbortController().signal;

describe('tool input strictness', () => {
  it('rejects an approval-shaped property instead of silently dropping it', async () => {
    const run = guarded(z.object({ skillId: z.string().min(1) }), never);
    const result = await run({ skillId: 'sg-1', humanApproved: true }, liveSignal());

    const text = JSON.stringify(result);
    expect(text).toContain('validation');
    expect(text.toLowerCase()).toContain('unrecognized');
  });

  it('still accepts exactly the declared shape', async () => {
    const run = guarded(z.object({ skillId: z.string().min(1) }), async (input) => ({
      content: [{ type: 'text' as const, text: input.skillId }],
    }));
    const result = await run({ skillId: 'sg-1' }, liveSignal());
    expect(JSON.stringify(result)).toContain('sg-1');
  });

  it('rejects any unknown key, not just approval-flavoured ones', async () => {
    const run = guarded(z.object({ task: z.string() }), never);
    const result = await run({ task: 'x', limit: 3, debug: 'on' }, liveSignal());
    expect(JSON.stringify(result)).toContain('validation');
  });

  it('keeps enforcing the declared types and bounds', async () => {
    const run = guarded(z.object({ limit: z.number().int().min(1).max(5) }), never);
    expect(JSON.stringify(await run({ limit: 9 }, liveSignal()))).toContain('validation');
    expect(JSON.stringify(await run({ limit: 'three' }, liveSignal()))).toContain('validation');
  });

  it('still treats a missing payload as an empty object for no-argument tools', async () => {
    // Hosts send undefined for tools that take nothing; that must stay valid.
    const run = guarded(z.object({}), async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }));
    expect(JSON.stringify(await run(undefined, liveSignal()))).toContain('ok');
  });

  it('advertises the same rule it now enforces', () => {
    expect(objectSchema({ skillId: { type: 'string' } }, ['skillId'])).toMatchObject({
      additionalProperties: false,
    });
  });
});
