# Scale design (architecture, not measured capacity)

This document describes how Cherry's storage boundary can grow. It makes no capacity claim. The
only measured numbers live in `docs/release/GOD_MODE_SCALE_REPORT.md` when GOD-11 runs.

## Today

Browser state is Dexie (IndexedDB) with versioned migrations and hash-verified export/import. The
runner keeps JSON files for jobs, scheduler state and a hash-chained JSONL events log.

## Content-addressed artifact store (runner, P1)

```text
.cherry/
  objects/sha256/<aa>/<full-hash>     immutable blobs, atomic write (temp + rename), dedupe by hash
  metadata/                           JSONL records referencing blobs by hash
  events/                             append-only, hash-chained
  missions/                           mission run records
  sandboxes/                          lease records
  indexes/                            lexical and cursor indexes, rebuildable
```

Records reference immutable content by hash. No full-table `getAll` on scale-critical paths:
cursor pagination, bounded batches, streaming reads and writes, incremental indexes, partition keys
(workspace, mission), cancellation.

## Path to a distributed backend (P2)

SQLite for local metadata; object storage for blobs; lexical, vector and graph indexes; append-only
event store; queue broker; remote worker pool; multi-tenant isolation by workspace; retention and
garbage collection as a separate policy-controlled operation; migration from local CAS and Dexie by
export, re-hash and verify.

Everything in this section is DESIGNED. "Billions of artifacts" is a forbidden claim.
