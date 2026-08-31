import { z } from 'zod';
import type { CherryErrorCode } from '../core/result.ts';
import type { ProductState } from '../mission/mission-state.ts';

export interface CherryToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface CherryToolAnnotations extends Record<string, unknown> {
  readOnlyHint: boolean;
  untrustedContentHint?: boolean;
  /** Explicit protocol metadata consumed by hosts and the inspector. */
  sideEffect?: 'none' | 'write' | 'execute' | 'export';
  requiresApproval?: boolean;
}

export interface CherryToolDefinition<I = unknown> {
  /** snake_case, 30 chars or fewer. */
  name: string;
  /** 500 chars or fewer, one responsibility, non-overlapping. */
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: CherryToolAnnotations;
  /** States in which this tool is registered. Empty = global. */
  states: ProductState[];
  zodSchema: z.ZodType<I>;
  execute(input: I, signal: AbortSignal): Promise<CherryToolResult>;
}

export const MAX_RESULT_CHARS = 1500;
export const HARD_CAP_BYTES = 8 * 1024;

const SECRET_PATTERN = /(rk_live_|sk_live_|gh[pousr]_|xox[baprs]-|Bearer\s+)[A-Za-z0-9._:-]+/gi;

function redact(value: string): string {
  return value.replace(SECRET_PATTERN, '[redacted]');
}

function safeDetailValue(value: unknown, depth = 0): unknown {
  if (depth > 2) return '[omitted]';
  if (typeof value === 'string') return redact(value).slice(0, 400);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((entry) => safeDetailValue(entry, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 8).map(([key, entry]) => [key.slice(0, 80), /token|secret|password|authorization|credential/i.test(key) ? '[redacted]' : safeDetailValue(entry, depth + 1)]));
  }
  return String(value).slice(0, 200);
}

/** Truncate by encoded UTF-8 bytes, never by UTF-16 code units. */
function capUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) return value;
  const suffix = '… (truncated; use a read tool with an id for details)';
  const suffixBytes = encoder.encode(suffix).length;
  const target = Math.max(0, maxBytes - suffixBytes);
  let output = '';
  for (const character of value) {
    const candidate = output + character;
    if (encoder.encode(candidate).length > target) break;
    output = candidate;
  }
  return `${output}${suffix}`;
}

export function toolText(payload: unknown): CherryToolResult {
  let text = redact(typeof payload === 'string' ? payload : JSON.stringify(payload) ?? String(payload));
  if (text.length > MAX_RESULT_CHARS) {
    text = `${text.slice(0, MAX_RESULT_CHARS)}… (truncated; use a read tool with an id for details)`;
  }
  text = capUtf8(text, HARD_CAP_BYTES);
  return { content: [{ type: 'text', text }] };
}

export function toolError(code: CherryErrorCode, message: string, details?: Record<string, unknown>): CherryToolResult {
  const safeDetails = details
    ? Object.fromEntries(
        Object.entries(details).slice(0, 8).map(([key, value]) => [
          key.slice(0, 80),
          /token|secret|password|authorization|credential/i.test(key) ? '[redacted]' : safeDetailValue(value),
        ]),
      )
    : undefined;
  const payload = { error: code, message: redact(message).slice(0, 800), ...(safeDetails && Object.keys(safeDetails).length > 0 ? { details: safeDetails } : {}) };
  return {
    content: [{ type: 'text', text: capUtf8(JSON.stringify(payload), HARD_CAP_BYTES) }],
    isError: true,
  };
}

/** Validate a postMessage origin against an explicit allowlist. */
export function validateOrigin(origin: unknown, allowedOrigins: readonly string[]): boolean {
  return typeof origin === 'string' && origin !== 'null' && allowedOrigins.includes(origin);
}

export interface CherryPostMessageEnvelope {
  type: 'cherry-webmcp';
  version: 1;
  requestId: string;
  payload: unknown;
}

/** Parse only the narrow, versioned envelope accepted by a Cherry bridge. */
export function validatePostMessageEnvelope(value: unknown): CherryPostMessageEnvelope | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== 'cherry-webmcp' || candidate.version !== 1 || typeof candidate.requestId !== 'string' || candidate.requestId.length < 1 || candidate.requestId.length > 120 || !('payload' in candidate)) return null;
  return candidate as unknown as CherryPostMessageEnvelope;
}

/**
 * Wraps a zod schema execution: arguments are re-validated at runtime even if
 * the host claims it validated them, and abort is honoured before starting.
 */
export function guarded<I>(
  schema: z.ZodType<I>,
  handler: (input: I, signal: AbortSignal) => Promise<CherryToolResult>,
): (input: unknown, signal: AbortSignal) => Promise<CherryToolResult> {
  return async (input, signal) => {
    if (signal.aborted) return toolError('temporary', 'Tool call was cancelled before it started');
    const parsed = schema.safeParse(input ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return toolError('validation', `Invalid arguments: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown issue'}`);
    }
    try {
      return await handler(parsed.data, signal);
    } catch (error) {
      return toolError('internal', (error as Error).message);
    }
  };
}

/** JSON Schema for tool registration; always additionalProperties:false. */
export function objectSchema(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}
