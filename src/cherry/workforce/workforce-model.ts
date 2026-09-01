/**
 * Workforce domain contracts — Cherry Workforce v2.
 * Pure types + pure functions (state machine, schedule math). No I/O here:
 * persistence lives in workforce-service, protocol in webmcp. These modules
 * are the source of truth, not React or tool code.
 */

// ---------------- Capabilities & hosts ----------------

export type ExecutionHostKind =
  | 'attached-webmcp'
  | 'local-runner'
  | 'codex-cli'
  | 'claude-cli'
  | 'codex-automation-export'
  | 'manual';

export const RUNTIME_CAPABILITIES = [
  'page_tools',
  'repository_read',
  'repository_write',
  'command_execution',
  'browser_vision',
  'browser_control',
  'background',
  'schedule',
  'network',
  'human_approval',
  'artifact_write',
  'verification',
] as const;

export type RuntimeCapability = (typeof RUNTIME_CAPABILITIES)[number];

export interface ExecutionHost {
  id: string;
  workspaceId: string;
  kind: ExecutionHostKind;
  name: string;
  status: 'available' | 'offline' | 'unpaired' | 'degraded' | 'unknown';
  capabilities: RuntimeCapability[];
  lastSeenAt: string | null;
  publicConfig: Record<string, string | number | boolean>;
  revision: number;
}

/** A host can take a task only when it satisfies every required capability. */
export function hostSatisfies(host: ExecutionHost, required: readonly RuntimeCapability[]): boolean {
  return required.every((capability) => host.capabilities.includes(capability));
}

// ---------------- Agent profiles & crews ----------------

