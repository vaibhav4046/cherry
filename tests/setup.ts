import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { CherryDatabase, setDb } from '../src/cherry/persistence/cherry-db.ts';
import { resetClock } from '../src/cherry/core/clock.ts';

let counter = 0;

// Every test file gets fresh isolated databases via freshDb().
export function freshDb(): CherryDatabase {
  counter += 1;
  const db = new CherryDatabase(`cherry-test-${Date.now()}-${counter}`);
  setDb(db);
  return db;
}

afterEach(() => {
  resetClock();
});
