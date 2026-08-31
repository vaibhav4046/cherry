import type { CherryToolDefinition } from './tool-contract.ts';
import { toolError } from './tool-contract.ts';
import { buildToolDefinitions, GLOBAL_TOOLS, SAFE_TOOL_NAME_ALIASES, TOOL_STATE_TABLE, type ToolContext } from './tool-definitions.ts';
import type { ProductState } from '../mission/mission-state.ts';
import { TOOL_SURFACE_TABLE, type ToolSurface } from './workforce-tools.ts';

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
  sideEffect: 'none' | 'write' | 'execute' | 'export';
  requiresApproval: boolean;
  allowedStates: ProductState[];
  surface: ToolSurface;
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
  /** Route-driven tool surface currently selected. */
  surface: ToolSurface;
  /** Registration/runtime diagnostics safe to render in the UI. */
  diagnostics: Array<{ code: 'registration_failed' | 'unsupported'; message: string; tool?: string }>;
}

type StatusListener = (status: WebMcpStatus) => void;

/** Route surfaces are intentionally state-independent: their domain services
 * return a safe conflict when no workspace/approval exists. Keeping the
 * allowlist explicit makes the route × state intersection auditable. */
const SURFACE_STATES: Record<Exclude<ToolSurface, 'default'>, ProductState[]> = {
  // A route surface is only open after a workspace exists. Routines require a
  // planned/approved workflow; run controls become available once learning is
  // underway. The global reads remain available in every state.
  inbox: ['onboarding', 'learning', 'planning', 'execution', 'verification', 'passed'],
  crew: ['onboarding', 'learning', 'planning', 'execution', 'verification', 'passed'],
  routines: ['planning', 'execution', 'verification', 'passed'],
  run: ['learning', 'planning', 'execution', 'verification', 'passed'],
};

const ALL_PRODUCT_STATES: ProductState[] = ['empty', 'onboarding', 'learning', 'planning', 'execution', 'verification', 'passed'];

