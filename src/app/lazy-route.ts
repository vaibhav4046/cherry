import { lazy, type ComponentType } from 'react';

const RETRY_KEY = 'cherry.chunkReloadAt';
const RETRY_WINDOW_MS = 10_000;

/**
 * A route chunk that survives a deploy landing under an open tab.
 *
 * Every route here is code-split, so the chunk URL carries a content hash. When
 * a new build ships while someone has Cherry open, the next navigation asks for
 * a hashed file the server no longer has, the dynamic import rejects, and the
 * page renders nothing. The person sees a blank screen and has no idea a reload
 * would fix it.
 *
 * One reload does fix it, because the app shell is fetched network-first. So a
 * failed chunk import reloads once and then gives up: the timestamp guard means
 * a genuinely broken build shows the real error instead of reloading forever.
 */
export function lazyRoute<T extends ComponentType<unknown>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RETRY_KEY) ?? 0);
      } catch {
        // Storage blocked: fall through and rethrow rather than reload blind.
      }
      if (Date.now() - last > RETRY_WINDOW_MS) {
        try {
          sessionStorage.setItem(RETRY_KEY, String(Date.now()));
          window.location.reload();
        } catch {
          // Nothing safe left to try; the error below is the honest outcome.
        }
      }
      throw error;
    }
  });
}
