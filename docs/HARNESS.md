# The Cherry harness

Two harnesses matter in this repository: the **product engine** that turns a source into a skill
your agents can use, and the **team harness** that builds it. Both exist to make one thing true:
nothing is claimed that is not proven.

This document describes what the code does today. Where a capability is partial or unproven, it
says so.

## Part 1: The product engine

### Five movements

```
sources ──▶ evidence ──▶ skill ──▶ approval ──▶ verification ──▶ library ──▶ agents
            (untrusted)   (versioned) (human-only) (can fail)     (install-ready)
```

**1. Ingestion** (`src/cherry/source/`, `src/cherry/watch/`)

Sources are saved with their origin and a content hash, deduplicated, and archivable. The kinds:

- **YouTube.** Playback is the official embed. Cherry does **not** download video or captions.
  Transcript text comes from what you paste, or from on-device Whisper transcribing audio you play
  (WebGPU with a WASM fallback). A title lookup against the public oEmbed endpoint runs **only**
  when you click "Fetch title" (5s timeout, 16KB response cap). Channel watches fetch a channel's
  **public RSS feed through your paired local runner**, only for watches you approved.
- **Articles and pages.** Pasted text, or a user-triggered fetch through the paired local runner.
- **Notes and files.** Plain text, Markdown, SRT, VTT, parsed in the browser.
- **Watch history.** Your own Google Takeout export, parsed entirely client-side; nothing uploads.

Every fetch is user-triggered or runs on a schedule you approved, is visible, and fails closed.

**2. Evidence** (`src/cherry/evidence/`)

Material becomes timestamped claims marked untrusted. Promotion to trusted is a human-only code
path. External content is treated as data, never as instructions.

**3. Skill compilation** (`src/cherry/skillgraph/`, `src/cherry/compiler/`)

Evidence compiles into a readable, versioned skill: steps, guardrails, checks, and the evidence each
step rests on. Revisions are tracked like code.

**4. Approval** (`src/cherry/approval/`)

You approve an exact revision. Editing anything afterwards invalidates that approval. An agent can
request an approval; no registered tool can grant one.

**5. Verification and proof** (`src/cherry/verify/`, `src/cherry/proof/`)

Checks run against real state and can genuinely fail. Required checks fail closed when blocked,
skipped, absent, or unobserved. Verification binds the exact skill revision, artifact-set revision,
and a recomputed file manifest. Receipts are SHA-256 over RFC 8785 canonical JSON: recomputable by
anyone, and they are hashes, not signatures.

### Serving: three rails out

| Rail | Mechanism | Status |
| --- | --- | --- |
| Browser agents | WebMCP: `list_skills`, `recommend_skills`, `get_skill` as always-on global reads, plus at most five contextual mutation tools per surface | Validated against a mock host in e2e; a live browser WebMCP host is labelled Experimental |
| Local agents | MCP stdio bridge (`runner/mcp/server.mjs`) | Validated in a live Codex CLI host, 2026-09-01, transcript in `docs/release/CODEX_MCP_CAPTURE.md` |
| Any agent | Agent Skills bundles: SKILL.md, AGENTS.md, CLAUDE.md, plus a zip with its own `scripts/verify.mjs` | Validated: a compiled bundle installed into a live Claude Code host |

`get_skill` streams install files in bounded parts with a full-file SHA-256 so the receiving agent
can verify what it assembled. The current status of every surface lives on `/compatibility`, and it
is the authoritative list, not this table.

### The runner (`runner/`)

Optional, local, loopback-only, requires a pairing token, enforces root and executable allowlists,
uses no shell strings, caps output, redacts secrets, refuses private-network destinations, and gives
child processes a minimal non-secret environment. It performs user-triggered fetches and runs
routines bound to an approved skill revision and action hash.

## Part 2: The team harness

Cherry is built by two agents under one release manager, with a human owner who does three things:
approve direction, record the demo, submit.

| Lane | Owner |
| --- | --- |
| Feature tickets, their tests, studio-surface copy | Codex |
| Design system, landing/showcase/connect/compatibility, docs of record | Claude |
| Review, gates on the merged tree, **all deploys**, release evidence | Claude |
| Privy dashboard, demo video, submission | The human owner |

### The rules that hold it together

1. **One deployer.** Codex never deploys. Every production release goes out as a locally built,
   render-verified prebuilt artifact, then is verified again on the live domain by content.
2. **Gates before every commit:** `npm run gates` (typecheck, lint, unit, runner). Before any
   session ends: `npm run verify:all` (adds build, e2e, pack verification, submission audit).
3. **`npm ci` is law.** `package.json` and `package-lock.json` change together, in the same commit.
4. **STATUS.md is the only channel.** Append-only. Every ticket transition, every bounce, every
   owner note.
5. **Claims discipline.** Nothing ships in UI, docs, or commit messages that a test, receipt, or
   captured session does not demonstrate. Removing an overstatement counts as a fix.

### Why the deploy rule exists

Production once served a blank page. Two causes were found and both are now structurally prevented:
a deploy built remotely with a different package manager against a drifted lockfile
(`installCommand` is now pinned to `npm ci`), and a service worker that served the cached app shell
first, so returning visitors kept an old `index.html` pointing at asset hashes the new deploy had
removed (the worker is now network-first for navigations, cache-first only for immutable assets).

## Reading the code

| You want | Start here |
| --- | --- |
| The domain, framework-free | `src/cherry/` |
| The WebMCP surface | `src/cherry/webmcp/tool-definitions.ts` |
| The agent-facing library | `src/cherry/library/library-service.ts` |
| The local runner and MCP bridge | `runner/` |
| What is actually proven | `/compatibility` and `docs/release/` |
| How to contribute | `CONTRIBUTING.md`, `docs/GOOD_FIRST_ISSUES.md` |
