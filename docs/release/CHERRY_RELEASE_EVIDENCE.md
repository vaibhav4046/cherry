# Cherry release evidence

> This file preserves dated evidence snapshots. Older clean-install counts are historical and do
> not describe the current lockfile. The current dependency result, including remaining moderate
> findings and peer warnings, is in `docs/release/DEPENDENCY_AUDIT.md`.

> **Historical production deployment addendum (2026-08-31):** commit `5b7d731` deployed successfully to the
> linked Vercel project as `dpl_CcTPQWLDuda2SsPH2NA5kqBKksUC` with a READY production target. The
> public alias is [https://getcherry.vercel.app](https://getcherry.vercel.app); HTTP returned 200 and
> a browser smoke check rendered the Cherry landing page with no Vercel/Vite overlay or captured
> console errors. A later 2026-08-31 deployment is recorded in `docs/BUILD_STATUS.md`; neither
> historical block claims that subsequent local commits are live. The preview deployment remains Vercel-auth protected, so the production alias is
> the inspection URL. The live WebMCP host boundary is unchanged and remains experimental.

> **Finalist hardening addendum (2026-08-31):** full gate suite re-run after the
> Memory Vault, routines, WebMCP, and glass UI work: **154 unit passed + 2 skipped + 42
> runner/bridge (node:test) + 41 e2e (Playwright)**, typecheck/lint clean, production build clean,
> verify:pack 6/6, audit:submission 13 checks 0 FAIL. New evidence class: a **registered-closure
> host-path e2e** (`e2e/cherry/showcase-host.spec.ts`) installs a mock `document.modelContext`
> BEFORE app load and drives the entire fresh journey through the closures the app actually
> registered — discovery, introduce_agent, start_apprenticeship, aperture advancing with no human
> click, load_lesson, import_transcript, add_source_evidence, generate_quick_skill,
> request_skill_approval — then the human approves in the /showcase UI and the agent
> continues. It also asserts no registered tool name can approve/decide. Fresh-journey defects
> fixed same day (D-021): mutation→shell sync, onboarding-aperture lesson deadlock, quick-skill
> mission linking. Privy auth boundary landed per D-019 (guest-first, setup_required without
> credentials, SDK lazy-chunked and pinned). **Host validation attempt (2026-08-31):** owner's
> Chrome 151 probed via its own console — `document.modelContext` undefined (WebMCP testing flag
> not enabled); result recorded as unavailable-in-current-host, no live browser-host claim is
> made. Live-host validation remains a queued owner action in docs/BUILD_STATUS.md.
>
> **Deployment/host boundary at the original snapshot:** no deployment or push had been performed
> when that evidence block was written. A subsequent linked Vercel production deployment is recorded
> above. A compatible live WebMCP browser host remains unverified; the registered-closure Playwright
> journey uses a mock `document.modelContext` host.

> **v1.2 addendum (2026-08-30, editorial-pack integration):** every gate re-ran fresh on the tree
> after the god-mode pack landed. Current totals: **119 unit/integration passed + 2 skipped
> (vitest, 13 files) + 42 runner/bridge/v2 (node:test) + 33 e2e (Playwright)**, typecheck and
> eslint clean, production build clean. Two gates that previously lacked a runnable command now
> pass for real: `npm run verify:pack` (6/6 — sample-bundle hash matches meta, standalone verifier
> passes, **one-byte mutation fails**, **deleted evidence fails**) and `npm run audit:submission`
> (13 checks, 0 FAIL, 0 WARN). Security re-review REFUTED the YouTube-bridge wording (wildcard
> `'*'` targetOrigin + missing `event.source` check, low practical severity) — fixed same day, see
> CHERRY_SECURITY_AUDIT.md §Adversarial re-review. Landing now uses the three linked brand clips
> (lesson-seed / proof-approval / carry-forward) with first-frame posters (reduced motion shows the
> static poster, never a blank slot); OG card upgraded to the editorial plate (`/og.jpg`).
>
> **Native MCP live-host validation (2026-08-30):** from a real MCP host (Claude Code session) over
> the runner bridge: `read_workspace_summary` returned the example workspace (1 mission COMPLETE,
> 1 skill, 1 approved memory, 1 receipt); `list_skills` returned the approved skill at
> revision = approvedRevision; `verify_workspace_integrity` recomputed `fa13a1fc…432db35b` matching
> stored; `verify_receipt rc-01M1779YFWYGBACKVW020XXT3R` recomputed `b8dd59e7…8dd638f` matching
> stored; an unknown receipt id returned an honest error; `list_skill_bundles` honestly reported no
> bundles directory configured. Browser-host WebMCP status is unchanged from the compatibility
> matrix (mock-host tested, labelled as such — no live ChatGPT/Codex host claim is made).

> **v1.1.0 addendum (2026-08-29):** the winner-perception upgrade re-ran every gate on the new
> tree. Current totals: **65 unit/integration (vitest, +4 for the MCP inspector call log and
> retired-tools diff) + 15 runner/bridge (node:test) + 28 e2e (Playwright, +9: landing CTAs, cherry
> burst incl. reduced-motion, guided walkthrough end-to-end, replay, Agent View honesty, teach
> routing, axe on /compatibility and Agent View)**. All passing. New surfaces (Agent View, guided
> tour, compatibility page, mascot/brand layer) are additive; the golden journey spec is unchanged
> except one selector disambiguation. Deployment re-smoked live after v1.1 (tour, example import,
> Agent View, /compatibility all verified on https://cherry-wine.vercel.app). See RELEASE_NOTES.md.

**Date:** 2026-08-29 · **Tested tree:** initial release commit (see git log)

Every command below was executed on this tree with the pasted result.

## clean_install

```
npm install
→ added 286 packages, and audited 287 packages in 27s
→ found 0 vulnerabilities
```
Lockfile committed; no manual patches. **PASSED**

## typecheck

```
npx tsc --noEmit
→ exit 0, no output
```
Strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. **PASSED**

## lint

```
npx eslint .
→ exit 0, no output
```
`no-explicit-any` and `no-console` enforced in app code. **PASSED**

## unit_integration_tests

```
npx vitest run
→ Test Files 7 passed (7)
→ Tests 61 passed | 1 skipped (62)
```
Skipped test is the opt-in example-workspace generator (`GENERATE_EXAMPLE=1`), not release-critical —
it was run once with the flag to produce `public/examples/example-workspace.json` and passed.

```
npm run test:runner
→ node:test — 9 pass (runner) + 6 pass (MCP bridge), 0 fail
```
**PASSED**

## manual_golden_journey

```
npx playwright test e2e/cherry/golden-manual.spec.ts --project=desktop
→ 1 passed
```
The spec walks, with zero AI provider and zero WebMCP: workspace → mission → manual lesson →
transcript paste (3 segments) → visual observation → coverage incomplete → declared criterion →
coverage complete → evidence (untrusted → reviewed by human) → drafted SkillGraph with
DoD-derived acceptance checks → node edit (new revision) → approval request → exact-revision
approval → EXECUTING → real artifact (deliberately missing h1) → verification **failed** honestly
with evidence → repair → re-verify **passed** → proof receipt → hash recomputation "Receipt
verifies" → correction compiled to memory proposal → human approval → workspace export (download) →
re-import (id-remapped, hash-verified) → full page reload with state intact. **PASSED**

## webmcp_tool_aperture

```
npx vitest run tests/cherry/webmcp.test.ts
→ 8 passed
```
Covers: ≤ 5 state tools + 2 global reads per state; snake_case ≤ 30 chars; descriptions ≤ 500;
`additionalProperties:false` everywhere; runtime re-validation of host-supplied arguments;
pre-abort honoured; full golden journey driven through `executeLocal` against the same persisted
state as the UI; registration/unregistration with AbortController on state change (mock model
context asserts old signals aborted); unsupported browsers report manual mode with zero registered
tools and a fully working UI. **PASSED**

## youtube_compliance

Unit tests (`tests/cherry/watch.test.ts`): URL parsing accepts watch/youtu.be/shorts/embed/live/bare-id,
rejects non-YouTube hosts and `javascript:`; embed URL is the official
`youtube-nocookie.com/embed` with `enablejsapi` + exact app `origin`. Lesson loading refuses a YouTube
lesson without permission acknowledgement (domain-flow test). The player is a visible iframe; no
caption/media endpoint is called anywhere (grep: no `timedtext`, no `googlevideo`, no Data API).
Transcript/manual fallback is the path the golden journey itself uses. **PASSED**

## creators_watch_engine

- **What is proven.** `src/cherry/source/proposal-service.ts` derives a skill proposal deterministically
  from a creator upload: the title, an optional capped plain-text description, and the transcript a
  person supplied or transcribed on-device. Readiness is computed from persisted facts (transcript
  present, draft exists, exact-revision approval matches) and never asserted; only a person can set a
  proposal aside. New uploads from a paired-runner daily feed check land as sources with proposals in
  the same ledger entry (`channel-watch-service.ts`), as do manual YouTube saves. Proposals persist in
  Dexie v5, round-trip through workspace archive v1.2.0 with schema validation, and ride on the
  existing WebMCP `list_sources` rows without a new tool (the global count stays 7).
  Unit: `tests/cherry/proposal-service.test.ts`, `webmcp.test.ts`, `workspace-portability.test.ts`,
  `example-workspace-loader.test.ts`. Browser: `e2e/cherry/creators.spec.ts` drives the empty state,
  the labelled sample creator, Add transcript changing a row from Needs transcript to Ready to draft,
  Not useful persisting across reload, mobile overflow, axe, the Command Center card, and Reset demo
  removing the sample creator while a person's own watched workspace still refuses deletion.
- **What is not proven.** No live check of a real creator's channel feed was captured in this
  repository; the daily check is covered by the runner's own tests only. The shipped sample creator
  is synthetic and labelled SAMPLE DATA. Cherry never downloads a video or captions and never calls a
  model; a proposal without a transcript carries only a title-derived name and sentence.
- **Screenshots.** `docs/release/screenshots/creators/` (empty, sample, draft-ready; 1440 and 390 wide).

## schema_validation

```
npx vitest run tests/cherry/schemas.test.ts
→ 5 passed
```
All four canonical schemas compile under Draft 2020-12 (Ajv). Real runtime output — a proof receipt,
an approved skill graph, a memory record — validates with zero errors. Invalid fixtures fail. **PASSED**

## skill_export_validation

```
npx vitest run tests/cherry/compiler.test.ts → 3 passed
node --test runner/runner.test.mjs → includes "cherry-verify runs a real bundle verify script and detects tampering"
```
A real compiled bundle: frontmatter name == directory name, SKILL.md < 500 lines, required tree
(SKILL.md, cherry.json, skillgraph.json, receipt.json, MANIFEST.json, references/, policies/, evals/,
scripts/verify.mjs, targets/codex, targets/claude-code), every MANIFEST hash recomputes, embedded
receipt hash recomputable. `scripts/verify.mjs` exits non-zero on a tampered bundle (runner test
proves it against a mutated file). Unapproved graphs refuse to compile. **PASSED**

## workspace_round_trip

Unit test "round-trips domain state and verifies the payload hash" + the golden journey's
export→import→reload segment. Imports remap every record id (no collisions with existing state),
preserve internal references, and verify the RFC 8785/SHA-256 integrity hash; corrupted or
version-mismatched files are rejected with nothing written. **PASSED**

## proof_recomputation

Unit test: receipt recomputes and verifies; a one-byte mutation flips the verdict to `tampered`.
E2E: the Proof page's "Recompute hashes" shows "Receipt verifies" from live state. UI copy says
tamper-evident, explicitly not a signature. **PASSED**

## security_red_team

See `CHERRY_SECURITY_AUDIT.md` — all sections PASS, including the live malicious-artifact e2e probe,
runner origin/token/root/allowlist refusals, stale-approval replay, import corruption, and the
agent-cannot-raise-trust boundary. **PASSED**

## secret_scan

Grep over source, configs, public assets, schemas: no credential-shaped strings. `.env*` ignored,
`.env.example` value-free. Client bundle contains no secrets (no secret exists to leak; core needs
none). Runner redacts secret-shaped output (tested). **PASSED**

## artifact_sandbox

E2E "malicious artifact cannot reach Cherry storage or the network": storage access throws inside
the opaque-origin sandbox, external fetch blocked by the preview CSP, parent navigation blocked,
errors surface in the visible preview console and the ProofEvent ledger. **PASSED**

## accessibility

See `CHERRY_ACCESSIBILITY_AUDIT.md`. axe: 0 serious/critical on tested routes; keyboard-only journey
e2e-passes; reduced motion honoured. **PASSED**

## responsive_visual_qa

E2E overflow assertions pass at 390/834/1280/1440; mobile bottom-nav swap asserted; screenshots in
`docs/release/screenshots/`. See `CHERRY_VISUAL_QA.md`. **PASSED**

## pwa_offline

Manifest + service worker ship; the worker caches the static shell and hashed assets only — never
IndexedDB data (it has no access) and never runner calls (port-guarded). Local-first resilience is
inherent: all workspace reads/writes are IndexedDB and the golden journey survives a full reload.
Installability requires the HTTPS deployment. **PASSED** (install prompt verified only insofar as the
manifest/worker are valid; a live HTTPS origin is where the browser offers install)

## production_build

```
npm run build → exit 0 (main 344 kB / 102 kB gzip, code-split routes)
npm run preview + full Playwright suite → 19 passed
```
Deep links, assets, and primary routes verified against the production build (Playwright's web
server IS `build && preview`). **PASSED**

## no_fake_product

- Scans: no lorem ipsum or placeholder markers in src/dist (the only occurrences are the verifier
  fragments that define the rule).
- Every route in navigation renders a real page backed by persisted state; no route stubs.
- No fake activity: the event strip renders the actual ProofEvent ledger; runner status is probed
  live; WebMCP status is feature-detected; verification badges derive only from stored reports.
- The example workspace is a genuine export produced by real domain calls
  (generator test), imported only on explicit click, labelled EXAMPLE, deletable. **PASSED**

## public_repo_docs_license

MIT `LICENSE`, `README.md` (setup, architecture, privacy/security, compatibility, zero-dollar
boundaries), decision log, repo map, baseline, and this evidence file are in the repository root and
`docs/`. Published publicly at **https://github.com/vaibhav4046/cherry** (MIT). **PASSED**

## deployment_smoke

**PASSED (2026-08-31).** `npx vercel deploy --prod --yes` deployed commit `5b7d731` to
`dpl_CcTPQWLDuda2SsPH2NA5kqBKksUC` with READY status. `https://getcherry.vercel.app/` returned HTTP
200 and a browser smoke check confirmed meaningful Cherry content, no Vercel/Vite error overlay, and
no captured console errors. The production alias is public; the separate preview deployment is
Vercel-auth protected.

## local_runner (optional gate)

9 integration tests pass: pairing, origins, roots, allowlists, no-shell spawn, timeouts, atomic
persistence + crash recovery, redaction, real bundle verification incl. tamper detection. **PASSED**

## native_mcp_bridge (optional gate)

6 integration tests pass over real stdio JSON-RPC: initialize, narrow tools/list (read/verify only,
no approval/write/exec tool exists), summary reads, workspace-integrity and receipt-hash
recomputation, unknown-tool refusal. Scope per decision D-005. **PASSED (scoped)**

## encrypted_sync (optional gate)

Not implemented in golden v1 (spec §14 exclusion). No UI claims it. **NOT RUN — intentionally out of scope**
