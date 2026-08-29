import { z } from 'zod';
import type { CherryErrorCode } from '../core/result.ts';
import type { ProductState } from '../mission/mission-state.ts';

export interface CherryToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface CherryToolDefinition<I = unknown> {
  /** snake_case, 30 chars or fewer. */
  name: string;
  /** 500 chars or fewer, one responsibility, non-overlapping. */
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint?: boolean;
  };
  /** States in which this tool is registered. Empty = global. */
  states: ProductState[];
  zodSchema: z.ZodType<I>;
  execute(input: I, signal: AbortSignal): Promise<CherryToolResult>;
}

const MAX_RESULT_CHARS = 1500;
const HARD_CAP_BYTES = 8 * 1024;

export function toolText(payload: unknown): CherryToolResult {
  let text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (text.length > MAX_RESULT_CHARS) {
    text = `${text.slice(0, MAX_RESULT_CHARS)}… (truncated; use a read tool with an id for details)`;
  }
  const encoder = new TextEncoder();
  if (encoder.encode(text).length > HARD_CAP_BYTES) {
    text = text.slice(0, 2000);
  }
  return { content: [{ type: 'text', text }] };
}

export function toolError(code: CherryErrorCode, message: string): CherryToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: code, message: message.slice(0, 800) }) }],
    isError: true,
  };
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
