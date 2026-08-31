# Cherry Source Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a local-first Sources surface that saves user-selected YouTube, article/post, note, and text-file material as provenance-linked lessons, with explicit compliant Scrapling fetch requests and no autonomous or protected-site scraping.

**Architecture:** Add a framework-independent `source` domain service backed by a Dexie `sourceRecords` table. The Sources page and WebMCP `sources` aperture call that service; Quick Skill reuses the linked lesson by `sourceId`. An optional loopback runner adapter invokes a separate Scrapling worker using ordinary fetches only; the browser remains fully usable without that worker.

**Tech Stack:** React 19, TypeScript, Vite, Dexie, Zod, Vitest/jsdom, Playwright, Node ESM runner, optional Python Scrapling worker.

**Spec:** `docs/superpowers/specs/2026-08-31-source-inbox-design.md`

## Global Constraints

- External source material is untrusted until a human promotes trust.
- Every source mutation emits a metadata-only ProofEvent in the same transaction.
- Fetch is visible and user-selected; no background crawler, timers, hidden browser automation, or model calls.
- YouTube is official-player/transcript-only; LinkedIn URLs fail closed and pasted/exported text remains supported.
- Scrapling uses only ordinary non-stealth fetchers, robots fail-closed, bounded output, and no credentials/proxies/CAPTCHA/CDP.
- Existing Quick Skill, approval, verification, runner, archive, and WebMCP security contracts remain unchanged.
- Required gates: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:runner`, `npm run build`, and UI `npm run test:e2e`.

---

### Task 1: Source domain model and service

**Files:**
- Create: `src/cherry/source/source-model.ts`
- Create: `src/cherry/source/source-service.ts`
- Create: `tests/cherry/source.test.ts`
- Modify: `src/cherry/watch/lesson-service.ts` only if a small helper is needed to create a lesson without transcript data.

**Interfaces:**
- Produces the `SourceRecord` types and `createSource`, `getSource`, `listSources`, `updateSource`, `archiveSource`, `findDuplicateSource`, `requestSourceFetch`, `completeSourceFetch`, and `failSourceFetch` functions defined in the spec.
- Uses `createLesson`/`loadLesson`-equivalent existing lesson services, `withWorkspaceTx`, URL utilities, SHA-256 helpers, and `ActorType`.

- [ ] Write failing tests for source-kind validation, URL normalization (fragment/tracking removal and credential/scheme rejection), LinkedIn/YouTube fetch blocking, duplicate URL/content hash detection, proof summaries without body text, and fetch lifecycle transitions.
- [ ] Run `npx vitest run tests/cherry/source.test.ts` and confirm the new tests fail because the service is absent.
- [ ] Implement bounded Zod inputs, normalized-domain metadata, deterministic duplicate checks, lesson creation/linking, metadata-only proof events, archive recovery, and explicit fetch-state transitions.
- [ ] Run the focused tests and confirm they pass.
- [ ] Commit `feat: add source inbox domain service`.

### Task 2: Dexie migration and workspace archive support

**Files:**
- Modify: `src/cherry/persistence/migrations.ts`
- Modify: `src/cherry/persistence/cherry-db.ts`
- Modify: `src/cherry/persistence/workspace-archive.ts`
- Modify: `src/cherry/mission/mission-service.ts` for workspace deletion table coverage.
- Modify: `tests/cherry/migrations.test.ts` or the existing archive test file.

**Interfaces:**
- `CherryDatabase.sourceRecords` is a `Table<SourceRecord, string>`.
- Export payload includes `sourceRecords`; import remaps source IDs, workspace IDs, and lesson IDs consistently.

- [ ] Add migration version 3 with `sourceRecords: id, workspaceId, lessonId, kind, status, updatedAt`, register the table and `ALL_STORES`, and include it in workspace deletion transactions.
- [ ] Add export/import shape, limits, transaction stores, and ID remapping for source records.
- [ ] Add migration and archive round-trip tests, including an imported source whose lesson reference is remapped.
- [ ] Run focused persistence tests and the full unit suite.
- [ ] Commit `feat: persist source records in workspace archives`.

### Task 3: Sources route and user-selected capture UI

**Files:**
- Create: `src/pages/studio/Sources.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/pages/studio/StudioLayout.tsx`
- Modify: `src/pages/studio/CommandCenter.tsx`
- Modify: `src/design-system/apple.css` only for missing Sources-specific glass layout rules.
- Create/modify: `tests/cherry/sources-page.test.tsx` and `e2e/cherry/sources.spec.ts`.

**Interfaces:**
- Route `/studio/sources` renders the Sources page and sets WebMCP surface `sources`.
- The dialog supports YouTube, article/post, note, and text file inputs, records rights acknowledgement, and never fetches on save.
- Cards expose Open lesson, Fetch selected page, Create skill, and Archive actions with visible status labels.

- [ ] Write component tests for saving each kind, duplicate error display, filters, keyboard dialog close, and manual-mode behavior when no WebMCP host exists.
- [ ] Implement the route, navigation item, form validation, local file reading for `.txt/.md/.json/.srt/.vtt`, card list, filters, and empty state.
- [ ] Implement explicit fetch button state: YouTube/LinkedIn blocked copy, unpaired runner setup-required copy, queued/fetched/failed status, and no automatic effect.
- [ ] Link Open lesson to `/studio/watch/:lessonId` and Create skill to `/studio/quick?sourceId=...`.
- [ ] Add Playwright coverage for persistence across reload, all four source kinds, filters, and responsive overflow.
- [ ] Run focused component/E2E tests and commit `feat: add Sources capture surface`.

### Task 4: Quick Skill reuse and WebMCP Sources aperture

**Files:**
- Modify: `src/pages/studio/QuickSkill.tsx`
- Modify: `src/cherry/webmcp/workforce-tools.ts`
- Modify: `src/cherry/webmcp/tool-definitions.ts`
- Modify: `src/cherry/webmcp/registration-manager.ts`
- Modify: `src/app/AppState.tsx` only if route mutation refresh wiring needs a shared helper.
- Modify: `tests/cherry/quick-skill.test.ts` and `tests/cherry/webmcp.test.ts`.

**Interfaces:**
- `ToolSurface` gains `sources`; `TOOL_SURFACE_TABLE.sources` contains exactly five source tools.
- `sourceId` query loads the existing source/lesson and skips duplicate lesson creation.
- WebMCP tools are `list_sources`, `save_source`, `request_source_fetch`, `archive_source`, and `prepare_source_for_skill`; none approve or promote trust.

- [ ] Add failing tests for source aperture registration cap, stale-closure refusal, bounded tool output, no approval tool, and Quick Skill lesson reuse.
- [ ] Implement source tool definitions through source/mission services with explicit workspace context and setup-required fetch result.
- [ ] Add `sources` to surface mapping/state selection and route selection while preserving existing workforce Inbox behavior.
- [ ] Update Quick Skill initialization to load `sourceId`, reuse linked lesson, and keep the no-query flow unchanged.
- [ ] Run focused WebMCP/Quick Skill tests and commit `feat: expose Sources over WebMCP and Quick Skill`.

### Task 5: Optional compliant Scrapling worker and runner adapter

**Files:**
- Create: `scraper/worker.py`
- Create: `scraper/requirements.txt`
- Create: `scraper/tests/contract_test.py`
- Modify: `runner/lib/adapters.mjs`
- Modify: `runner/server.mjs` allowlist only as needed for a fixed worker command.
- Modify: `runner/runner.test.mjs`.
- Create: `docs/SCRAPLING_SETUP.md`

**Interfaces:**
- Worker reads one JSON request from stdin and emits one bounded JSON response with `status`, `title`, `canonicalUrl`, `author`, `fetchedAt`, `contentHash`, and sanitized `markdown`, or a structured blocked/failed reason.
- Runner adapter name is `scrapling-fetch`, setup-required until a paired local worker is explicitly configured.

- [ ] Write Python contract tests for disallowed schemes/domains, private addresses, YouTube/LinkedIn, robots denial, oversized responses, hidden/prompt-injection markup, and permitted fixture HTML.
- [ ] Implement URL/domain/private-network validation, robots fail-closed, ordinary Scrapling fetcher, byte/redirect/timeout/text caps, sanitized Markdown extraction, and no body logging.
- [ ] Add the fixed runner adapter command and tests proving it cannot run arbitrary executables or claim verification.
- [ ] Document install/pair/start commands, allowlist behavior, limitations, and manual fallback.
- [ ] Run Python contract tests when Scrapling is installed plus runner tests; commit `feat: add opt-in Scrapling fetch adapter`.

### Task 6: Verification, release notes, and full gates

**Files:**
- Modify: `docs/CHERRY_COMPATIBILITY.md` or the current compatibility/release document.
- Modify: `README.md` only where Source Inbox capability/limitations are described.
- Modify: `docs/CHERRY_DECISIONS.md` with the implementation decision and migration version.
- Modify: `e2e/cherry/sources.spec.ts` and accessibility tests as needed.

- [ ] Add explicit release language that Cherry does not watch every video, scrape LinkedIn, train a private foundation model, access subscriptions invisibly, execute in the cloud without a runner, auto-approve, or understand every video frame.
- [ ] Run `npm run typecheck && npm run lint && npm run test && npm run test:runner && npm run build`.
- [ ] Run `npm run test:e2e` and inspect Sources desktop/mobile screenshots for overflow, focus visibility, and no console errors.
- [ ] Run `git diff --check`, confirm only intended files are staged, and commit `docs: document Sources and Scrapling limits`.
