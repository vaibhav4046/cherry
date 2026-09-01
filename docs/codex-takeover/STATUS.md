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
