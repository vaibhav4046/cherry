# Task 1 report — memory graph, policy, lifecycle, causal receipts

Status: COMPLETE (focused implementation and tests pass)

Commit hashes:
- 82395f6 — initial memory graph/policy/receipt hardening`n- 15cfbd1 — persisted graph relations and actor enforcement`n- 6f13100 — causal receipt expansion and deleted-memory redaction

Files changed:
- src/cherry/memory/memory-graph-model.ts
- src/cherry/memory/memory-graph.ts
- src/cherry/memory/memory-policy.ts
- src/cherry/memory/memory-service.ts
- src/cherry/proof/proof-model.ts
- src/cherry/proof/proof-service.ts
- src/cherry/core/domain-event.ts
- schemas/cherry-proof.schema.json
- tests/cherry/memory-graph.test.ts
- tests/cherry/memory.test.ts

Tests run/results:
- npm run typecheck — PASS
- npm test -- --run tests/cherry/memory.test.ts tests/cherry/memory-graph.test.ts — PASS (3 tests)
- npm test -- --run tests/cherry/schemas.test.ts — PASS (5 tests)
- npm test -- --run — PASS (138 tests, 2 skipped).
- npm run lint — repository currently reports existing vendored public/lab/three-d errors; no errors from changed TypeScript files.

Risks/unresolved limitations:
- Graph relationship edges are emitted only where persisted IDs expose a direct relationship; observations do not store transcript-segment IDs, so no guessed transcript→observation edge is created.
- Proof provider kind is mapped from RunRecord provider data and receipt event selection is causal-ID based; receipts remain schema-compatible with optional truncation metadata.
- Agent decision refusal uses the optional actorType argument (`decideMemory(..., 'agent')`); legacy three-argument human calls remain compatible.