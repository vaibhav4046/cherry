# Status — Cherry Workforce v2

Updated: 2026-08-30 (phase 2 complete) · main @ ff07b8f · live: getcherry.vercel.app = cherry-wine.vercel.app

## Completed
- Phase 1 (see git history): domain core, state machine, DST schedules, Dexie v2, crew/inbox/thread
  surfaces, attention queue, copy truths.
- Surface-selected WebMCP apertures: inbox / crew / routines / run tool sets, selected by route +
  mission state, each ≤5 tools + 3 globals, retired-tools diff on every switch. 14 new workforce
  tools; agents can draft/schedule/queue but can never approve, enable, or mark success.
- Routines end-to-end: draft from approved SkillGraph → schedule (validated, DST-aware) → exact-
  revision human approval binding an action hash → pause/resume; every schedule edit invalidates
  approval. Full UI at /studio/routines(+detail). ApprovalObjectType widened with 'routine'.
- Runner v2 (dependency-free Node, evolves the secure v1): durable queue with immutable hashed
  envelopes, leases+heartbeats+expiry recovery, worker pool 1–3, idempotency refusal, bounded retry,
  cancellation/timeout, crash recovery, exactly-once schedule materialisation with missed-run
  policies, hash-chained events log + /events?since sync, adapters: cherry-verify, cherry-export,
  codex-cli, claude-cli (dual-allowlist, never 'verified'), safe-command. v1 endpoints untouched.
- Motion: honest status pulse on running stickers (reduced-motion safe).
- Evidence, all run fresh by the lead after integration:
  typecheck ✓ · lint ✓ · unit 116 passed + 2 skipped · runner 42/42 · build ✓ · e2e 33/33 ·
  production routes /studio/inbox|crew|routines live (HTTP 200 smoke).

## Honest limitations (unchanged claims never shipped)
- Provider-CLI success path (spawning a real codex/claude binary) has no automated test on Windows
  (.cmd shim limitation under shell:false); gating/refusal/never-verified contracts ARE tested.
- Work items reach RUNNING only via the service/runner path; the browser UI offers legal human moves
  only. Studio↔runner event import UI is wired at the protocol level (/events + chain verify) but
  the Studio-side import screen is not built yet.
- The 25-step full workforce journey e2e is partial (crew→handoff→assign→queue→cancel + routine
  smoke covered; runner-backed live-run steps need the import screen).
- Live ChatGPT/Codex WebMCP host validation requires the owner present in a supported client.

## Owner-only actions remaining
1. Live host validation session (open getcherry.vercel.app in a WebMCP-capable ChatGPT/Codex
   browser; the Agent page brief drives it).
2. Record the <3-minute video; submit on Devpost before Sep 3, 1 PM PT.

2026-09-01 00:20 claude PACK PUBLISHED — master directive + tickets T1-T7 in docs/codex-takeover/; production restored (blank-page incident closed at c450b50); Codex lane: start T1
2026-09-01 00:25 claude WINE IDENTITY DEPLOYED — 6ac8acb live (dpl_4XrzghKZH4), render-verified; landing/nav/CTAs now cherry wine; incident fix c450b50 also live
2026-09-01 01:05 codex  T1 DONE 991255b — typecheck, lint, unit, runner, build, focused e2e green
2026-09-01 01:05 claude SPRINT 2 PUBLISHED — 08_SPRINT2_ULTIMATUM.md adds T8-T14 (starter library, uncut demo recording, live Codex MCP self-validation, UI inspection sweep, perf/meta, add-anything menu, judge card); brand icons colorized in Claude lane
2026-09-01 morning claude SPRINT 3 PUBLISHED — 09_SPRINT3_ENDGAME.md: T15 continuous 10/10 rubric loop, T16 real-usage proof runs with screenshots, T17 harness codification (AGENTS.md layers + HARNESS.md + gates scripts), T18 contribution/star-ready repo, T19 final technical report, T20 launch kit drafts
2026-09-01 claude SPRINT 4 PUBLISHED — 10_SPRINT4_BREAKER.md: T21 adversarial attack catalog (input/file/flow/state/WebMCP/access abuse + anti-sloppiness copy sweep), T22 chaos battery as permanent e2e, T23 bulletproof landing self-demo; interleaves with Sprint 3, outranks new features; done = two consecutive clean sweeps
2026-09-01 claude SPRINT 5 PUBLISHED — 11_SPRINT5_TRIBUNAL.md: T24 five-persona judge tribunal looping to two consecutive perfect rounds (no-disturb rule, no grade inflation, hard stop Wed 10:00 London), T25 FINAL_HANDOFF verifying every ticket T1-T23 with evidence + owner minute-by-minute script; Claude signs handoff on Wed morning cycle
2026-09-02 claude QA ULTIMATUM ADOPTED — docs/codex-takeover/12_QA_ULTIMATUM.md (second reviewer audit, reconciled); Claude fixed punch items 1,2 (auth SDK activation-gated: guest landing 8 requests, 0 privy/walletconnect, 0 console errors in env build), 3 (/connect 390px), 9 (per-route titles/meta, em dash out of base title), 8 partial (robots/sitemap/favicon.ico), 11 partial (tap target); QA_LEDGER.md seeded at repo root; Codex: verify on live after next deploy, then items 4,5,6,7,10,11-rest + suites A-H

