import type { Table } from 'dexie';
import { getDb, type CherryDatabase } from './cherry-db.ts';
import { newId } from '../core/ids.ts';
import { isoNow } from '../core/clock.ts';
import type { NewProofEvent, ProofEvent } from '../core/domain-event.ts';

export interface MutationContext {
  db: CherryDatabase;
  workspaceId: string;
  /** Queue a ProofEvent. Events are written in the same transaction as the mutation. */
  emit(event: NewProofEvent): void;
}

type StoreName = Extract<keyof CherryDatabase, string>;

function tablesFor(db: CherryDatabase, stores: readonly StoreName[]): Table<unknown, string>[] {
  const unique = new Set<StoreName>([...stores, 'proofEvents']);
  return [...unique].map((name) => db[name] as unknown as Table<unknown, string>);
}

function buildEvents(workspaceId: string, startSequence: number, queued: readonly NewProofEvent[]): ProofEvent[] {
  let sequence = startSequence;
  return queued.map((event) => {
    sequence += 1;
    const record: ProofEvent = {
      id: newId('pe'),
      workspaceId,
      sequence,
      type: event.type,
      actorType: event.actorType,
      occurredAt: isoNow(),
      objectType: event.objectType,
      objectId: event.objectId,
      summary: event.summary,
    };
    if (event.actorId) record.actorId = event.actorId;
    if (event.payload) record.payload = event.payload;
    return record;
  });
}

async function lastSequence(db: CherryDatabase, workspaceId: string): Promise<number> {
  const last = await db.proofEvents
    .where('[workspaceId+sequence]')
    .between([workspaceId, Number.NEGATIVE_INFINITY], [workspaceId, Number.POSITIVE_INFINITY])
    .last();
  return last ? last.sequence : 0;
}

/**
 * Runs a workspace mutation and its ProofEvents inside one IndexedDB
 * transaction. If the mutation throws, neither the state change nor the ledger
 * entry survives, so proof can never describe work that did not happen.
 *
 * Only Dexie operations may be awaited inside `work`: awaiting an unrelated
 * promise would let the IndexedDB transaction commit early.
 */
export async function withWorkspaceTx<T>(
  workspaceId: string,
  stores: readonly StoreName[],
  work: (ctx: MutationContext) => Promise<T>,
): Promise<T> {
  const db = getDb();
  const queued: NewProofEvent[] = [];
  const ctx: MutationContext = {
    db,
    workspaceId,
    emit(event) {
      queued.push(event);
    },
  };

  return db.transaction('rw', tablesFor(db, stores), async () => {
    const result = await work(ctx);
    if (queued.length > 0) {
      const start = await lastSequence(db, workspaceId);
      await db.proofEvents.bulkAdd(buildEvents(workspaceId, start, queued));
    }
    return result;
  });
}

/** Append ledger events outside a domain mutation (import, tool audit). */
export async function appendProofEvents(
  workspaceId: string,
  events: readonly NewProofEvent[],
): Promise<ProofEvent[]> {
  if (events.length === 0) return [];
  const db = getDb();
  return db.transaction('rw', db.proofEvents, async () => {
    const start = await lastSequence(db, workspaceId);
    const records = buildEvents(workspaceId, start, events);
    await db.proofEvents.bulkAdd(records);
    return records;
  });
}

export async function listProofEvents(workspaceId: string, limit?: number): Promise<ProofEvent[]> {
  const db = getDb();
  const all = await db.proofEvents
    .where('[workspaceId+sequence]')
    .between([workspaceId, Number.NEGATIVE_INFINITY], [workspaceId, Number.POSITIVE_INFINITY])
    .toArray();
  all.sort((a, b) => a.sequence - b.sequence);
  return typeof limit === 'number' ? all.slice(-limit) : all;
}