export interface AgentProfile {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  role: string;
  objective: string;
  instructions: string;
  executionHostId: string | null;
  allowedCapabilities: RuntimeCapability[];
  skillGraphIds: string[];
  memoryScopes: string[];
  maxParallelTasks: number;
  approvalMode: 'always' | 'risk_based' | 'routine_policy';
  /** A profile is a configuration, not a running model: 'working' requires a real lease. */
  status: 'idle' | 'working' | 'waiting' | 'offline' | 'error' | 'archived';
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface Crew {
  id: string;
  workspaceId: string;
  name: string;
  coordinatorAgentId: string;
  memberAgentIds: string[];
  maxConcurrentWorkItems: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** The editable, deletable starter crew. */
export const STARTER_CREW_TEMPLATE: ReadonlyArray<{ name: string; role: string; objective: string; capabilities: RuntimeCapability[] }> = [
  { name: 'Lead', role: 'coordinator', objective: 'Break work down, route tasks, surface what needs the human.', capabilities: ['page_tools'] },
  { name: 'Researcher', role: 'research', objective: 'Gather sources and evidence; everything lands untrusted.', capabilities: ['page_tools', 'browser_vision'] },
  { name: 'Designer', role: 'design', objective: 'Shape artifacts and interfaces from approved context.', capabilities: ['page_tools', 'artifact_write'] },
  { name: 'Builder', role: 'build', objective: 'Produce working artifacts inside the approved envelope.', capabilities: ['page_tools', 'artifact_write'] },
  { name: 'Verifier', role: 'verify', objective: 'Run deterministic checks; report failures honestly.', capabilities: ['page_tools', 'verification'] },
];

// ---------------- Work items ----------------

export type WorkItemStatus =
  | 'DRAFT'
  | 'READY'
  | 'QUEUED'
  | 'LEASED'
  | 'RUNNING'
  | 'WAITING_FOR_HUMAN'
  | 'WAITING_FOR_DEPENDENCY'
  | 'RETRYING'
  | 'VERIFYING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export interface WorkItem {
  id: string;
  workspaceId: string;
  missionId: string | null;
  parentWorkItemId: string | null;
  title: string;
  objective: string;
  definitionOfDone: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  riskLevel: 'low' | 'medium' | 'high';
  status: WorkItemStatus;
  assignedAgentIds: string[];
  crewId: string | null;
  dependencyIds: string[];
  requiredCapabilities: RuntimeCapability[];
  executionHostId: string | null;
  routineId: string | null;
  currentRunId: string | null;
  contextRefs: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkMessage {
  id: string;
  workspaceId: string;
  workItemId: string;
  actorType: 'human' | 'agent' | 'system' | 'runner';
  actorId: string | null;
  kind: 'message' | 'checkpoint' | 'question' | 'decision' | 'artifact' | 'result';
  body: string;
  referenceIds: string[];
  createdAt: string;
}

export interface HandoffRecord {
  id: string;
  workspaceId: string;
  workItemId: string;
  fromAgentId: string | null;
  toAgentId: string;
  reason: string;
  contextRefs: string[];
  status: 'proposed' | 'accepted' | 'rejected' | 'completed';
  createdAt: string;
  updatedAt: string;
}

/** The only legal transitions. SUCCEEDED and CANCELLED are terminal. */
export const WORK_ITEM_TRANSITIONS: Readonly<Record<WorkItemStatus, readonly WorkItemStatus[]>> = {
  DRAFT: ['READY'],
  READY: ['QUEUED', 'CANCELLED'],
  QUEUED: ['LEASED', 'CANCELLED'],
  LEASED: ['RUNNING', 'QUEUED', 'FAILED', 'CANCELLED'],
  RUNNING: ['WAITING_FOR_HUMAN', 'WAITING_FOR_DEPENDENCY', 'RETRYING', 'VERIFYING', 'FAILED', 'CANCELLED'],
  WAITING_FOR_HUMAN: ['QUEUED', 'CANCELLED'],
  WAITING_FOR_DEPENDENCY: ['QUEUED', 'CANCELLED'],
  RETRYING: ['QUEUED', 'FAILED', 'CANCELLED'],
  VERIFYING: ['SUCCEEDED', 'FAILED', 'RETRYING'],
  FAILED: ['QUEUED', 'CANCELLED'],
  SUCCEEDED: [],
  CANCELLED: [],
};

/** Human-facing status wording — plain words, no scheduler jargon. */
export const WORK_ITEM_STATUS_LABEL: Readonly<Record<WorkItemStatus, string>> = {
  DRAFT: 'DRAFT',
  READY: 'READY',
  QUEUED: 'QUEUED',
  LEASED: 'CLAIMED BY A HOST',
  RUNNING: 'RUNNING',
  WAITING_FOR_HUMAN: 'NEEDS YOU',
  WAITING_FOR_DEPENDENCY: 'WAITING ON ANOTHER TASK',
  RETRYING: 'RETRYING',
  VERIFYING: 'CHECKING THE WORK',
  SUCCEEDED: 'DONE',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

export function canTransition(from: WorkItemStatus, to: WorkItemStatus): boolean {
  return WORK_ITEM_TRANSITIONS[from].includes(to);
}

// ---------------- Schedules ----------------

export type ScheduleSpec =
  | { kind: 'manual' }
  | { kind: 'once'; runAt: string }
  | { kind: 'interval'; everyMinutes: number; startAt: string }
  | { kind: 'daily'; localTime: string; timeZone: string }
  | { kind: 'weekly'; weekdays: number[]; localTime: string; timeZone: string };

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 30 * 24 * 60;

const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Returns human-readable problems; empty array means the spec is valid. */
export function validateSchedule(spec: ScheduleSpec): string[] {
  const problems: string[] = [];
  switch (spec.kind) {
    case 'manual':
      break;
    case 'once':
      if (Number.isNaN(Date.parse(spec.runAt))) problems.push('once.runAt must be a valid ISO timestamp');
      break;
    case 'interval':
      if (!Number.isInteger(spec.everyMinutes)) problems.push('interval.everyMinutes must be an integer');
      else if (spec.everyMinutes < MIN_INTERVAL_MINUTES) problems.push(`interval must be at least ${MIN_INTERVAL_MINUTES} minutes`);
      else if (spec.everyMinutes > MAX_INTERVAL_MINUTES) problems.push('interval must be at most 30 days');
      if (Number.isNaN(Date.parse(spec.startAt))) problems.push('interval.startAt must be a valid ISO timestamp');
      break;
    case 'daily':
      if (!LOCAL_TIME_PATTERN.test(spec.localTime)) problems.push('daily.localTime must be HH:MM (24h)');
      if (!isValidTimeZone(spec.timeZone)) problems.push('daily.timeZone must be a valid IANA time zone');
      break;
    case 'weekly':
      if (!LOCAL_TIME_PATTERN.test(spec.localTime)) problems.push('weekly.localTime must be HH:MM (24h)');
      if (!isValidTimeZone(spec.timeZone)) problems.push('weekly.timeZone must be a valid IANA time zone');
      if (spec.weekdays.length === 0) problems.push('weekly.weekdays must not be empty');
      if (spec.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        problems.push('weekly.weekdays entries must be 0 (Sunday) through 6 (Saturday)');
      }
      break;
  }
  return problems;
}

/** Minutes that `timeZone`'s wall clock is ahead of UTC at the given instant. */
function offsetMinutesAt(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const wallMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((wallMs - utcMs) / 60000);
}

/**
 * UTC instant for a wall-clock date+time in a zone. DST-aware via the
 * standard two-pass offset correction; skipped wall times resolve to the
 * post-transition instant, which is the safe choice for schedules.
 */
function zonedInstant(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let pass = 0; pass < 2; pass += 1) {
    guess = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutesAt(guess, timeZone) * 60000;
  }
  return guess;
}

function zonedDateParts(utcMs: number, timeZone: string): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), weekday: weekdayIndex };
}