function surfaceForTool(name: string): ToolSurface {
  const resolved = Object.entries(SAFE_TOOL_NAME_ALIASES).find(([, legacy]) => legacy === name)?.[0] ?? name;
  for (const surface of ['inbox', 'crew', 'routines', 'run'] as const) {
    if (TOOL_SURFACE_TABLE[surface].includes(resolved)) return surface;
  }
  return 'default';
}

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
  private currentSurface: ToolSurface = 'default';
  private diagnostics: WebMcpStatus['diagnostics'] = [];
  private currentWorkspaceId: string | null = null;
  private currentMissionId: string | null = null;
  private context: ToolContext;

  constructor(context: ToolContext) {
    this.context = context;
    context.setAgentName = (name: string) => {
      this.agentName = name;
      this.notify();
    };
    context.getActiveToolNames = () => this.activeNamesFor(this.currentState ?? 'empty', this.currentSurface);
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
      surface: this.currentSurface,
      diagnostics: [...this.diagnostics],
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

  /** Returns the names that should be active for a state (aperture ≤ 5 phase tools + the global set). */
  activeNamesFor(state: ProductState, surface: ToolSurface = 'default'): string[] {
    // Workforce surfaces are a second, route-scoped aperture. Their domain
    // services still enforce workspace/approval state, so they remain useful
    // while a mission is in any phase; the state table is used on the default
    // product surfaces. This keeps each route bounded to the narrow 5-tool
    // set while avoiding an unusable empty inbox during onboarding.
    const candidates = surface === 'default' || !SURFACE_STATES[surface].includes(state)
      ? (surface === 'default' ? (TOOL_STATE_TABLE[state] ?? []) : [])
      : (TOOL_SURFACE_TABLE[surface] ?? []);
    return [...GLOBAL_TOOLS, ...candidates.slice(0, 5)];
  }

  /** Route-driven surface selection; re-registers when it changes. */
  setSurface(surface: ToolSurface): void {
    if (surface === this.currentSurface) return;
    const previous = this.activeNamesFor(this.currentState ?? 'empty', this.currentSurface);
    this.currentSurface = surface;
    this.applySelection(previous);
  }

  /** Re-register tools for the given product state. Old registrations abort. */
  syncState(state: ProductState): void {
    const workspaceId = this.context.getActiveWorkspaceId() ?? null;
    const missionId = this.context.getActiveMissionId() ?? null;
    if (state === this.currentState && workspaceId === this.currentWorkspaceId && missionId === this.currentMissionId) return;
    const previousActive = this.currentState ? this.activeNamesFor(this.currentState, this.currentSurface) : [];
    this.currentState = state;
    this.currentWorkspaceId = workspaceId;
    this.currentMissionId = missionId;
    this.applySelection(previousActive);
  }

  private applySelection(previousActive: string[]): void {
    const state = this.currentState ?? 'empty';
    const nextActive = new Set(this.activeNamesFor(state, this.currentSurface));
    const removed = previousActive.filter((name) => !nextActive.has(name));
    // Keep legacy names in the inspector for hosts that still understand the
    // pre-canonical vocabulary, while registrations themselves stay canonical.
    this.recentlyRemoved = [...new Set(removed.flatMap((name) => {
      const legacy = Object.entries(SAFE_TOOL_NAME_ALIASES).find(([canonical]) => canonical === name)?.[1];
      return legacy ? [name, legacy] : [name];
    }))];
    this.registered = [];
    this.diagnostics = [];

    if (!this.supported) {
      this.diagnostics.push({ code: 'unsupported', message: 'This browser does not expose document.modelContext; manual mode remains available.' });
      this.notify();
      return;
    }

    // Abort previous registrations; in-flight executions may finish where the
    // browser supports it — new calls route to the new registration set.
    this.controller?.abort();
    this.controller = new AbortController();
    const { signal } = this.controller;
    const registrationWorkspaceId = this.currentWorkspaceId;
    const registrationMissionId = this.currentMissionId;

    const active = new Set(this.activeNamesFor(state, this.currentSurface));
    for (const definition of this.definitions) {
      if (!active.has(definition.name)) continue;
      try {
        const registration = document.modelContext!.registerTool(
          {
            name: definition.name,
            description: definition.description,
            inputSchema: definition.inputSchema,
            annotations: definition.annotations,
            execute: async (input: unknown) => {
              // AbortController is advisory in some hosts. Re-check the
              // aperture so a stale closure cannot mutate after a transition.
              const idsChanged = this.context.getActiveWorkspaceId() !== registrationWorkspaceId || this.context.getActiveMissionId() !== registrationMissionId;
              if (idsChanged || !this.activeNamesFor(this.currentState ?? 'empty', this.currentSurface).includes(definition.name)) {
                const refused = toolError('conflict', 'This tool is no longer active for the current Cherry state or surface.', { tool: definition.name });
                this.logCall(definition.name, refused, 'host');
                return refused;
              }
              const result = await definition.execute(input, signal);
              this.logCall(definition.name, result, 'host');
              return result;
            },
          },
          { signal },
        );
        if (registration && typeof (registration as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(registration).catch(() => {
            this.registered = this.registered.filter((entry) => entry.name !== definition.name);
            this.diagnostics.push({ code: 'registration_failed', tool: definition.name, message: `Could not register ${definition.name}.` });
            this.notify();
          });
        }
        this.registered.push({
          name: definition.name,
          description: definition.description,
          readOnly: definition.annotations.readOnlyHint,
          untrustedContent: definition.annotations.untrustedContentHint === true,
          sideEffect: definition.annotations.sideEffect ?? (definition.annotations.readOnlyHint ? 'none' : 'write'),
          requiresApproval: definition.annotations.requiresApproval === true,
          allowedStates: definition.states.length > 0 ? [...definition.states] : [...ALL_PRODUCT_STATES],
          surface: surfaceForTool(definition.name),
        });
      } catch {
        // Registration failure on one tool must not break the app or other tools;
        // expose only a bounded, non-payload diagnostic to the UI.
        this.diagnostics.push({ code: 'registration_failed', tool: definition.name, message: `Could not register ${definition.name}.` });
      }
    }
    this.notify();
  }

  /** Direct execution path used by unit tests and the native bridge. */
  async executeLocal(name: string, input: unknown): Promise<unknown> {
    const canonicalName = Object.entries(SAFE_TOOL_NAME_ALIASES).find(([, legacy]) => legacy === name)?.[0] ?? name;
    const definition = this.definitions.find((candidate) => candidate.name === canonicalName);
    if (!definition) throw new Error(`Unknown tool ${name}`);
    if (this.currentState !== null && !this.activeNamesFor(this.currentState, this.currentSurface).includes(canonicalName)) {
      const refused = toolError('conflict', 'This tool is not active for the current Cherry state or surface.', { tool: name });
      this.logCall(name, refused, 'local');
      return refused;
    }
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
    this.diagnostics = [];
    this.listeners.clear();
  }
}
