# Cherry 🍒

**The user-owned apprenticeship, memory, mission, and verification layer for AI agents.**

Your agents should not start from zero. Cherry watches how useful work gets done, turns the process
into trusted memory and portable skills, then gives the agents you already use a mission they can
execute — and prove.

> Teach once. Cherry remembers. Every agent gets better.

Built for the **OpenAI WebMCP Challenge 2026**.

**Live:** https://cherry-wine.vercel.app · **Judge route:** [/showcase](https://cherry-wine.vercel.app/showcase) · **Source:** https://github.com/vaibhav4046/cherry

![Cherry landing — Teach once. Prove it. Keep it.](docs/release/screenshots/landing-v4-desktop.png)

## What it does

```
WATCH / READ / OBSERVE  →  UNDERSTAND AND STRUCTURE  →  APPROVE THE SKILLGRAPH
        →  EXECUTE THROUGH AN AGENT  →  VERIFY THE RESULT  →  TURN CORRECTIONS INTO MEMORY
```

- **Cherry Watch** — learn from a permitted YouTube lesson (official player only) or manual material.
  Paste/upload transcripts (.txt/.srt/.vtt), record timestamped observations, and see computed —
  never invented — coverage with declared criteria and honest gaps.
- **Source Inbox** — save YouTube lessons, article/post exports, private notes, and local text files
  as provenance-linked lessons. A visible, one-page-at-a-time Scrapling fetch is optional for an
  allowlisted public article when your paired local runner is configured; it never fetches YouTube
  or LinkedIn and never runs in the background.
- **Evidence Ledger** — every claim is a record with provenance and a trust label. Everything from
  the outside world starts **untrusted**; only a human can raise trust.
- **SkillGraph** — an editable, versioned, vendor-neutral workflow representation. Approvals bind to
  the exact revision you reviewed; any edit invalidates them.
- **Memory Vault** — scoped, source-linked memory with an inbox. Nothing becomes memory without your
  approval. A correction compiler turns failures into scoped rules.
- **Artifact Workspace** — real files (HTML/CSS/JS/MD/JSON), versioned, previewed in a sandboxed,
  network-blocked iframe that cannot touch Cherry data.
- **Cherry Verify** — deterministic checks against actual files and state: file, DOM, hash,
  placeholder, accessibility, and graph assertions. Failures link to evidence; repairs re-verify.
- **Proof** — an append-only event ledger compiles into receipts hashed with SHA-256 over RFC 8785
  canonical JSON. Tamper-evident and independently recomputable (not a signature, and never called one).
- **Cherry Compiler** — export approved skills as Agent Skills bundles with Codex and Claude Code
  install targets, evidence references, policies, evals, and a standalone `verify.mjs`.
- **Agent View (MCP Inspector)** — a live inspector at /studio/agent: current phase, the exact
  tool aperture per phase, live registrations, retired tools, and a real tool-call log. In manual
  mode it shows the honest truth: nothing registered, nothing called.
- **Guided example + walkthrough** — one click imports a real exported example workspace and walks
  you through the whole loop, ending at the recomputable receipt. Replayable anytime.
- **WebMCP native** — in a compatible ChatGPT/Codex client, Cherry registers **state-aware site
  tools** (max 5 per state + 2 global reads) that mutate the same visible workspace. Tools appear and
  disappear as the product state changes. No WebMCP? The complete product works manually.
- **Local Runner (optional)** — a loopback-only Node process with pairing tokens, allowlists, and
  timeouts for deterministic jobs. **Native MCP bridge (optional)** — a stdio server for Claude
  Code/Codex CLI that reads and verifies workspace exports.

## Zero-dollar core

Cherry's core requires **no AI API key, no YouTube API key, no cloud database, no account, and no
paid backend**. Everything persists in your browser's IndexedDB. Export/import complete workspaces as
hash-verified JSON. Connecting an agent accelerates the same product; it never unlocks a different one.

## Quickstart

```bash
npm install
npm run dev        # http://127.0.0.1:5273
```

Production build and checks:

```bash
npm run typecheck && npm run lint && npm run test && npm run test:runner && npm run build
npm run test:e2e   # builds, serves, and runs the golden journey + a11y + sandbox suites
```

Optional local runner:

```bash
node runner/server.mjs --root /path/you/approve
# prints a pairing token → paste it in Studio → Connections
```

Optional native MCP bridge (Claude Code / Codex CLI):

```bash
node runner/mcp/server.mjs --workspace path/to/cherry-workspace-export.json
```

## Architecture

Typed domain services (`src/cherry/*`) are independent of React, WebMCP, and MCP. The manual UI, the
WebMCP tool layer, and the native bridge all call the same validated services, so an agent can never
do something the UI would refuse. IndexedDB (Dexie) with versioned migrations persists everything;
every domain mutation emits a ProofEvent in the same transaction. See `docs/CHERRY_REPO_MAP.md`.

## Security & privacy

- Learning material is data, never instructions; trust promotion is human-only.
- Exact-revision approvals; agents cannot approve their own work.
- Sandboxed, network-blocked artifact previews (e2e-verified against a hostile artifact).
- Loopback-only runner with pairing, allowlisted executables, no shell strings, output redaction.
- No telemetry, no analytics, no external calls beyond the YouTube embed you opt into.
- Full audit trail in `docs/release/`.

## Honest limitations

- WebMCP tools exist only while the page is open in a compatible client; that client's availability
  is outside Cherry's control (feature-detected, shown in Connections).
- Receipts are hash-based tamper-evidence, not cryptographic signatures.
- The runner runs while your machine is on — it is not a cloud.
- "Full lesson coverage" means declared segments/criteria were processed, not that every video frame
  was semantically understood.
- Cherry does not watch every video automatically, scrape LinkedIn, train a private foundation model,
  access a ChatGPT/Codex subscription invisibly, execute in the cloud without a configured runner,
  auto-approve skills or memories, or claim to understand every frame of a video.
- The native MCP bridge is read/verify over exports (browser IndexedDB is unreachable from Node).
- Optional encrypted sync is not in golden v1.

## What is proven vs. roadmap

See the in-app page at /compatibility (or the live site) — every surface is labelled Validated /
Shipped / Experimental / Roadmap with the actual test behind the label. Auth is deliberately
absent (guest-first, decision D-008 in docs/CHERRY_DECISIONS.md).

## License

MIT — see [LICENSE](LICENSE).
