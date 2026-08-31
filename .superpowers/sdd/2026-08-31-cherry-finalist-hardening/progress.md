# SDD ledger — plan: docs/superpowers/plans/2026-08-31-cherry-finalist-hardening.md

## Preflight conflict scan

| Scope | Check | Result / ruling |
|---|---|---|
| Task 1 ↔ Task 2 | Task 1 produces graph/proof scoping; Task 2 consumes run/approval records | Compatible: Task 1 keeps projection read-only and Task 2 preserves causal IDs needed by receipts. |
| Task 1 ↔ Task 4 | Task 1 produces `buildMemoryGraph`; Task 4 renders it | Compatible: Task 4 must not add fallback data or mutate records. |
| Task 1 ↔ Task 5 | Task 1 changes proof tests; Task 5 regenerates release evidence | Compatible: fresh E2E/release run occurs after proof behavior stabilizes. |
| Task 2 ↔ Task 3 | Task 2 hardens run API; Task 3 gates `run_routine_now` | Compatible: Task 3 treats Task 2 domain refusal as the final boundary. |
| Task 2 ↔ Task 4 | Task 2 adds persisted run fields; Task 4 displays them | Compatible: Task 4 consumes the declared `RunRecord` fields only. |
| Task 2 ↔ Task 5 | Task 2 changes runner tests; Task 5 adds routine E2E | Compatible: E2E starts only after runner lifecycle is real. |
| Task 3 ↔ Task 4 | Task 3 changes WebMCP refresh; Task 4 changes surfaces using `useAppState` | Compatible: UI reads refreshed state; no duplicate store. |
| Task 3 ↔ Task 5 | Task 3 changes host journey; Task 5 runs full E2E/count generation | Compatible: Task 5 is canonical count source. |
| Task 4 ↔ Task 5 | Task 4 changes pages/CSS; Task 5 verifies responsive/route behavior | Compatible: Task 5 owns final evidence only, not new UI behavior. |
| Each task internally | Tests are written before implementation; file lists match interfaces | No contradictions found. |

No preflight rulings required; the spec remains authoritative for any implementation ambiguity.

Ruling: external-service references use a dedicated inline SVG brand-mark set paired with text labels — the user explicitly requested recognizable brand icons, and this avoids emoji/generic glyphs while keeping assets local and accessible; the cost if wrong is a small UI asset revision.

Task 1: fix round 1/5 — reviewer findings addressed in commits `15cfbd1` and `8e8dbb3`; scoped re-review pending.

Task 1: fix round 2/5 — re-review found artifact node metadata and required-memory deletion redaction gaps plus missing dedicated proof coverage; routed to implementer.

Task 1: complete (commits `82395f6`..`70c9443`, review rounds 1–5). Parked findings: orphan records without persisted parents are filtered rather than diagnosed, and skill-revision→memory-proposal / skill→artifact edges are absent where the current schema has no direct foreign key. Ruling: preserve honest omission (never guess); Task 4 will expose orphan diagnostics in the UI. Cost if wrong: a judge may see less graph context until those links are modeled.

Task 2: complete candidate (commits through `d2ef480`, `85a166f`, `77755e1`, plus final settlement contract cleanup). Reviewed through four scoped review rounds. Delivered exact human approval gates, current graph/routine binding hashes, persisted run identity and runner capability tokens, recoverable setup-required state, runner job idempotency/polling/cancellation, report-only agent outcomes, receipt-bound success, routine proof causality, and safe run-history evidence. Fresh focused suites and typecheck pass; full suite/runner evidence is recorded in the task report.

Ruling: pausing is a deliberate risk-reducing safety exception to enabled-state invalidation. `pauseRoutine` disables execution and clears `nextRunAt` but keeps the exact approval; `resumeRoutine` is human-only and revalidates the approval, action hash, graph revision, graph hash, and mission binding before re-enabling. Schedule, graph, action, and mission changes still invalidate approval. Cost if wrong: changing pause to require reapproval would be a small UX/security-policy revision, but retaining approval avoids unnecessary re-approval for a reversible stop control while preserving the human gate on resume.

Task 3: complete. WebMCP lifecycle, route×state apertures, stale-closure/active-id retirement, bounded structured errors, async registration diagnostics, truthful approval metadata, canonical public tool registrations with legacy local aliases, and inspector state/surface metadata landed in commits `8cb69e9`, `0a62b91`, `ce1fecc`, and `dcb5e22`. Focused suite: 28 passed; typecheck passed. Remaining limitation: browser-host E2E covers the showcase host journey, while the final release pass owns the complete route/aperture evidence.

Task 4: complete (commits `c7be450`, `c521910`, `2092b38`, `adef088`, `3fcbdc8`, `ca7060d`, `100ef9c`, `0ad8286`). Delivered the glass-premium shell, accessible persisted memory graph/table fallback, routine evidence/history surfaces, honest source labels, resilient showcase routing, not-found route, and local inline SVG brand marks. Full browser verification passed after the final UI fixes.

Task 5: complete candidate. Final release gates passed on the current tree: typecheck, lint, 152 unit tests + 2 skipped, 42 runner tests, production build, 41 Playwright E2E tests, verify:pack, and audit:submission (0 failures, 0 warnings). Deployment was not performed because no credentials or project linkage were provided; compatible live WebMCP host validation remains open.
