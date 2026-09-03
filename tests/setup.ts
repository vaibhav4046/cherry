import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { configure } from '@testing-library/react';
import { CherryDatabase, setDb } from '../src/cherry/persistence/cherry-db.ts';
import { resetClock } from '../src/cherry/core/clock.ts';

// Testing Library waits 1000ms by default for an async appearance. Vitest runs
// these files in parallel workers that compete for CPU, so a render which takes
// 200ms alone can exceed 1000ms in a full run - which surfaced as findBy
// failures that always passed when the file was run on its own. Waiting longer
// costs nothing when the element appears promptly; it only removes a false
// failure. Nothing here weakens an assertion.
configure({ asyncUtilTimeout: 5000 });

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
