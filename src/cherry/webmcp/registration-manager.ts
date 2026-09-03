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
  /** The attached agent: attached once a host has called a tool or introduced itself; the name comes from introduce_agent. */
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
  sources: ['empty', 'onboarding', 'learning', 'planning', 'execution', 'verification', 'passed'],
  // Mission Control works from the first visit: create_outcome_mission creates the space when none exists.
  control: ['empty', 'onboarding', 'learning', 'planning', 'execution', 'verification', 'passed'],
};

const ALL_PRODUCT_STATES: ProductState[] = ['empty', 'onboarding', 'learning', 'planning', 'execution', 'verification', 'passed'];

function surfaceForTool(name: string): ToolSurface {
  const resolved = Object.entries(SAFE_TOOL_NAME_ALIASES).find(([, legacy]) => legacy === name)?.[0] ?? name;
  for (const surface of ['inbox', 'crew', 'routines', 'run', 'sources', 'control'] as const) {
    if (TOOL_SURFACE_TABLE[surface].includes(resolved)) return surface;
  }
  return 'default';
}

const GLOBAL_TOOL_SET: ReadonlySet<string> = new Set(GLOBAL_TOOLS);

/** One live host registration: its own abort handle plus the inspector row. */
interface LiveRegistration {
  controller: AbortController;
  info: RegisteredToolInfo;
}

function infoFor(definition: CherryToolDefinition): RegisteredToolInfo {
  return {
    name: definition.name,
    description: definition.description,
    readOnly: definition.annotations.readOnlyHint,
    untrustedContent: definition.annotations.untrustedContentHint === true,
    sideEffect: definition.annotations.sideEffect ?? (definition.annotations.readOnlyHint ? 'none' : 'write'),
    requiresApproval: definition.annotations.requiresApproval === true,
    allowedStates: definition.states.length > 0 ? [...definition.states] : [...ALL_PRODUCT_STATES],
    surface: surfaceForTool(definition.name),
  };
}

/**
 * Owns the WebMCP tool lifecycle: feature-detects document.modelContext,
 * registers the global tools once under a long-lived AbortController, and
 * diffs the contextual aperture on every state or surface change so only the
 * names that left are aborted and only the names that entered are registered.
 * A registration is never aborted while the host still awaits one of its
 * results. Tools re-read persisted state at execution time: definitions
 * receive a context object, never captured snapshots.
 */
export class WebMcpRegistrationManager {
  private definitions: CherryToolDefinition[];
  private globalController: AbortController | null = null;
  private live = new Map<string, LiveRegistration>();
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
  /** Host executions that have not returned their result yet. */
  private inFlight = 0;
  /** The aperture before a selection that was deferred behind an in-flight execution. */
  private pendingSelection: string[] | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

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
      // A host that merely exposes the API has not attached an agent; a real call or an introduction has.
      agent: { attached: this.supported && (this.agentName !== null || this.callLog.some((entry) => entry.source === 'host')), name: this.agentName },
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

  /** Route-driven surface selection; the contextual aperture is diffed when it changes. */
  setSurface(surface: ToolSurface): void {
    if (surface === this.currentSurface) return;
    const previous = this.activeNamesFor(this.currentState ?? 'empty', this.currentSurface);
    this.currentSurface = surface;
    this.applySelection(previous);
  }

  /** Select the tools for the given product state. Only registrations that left the aperture abort. */
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
    if (this.inFlight > 0) {
      // A host is still waiting for a result from one of these registrations.
      // Aborting it now could make the host discard that result, so the whole
      // selection waits until the call has returned; the earliest baseline wins.
      this.pendingSelection ??= previousActive;
      return;
    }
    // A deferred baseline describes what is actually live; consume it here.
    const baseline = this.pendingSelection ?? previousActive;
    this.pendingSelection = null;
    const state = this.currentState ?? 'empty';
    const nextActive = this.activeNamesFor(state, this.currentSurface);
    const nextSet = new Set(nextActive);
    const removed = baseline.filter((name) => !nextSet.has(name));
    // Keep legacy names in the inspector for hosts that still understand the
    // pre-canonical vocabulary, while registrations themselves stay canonical.
    this.recentlyRemoved = [...new Set(removed.flatMap((name) => {
      const legacy = Object.entries(SAFE_TOOL_NAME_ALIASES).find(([canonical]) => canonical === name)?.[1];
      return legacy ? [name, legacy] : [name];
    }))];

