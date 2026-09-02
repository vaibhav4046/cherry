# 13 · CLAUDE TAKEOVER — Claude builds, Codex stands down, Claude Cowork ships

**Issued:** 2026-09-02, 10:15 London, by Claude Cowork (release manager)
**For:** Claude Code (Fable 5.1) working autonomously in its own worktree
**Owner:** Vaibhav. He will not be in the room. Do not ask him anything unless a human-only
credential or an irreversible external decision blocks you; otherwise decide, record, continue.
**Hard deadline for the hackathon:** Thursday 3 September 2026, 21:00 London.
**Your hard stop for feature work:** today, Wednesday 2 September, 18:00 London. At 18:00 you
stop adding, push whatever is green, and write the final report. Unfinished work is reported,
never hidden and never half-merged.

This document replaces `00_MASTER_PROMPT.md` as the division of authority from this moment.
Everything in `05_GUARDRAILS.md`, `04_COPY_GUIDE.md`, and `03_DESIGN_DIRECTIVE.md` still binds.

---

## 0. Division of authority from now

| Who | Share | Does | Never does |
|---|---|---|---|
| **Claude Code (you)** | 90 percent | Builds every ticket below in worktree `D:\project\cherry-claude-takeover` on branch `claude/takeover`; owns `src/**`, `runner/**`, `e2e/**`, `tests/**`, `public/**` (except the items reserved below); writes tests first; appends to STATUS | Deploys. Merges into main. Edits `package.json`, `package-lock.json`, `vercel.json`, `public/sw.js`, `public/_headers`. Touches the nav brand mark (reserved, see 0.1). Adds Claude or Anthropic attribution to commit messages (the repo's `no-claude` commit hook rejects it and you must not bypass the hook) |
| **Claude Cowork** | release manager | Verifies your branch from a clean checkout, merges to main, deploys prebuilt to Vercel, verifies live, lands the brand-mark consistency fix (T27) on main, writes the release evidence | Builds features while you are building them |
| **Codex** | 5 percent | Read-only reviewer. Runs the Windows-native full Playwright matrix on a branch when asked in STATUS and appends counts. Nothing else | Edits any file. Merges. Deploys. Opens new tickets |

### 0.1 Reserved: the brand mark (do not touch, rebase over it)

At 10:12 London Codex was mid-way through the owner's "make the logo consistent" request in the
main working tree: a new `src/components/CherryHomeLink.tsx` (the canonical `/cherry.svg`
twin-cherry mark inside the `.logo-mark` home link, with `tests/cherry/cherry-logo.test.tsx`),
used by `Landing.tsx`, `Connect.tsx`, `Compatibility.tsx`, `Showcase.tsx`, and
`studio/StudioLayout.tsx`, plus the `.logo-mark` rules in `tokens.css` / `apple.css`. Codex
finishes that one commit, pushes it, and stands down (see `14_CODEX_STANDDOWN.md`). Claude Cowork
verifies and deploys it.

You **use** `CherryHomeLink` wherever a page needs the mark (including the new Creators page
through `StudioLayout`) and you never redefine, restyle, or replace it. Before every push,
`git fetch origin` and `git rebase origin/main`; if the nav conflicts, take main's version.

---

## 1. Non-negotiables (unchanged in spirit, restated so you never have to open another file)

1. **Never deploy.** Claude Cowork deploys prebuilt output after verifying your branch. If you ever
   run `vercel`, you are wrong.
2. **`npm ci` is law.** You must not change dependencies. If a ticket seems to need one, it does
   not; find the in-tree way.
3. **Gates before every commit:** `npm run typecheck`, `npm run lint`, `npm run test`,
   `npm run test:runner`, `npm run build`. **Full `npx playwright test` before every push.**
   Record exact counts in STATUS. A hung Playwright process is not a green gate.
4. **Honesty is the product.** No claim in code, copy, tests, docs, or STATUS may exceed what a
   test, a receipt, or a captured session demonstrates. If you cannot prove it, say
   "not verified" in the exact place a reader would otherwise believe it.
5. **Guardrails, hard lines:** no LinkedIn scraping. No downloading YouTube video or captions by
   automation, ever, from any component. No headless automation of anyone's ChatGPT, Codex, or
   Claude account. No background cloud execution and no hidden network calls from the browser
   (the runner is loopback-only and user-triggered or user-approved). No auto-approval: approval,
   trust promotion, and memory promotion are human-only. Private-network fetch protection stays in
   the runner. No secrets anywhere.
6. **WebMCP invariants:** 7 global read tools, at most 5 contextual mutation tools per surface,
   register/unregister strictly by product state, every call lands in Agent View. Do not add a
   global tool. Extend `list_sources` output instead of adding a tool.
7. **Design is frozen:** existing tokens and components only. No new font, radius, shadow,
   spacing, colour, or icon system. One primary action per screen. No emoji, no exclamation
   marks, no em dashes in new copy. Real brand SVGs only where the integration is real or
   explicitly labelled a target.
8. **Copy:** plain language per `04_COPY_GUIDE.md`. "Proof" not "receipt" in ordinary UI.
   "Tools the agent can use right now" not "aperture". "Where this came from" not "provenance".
9. **Loop is law:** RED (write the failing test or reproduce in the browser) → FIX → PROVE
   (focused test green, gates green) → REGRESS (the failing case stays in the suite forever).
   Never fake a fix: no silenced logs, no hardcoded outcomes, no spinner hiding a failure.
10. **STATUS is the only channel.** Append to `docs/codex-takeover/STATUS.md` with the format
    `YYYY-MM-DD HH:MM claude-code <TICKET> <STATE> <sha> — <what, with counts>`. States:
    IN_PROGRESS, CHECKPOINT, DONE, BLOCKED, NOT DONE. Never edit earlier lines.

---

## 2. State of Cherry at `505d1d9` (origin/main, verified by Claude Cowork 2026-09-02)

- Live: `https://cherry-wine.vercel.app` (canonical) and `https://getcherry.vercel.app` (alias).
  Deploys are prebuilt from a verified local build; a push to main also triggers a Vercel
  remote build with `installCommand: npm ci`, which is why the lock must never drift.
- Gates on `b6b7d11` from a clean checkout: `npm ci` 0 (996 packages), typecheck 0, lint 0,
  unit 385 (+2 opt-in skips), runner 69, build 0, verify:pack 0, audit:submission 0 FAIL 0 WARN,
  Playwright 96 passed. `505d1d9` merged Claude Code's visual lane on top (37 files, +6 visual e2e)
  and Codex reports 102 green; Claude Cowork is re-verifying that from a clean checkout now and
  will note the result in STATUS.
- Product surfaces that exist and work: Quick Skill (`/studio/quick`), Sources with one
  "Add to Cherry" menu (YouTube link, article via approved runner fetch, raw text, local
  .txt/.md/.srt/.vtt upload, watch-history Takeout import, bookmarklet, channel watch through the
  paired runner), lessons with transcript and timestamped observations, evidence with trust
  labels, versioned SkillGraph with exact-revision human approval, artifacts, verification with
  honest fail/repair/pass, tamper-evident receipts (SHA-256 over RFC 8785 canonical JSON), the
  cross-workspace Skill Library with SKILL.md / AGENTS.md / CLAUDE.md exports and zip bundles,
  WebMCP tools (7 global + contextual), the stdio MCP bridge validated against a live Codex CLI
  (`docs/release/CODEX_MCP_CAPTURE.md`), crew, inbox, routines, Agent View, opt-in Privy, `/showcase`
  with the uncut recording, `/connect`, `/compatibility`.
- Channel watch today (`src/cherry/source/channel-watch-*.ts`, `runner/lib/youtube-rss-watch.mjs`):
  a human starts a watch from Sources; the paired runner checks the channel's public RSS feed
  daily; new uploads become `SourceRecord`s with `sourceOrigin: 'rss-watch'`, title, url,
  videoId, publishedAt. **It stops there.** Nothing proposes a skill, nothing surfaces "what is
  new from the creators you follow", and a judge in a plain browser (no runner) sees only the
  honest "Channel watch is not enabled" line. This is the gap the owner calls
  "the skill watch engine is not there".
- Known not done from earlier sprints: T13 judge card on `/showcase`, T19 technical report,
  T20 launch kit, T23 landing self-demo, T24 tribunal. See `docs/release/FINAL_HANDOFF.md`.

---

## 3. Setup (do exactly this)

```powershell
cd D:\project\cherry
git fetch origin
git worktree add -b claude/takeover D:\project\cherry-claude-takeover origin/main
cd D:\project\cherry-claude-takeover
npm ci
npm run gates
```

If the branch or worktree exists, inspect it, then use `claude/takeover-2`. Never delete or
force-reset anything. Dev server: `npm run dev -- --host 127.0.0.1 --port 4177`. Preview for
Playwright uses 4173 through the config; do not run a second preview on 4173.

Read before writing a line: `AGENTS.md`, `docs/HARNESS.md`, `04_COPY_GUIDE.md`,
`05_GUARDRAILS.md`, `src/cherry/source/channel-watch-service.ts`, `src/pages/studio/Sources.tsx`,
`src/pages/studio/QuickSkill.tsx`, `src/cherry/webmcp/tool-definitions.ts`,
`src/cherry/persistence/example-workspace-loader.ts`, `e2e/cherry/visual-qa.spec.ts`.

---

## 4. Tickets, in this order. Finish one before starting the next.

### T26 · P0 — The Creators watch engine (`/studio/creators`)

**Why.** The owner's thesis is "you learn from creators; your agents can't; Cherry fixes that."
Today the site proves teach → approve → serve, but the *follow a creator → new upload → proposed
skill → approve* loop is invisible. This ticket makes it one screen a judge can read in 30 seconds
and a user can drive in a minute, without breaking a single guardrail.

**What Cherry may do, precisely.** Check a channel's public RSS feed on the paired local runner
(exists). Read title, url, videoId, publishedAt (exists), and, if trivially safe, a plain-text
description capped at 2,000 characters marked untrusted (new, optional; `runner/lib/youtube-rss-watch.mjs`
currently drops descriptions on purpose, so if you add it, keep the cap, add a runner test that
proves the cap and that HTML is stripped, and note the boundary change in STATUS). Propose a
skill deterministically from that metadata and, when present, the transcript the human supplied
or transcribed on-device. **Never** fetch the video, captions, or the page. **Never** call a
model. The proposal is a starting point the human or a connected agent finishes.

**Build.**

1. `src/cherry/source/proposal-model.ts` and `proposal-service.ts` (domain layer, no React):
   - `SkillProposal { id, workspaceId, sourceId, creatorName, sourceTitle, publishedAt, name, teaches: string, candidateSteps: string[], readiness: 'needs-transcript' | 'draft-ready' | 'drafted' | 'approved' | 'dismissed', missionId: string | null, skillGraphId: string | null, createdAt, updatedAt }`
   - `proposeFromSource(source, lesson?)`: deterministic. `name` from the title using the same
     content-derived naming rule Quick Skill uses (never the source label). `teaches` is one
     calm sentence derived from the title (and description if present), e.g. "How to set up a
     cold-email sequence that gets replies." `candidateSteps` only when a transcript exists
     (reuse `transcript-parser.ts` and `coverage.ts`); otherwise empty and readiness
     `needs-transcript`. Unit tests: title-only, title+description, transcript present,
     hostile HTML in description, empty title, duplicate source, idempotent re-propose.
   - Proposals persist in Dexie with a migration (`migrations.ts`), export/import through the
     workspace archive (`workspace-archive.ts` v1.1 rules: schema validation, remap, dedupe),
     and emit ProofEvents like every other mutation.
   - Lifecycle: created when a source arrives from `rss-watch`, `takeout-import`, or a manual
     YouTube save; moves to `draft-ready` when the source's lesson gains a transcript; `drafted`
     when a mission/skill graph exists for it; `approved` when that skill graph's approval
     matches its current revision; `dismissed` by the human. Never auto-approves anything.
2. `src/pages/studio/Creators.tsx` at `/studio/creators`, nav label **Creators** between Sources
   and Skills, `RouteMeta` entry "Creators · Cherry Wine" with description
   "What is new from the creators you follow, and the skills Cherry proposes from it."
   - Header: "What's new from the creators you follow". One primary action: **Follow a creator**
     (opens the existing Start-a-channel-watch dialog from Sources; do not fork it).
   - Runner state, honest and specific: paired → "Daily check runs on your paired runner. Last
     checked <time>." Not paired → "Pair the local runner to check channels automatically. You
     can still paste any video link now." with the existing pairing link. Never pretend a check
     happened.
   - Followed creators list: name, channel id, last checked, count of new uploads, Stop.
   - "New from your creators": one row per proposal, newest first: creator, title, published,
     readiness sticker, and exactly the actions that are true for its state:
     `needs-transcript` → **Add transcript** (to `/studio/quick?sourceId=<id>&method=paste`) and
     **Transcribe on this device** (`method=transcribe`) and **Not useful**;
     `draft-ready` → **Draft the skill** (`/studio/quick?sourceId=<id>`) and **Not useful**;
     `drafted` → **Open draft**; `approved` → **Open in library**.
   - Empty state when nothing is followed: the three honest sentences and the primary action.
   - Mobile: no overflow at 390px; bottom nav clearance (`scroll-margin-bottom` pattern exists).
3. `src/pages/studio/CommandCenter.tsx`: one quiet card "Creators" showing followed count and
   proposals waiting, linking to `/studio/creators`. No new component.
4. WebMCP: extend the `list_sources` result rows with `proposal: { readiness, name, teaches } | null`.
   Do not add a tool. The agent flow that already exists (`prepare_source_for_skill` →
   `import_transcript` → `generate_quick_skill` → `request_checkpoint_approval`) is how a
   connected agent finishes a proposal. Add a mock-host e2e proving `list_sources` returns the
   proposal fields and that no new global tool registered (count stays 7).
5. Sample for judges: extend the labelled starter library (`example-workspace-loader.ts` and its
   fixture) with one followed creator (synthetic, clearly labelled, no real person or channel)
   and two new uploads: one with a supplied transcript (`draft-ready`) and one without
   (`needs-transcript`). Reset demo must remove them. The sample must never show as a real watch:
   creator row carries the existing synthetic sticker.
6. Sources page: proposals also visible inline on each `rss-watch` / YouTube source card as one
   line ("Cherry proposes: <name> · <readiness>") linking to Creators. Nothing else changes there.
7. Copy rules for this ticket, verbatim allowed sentences:
   - "Cherry checks the channel's public feed once a day on your paired runner."
   - "Cherry never downloads the video. Add the transcript and Cherry drafts the steps."
   - "A proposal is a starting point. You approve the exact version you read."
   Forbidden: "watches every video", "understands the video", "automatically learns", "AI
   watches", "auto-approves", anything implying cloud execution.

**Tests you must add (RED first).**
- Unit: proposal-service (≥ 12 cases as listed), migration up/down for the new table, archive
  round-trip with proposals, lifecycle transitions including "approval goes stale on revision
  change".
- Runner: description cap + HTML strip (only if you add description).
- e2e (desktop + the responsive spec for mobile): empty state; sample loaded shows 1 creator +
  2 proposals with correct readiness and only the true actions; `needs-transcript` → Add
  transcript → paste → back on Creators the row is `draft-ready`; Draft the skill lands in Quick
  Skill with the source preselected; Not useful moves to dismissed and survives reload; Reset
  demo removes sample creators; axe serious violations 0; keyboard-only path through Follow a
  creator dialog; no console errors.

**Done means:** all of the above green, STATUS line with counts, screenshots at 1440×900 and
390×844 saved to `docs/release/screenshots/creators/` (empty, sample, draft-ready), and one
paragraph in `docs/release/CHERRY_RELEASE_EVIDENCE.md` under a new "Creators" heading stating
exactly what is proven and what is not (no live real-channel capture unless you actually ran the
paired runner against a real public feed; if you did, record channel id, time, and entry count).

### T13 · P0 — The 90-second judge card on `/showcase`

A dismissible card at the top of the showcase canvas, above the rail: heading "Judging Cherry?
The 90-second path", four plain steps: (1) Load sample library, (2) open Creators and see what
Cherry proposed from a new upload, (3) approve one skill draft to see the human gate, (4) open
Proof and recompute the hash. Each step is a real link. Dismissal persists in localStorage under
`cherry.showcase.judgeCard.dismissed`; a "Show judge path" quiet link restores it. Fold the
existing `showcase-judge-script` details into this card (one judge surface, not two). e2e:
renders on fresh visit, links resolve, dismissal persists across reload, restore works, mobile
no overflow, axe clean.

### T28 · P1 — The creators story on the landing and showcase copy

Landing: in the three-step band, step 01 "Learn from the source" gains one sentence: "Follow a
creator and Cherry proposes a skill from each new upload; you add the transcript, you approve."
Under **Learns from**, keep YouTube only. No new section, no new image. Showcase chapter
"Source" step detail mentions Creators once. `/compatibility`: add a row "Creators watch engine"
with status Shipped (deterministic proposals, paired-runner daily feed check) and the honest
note "No video or caption download; transcript is supplied by the user or transcribed on-device.
Live real-channel check: <validated with capture | not captured>". e2e copy assertions updated.

### T19 · P1 — `docs/release/TECHNICAL_REPORT.md`

One document, assembled from what exists, nothing invented: architecture (domain layer, WebMCP
layer, MCP bridge, runner, persistence, proof), the two harnesses (link `docs/HARNESS.md`), the
Creators engine and its boundaries, the security model (link the audits), the gate counts from
your final run, the evidence index (copy from FINAL_HANDOFF section 4 and add Creators), and a
"What is not proven" section. Under 400 lines. Plain language, no em dashes.

### T29 · Continuous until 18:00 — Your own 10/10 loop on what you shipped

After T26 and T13 are green, spend remaining time only on: routes you touched at 1440×900 and
390×844, keyboard, focus, contrast, copy honesty, console errors, and every e2e you added run
three times in a row (flakes are defects). Log each pass in STATUS. Do not start T20 or T23.

---

## 5. Verification protocol (every time, no shortcuts)

```powershell
npm run gates                 # typecheck, lint, unit, runner
npm run build
npx playwright test           # full matrix, all projects
npm run verify:pack
npm run audit:submission
```

Before push: `git fetch origin && git rebase origin/main`, rerun the full matrix if the rebase
touched anything you changed, then `git push -u origin claude/takeover`. Commit messages:
conventional prefix, plain body, **no attribution trailers** (repo hook).

If a gate is red for a reason outside your tickets, do not patch around it: write
`BLOCKED <reason>` in STATUS with the failing test name and stop that ticket. Claude Cowork reads
STATUS every 30 minutes.

---

## 6. Reporting

Append to STATUS at every state change. At 18:00 London (or earlier if everything is done),
append `claude-code TAKEOVER FINAL <sha>` with: tickets DONE / NOT DONE, exact gate counts from
the last full run, files changed count, screenshot paths, anything you could not prove, and the
one command Claude Cowork should run to review: `git fetch origin && git diff origin/main...origin/claude/takeover --stat`.

Then stop. Claude Cowork merges, verifies from a clean checkout, deploys, and verifies live. You
do not wait for that; you are done when the report is appended and the branch is pushed.

---

## 7. What "perfect" means here, so nobody grades on vibes

Perfect is not a feeling. It is: every ticket above DONE with its listed tests green three times;
zero console errors on every route at both widths; zero axe serious violations; every capability
label on `/compatibility` backed by a named test or capture; zero claims in copy that the
guardrails forbid; a full Playwright matrix green on a clean checkout; and a STATUS log a stranger
can follow without you. If any of those is false at 18:00, the report says which, and the product
ships without that piece rather than with a lie in it.
