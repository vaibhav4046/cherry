type PresentListener = (path: string) => void;

let listener: PresentListener | null = null;
let queued: string | null = null;

/**
 * A one-way channel from a tool call to Cherry's router.
 *
 * An agent that has just requested approval should be able to put that decision
 * on screen, and the decision screen lives behind a route. Going through a
 * module-level channel instead of calling useNavigate inside the app state
 * provider keeps the provider usable without a router, which several tests and
 * the embedded surfaces rely on.
 *
 * A request made before the router mounts is queued, so a tool call during boot
 * still lands. Only relative in-app paths are accepted: nothing here can send a
 * person to another origin.
 */
export function requestPresent(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) return;
  if (listener) listener(path);
  else queued = path;
}

export function onPresentRequest(next: PresentListener): () => void {
  listener = next;
  if (queued !== null) {
    const path = queued;
    queued = null;
    next(path);
  }
  return () => {
    if (listener === next) listener = null;
  };
}
