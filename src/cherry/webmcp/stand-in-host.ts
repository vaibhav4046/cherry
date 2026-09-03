/**
 * An opt-in stand-in for a WebMCP host, for inspecting Cherry's tool surface in
 * an ordinary browser.
 *
 * Cherry feature-detects `document.modelContext` once, at boot. That means a
 * shim pasted into the console after the page has loaded can never register
 * anything: by the time it exists, the decision has been made. So the only
 * honest way to let someone watch the registrations happen is to install the
 * stand-in *before* the app boots, which is what this does.
 *
 * It is off unless explicitly requested for the current tab, it never runs when
 * a real host is present, and it adds no capability: it stores the registrations
 * Cherry offers, honours the AbortSignal Cherry passes when a tool is retired,
 * and forwards calls to Cherry's own execute function. It cannot approve
 * anything, because no registered tool can.
 *
 * This is a stand-in, not a WebMCP client. It demonstrates that the
 * registrations and closures are real. It is NOT evidence that Cherry has run
 * inside a proprietary in-browser host, and `/compatibility` continues to hold
 * that row at Experimental.
 */

export const STAND_IN_HOST_FLAG = 'cherry.standInHost';

interface StandInTool {
  name: string;
  execute: (input: unknown) => unknown;
}

declare global {
  interface Window {
    cherryTools?: () => string[];
    cherryCall?: (name: string, input?: unknown) => unknown;
    cherryStandInHost?: boolean;
  }
}

export function installStandInHostIfRequested(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  let requested = false;
  try {
    requested = window.sessionStorage.getItem(STAND_IN_HOST_FLAG) === '1';
  } catch {
    // Private mode or blocked storage: treat as not requested.
    return false;
  }
  if (!requested) return false;

  // Never shadow a real host.
  const existing = (document as { modelContext?: { registerTool?: unknown } }).modelContext;
  if (typeof existing?.registerTool === 'function') return false;

  const tools = new Map<string, StandInTool>();

  (document as { modelContext?: unknown }).modelContext = {
    registerTool(tool: StandInTool, options?: { signal?: AbortSignal }) {
      tools.set(tool.name, tool);
      // A real host drops a tool when Cherry aborts its controller; mirroring
      // that is what makes the retirement diff in Agent View meaningful.
      options?.signal?.addEventListener('abort', () => { tools.delete(tool.name); });
      return { name: tool.name };
    },
  };

  window.cherryStandInHost = true;
  window.cherryTools = () => [...tools.keys()].sort();
  window.cherryCall = (name: string, input: unknown = {}) => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`${name} is not registered on this surface. Try cherryTools().`);
    return tool.execute(input);
  };

  return true;
}
