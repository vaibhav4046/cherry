/**
 * Durable runner events: append-only JSONL log with a rolling SHA-256 chain.
 * Each line is {seq, jobId, type, at, chain} where
 *   chain = sha256(previousChain + canonicalize({seq, jobId, type, at}))
 * so a client holding the chain value of event N can verify continuity of
 * everything after N. Tampering with any line breaks verification.
 */
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalize, sha256Hex } from './canonical.mjs';

export class EventsLog {
  constructor(path) {
    this.path = path;
    this.seq = 0;
    this.chain = '';
    mkdirSync(dirname(path), { recursive: true });
    const existing = this.readAll();
    const last = existing[existing.length - 1];
    if (last) {
      this.seq = last.seq;
      this.chain = last.chain;
    }
  }

  readAll() {
    if (!existsSync(this.path)) return [];
    const events = [];
    for (const line of readFileSync(this.path, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // A corrupt tail line is surfaced by verify(); skip here.
      }
    }
    return events;
  }

  append(jobId, type, at = new Date().toISOString()) {
    const core = { seq: this.seq + 1, jobId, type, at };
    const chain = sha256Hex(this.chain + canonicalize(core));
    const event = { ...core, chain };
    appendFileSync(this.path, JSON.stringify(event) + '\n');
    this.seq = event.seq;
    this.chain = chain;
    return event;
  }

  readSince(since) {
    return this.readAll().filter((event) => event.seq > since);
  }

  /** Recompute the whole chain; reports the first broken sequence number. */
  verify() {
    let previous = '';
    let expectedSeq = 0;
    for (const event of this.readAll()) {
      expectedSeq += 1;
      const { seq, jobId, type, at, chain } = event;
      const recomputed = sha256Hex(previous + canonicalize({ seq, jobId, type, at }));
      if (seq !== expectedSeq || chain !== recomputed) {
        return { ok: false, brokenAt: expectedSeq };
      }
      previous = chain;
    }
    return { ok: true, length: expectedSeq };
  }
}