2026-09-02 claude P0 FOUND AND FIXED — service worker served the app shell cache-first, so returning visitors kept an old index.html pointing at asset hashes a new deploy had removed (white-screen generator; likely the true root of the Sep 1 blank-page incident). sw.js v2: network-first for navigations with HTTP-cache bypass, cache-first only for immutable /assets/, old caches purged on activate. Proven locally: simulated redeploy serves fresh HTML, offline fallback still works. Gates green (179 unit, 45 e2e).
2026-09-02 claude DEPLOYED + LIVE-PROVEN — QA wave live on cherry-wine.vercel.app: guest landing 6 requests / ~739KB (was ~7MB) with zero third-party auth; per-route titles and descriptions; /connect no horizontal scroll; robots.txt, sitemap.xml, favicon.ico serving; alias 307 intact; sw v2 with cache bypass live. QA_LEDGER.md updated with evidence. Codex: punch items 4,5,6,7,10,11-rest are yours next, then suites A-H.
2026-09-01 03:54 codex T1 DONE 7ff543a — independent review ready; typecheck, lint, unit 189 (+2 skips), runner 42, scraper 3, build, focused e2e 7, full e2e 48 green; no deploy
2026-09-01 04:19 codex T2 CONNECT OWNER NOTE — Claude: add a quiet Save to Cherry bookmarklet reference on /connect; Connect remains Claude-owned and was not edited
2026-09-01 04:40 codex T2 DONE ca048ab — independent review ready; typecheck, lint, unit 194 (+2 skips), runner 42, scraper 3, build, focused e2e 5, full e2e 53 green; CSP unchanged; no deploy
2026-09-01 04:41 codex T3 IN_PROGRESS
2026-09-01 05:38 codex T3 DONE 144b587 — independent review ready; typecheck, lint, unit 205 (+2 skips), runner 42, scraper 3, build, focused e2e 3, full e2e 56 green; deploy config unchanged; no deploy
2026-09-01 05:39 codex T4 IN_PROGRESS
2026-09-01 06:14 codex T4 BLOCKED OWNER NOTE — feature ready dd8d095; independent code and UX review ready; typecheck, lint, unit 214 (+2 skips), runner 42, scraper 3, build, focused e2e 4, full e2e 60 green; Claude: add exactly https://www.youtube.com to connect-src in vercel.json and public/_headers, then verify production; deploy config intentionally unchanged; no deploy
2026-09-01 06:59 codex T5 DONE 6c7fc89 — independent code and UX review ready; typecheck, lint, unit 220 (+2 skips), runner 42, scraper 3, build, verify:pack, audit:submission, focused e2e 3, full e2e 63 green; exact-revision and cross-workspace fail-closed; no auto-draft; no deploy
2026-09-01 07:13 codex T6 IN_PROGRESS
2026-09-01 08:12 codex T6 DONE 003853d — independent code and UX review clean; typecheck, lint, unit 223 (+2 skips), runner 42, scraper 3, build, verify:pack, audit:submission, focused e2e 22, full e2e 65 green; external diagnostics preserved; no deploy
2026-09-01 08:20 codex T7 IN_PROGRESS — public YouTube RSS through paired local runner only; no browser-side feed fetch and no auto-approval
2026-09-01 08:55 claude REVIEW CYCLE 1 — T1-T6 VERIFIED, DEPLOYED. Fresh snapshot of 1aee0b7, clean npm ci, full gates: typecheck, lint, unit 223 (+2 skips), runner 42, build, verify:pack, audit:submission (0 FAIL 0 WARN), full e2e 65 passed. Browser QA at 390px on the built output: first-skill flow reaches the transcript step; empty submit is blocked (native required validation, wizard stays on step 1 — punch item 5 not reproducible on this build); /ingest prefills from the query string; no horizontal scroll on /, /connect, /studio/sources, /studio/skills; zero page errors apart from the known local-runner refusals (punch item 7, still yours). Deployed and verified live: title per route, connect-src now includes https://www.youtube.com, zero third-party auth requests for guests, jargon sweep clean on /studio/quick.
2026-09-01 08:55 claude T4 UNBLOCKED — 1aee0b7 adds exactly https://www.youtube.com to connect-src in vercel.json and public/_headers (oEmbed lookup is user-triggered, 5s timeout, 16KB cap). Live CSP header confirmed. T2 owner note also closed: /connect now carries a quiet Save to Cherry section pointing at the Sources bookmark.
2026-09-01 08:55 claude DATE CORRECTION — three earlier entries in this file are stamped 2026-09-02; they were written on 2026-09-01 (QA ultimatum adoption, service worker P0, first QA deploy). Kept as written with this correction rather than rewriting history.
2026-09-01 11:43 codex T7 DONE 320d35f — independent code and UX review clean; typecheck, lint, unit 246 (+2 skips), runner 63, scraper 3, build, verify:pack, audit:submission, focused e2e 3, full desktop e2e 58 green; local browser QA passed at mobile and desktop; public YouTube RSS runs only through the exact approval-bound paired runner watch; no browser-side feed fetch, no auto-approval, deploy config unchanged; no deploy
2026-09-01 11:50 codex T8 IN_PROGRESS — building an opt-in, resettable starter library from verified public video metadata and creator-authored chapter markers only; no caption/video downloads and no invented evidence
2026-09-01 13:53 codex T8 DONE 1dd0d92 — independent security/code/UX review clean; typecheck, lint, unit 266 (+2 skips), runner 63, scraper 3, build, verify:pack, audit:submission, full e2e 69 green; 8 opt-in cited creator samples use timestamped public chapter metadata only; synthetic approvals remain durably labelled across ordinary import, UI, WebMCP, standalone files, and bundles; bounded redacted payload hashes match delivered bytes; reset preserves user workspaces; no transcripts, downloads, auto-approval, deploy config change, or deploy
2026-09-01 13:54 codex T9 IN_PROGRESS — recording the real golden loop with Playwright video capture and adding a quiet native-video proof section; repo asset only, exact uncut-test label, no staged-product claim
2026-09-01 14:21 codex T9 DONE e603c95 — independent review clean; npm run record:demo passed; VP8 1280×720, 37.76s, 4,000,205 bytes, sha256 73935b8377f9816e751f4725ba50f7c0d424c5af2a12030c43d3b14cb5e10d61; decoded playback and axe clean; typecheck, lint, unit 266 (+2 skips), runner 63, scraper 3, build, verify:pack, audit:submission, focused e2e 2, full e2e 71 green; default suite excludes the paced recorder; no deploy
2026-09-01 14:21 codex T10 IN_PROGRESS — validating the shipped read-only MCP bridge through a fresh ChatGPT-authenticated Codex CLI session, capturing exact transport and integrity evidence, and removing the temporary registration afterward
2026-09-01 14:36 codex T10 DONE 2ab9a1a — independent evidence review clean; live ChatGPT-authenticated Codex CLI 0.151.0-alpha.7.2 session called all 5 Cherry MCP tools in order; workspace and receipt recomputations matched; 22 bundle manifest hashes plus embedded receipt passed; direct JSON-RPC replay captured; bridge 6, audit:submission green; temporary global registration removed and absence confirmed; labelled synthetic sample only, native Codex MCP only, no live-human or browser-host claim; Claude: compatibility evidence is validated — native Codex MCP session, 1 Sep 2026; no deploy
2026-09-01 14:36 codex T11 IN_PROGRESS — inspecting every route at 375, 768, and 1440 widths; logging the full visual sweep, fixing only Codex-lane defects with existing tokens, and handing owner-lane findings to Claude
2026-09-01 15:42 codex UIQA: all routes 375/768/1440 — OWNER: shared focus treatment still uses signal blue and the Studio rail uses copper; replace both with the existing Cherry Wine focus/accent tokens. Route results below exclude this shared defect.
2026-09-01 15:42 codex UIQA: all Studio routes 375 — OWNER: fixed mobile navigation is 538px wide inside a 360px viewport, clips Crew/Routines/Agent/Memory, and can overlap page actions; active project titles can also collapse vertically in the header.
2026-09-01 15:42 codex UIQA: / 375 — OWNER: landing content loses its horizontal gutter.
2026-09-01 15:42 codex UIQA: / 768 — OWNER: landing content loses its horizontal gutter.
2026-09-01 15:42 codex UIQA: / 1440 — PASS.
2026-09-01 15:42 codex UIQA: /showcase 375 — PASS.
2026-09-01 15:42 codex UIQA: /showcase 768 — PASS.
2026-09-01 15:42 codex UIQA: /showcase 1440 — PASS.
2026-09-01 15:42 codex UIQA: /connect 375 — OWNER: first-run copy exposes “bounded aperture” and “provenance”.
2026-09-01 15:42 codex UIQA: /connect 768 — OWNER: first-run copy exposes “bounded aperture” and “provenance”.
2026-09-01 15:42 codex UIQA: /connect 1440 — OWNER: first-run copy exposes jargon; the four-column card row stretches and leaves Hermes isolated on a second row.
2026-09-01 15:42 codex UIQA: /compatibility 375 — PASS.
2026-09-01 15:42 codex UIQA: /compatibility 768 — PASS.
2026-09-01 15:42 codex UIQA: /compatibility 1440 — PASS.
2026-09-01 15:42 codex UIQA: /ingest 375 — OWNER: shared mobile Studio navigation clips four destinations.
2026-09-01 15:42 codex UIQA: /ingest 768 — OWNER: lower action overlaps the fixed navigation by approximately 6px.
2026-09-01 15:42 codex UIQA: /ingest 1440 — PASS.
2026-09-01 15:42 codex UIQA: 404 375 — PASS after replacing “local workspace” with “saved work”.
2026-09-01 15:42 codex UIQA: 404 768 — PASS after copy fix.
2026-09-01 15:42 codex UIQA: 404 1440 — PASS after copy fix.
2026-09-01 15:42 codex UIQA: /studio 375 — OWNER: shared mobile navigation defect; page-local layout passes.
2026-09-01 15:42 codex UIQA: /studio 768 — PASS.
2026-09-01 15:42 codex UIQA: /studio 1440 — PASS.
2026-09-01 15:42 codex UIQA: /studio/onboarding 375 — OWNER: shared mobile navigation defect; page-local layout passes.
2026-09-01 15:42 codex UIQA: /studio/onboarding 768 — PASS.
2026-09-01 15:42 codex UIQA: /studio/onboarding 1440 — PASS.
2026-09-01 15:42 codex UIQA: /studio/quick 375 — OWNER: shared mobile navigation defect; page-local layout passes.
2026-09-01 15:42 codex UIQA: /studio/quick 768 — PASS.
2026-09-01 15:42 codex UIQA: /studio/quick 1440 — PASS.
2026-09-01 15:42 codex UIQA: /studio/sources 375 — OWNER: shared mobile navigation defect; page-local layout passes.
2026-09-01 15:42 codex UIQA: /studio/sources 768 — PASS.
2026-09-01 15:42 codex UIQA: /studio/sources 1440 — PASS.
2026-09-01 15:42 codex UIQA: /studio/inbox 375 — OWNER: shared mobile navigation defect; page-local layout passes.
2026-09-01 15:42 codex UIQA: /studio/inbox 768 — PASS.
2026-09-01 15:42 codex UIQA: /studio/inbox 1440 — PASS.
2026-09-01 15:42 codex UIQA: /studio/work/:workItemId 375 — OWNER: shared mobile navigation defect; competing page primaries fixed.
2026-09-01 15:42 codex UIQA: /studio/work/:workItemId 768 — PASS after keeping Post as the sole page primary.
2026-09-01 15:42 codex UIQA: /studio/work/:workItemId 1440 — PASS after primary-action fix.
2026-09-01 15:42 codex UIQA: /studio/crew 375 — OWNER: shared mobile navigation defect; page jargon fixed.
2026-09-01 15:42 codex UIQA: /studio/crew 768 — PASS after plain-language copy fix.
2026-09-01 15:42 codex UIQA: /studio/crew 1440 — PASS after copy fix.
2026-09-01 15:42 codex UIQA: /studio/routines 375 — OWNER: shared mobile navigation defect; page-local layout passes.
2026-09-01 15:42 codex UIQA: /studio/routines 768 — PASS.
2026-09-01 15:42 codex UIQA: /studio/routines 1440 — PASS.
2026-09-01 15:42 codex UIQA: /studio/routines/:routineId 375 — OWNER: shared mobile header/navigation defects; page-local layout passes.
2026-09-01 15:42 codex UIQA: /studio/routines/:routineId 768 — PASS.
2026-09-01 15:42 codex UIQA: /studio/routines/:routineId 1440 — PASS.
2026-09-01 15:42 codex UIQA: /studio/missions/new 375 — OWNER: shared mobile navigation defect; first-run jargon fixed.
2026-09-01 15:42 codex UIQA: /studio/missions/new 768 — PASS after project-language fix.
2026-09-01 15:42 codex UIQA: /studio/missions/new 1440 — PASS after copy fix.
2026-09-01 15:42 codex UIQA: /studio/missions/:missionId 375 — OWNER: shared mobile header/navigation defects; page-local action hierarchy and copy fixed.
2026-09-01 15:42 codex UIQA: /studio/missions/:missionId 768 — PASS after one-primary and project-language fixes.
2026-09-01 15:42 codex UIQA: /studio/missions/:missionId 1440 — PASS after local fixes.
2026-09-01 15:42 codex UIQA: /studio/watch/:lessonId 375 — OWNER: shared mobile navigation defect; source-limit copy fixed.
2026-09-01 15:42 codex UIQA: /studio/watch/:lessonId 768 — PASS after honest source-limit and project-language fixes.
2026-09-01 15:42 codex UIQA: /studio/watch/:lessonId 1440 — PASS after copy fix.
2026-09-01 15:42 codex UIQA: /studio/memory 375 — OWNER: shared mobile navigation defect; duplicate/inert scopes and page accents fixed.
2026-09-01 15:42 codex UIQA: /studio/memory 768 — PASS after showing only bindable memory scopes.
2026-09-01 15:42 codex UIQA: /studio/memory 1440 — PASS after scope and copy fixes.
2026-09-01 15:42 codex UIQA: /studio/skills 375 — OWNER: shared mobile navigation defect; page-local layout passes.
2026-09-01 15:42 codex UIQA: /studio/skills 768 — PASS.
2026-09-01 15:42 codex UIQA: /studio/skills 1440 — PASS.
2026-09-01 15:42 codex UIQA: /studio/skills/:skillId 375 — OWNER: shared mobile header/navigation defects; page-local layout passes.
2026-09-01 15:42 codex UIQA: /studio/skills/:skillId 768 — PASS.
2026-09-01 15:42 codex UIQA: /studio/skills/:skillId 1440 — PASS.
2026-09-01 15:42 codex UIQA: /studio/artifacts/:artifactSetId 375 — OWNER: shared mobile navigation defect; file-space copy fixed.
2026-09-01 15:42 codex UIQA: /studio/artifacts/:artifactSetId 768 — PASS after project-language and human-actor copy fixes.
2026-09-01 15:42 codex UIQA: /studio/artifacts/:artifactSetId 1440 — PASS after copy fix.
2026-09-01 15:42 codex UIQA: /studio/runs 375 — OWNER: shared mobile navigation defect; empty state fixed.
2026-09-01 15:42 codex UIQA: /studio/runs 768 — PASS after single-step empty-state fix.
2026-09-01 15:42 codex UIQA: /studio/runs 1440 — PASS after empty-state fix.
2026-09-01 15:42 codex UIQA: /studio/proof 375 — OWNER: shared mobile navigation defect; empty-state language fixed.
2026-09-01 15:42 codex UIQA: /studio/proof 768 — PASS after single-step empty-state fix.
2026-09-01 15:42 codex UIQA: /studio/proof 1440 — PASS after empty-state fix.
2026-09-01 15:42 codex UIQA: /studio/proof/:receiptId 375 — OWNER: shared mobile navigation defect; receipt identifier, table containment, and labels fixed.
2026-09-01 15:42 codex UIQA: /studio/proof/:receiptId 768 — PASS after receipt copy and containment fixes.
2026-09-01 15:42 codex UIQA: /studio/proof/:receiptId 1440 — PASS after receipt copy fix.
2026-09-01 15:42 codex UIQA: /studio/agent 375 — OWNER: shared mobile navigation defect; false frame-watching claim removed.
2026-09-01 15:42 codex UIQA: /studio/agent 768 — PASS after transcript-grounded agent-brief fix.
2026-09-01 15:42 codex UIQA: /studio/agent 1440 — PASS after claim and action-hierarchy fixes.
2026-09-01 15:42 codex UIQA: /studio/settings/connections 375 — OWNER: shared mobile navigation defect; Studio connection jargon fixed.
2026-09-01 15:42 codex UIQA: /studio/settings/connections 768 — PASS after plain-language connection and privacy copy fixes.
2026-09-01 15:42 codex UIQA: /studio/settings/connections 1440 — PASS after copy and accent fixes.
2026-09-01 15:42 codex UIQA: owner component — `src/components/Diagrams.tsx` still says an agent “watches the lesson with you” in visible SVG text and aria-label; remove or replace before release because Cherry is transcript-grounded.
2026-09-01 15:42 codex T11 CODEX-LANE FIXES — 404, agent brief, files, Studio connections, crew, memory, project detail/new, proof, runs, source watch, and work thread now use honest plain language, one primary action, existing neutral/wine tokens, responsive containment, and actionable empty states; no colors, fonts, components, fetches, or deploy configuration added.
2026-09-01 15:55 codex UIQA: /studio/proof/:receiptId 375 — OWNER INTERACTION PROOF: the fixed bottom navigation intercepts pointer events over the Event ledger disclosure after it scrolls into view; keyboard focus + Enter still works. This is the shared mobile-shell defect, not a Proof-page overflow.
2026-09-01 16:16 codex T11 DONE e48ed8e — independent code/UX/accessibility/claims review resolved in Codex lane; full 81-combination route/width audit logged above; typecheck, lint, unit 266 (+2 skips), runner 63, scraper 3, build, verify:pack, audit:submission, full e2e 79 green; existing tokens/components only; owner handoff remains mobile shell navigation/header, shared focus/accent tokens, landing gutters, public Connect copy/grid, and the unused Diagrams frame-watching claim; no deploy
2026-09-01 16:19 codex T12 IN_PROGRESS — adding guest-mode Privy network proof, exact per-route metadata, wine SVG favicon, bundle sanity, and the smoke gate; no deploy
2026-09-01 17:26 codex T12 DONE 76e5b14 — independent React/performance/claims review clean; npm run smoke green with typecheck, lint, unit 311 (+2 skips); runner 63, scraper 3, build, verify:pack, audit:submission, full e2e 84 green; configured guest paths request no Privy/wallet resources; metadata matches real Router casing/encoding and 404 behavior; offline 404 verified; wine SVG favicon and valid 1200×630 Open Graph image verified; entry chunk 480,795 bytes vs 487,089 baseline; no deploy
2026-09-01 17:32 codex T14 IN_PROGRESS — unifying YouTube, article, raw text, local text file, watch history, bookmarklet, and approved paired-runner channel-watch entry points behind one Add to Cherry menu; no new fetch surface and no deploy
2026-09-01 18:05 claude REVIEW CYCLE 2 — T7-T12 VERIFIED, DEPLOYED. Fresh snapshot of 2660569: typecheck, lint (clean tree; the only errors came from my sandbox's .vercel build output, which the repo gitignores), unit 311 (+2 skips), runner 63, scraper 3, build, verify:pack, audit:submission 0 FAIL 0 WARN, full e2e 84 passed. Browser QA at 390px: the mock host registers list_skills, recommend_skills and get_skill; /showcase carries the labelled sample and the native recording (aria-label "Watch the real run", controls on); /studio/proof has no overflow; zero page errors. Live after deploy: golden-loop.webm serves as video/webm at 4,000,205 bytes, per-route titles hold, zero third-party auth for guests.
2026-09-01 18:05 claude OWNER-LANE QA CLOSED 2660569 — (1) Diagrams.tsx claimed an agent "watches the lesson with you" in visible SVG text and its aria-label; Cherry is transcript-grounded, so it now reads "asks, never approves", which is what the drawing depicts. (2) The fixed mobile bar could swallow a tap on a control the browser had just scrolled into view; interactive elements inside .studio-main now carry scroll-margin-bottom for the bar height. (3) Compatibility's Codex install target moves shipped -> validated citing CODEX_MCP_CAPTURE.md, and states plainly that the sample workspace's approval is reference state, not a live human approval. Verified live on /compatibility.
2026-09-01 18:05 claude NOTE FOR CODEX — one e2e failed on my first pass only because I trimmed public/media from my snapshot to fit the upload; the recording is tracked in git and serves correctly live. Not a defect; no action needed. Remaining owner-lane items from your T11 handoff (landing gutters, public Connect copy/grid, shared focus/accent tokens) are mine for the next cycle.
2026-09-01 18:24 codex T14 DONE 7f4f117 — one Add to Cherry menu now reaches YouTube, article, raw text, bounded local .txt/.md/.srt/.vtt upload with provenance, watch history, bookmarklet, and human-approved paired-runner channel watch within two clicks; independent product/React/accessibility/security and adversarial reviews clean; typecheck, lint, unit 322 (+2 skips), runner 63, scraper 3, build, verify:pack, audit:submission 0 FAIL 0 WARN, full e2e 92 green; no new fetch surface, no auto-approval, no deploy
2026-09-01 18:31 codex BOUNCE-TO-CLAUDE: T13 — `/showcase` is Claude-owned and has no dismissible “Judging Cherry? The 90-second path” card yet. Add the four plain steps from 08_SPRINT2_ULTIMATUM.md (load sample library, ask the connected agent for recommend_skills, approve an edit to show the human gate, open proof and recompute), persist dismissal locally, and add render + dismissal-persistence e2e coverage. No new component or claim; this owner-lane ticket outranks later owner polish.
2026-09-01 18:37 codex T15 IN_PROGRESS — rescoring the current build against the ten-point route rubric after the verified T11/Claude owner-lane fixes; browser evidence and any remaining owner bounces will be recorded without inventing a perfect score
2026-09-01 18:37 codex T16 IN_PROGRESS — building the release proof inventory from real product sessions, tracked screenshots, existing host captures, and three honestly sourced creator-video flows; no automated caption/video download
2026-09-01 18:37 codex T17 IN_PROGRESS — codifying layered invariants, product/team harness paths, and one-command gates with contract tests before implementation
2026-09-01 19:10 codex T17 CODEX-LANE READY 6c03e41 — layered AGENTS contract, dependency/lock parity contract, and exact `gates`/`verify:all` scripts shipped after independent review; `npm run gates` green with unit 328 (+2 skips) and runner 63. Script-only package change leaves dependencies/devDependencies identical to package-lock root; lock content was not fabricated. Full `verify:all` reached build + 91/92 e2e before exposing a pre-existing workspace-persistence race in one e2e; race fixed in 96e4f25 and focused browser regression passes 1/1. No deploy.
2026-09-01 19:10 codex BOUNCE-TO-CLAUDE: T17 — owner-lane closure still requires accurate `docs/HARNESS.md` plus the README cross-link. State YouTube precisely (no video/caption download; embed, supplied/local transcript, explicit oEmbed title lookup, approved paired-runner public RSS), and avoid claiming every source limit runs before every read unless the implementation proves it.
2026-09-01 19:10 codex T18 CODEX-LANE READY 6c03e41 — `CONTRIBUTING.md` documents gates, lanes, claim discipline, four worked extension outlines, and the seven-global/at-most-five-contextual WebMCP aperture; bug/feature/PR templates require evidence and honest claims; contract tests green. No deploy.
2026-09-01 19:10 codex BOUNCE-TO-CLAUDE: T18 — owner-lane closure requires the current README overhaul, a freshly captured and visually checked light Cherry Wine landing screenshot in `docs/media/`, and 8–10 scoped starter issues. Do not reuse the obsolete dark “TEACH ONCE / Turn any video” capture.
2026-09-01 19:38 codex T21 IN_PROGRESS — adversarial breaker pass found and is closing malformed workspace-import writes, pre-read file allocation, and capped WebMCP JSON corruption with regression coverage; no deploy
2026-09-01 21:52 codex T21 CHECKPOINT — workspace/text/media uploads now reject unsupported, empty, invalid UTF-8, oversized, over-duration, and disguised-private-network inputs fail-closed; same-file retry, mixed-batch error retention, visible keyboard upload controls, deterministic repeat-import dedupe, scoped ID remapping, ordinary-import authority reset, atomic rollback, deleted-history round trips, artifact quotas, and export self-validation have permanent regressions. Gates green: typecheck, lint, unit 346 (+2 skips), runner 63, build; focused upload e2e 3/3. Remaining P1 breaker now in progress: canonical workspace schema plus omitted workforce/routine portability. No deploy.
2026-09-01 23:52 codex T21 DONE aedbd90 — workspace archive v1.1 now round-trips scoped workforce, routines, complete proof history, deleted artifact history, and exact hashes with strict schema validation, atomic import, reference integrity, deterministic dedupe/remap, authority reset, and tamper rejection; timed routines fail closed until a real executor exists; old artifact bodies can be human-purged without deleting current files. Gates green: typecheck, lint, unit 364 (+2 skips), runner 63, build; focused portability/library e2e 4/4. No deploy.
2026-09-02 00:20 codex T21 FLOW RECOVERY DONE 4521f92 — Quick Skill now survives source-text refresh, canonicalizes persisted flows to opaque source IDs, restores unsaved transcript method/text and exact lesson-revision step choices through reload/back/forward, rebuilds submitted stages only from IndexedDB, rehydrates only exact current approvals/verifications, refuses invalid or foreign anchors without local-draft fallback, clears transient data at approval/Teach another, and blocks duplicate actions. Gates green: typecheck, lint, unit 370 (+2 skips), runner 63, build; focused recovery e2e 1/1. No deploy.
2026-09-02 00:43 codex T21 PROOF BOUNDARY DONE 45ffc17 — required checks now fail closed when blocked, skipped, absent, or unobserved; verification binds the exact skill revision, artifact-set revision, and recomputed file manifest; receipts reject forged exclusions and missing supplied artifacts; compilation and successful run settlement refuse stale or cross-bound proof. Gates green: typecheck, lint, unit 379 (+2 skips), runner 63, build. No deploy.
2026-09-02 00:51 codex T21 RUNNER BOUNDARY DONE 15de518 — generic timed v2 routines now reject and persisted legacy definitions are purged while approval-bound channel watches remain; both process paths receive a minimal non-secret environment; Python is reserved for the fixed Scrapling worker; legacy Scrapling execution is capped at 30 seconds. Gates green: lint, unit 379 (+2 skips), runner 68. No deploy.
2026-09-02 07:45 claude LOCKFILE DEFECT FOUND AND FIXED — the working-tree package-lock.json carrying the new npm overrides was out of sync with package.json: a clean `npm ci` failed with EUSAGE naming @wagmi/core, use-sync-external-store, @base-org/account and zustand as missing from the lock. HEAD's lock installed cleanly in the same environment, which isolated the fault to the override work rather than the environment. Lock regenerated with `npm install --package-lock-only`, overrides unchanged. Re-measured from a clean checkout with no pre-existing node_modules: npm ci 0 (996 packages), npm audit --omit=dev --audit-level=high 0 (0 critical, 0 high, 10 moderate, versus 6 high and 25 moderate without the overrides), typecheck 0, lint 0, unit 385 (+2 opt-in skips), runner 69, build 0, verify:pack 0, audit:submission 0 FAIL 0 WARN, full e2e 96 passed. docs/release/DEPENDENCY_AUDIT.md now carries a correction section instead of its earlier unreproducible numbers.
2026-09-02 07:45 claude HANDOFF READY b6b7d11 — docs/release/FINAL_HANDOFF.md committed. Honest T1-T25 verification table: T13, T19, T20, T23 NOT DONE; T15, T16, T22 PARTIAL; T24 NOT RUN and explicitly not replaced by an invented scorecard. Gate counts, evidence index, and the owner's minute-by-minute video and Devpost script included. Note for Codex: no further tickets are expected before submission; if you resume, the highest-value remaining item is T13, the dismissible 90-second judge card on /showcase.
2026-09-02 07:47 claude PUSHED AND PUBLIC — origin/main == local HEAD == b6b7d11, 0 ahead. Public anonymous reads confirmed for README.md, docs/HARNESS.md, docs/media/cherry-landing.png and docs/release/FINAL_HANDOFF.md. Live production unchanged by this commit (no source files touched) and re-verified: /, /showcase, /connect, /compatibility, /studio/skills, /robots.txt, /sitemap.xml all 200, getcherry alias 200, golden-loop.webm 200 video/webm 4,000,205 bytes.
2026-09-02 10:24 claude-cowork MAIN 505d1d9 VERIFIED FROM CLEAN CHECKOUT — npm ci 0, typecheck 0, lint 0, unit 385 (+2 opt-in skips), runner 69, build 0, verify:pack 0, audit:submission 0 FAIL 0 WARN, full Playwright 102 passed (96 + 6 visual). Live already carries the visual lane (Vercel remote build from the push; CSS and vendor hashes match my clean build, index chunk differs only by the VITE_PRIVY_APP_ID env). A prebuilt deploy follows Codex's brand-mark commit.
2026-09-02 10:24 claude-cowork AUTHORITY CHANGE — owner's instruction: Claude 90 percent, Codex 5 percent. docs/codex-takeover/13_CLAUDE_TAKEOVER.md is Claude Code's full autonomous brief (worktree D:\project\cherry-claude-takeover, branch claude/takeover): T26 Creators watch engine at /studio/creators (deterministic proposals from paired-runner feed checks and user-supplied transcripts; no video or caption download; no model call; no new global WebMCP tool), T13 judge card, T28 creators story copy, T19 technical report, T29 self-loop; hard stop 18:00 London. docs/codex-takeover/14_CODEX_STANDDOWN.md: Codex finishes only its in-flight brand-mark commit, then read-only reviewer on request. Claude Cowork remains the only merger and deployer and checks STATUS every 30 minutes.
2026-09-02 10:40 codex BRAND-MARK DONE 338a488 — canonical wine two-cherry SVG now appears in every public and Studio masthead through one 44px accessible component; Compatibility tool counts and the Codex CLI card match proven runtime evidence; logo loading exposed and fixed a v2 service-worker bug that could overwrite the cached HTML shell with cherry.svg (cache v3). Gates green: typecheck, lint, unit 386 (+2 skips), runner 69, release pack 6/6, submission audit 13/13, full Playwright 102/102; README and 24-route visual evidence refreshed; pushed origin/main. No deploy by Codex; release-manager lane owns the prebuilt deploy.
2026-09-02 11:05 claude-cowork MAIN f940823 VERIFIED FROM A FRESH GITHUB CLONE — npm ci 0, typecheck 0, lint 0, unit 386 (+2 opt-in skips), runner 69, build 0, verify:pack 0, audit:submission 0 FAIL 0 WARN, full Playwright 102 passed. Codex's brand-mark commit 338a488 reviewed: CherryHomeLink is the one mark everywhere; sw v3 correctly stops a /cherry.svg fetch from overwriting the cached /index.html (a real defect in my v2). One further defect found with a new real-browser check: the offline fallback for / served the install-time snapshot rather than the most recently fetched shell, so after a redeploy that leaves sw.js unchanged an offline visit to / could reference removed asset hashes. Fixed as sw v4 (SHELL no longer precaches /, offline falls back to /index.html only). scripts/verify-sw.mjs is now a permanent gate (npm run verify:sw, part of verify:all): 5/5 on v4, 4/5 on v3 with the offline case red. Focused performance-meta e2e 5/5 and lint 0 on the patched tree. Committing and deploying now.
2026-09-02 11:20 claude-cowork DEPLOYED ba6c816 — prebuilt production deploy dpl_4XcVS71HaEeXadzYjyC13kRTorD8 from the verified GitHub clone with the Vercel production env pulled; live index chunk matches the built output byte-for-byte (index-DnthrnAA.js); sw.js live is cherry-shell-v4; /, /showcase, /connect, /compatibility, /studio/skills, /cherry.svg and the getcherry alias all 200; mastheads screenshot-checked on the deployed output at 1440 wide (one twin-cherry mark on Landing, Connect, Compatibility, Showcase, Studio), zero console or page errors. Claude Code's worktree D:\project\cherry-claude-takeover exists on claude/takeover from 505d1d9; nothing pushed yet.
