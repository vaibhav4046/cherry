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

export interface WebMcpStatus {
  supported: boolean;
  registered: RegisteredToolInfo[];
  productState: ProductState;
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

  constructor(context: ToolContext) {
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
    };
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
    this.currentState = state;
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
            execute: async (input: unknown) => definition.execute(input, signal),
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
    return definition.execute(input, controller.signal);
  }

  listDefinitions(): CherryToolDefinition[] {
    return [...this.definitions];
  }

  dispose(): void {
    this.controller?.abort();
    this.controller = null;
    this.registered = [];
    this.listeners.clear();
  }
}
