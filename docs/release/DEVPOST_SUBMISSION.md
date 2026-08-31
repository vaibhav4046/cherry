# Devpost submission kit (paste-ready draft)

Submit at https://webmcp.devpost.com/ before 3 Sep 2026, 1:00 PM PT.

## Project name

Cherry

## Tagline (≤ 60 chars)

Teach once. Cherry remembers. Every agent gets better.

## Links

- Live app: https://cherry-wine.vercel.app
- Judge route (fresh linear story): https://cherry-wine.vercel.app/showcase
- Repository (MIT): https://github.com/vaibhav4046/cherry
- Video: (add after recording — script in docs/release/DEMO_SCRIPT.md)

## Inspiration

Every useful thing we teach an AI agent dies in a chat transcript. The process, the corrections, the
"no, do it this way" — gone next session, unusable in the next tool. And when an agent says "done",
we're expected to take its word for it. We wanted the layer underneath: user-owned memory of how work
gets done, with approval boundaries and receipts.

## What it does

Cherry is the apprenticeship, memory, mission, and verification layer for AI agents. One persistent
journey: load a permitted lesson (official YouTube player or manual material) → import your
transcript → record timestamped observations → evidence with trust labels (everything external starts
untrusted) → an editable, versioned SkillGraph → exact-revision human approval → real artifacts in a
sandboxed workspace → deterministic verification with honest fail/repair/pass → a tamper-evident
proof receipt (SHA-256 over RFC 8785 canonical JSON, recomputable by anyone) → a portable Agent
Skills bundle with Codex and Claude Code install targets.

The WebMCP part: Cherry registers state-aware site tools — at most 5 per surface plus global reads.
Learning tools exist only while learning; export tools only after verification passes. Tools
register and unregister live as the mission's state machine advances, agents can request but never
grant approvals, and every tool call lands in a visible inspector (Agent View). In a browser without
WebMCP, the complete product works manually — the agent path and the human path are the same product.

On top sits a workforce layer: a crew of named agent seats, a work inbox with legal state
transitions (an agent can never mark its own work SUCCEEDED), routines with action-hash approvals,
and an optional durable runner (leased job queue, worker pool, exactly-once scheduler, hash-chained
events). Lessons transcribe on-device with Whisper (WebGPU, WASM fallback) — still no API key.

## How we built it

React 19 + TypeScript strict + Vite, with a framework-independent domain layer (`src/cherry/*`) that
the UI, the WebMCP tool layer, and a native stdio MCP bridge all call — an agent can never do
something the UI would refuse. IndexedDB (Dexie) with versioned migrations; every mutation emits a
ProofEvent in the same transaction. Zero-dollar core: no AI API key, no cloud database, no account.
Optional dependency-free Node runner (loopback-only, pairing tokens, allowlists, no shell strings).

## Challenges

- WebMCP tool lifecycle: registering/unregistering by product state with AbortController, without
  stale closures — tools re-read persisted state at execution time.
- Honest verification: checks test actual files and state; the demo mission's first artifact
  genuinely fails and the repair is part of the receipt.
- Sandboxing generated artifacts inside a strict-CSP world (srcdoc CSP inheritance is unforgiving).
- Making id-remapped workspace import collision-proof while keeping every internal reference intact.

## Accomplishments

- 152 unit (+2 opt-in skips) + 42 runner/bridge + 41 e2e tests, including a hostile-artifact sandbox probe, axe
  audits, keyboard-only journeys, and an end-to-end guided-walkthrough test.
- A compatibility page that labels every surface Validated / Shipped / Experimental / Roadmap with
  the actual test behind the label — including what we did NOT test.
- Proof receipts a stranger can recompute; `npm run verify:pack` proves it — a one-byte tamper or a
  deleted evidence file fails verification.
- The native MCP bridge is covered by deterministic runner/bridge tests; no live external host
  session is claimed by this release pass.
- An adversarial security pass that tried to refute our own claims — and the one it broke
  (postMessage origin wording) was fixed the same day and documented.

## What's next

Live-host validation in WebMCP-enabled clients, encrypted cross-device sync (with guest-first auth
riding along), richer graph editing, and a skill-sharing format built on the same receipts.

## Built with

react, typescript, vite, dexie (indexeddb), zod, jszip, web-crypto, webmcp (document.modelContext),
mcp (stdio), node, playwright, vitest

## Judging-criteria cheat sheet (for the form / video description)

- **Use of WebMCP:** state-aware tool aperture (≤5+2), live register/unregister on a real state
  machine, runtime re-validation, cancellation, untrusted-content hints, visible Agent View
  inspector with a real call log.
- **Real product:** local-first persistence, refresh-safe, import/export, no fake states — the
  guided example is a genuine exported workspace.
- **Safety story:** untrusted-by-default evidence, human-only trust/approval/memory promotion,
  exact-revision approvals, sandboxed previews, recomputable proof.