/**
 * Next run strictly after `fromIso`, or null (manual, or a once schedule in
 * the past). Deterministic and DST-aware for daily/weekly.
 */
export function nextRunAt(spec: ScheduleSpec, fromIso: string): string | null {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) throw new Error('nextRunAt: fromIso is not a valid timestamp');

  switch (spec.kind) {
    case 'manual':
      return null;
    case 'once': {
      const runAt = Date.parse(spec.runAt);
      return runAt > from ? new Date(runAt).toISOString() : null;
    }
    case 'interval': {
      const start = Date.parse(spec.startAt);
      const stepMs = spec.everyMinutes * 60000;
      if (start > from) return new Date(start).toISOString();
      const elapsed = from - start;
      const next = start + (Math.floor(elapsed / stepMs) + 1) * stepMs;
      return new Date(next).toISOString();
    }
    case 'daily':
    case 'weekly': {
      const [hourText, minuteText] = spec.localTime.split(':');
      const hour = Number(hourText);
      const minute = Number(minuteText);
      const weekdays = spec.kind === 'weekly' ? spec.weekdays : [0, 1, 2, 3, 4, 5, 6];
      // Walk day by day in the target zone; 9 days covers any weekday set + DST edges.
      for (let offset = 0; offset <= 9; offset += 1) {
        const probe = zonedDateParts(from + offset * 86400000, spec.timeZone);
        if (!weekdays.includes(probe.weekday)) continue;
        const instant = zonedInstant(probe.year, probe.month, probe.day, hour, minute, spec.timeZone);
        if (instant > from) return new Date(instant).toISOString();
      }
      return null;
    }
  }
}

// ---------------- Routines & envelopes ----------------

export interface Routine {
  id: string;
  workspaceId: string;
  name: string;
  skillGraphId: string;
  missionId?: string | null;
  skillGraphRevision: number;
  executionHostId: string;
  schedule: ScheduleSpec;
  missedRunPolicy: 'skip' | 'run_once_on_reconnect';
  enabled: boolean;
  approvalId: string | null;
  approvedActionHash: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionEnvelope {
  schemaVersion: 1;
  workspaceId: string;
  workItemId: string;
  workItemRevision: number;
  routineId: string | null;
  routineRevision: number | null;
  executionHostId: string;
  adapter: string;
  workingDirectory: string | null;
  boundedPrompt: string;
  contextRefs: string[];
  requiredCapabilities: RuntimeCapability[];
  allowedExecutables: string[];
  allowedOrigins: string[];
  sideEffects: string[];
  dataEgress: string[];
  verificationPlan: string[];
  idempotencyKey: string;
  approvalIntentId: string | null;
  actionHash: string;
  createdAt: string;
}

// ---------------- Attention ----------------

export interface AttentionItem {
  id: string;
  kind:
    | 'approval'
    | 'failed_run'
    | 'missing_host'
    | 'retries_exhausted'
    | 'stale_routine_approval'
    | 'memory_proposal'
    | 'verification_failure'
    | 'host_login_required'
    | 'waiting_for_human';
  title: string;
  objectType: string;
  objectId: string;
  /** Higher = more consequential. Used with age for honest ordering — never fake urgency. */
  consequence: number;
  createdAt: string;
}

export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => b.consequence - a.consequence || a.createdAt.localeCompare(b.createdAt));
}
