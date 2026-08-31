# Cherry finalist hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a truthful, glass-premium Cherry lesson-to-skill flow with real provenance graph data, human-only approvals, inspectable local routine execution, state-aware WebMCP tools, and fresh release evidence.

**Architecture:** Preserve the existing IndexedDB/domain-service/proof-ledger boundaries and add focused projection and lifecycle services. UI, WebMCP, and runner integrations consume those services; no protocol or UI shortcut mutates persistence. The work is serialized by dependency, with each task independently testable and reviewed before the next.

**Tech Stack:** React 19, TypeScript 5.8, Vite, Dexie/IndexedDB, Vitest, Playwright, Node ESM local runner, CSS/SVG icons, existing Cherry services.

**Spec:** `docs/superpowers/specs/2026-08-31-cherry-finalist-hardening-design.md`

## Global Constraints

- Keep Cherry local-first and IndexedDB-backed; do not imply cloud sync or cloud workers.
- Every domain mutation uses `withWorkspaceTx` and emits a proof event.
- Agents may request/draft/verify/export safe work but cannot approve skills, memories, routines, or consequential mission transitions.
- External text, artifacts, tool output, and transcripts remain untrusted until human promotion.
- Source labels must state the actual extraction mode; never claim arbitrary YouTube scraping or frame-level vision.
- Use existing domain services and proof-event ledger; do not mutate IndexedDB from React/WebMCP shortcuts.
- Do not read, log, commit, or transmit secrets.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:runner`, `npm run build`, `npm run verify:pack`, `npm run audit:submission`, and fresh `npm run test:e2e` must pass before completion.
- The attached image is visual reference only; do not copy its text, logos, or assets.

---

### Task 1: Domain graph projection, memory policy, and receipt scoping

**Files:**
- Create: `src/cherry/memory/memory-graph-model.ts`
- Create: `src/cherry/memory/memory-graph.ts`
- Create: `src/cherry/memory/memory-policy.ts`
- Modify: `src/cherry/memory/memory-service.ts`
- Modify: `src/cherry/proof/proof-service.ts`
- Modify: `src/cherry/persistence/cherry-db.ts` only if a missing index/query is required
- Test: `tests/cherry/memory-graph.test.ts`
- Test: `tests/cherry/memory.test.ts` (extend existing)
- Test: `tests/cherry/proof.test.ts` (create if absent; otherwise extend the proof suite)

**Interfaces:**
- Produce `MemoryGraphNode`, `MemoryGraphEdge`, `MemoryGraph`, and `buildMemoryGraph(workspaceId: string, missionId?: string | null): Promise<Result<MemoryGraph>>`.
- Produce `selectMemoriesForContext(input: { workspaceId: string; missionId?: string | null; projectId?: string | null; sensitivity?: MemorySensitivity; now?: string }): Promise<MemoryRecord[]>`.
- Preserve existing `listMemories`, `proposeMemory`, `decideMemory`, `supersedeMemory`, `deleteMemory`, and pin APIs while adding actor/revision safeguards and redacted deletion history.
- Ensure `buildProofReceipt` scopes events, approvals, verifications, runs, and artifacts to the requested mission/run causality rather than the whole workspace.

- [ ] **Step 1: Write failing graph and policy tests.** Assert all required node types and edges use persisted IDs; proposed/approved/rejected/superseded status is preserved; clicking data can resolve to a real record; out-of-scope, expired, sensitive, and deleted memories are filtered/redacted; two missions in one workspace produce isolated receipts.
- [ ] **Step 2: Run the focused tests and verify expected failures.** Run `npm test -- tests/cherry/memory-graph.test.ts tests/cherry/memory.test.ts tests/cherry/proof.test.ts`; expected failures must name missing projection/policy/scoping behavior.
- [ ] **Step 3: Implement the graph projection and policy.** Read existing lesson, transcript, observation, evidence, skillgraph, memory, routine, verification, artifact, receipt, and event tables; emit an edge only when the stored relationship exists; return explainable diagnostics for orphaned records; enforce scope/sensitivity/expiry at selection time.
- [ ] **Step 4: Repair memory lifecycle invariants.** Add projectId propagation, revisioned pinning, human-only decisions, atomic supersession, and redacted deletion references while preserving proof events.
- [ ] **Step 5: Repair proof causality.** Filter records/events by mission and linked object IDs, carry run/provider IDs when present, record truncation metadata, and retain redacted deletion evidence without leaking content.
- [ ] **Step 6: Run focused tests, then the full unit suite.** Run the commands in Step 2 followed by `npm test`; expected result is zero failures and no new skips.
- [ ] **Step 7: Commit.** `git add src/cherry tests/cherry && git commit -m "feat: project persisted memory graph and scoped proof"`

### Task 2: Exact approval invariants and persisted local routine execution

**Files:**
- Modify: `src/cherry/mission/mission-service.ts`
- Modify: `src/cherry/skillgraph/skillgraph-service.ts`
- Modify: `src/cherry/approval/approval-model.ts`
- Modify: `src/cherry/workforce/routines-service.ts`
- Modify: `src/cherry/runner-client/runner-api.ts`
- Modify: `src/cherry/mission/mission-model.ts` if `RunRecord` fields are incomplete
- Modify: `runner/server.mjs` and `runner/lib/*` only for a missing status/settlement contract
- Test: `tests/cherry/approval-invariants.test.ts`
- Test: `tests/cherry/routines.test.ts` (extend existing)
- Test: `runner/runner.test.mjs` (extend existing)

**Interfaces:**
- Produce a domain-validated `requestRunNow(routineId: string, actorType?: ActorType): Promise<Result<RunRecord>>` that refuses disabled, unapproved, stale-hash, wrong-host, or stale-skill routines.
- Produce `settleRoutineRun(runId: string, settlement: { status: 'succeeded'|'failed'|'cancelled'|'setup-required'; startedAt?: string; endedAt: string; adapter?: string; command?: string[]; outputSummary?: string; receiptId?: string | null; error?: string | null }): Promise<Result<RunRecord>>`.
- Extend runner client with status, submit, poll/settle, idempotency, and origin/pairing validation without persisting secrets in logs.
- Direct service calls with `actorType: 'agent'` must reject approval decisions and consequential transitions.

- [ ] **Step 1: Write failing approval/run tests.** Cover exact skill revision, routine action hash, schedule/enabled invalidation, agent denial, setup-required runner, real success/failure, rerun, idempotency, reload persistence, and tampered receipt refusal.
- [ ] **Step 2: Run focused tests to verify RED.** Run `npm test -- tests/cherry/approval-invariants.test.ts tests/cherry/routines.test.ts`; run `npm run test:runner`; failures must demonstrate current bypasses/event-only runs.
- [ ] **Step 3: Implement domain guards.** Validate skill approval hash/revision, routine approval/action hash/schedule/enabled state, mission execution gates, human actor identity, and expected revision conflicts before writes.
- [ ] **Step 4: Implement persisted run lifecycle.** Create and settle run records inside proof-event transactions; preserve failed/setup-required histories; expose safe rerun as a new idempotent run.
- [ ] **Step 5: Connect the runner client.** Validate loopback origin and pairing state, submit only allowlisted argv/adapters, poll status, redact output, and verify receipt before success.
- [ ] **Step 6: Run focused and full runner/unit suites.** Run `npm test -- tests/cherry/approval-invariants.test.ts tests/cherry/routines.test.ts && npm run test:runner && npm test`.
- [ ] **Step 7: Commit.** `git add src/cherry runner tests/cherry && git commit -m "feat: enforce approvals and persist routine runs"`

### Task 3: State-aware WebMCP aperture and host evidence

**Files:**
- Modify: `src/cherry/webmcp/tool-definitions.ts`
- Modify: `src/cherry/webmcp/workforce-tools.ts`
- Modify: `src/cherry/webmcp/registration-manager.ts`
- Modify: `src/cherry/webmcp/tool-contract.ts`
- Modify: `src/app/AppState.tsx` only if refresh/surface contracts need a typed adjustment
- Test: `tests/cherry/webmcp.test.ts` (extend existing)
- Test: `e2e/cherry/showcase-host.spec.ts` (extend registered-closure journey)

**Interfaces:**
- Keep the safe tool names from the spec and expose metadata for side effects, approval requirements, state, and surface.
- `activeNamesFor(surface, productState)` must return the state/surface intersection; each registered closure must re-check it at invocation time.
- `toolText` must cap UTF-8 bytes after encoding; `toolError` must return redacted structured details.

- [ ] **Step 1: Write failing WebMCP tests.** Assert top-level registration, state/surface intersections, retired closure refusal, mutation refresh, origin/postMessage validation, UTF-8 byte cap, structured errors, and absence of self-approval tools.
- [ ] **Step 2: Run focused tests and verify RED.** Run `npm test -- tests/cherry/webmcp.test.ts`; failures should identify the current aperture/closure gaps.
- [ ] **Step 3: Implement runtime aperture checks.** Recompute state/surface permissions inside each invocation, retire stale closures safely, and surface registration errors without leaking payloads.
- [ ] **Step 4: Harden contracts and side-effect metadata.** Add explicit read/write/approval/side-effect fields and remove or gate any routine tool that is not currently executable.
- [ ] **Step 5: Extend the host E2E journey.** Drive the safe create→learn→derive→request approval path, assert the page updates after tool calls, and stop at the visible human checkpoint.
- [ ] **Step 6: Run focused tests and the host E2E spec.** Run `npm test -- tests/cherry/webmcp.test.ts && npx playwright test e2e/cherry/showcase-host.spec.ts`.
- [ ] **Step 7: Commit.** `git add src/cherry/webmcp src/app/AppState.tsx tests/cherry/webmcp.test.ts e2e/cherry/showcase-host.spec.ts && git commit -m "feat: harden state-aware WebMCP tools"`

### Task 4: Glass-premium product surfaces and accessible memory graph

**Files:**
- Create: `src/pages/studio/MemoryGraph.tsx`
- Create: `src/components/BrandIcons.tsx`
- Create: `src/pages/NotFound.tsx`
- Modify: `src/pages/studio/MemoryVault.tsx`
- Modify: `src/pages/studio/RoutinesPage.tsx`
- Modify: `src/pages/studio/RoutineDetail.tsx`
- Modify: `src/pages/studio/Watch.tsx`
- Modify: `src/pages/Showcase.tsx`
- Modify: `src/pages/Landing.tsx`
- Modify: `src/pages/studio/StudioLayout.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/design-system/tokens.css`
- Modify: `src/design-system/ui-foundation.css`
- Modify: `src/design-system/showcase.css`
- Test: `tests/cherry/memory-graph.test.tsx`
- Test: `tests/cherry/auth-panel.test.tsx` only if shared shell behavior changes
- Test: `e2e/cherry/responsive.spec.ts`
- Test: create `e2e/cherry/memory-routine.spec.ts`

**Interfaces:**
- `MemoryGraph` consumes `buildMemoryGraph` and exposes `onSelectNode(nodeId: string)`; it renders semantic nodes plus a synchronized table fallback.
- Studio pages consume `useAppState`, existing domain services, and persisted run records; they do not create decorative data.

- [ ] **Step 1: Write failing UI/E2E tests.** Assert graph node labels/status/provenance, accessible fallback, keyboard-only selection, reduced-motion behavior, lazy loading, empty state, glass layout, mobile no-overflow, source-mode labels, and routine run history after reload.
- [ ] **Step 2: Run focused tests to verify RED.** Run `npm test -- tests/cherry/memory-graph.test.tsx && npx playwright test e2e/cherry/responsive.spec.ts`; failures must reflect missing UI behavior.
- [ ] **Step 3: Implement the graph surface.** Lazy-load the graph from `MemoryVault`, map real nodes/edges, open record/provenance details on activation, style proposal/approval/version/rejection states with text and icons, and keep the inbox controls.
- [ ] **Step 4: Implement routine inspection.** Show approved skill revision, schedule/next run, runner connection/setup, live result fields, failures, receipt links, rerun, and reload survival.
- [ ] **Step 5: Make source extraction honest.** Surface transcript supplied/local Whisper/tab capture/deterministic sample labels, timestamps/confidence/provenance, official embed wording, and the no-frame-vision limitation.
- [ ] **Step 6: Apply the glass design system.** Use translucent panels with opaque fallback, Cherry semantic SVG icons for actions, and recognizable inline SVG brand marks from `src/components/BrandIcons.tsx` for named external services (always paired with text and ARIA names). Keep restrained wine/pink accents, consistent focus states, simplified mobile navigation, and no ornamental motion under reduced motion.
- [ ] **Step 7: Repair showcase resilience and routing.** Make the first viewport explain the transformation, demote reset/refresh, add try/finally error handling, preserve disclosure state, and provide a real not-found route.
- [ ] **Step 8: Run focused tests and browser checks.** Run `npm test -- tests/cherry/memory-graph.test.tsx && npx playwright test e2e/cherry/memory-routine.spec.ts e2e/cherry/responsive.spec.ts`.
- [ ] **Step 9: Commit.** `git add src/pages src/app/App.tsx src/design-system tests/cherry e2e/cherry && git commit -m "feat: ship glass studio graph and routine inspection"`

### Task 5: Lint, release evidence, full golden journey, and production verification

**Files:**
- Modify: `eslint.config.js`
- Modify: `playwright.config.ts`
- Modify: `docs/BUILD_STATUS.md`
- Modify: `docs/TEST_EVIDENCE.md`
- Modify: `docs/RESCUE_BASELINE.md`
- Modify: `docs/WINNER_LOOP.md`
- Modify: `docs/release/e2e-results.json`
- Modify: `docs/release/RELEASE_NOTES.md`
- Modify: `docs/release/DEMO_SCRIPT.md`
- Modify: `docs/release/DEVPOST_SUBMISSION.md`
- Create: `e2e/cherry/routine-execution.spec.ts`
- Test: existing test suites and fresh Playwright output

**Interfaces:**
- Lint ignores only `public/lab/cherry-3d/vendor/**` and applies browser globals to `public/lab/cherry-3d/three-d-stage.js`; application TypeScript remains linted.
- E2E JSON is generated from the fresh run and is the single count source for every release document.

- [ ] **Step 1: Write the failing routine E2E journey.** Create/import a skill, approve exact revision, draft/approve routine, run it through the local runner, assert real output, reload, and assert run history.
- [ ] **Step 2: Run the new journey to verify RED.** Run `npx playwright test e2e/cherry/routine-execution.spec.ts`; failure must be due to missing real execution/inspection, not selectors.
- [ ] **Step 3: Implement the narrow lint configuration.** Add file-scoped ignores/globals and verify no application lint rule is disabled.
- [ ] **Step 4: Run every requested gate from a clean dependency/browser state.** Execute `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:runner`, `npm run build`, `npm run verify:pack`, `npm run audit:submission`, `npx playwright install chromium`, and `npm run test:e2e`.
- [ ] **Step 5: Reconcile evidence.** Copy the fresh E2E count only into the canonical JSON and all release summaries; remove stale hashes/counts and unsupported claims; record warnings and known limitations.
- [ ] **Step 6: Verify production preview and deployed routes.** Start `npm run preview`, inspect homepage, showcase, studio, memory, routines, and 3D lab on desktop/mobile for console errors, broken assets, overflow, canonical redirects, and honest capability text. If existing Vercel linkage/credentials are present, deploy the tested commit; otherwise record the owner-action limitation without inventing access.
- [ ] **Step 7: Commit evidence.** `git add eslint.config.js playwright.config.ts e2e docs && git commit -m "chore: reconcile release evidence and verification"`
- [ ] **Step 8: Run final verification before claiming completion.** Re-run all gates after the evidence commit and inspect `git status`, `git log --oneline -10`, and the final E2E JSON.
