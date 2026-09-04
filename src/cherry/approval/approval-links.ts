import type { ApprovalObjectType } from './approval-model.ts';

/**
 * Where a person goes to make one decision.
 *
 * An agent that requested approval needs to be able to point at the screen
 * without being able to act on it, so this builds a link into Cherry's own UI
 * and nothing else. Both parts are ids Cherry generated, so the path is safe by
 * construction: nothing here interpolates text a host or a transcript supplied.
 */
export function approvalPath(objectType: ApprovalObjectType, objectId: string, approvalId: string): string {
  const query = `?approval=${encodeURIComponent(approvalId)}`;
  if (objectType === 'skillgraph') return `/studio/skills/${encodeURIComponent(objectId)}${query}`;
  if (objectType === 'memory') return `/studio/memory${query}`;
  // Everything else is decided on the Command Center, which lists every
  // outstanding decision for the active space.
  return `/studio${query}`;
}

/**
 * The same path as an absolute URL when a browser origin exists, so a host can
 * render it as a link. Falls back to the path in Node, where there is no origin
 * to be honest about.
 */
export function approvalUrl(objectType: ApprovalObjectType, objectId: string, approvalId: string): string {
  const path = approvalPath(objectType, objectId, approvalId);
  const origin = typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : null;
  return origin && origin !== 'null' ? `${origin}${path}` : path;
}
