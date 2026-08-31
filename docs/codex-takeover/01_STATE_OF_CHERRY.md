# State of Cherry — ground truth as of Tue 1 Sep 2026, 00:15 London

Read this before touching code. Trust the repo over any older report, including your own.

## Current baseline

- HEAD: `c450b50` (deterministic-deploy fix). Working tree may carry small WIP from either agent;
  never commit files outside your lane.
- Live: https://cherry-wine.vercel.app — restored and render-verified at 23:05 UTC from prebuilt
  output of the committed tree. Alias https://getcherry.vercel.app 307s to it (by design).
- Gates on the merged tree (both agents' work): typecheck ✓, lint ✓, unit 168 (+2 skips) ✓,
  runner 42 ✓, build ✓, Playwright e2e 43 ✓.
- GitHub `vaibhav4046/cherry` is ~100 commits behind local. Pushing is part of your job now
  (Non-negotiable #4).

## Tonight's incident (why the deploy rules exist)

Production served a **blank page** (app never mounted). Contributing causes found in the audit:
a deploy built remotely with pnpm while HEAD's `package-lock.json` was out of sync with
`package.json` (the lockfile edit was uncommitted), so the remote build resolved different
dependency versions than every local gate ran against. Fixed by: deploying locally verified
prebuilt output, syncing the lockfile, and pinning `installCommand: npm ci` +
`buildCommand: npm run build` in `vercel.json` (`c450b50`). Single-deployer rule is now in force.

## What exists and works (do not rebuild any of this)

- **Golden loop**, e2e-proven in one browser session: source → transcript → evidence (trust
  labels) → versioned skill → exact-revision human approval → artifact → honest fail → repair →
  verified pass → receipt (SHA-256 over RFC 8785) → memory → routine reuse → export/import.
- **Sources Inbox** (`/studio/sources`, `src/cherry/source/`): YouTube/article/note/file sources,
  provenance, content hashes, duplicate detection, archive/recovery, honest fetch states,
  optional user-triggered Scrapling static fetch through the paired local runner, fail-closed.
- **Skill Library** (`/studio/skills`, `src/cherry/library/`): cross-workspace aggregation,
  search, install-ready gating, approval hashes, exports (SKILL.md / AGENTS.md / CLAUDE.md /
  verified .zip bundle).
- **WebMCP layer** (`src/cherry/webmcp/`): ~45 state-aware tools; 7 global reads including
  `list_skills`, `recommend_skills`, `get_skill` (chunked delivery + full-file sha256); bounded
  aperture; live inspector (Agent View); mock-host e2e through registered closures only.
- **Workforce + routines**: crew seats, work inbox with legal transitions, routines bound to
  approved revision + action hash, local runner (42 tests) with receipts, MCP stdio bridge
  (`runner/mcp/server.mjs`).
- **Connect** (`/connect`): per-host onboarding with honest status labels.
- **Auth**: opt-in Privy (email code) — live on production since tonight's CSP fix (`a930f5e`);
  guest-first is untouched and remains the default and the judge path.
- **Docs of record**: `docs/CHERRY_NORTHSTAR.md` (positioning/architecture),
  `docs/release/DEVPOST_SUBMISSION.md`, `docs/release/DEMO_SCRIPT.md`, `docs/CHERRY_DECISIONS.md`
  (through D-023), `docs/release/WEBMCP_CHANGELOG.md`, `docs/CAPABILITY_MATRIX.md`.

## The honest gap the tickets close

A new user currently meets vocabulary and structure before value: workspace, mission, lesson,
transcript, SkillGraph. The vision ("Cherry watches so you don't have to; skills just appear in
your workflow") needs the compliant, shippable version of itself:

- One-paste path from URL to approved skill (T1) instead of a five-noun setup.
- One-click capture from any tab via bookmarklet + `/ingest` (T2) instead of copy-paste routines.
- Watch-history import that proposes skills from the user's own exported data (T3) instead of a
  fantasy of reading their YouTube account.
- Channel watching via public RSS through the paired runner (T7) instead of scraping.
- Plain language everywhere a user reads (T6).

What stays out (and why it stays out is part of the pitch): scraping LinkedIn, downloading
videos, watching accounts server-side, auto-approval of anything. `05_GUARDRAILS.md` has the
exact lines.