    if (!this.supported) {
      this.registered = [];
      this.diagnostics = [{ code: 'unsupported', message: 'This browser does not expose document.modelContext; manual mode remains available.' }];
      this.notify();
      return;
    }

    // Globals register once and stay live until dispose(); a failed one is retried here.
    this.globalController ??= new AbortController();
    for (const name of GLOBAL_TOOLS) {
      if (!this.live.has(name)) this.register(name, this.globalController);
    }

    // Contextual tools: retire only the names that left the aperture, then
    // register only the names that entered it, so the live set never exceeds it.
    for (const [name, entry] of [...this.live]) {
      if (!GLOBAL_TOOL_SET.has(name) && !nextSet.has(name)) {
        this.live.delete(name);
        entry.controller.abort();
      }
    }
    for (const name of nextActive) {
      if (!GLOBAL_TOOL_SET.has(name) && !this.live.has(name)) this.register(name, new AbortController());
    }

    this.registered = nextActive.flatMap((name) => {
      const entry = this.live.get(name);
      return entry ? [entry.info] : [];
    });
    // Registration failure on one tool must not break the app or other tools;
    // expose only a bounded, non-payload diagnostic to the UI.
    this.diagnostics = nextActive
      .filter((name) => !this.live.has(name))
      .map((name) => ({ code: 'registration_failed', tool: name, message: `Could not register ${name}.` }));
    this.notify();
  }

  /** Register one definition with the host under the given controller; failures leave it out of the live set. */
  private register(name: string, controller: AbortController): void {
    const definition = this.definitions.find((candidate) => candidate.name === name);
    if (!definition) return;
    const { signal } = controller;
    try {
      const registration = document.modelContext!.registerTool(
        {
          name: definition.name,
          description: definition.description,
          inputSchema: definition.inputSchema,
          annotations: definition.annotations,
          execute: (input: unknown) => this.executeRegistered(definition, signal, input),
        },
        { signal },
      );
      this.live.set(name, { controller, info: infoFor(definition) });
      if (registration && typeof (registration as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(registration).catch(() => {
          if (this.live.get(name)?.controller !== controller) return;
          this.live.delete(name);
          this.registered = this.registered.filter((entry) => entry.name !== name);
          this.diagnostics.push({ code: 'registration_failed', tool: name, message: `Could not register ${name}.` });
          this.notify();
        });
      }
    } catch {
      // Reported through the diagnostics rebuilt by applySelection.
    }
  }

  /** The host-facing closure of one registration. */
  private async executeRegistered(definition: CherryToolDefinition, signal: AbortSignal, input: unknown): Promise<unknown> {
    this.inFlight += 1;
    try {
      // AbortController is advisory in some hosts. A retired closure refuses
      // instead of mutating after a transition; so does a live one whose name
      // has since left the aperture.
      if (signal.aborted || !this.activeNamesFor(this.currentState ?? 'empty', this.currentSurface).includes(definition.name)) {
        const refused = toolError('conflict', 'This tool is no longer active for the current Cherry state or surface.', { tool: definition.name });
        this.logCall(definition.name, refused, 'host');
        return refused;
      }
      const result = await definition.execute(input, signal);
      this.logCall(definition.name, result, 'host');
      return result;
    } finally {
      this.inFlight -= 1;
      if (this.inFlight === 0 && this.pendingSelection !== null) this.scheduleFlush();
    }
  }

  /** Apply a deferred selection once the host has received every pending result (a macrotask later). */
  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.pendingSelection !== null) this.applySelection(this.pendingSelection);
    }, 0);
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
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.pendingSelection = null;
    for (const entry of this.live.values()) entry.controller.abort();
    this.live.clear();
    this.globalController?.abort();
    this.globalController = null;
    this.registered = [];
    this.recentlyRemoved = [];
    this.callLog = [];
    this.diagnostics = [];
    this.listeners.clear();
  }
}
