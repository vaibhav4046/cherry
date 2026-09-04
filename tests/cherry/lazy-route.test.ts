import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lazyRoute } from '../../src/app/lazy-route.ts';

/**
 * A deploy that lands under an open tab used to render a blank page: the next
 * navigation asked for a hashed chunk the server no longer had, the dynamic
 * import rejected, and nothing was shown. One reload fixes it, so one reload is
 * what happens. Exactly one, so a genuinely broken build reports its real error
 * instead of reloading forever.
 */

const RETRY_KEY = 'cherry.chunkReloadAt';

function payload() {
  return { default: (() => null) as unknown as React.ComponentType<unknown> };
}

/** Reach the loader React would call, without rendering anything. */
async function invoke(component: ReturnType<typeof lazyRoute>): Promise<unknown> {
  const inner = (component as unknown as { _payload: { _result: () => Promise<unknown> } })._payload;
  return inner._result();
}

describe('lazyRoute', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads normally and never touches storage on the happy path', async () => {
    await invoke(lazyRoute(async () => payload()));
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RETRY_KEY)).toBeNull();
  });

  it('reloads once when a chunk has gone missing under an open tab', async () => {
    const failing = lazyRoute(async () => {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/SkillDetail-abc.js');
    });
    await expect(invoke(failing)).rejects.toThrow(/dynamically imported/);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(Number(sessionStorage.getItem(RETRY_KEY))).toBeGreaterThan(0);
  });

  it('does not reload a second time, so a broken build shows its real error', async () => {
    sessionStorage.setItem(RETRY_KEY, String(Date.now()));
    const failing = lazyRoute(async () => {
      throw new Error('chunk still missing');
    });
    await expect(invoke(failing)).rejects.toThrow('chunk still missing');
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads again once the retry window has passed, for a later deploy', async () => {
    sessionStorage.setItem(RETRY_KEY, String(Date.now() - 60_000));
    const failing = lazyRoute(async () => {
      throw new Error('a different deploy, much later');
    });
    await expect(invoke(failing)).rejects.toThrow('a different deploy');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
