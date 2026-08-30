import type { CherryToolDefinition } from './tool-contract.ts';
import { buildToolDefinitions, GLOBAL_TOOLS, TOOL_STATE_TABLE, type ToolContext } from './tool-definitions.ts';
import type { ProductState } from '../mission/mission-state.ts';

/** Minimal typing of the experimental WebMCP browser API. */
interface ModelContextToolRegistration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown>;
}

interface ModelContext {
  registerTool: (tool: ModelContextToolRegistration, options?: { signal?: AbortSignal }) => unknown;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export interface RegisteredToolInfo {
  name: string;
  description: string;
  readOnly: boolean;
  untrustedContent: boolean;
}

/** One real tool invocation, recorded at execution time. Session-local. */
export interface ToolCallLogEntry {
  name: string;
  at: string;
  ok: boolean;
  /** First characters of the (already size-capped) result text. */
  resultPreview: string;
  source: 'host' | 'local';
}

export interface WebMcpStatus {
  supported: boolean;
  registered: RegisteredToolInfo[];
  productState: ProductState;
  /** Tools retired by the most recent state change. */
  recentlyRemoved: string[];
  /** Most recent real tool calls, newest last (max 50). */
  recentCalls: ToolCallLogEntry[];
  /** The attached agent: auto-assigned whenever a WebMCP host is present. */
  agent: { attached: boolean; name: string | null };
}

type StatusListener = (status: WebMcpStatus) => void;

/**
 * Owns the WebMCP tool lifecycle: feature-detects document.modelContext,
 * registers global + state-specific tools, and aborts stale registrations when
 * the product state changes. Tools re-read persisted state at execution time —
 * definitions receive a context object, never captured snapshots.
 */
export class WebMcpRegistrationManager {
  private definitions: CherryToolDefinition[];
  private controller: AbortController | null = null;
  private currentState: ProductState | null = null;
  private listeners = new Set<StatusListener>();
  private registered: RegisteredToolInfo[] = [];
  private recentlyRemoved: string[] = [];
  private callLog: ToolCallLogEntry[] = [];
  private agentName: string | null = null;

  constructor(context: ToolContext) {
    context.setAgentName = (name: string) => {
      this.agentName = name;
      this.notify();
    };
    this.definitions = buildToolDefinitions(context);
  }

  get supported(): boolean {
    return typeof document !== 'undefined' && typeof document.modelContext?.registerTool === 'function';
  }

  status(): WebMcpStatus {
    return {
      supported: this.supported,
      registered: [...this.registered],
      productState: this.currentState ?? 'empty',
      recentlyRemoved: [...this.recentlyRemoved],
      recentCalls: [...this.callLog],
      agent: { attached: this.supported, name: this.agentName },
    };
  }

  /** Records a real invocation and derives ok from the tool result shape. */
  private logCall(name: string, result: unknown, source: ToolCallLogEntry['source']): void {
    const shaped = result as { isError?: boolean; content?: Array<{ text?: string }> } | undefined;
    this.callLog.push({
      name,
      at: new Date().toISOString(),
      ok: shaped?.isError !== true,
      resultPreview: (shaped?.content?.[0]?.text ?? '').slice(0, 160),
      source,
    });
    if (this.callLog.length > 50) this.callLog = this.callLog.slice(-50);
    this.notify();
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.status();
    for (const listener of this.listeners) listener(snapshot);
  }

  /** Returns the names that should be active for a state (aperture ≤ 5 + 2 global). */
  activeNamesFor(state: ProductState): string[] {
    const stateTools = TOOL_STATE_TABLE[state] ?? [];
    return [...GLOBAL_TOOLS, ...stateTools.slice(0, 5)];
  }

  /** Re-register tools for the given product state. Old registrations abort. */
  syncState(state: ProductState): void {
    if (state === this.currentState) return;
    const previousActive = this.currentState ? this.activeNamesFor(this.currentState) : [];
    this.currentState = state;
    const nextActive = new Set(this.activeNamesFor(state));
    this.recentlyRemoved = previousActive.filter((name) => !nextActive.has(name));
    this.registered = [];

    if (!this.supported) {
      this.notify();
      return;
    }

    // Abort previous registrations; in-flight executions may finish where the
    // browser supports it — new calls route to the new registration set.
    this.controller?.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;

    const active = new Set(this.activeNamesFor(state));
    for (const definition of this.definitions) {
      if (!active.has(definition.name)) continue;
      try {
        document.modelContext!.registerTool(
          {
            name: definition.name,
            description: definition.description,
            inputSchema: definition.inputSchema,
            annotations: definition.annotations,
            execute: async (input: unknown) => {
              const result = await definition.execute(input, signal);
              this.logCall(definition.name, result, 'host');
              return result;
            },
          },
          { signal },
        );
        this.registered.push({
          name: definition.name,
          description: definition.description,
          readOnly: definition.annotations.readOnlyHint,
          untrustedContent: definition.annotations.untrustedContentHint === true,
        });
      } catch {
        // Registration failure on one tool must not break the app or other tools.
      }
    }
    this.notify();
  }

  /** Direct execution path used by unit tests and the native bridge. */
  async executeLocal(name: string, input: unknown): Promise<unknown> {
    const definition = this.definitions.find((candidate) => candidate.name === name);
    if (!definition) throw new Error(`Unknown tool ${name}`);
    const controller = new AbortController();
    const result = await definition.execute(input, controller.signal);
    this.logCall(name, result, 'local');
    return result;
  }

  listDefinitions(): CherryToolDefinition[] {
    return [...this.definitions];
  }

  dispose(): void {
    this.controller?.abort();
    this.controller = null;
    this.registered = [];
    this.recentlyRemoved = [];
    this.callLog = [];
    this.listeners.clear();
  }
}
