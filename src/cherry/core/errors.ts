import { fail, type Result } from './result.ts';

export function notFound<T>(entity: string, id: string): Result<T> {
  return fail<T>('not_found', `${entity} ${id} was not found`, { entity, id });
}

export function invalid<T>(message: string, details?: Record<string, unknown>): Result<T> {
  return fail<T>('validation', message, details);
}

export function conflict<T>(message: string, details?: Record<string, unknown>): Result<T> {
  return fail<T>('conflict', message, details);
}

export function approvalRequired<T>(message: string, details?: Record<string, unknown>): Result<T> {
  return fail<T>('approval_required', message, details);
}

export function unsupported<T>(message: string, details?: Record<string, unknown>): Result<T> {
  return fail<T>('unsupported', message, details);
}
