import { afterEach, describe, expect, it, vi } from 'vitest';
import { installStandInHostIfRequested, STAND_IN_HOST_FLAG } from '../../src/cherry/webmcp/stand-in-host.ts';

type MutableDocument = { modelContext?: unknown };

function clearHost(): void {
  delete (document as MutableDocument).modelContext;
  delete window.cherryTools;
  delete window.cherryCall;
  delete window.cherryStandInHost;
  sessionStorage.removeItem(STAND_IN_HOST_FLAG);
}

describe('WebMCP stand-in host', () => {
  afterEach(() => {
    clearHost();
    vi.restoreAllMocks();
  });

  it('stays off unless this tab explicitly asked for it', () => {
    expect(installStandInHostIfRequested()).toBe(false);
    expect((document as MutableDocument).modelContext).toBeUndefined();
    expect(window.cherryTools).toBeUndefined();
  });

  it('never shadows a real host', () => {
    sessionStorage.setItem(STAND_IN_HOST_FLAG, '1');
    const realHost = { registerTool: () => ({ name: 'real' }) };
    (document as MutableDocument).modelContext = realHost;

    expect(installStandInHostIfRequested()).toBe(false);
    expect((document as MutableDocument).modelContext).toBe(realHost);
  });

  it('registers what Cherry offers and forwards calls to Cherry own execute function', async () => {
    sessionStorage.setItem(STAND_IN_HOST_FLAG, '1');
    expect(installStandInHostIfRequested()).toBe(true);

    const host = (document as MutableDocument).modelContext as {
      registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => unknown;
    };
    const execute = vi.fn(async (input: unknown) => ({ echoed: input }));
    host.registerTool({ name: 'read_cherry_context', execute });

    expect(window.cherryTools?.()).toEqual(['read_cherry_context']);
    await expect(window.cherryCall?.('read_cherry_context', { a: 1 })).resolves.toEqual({ echoed: { a: 1 } });
    expect(execute).toHaveBeenCalledWith({ a: 1 });
  });

  it('drops a tool when Cherry retires it, so the aperture stays honest', () => {
    sessionStorage.setItem(STAND_IN_HOST_FLAG, '1');
    installStandInHostIfRequested();
    const host = (document as MutableDocument).modelContext as {
      registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => unknown;
    };

    const controller = new AbortController();
    host.registerTool({ name: 'create_mission', execute: () => null }, { signal: controller.signal });
    expect(window.cherryTools?.()).toContain('create_mission');

    controller.abort();
    expect(window.cherryTools?.()).not.toContain('create_mission');
    expect(() => window.cherryCall?.('create_mission')).toThrow(/not registered on this surface/);
  });
});
