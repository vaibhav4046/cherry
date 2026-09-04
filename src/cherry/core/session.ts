import { newId } from './ids.ts';

const SESSION_KEY = 'cherry.decisionSessionId';

let memorySessionId: string | null = null;

/**
 * A stable identifier for the browser session that is making decisions.
 *
 * An approval record already names who decided and when. That is enough to read
 * the ledger, but not enough to tell two decisions made in different tabs or on
 * different days apart, which is exactly what an auditor asks about a security
 * boundary. The value identifies the session, not the person: Cherry has no
 * account system and does not pretend to have one.
 *
 * It lives in sessionStorage so it survives a reload and dies with the tab.
 * When storage is blocked (private mode, an embedded host, a Node test) the id
 * is generated once in memory instead, so the field is never empty.
 */
export function decisionSessionId(): string {
  try {
    const stored = globalThis.sessionStorage?.getItem(SESSION_KEY);
    if (stored) return stored;
    const created = newId('ds');
    globalThis.sessionStorage?.setItem(SESSION_KEY, created);
    return created;
  } catch {
    memorySessionId ??= newId('ds');
    return memorySessionId;
  }
}
