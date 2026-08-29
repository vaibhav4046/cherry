/**
 * Every domain service returns a Result. Protocol layers (UI, WebMCP, native MCP,
 * runner) translate the same structured failures instead of inventing their own.
 */
export type CherryErrorCode =
  | 'validation'
  | 'conflict'
  | 'approval_required'
  | 'not_found'
  | 'unsupported'
  | 'temporary'
  | 'internal';

export interface CherryFailure {
  readonly code: CherryErrorCode;
  readonly message: string;
  /** Machine-readable detail. Never contains secrets or raw untrusted documents. */
  readonly details?: Record<string, unknown>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: CherryFailure };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(
  code: CherryErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Result<T> {
  return details ? { ok: false, error: { code, message, details } } : { ok: false, error: { code, message } };
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new CherryError(result.error);
  }
  return result.value;
}

export class CherryError extends Error {
  readonly code: CherryErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(failure: CherryFailure) {
    super(failure.message);
    this.name = 'CherryError';
    this.code = failure.code;
    this.details = failure.details;
  }
}

export function toFailure(error: unknown, fallback: CherryErrorCode = 'internal'): CherryFailure {
  if (error instanceof CherryError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof Error) {
    return { code: fallback, message: error.message };
  }
  return { code: fallback, message: String(error) };
}
