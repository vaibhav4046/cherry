# Cherry — complete architecture brief

Copy-paste this whole file as context. Everything below is what the code
actually does, as of 2026-09-04. Where something is not proven, it says so.

Live: https://cherry-wine.vercel.app · Repo (MIT): https://github.com/vaibhav4046/cherry

---

## 1. What Cherry is, in one paragraph

Cherry is a local-first control layer for the AI agents a person already pays
for. You state an outcome. Cherry turns it into a bounded plan, dispatches the
work to agent hosts through open protocols, runs each task in an isolated
workspace on your own computer, decides "done" only when an independent check
passes, and stops at anything that needs a human decision. What it learns is
stored as a versioned, human-approved skill that any agent can install and
verify. Cherry makes no model API calls of its own and asks for no API key.

**One line:** Cherry turns the creators and methods you trust into skills your
agents can install, verify and reuse.

## 2. The problem it solves

A person learns a working method from a video, an article, or their own
experience. They explain it to an agent in a chat. That explanation dies in the
transcript: it is not versioned, not portable, not checkable, and must be
re-explained to every other agent, in every other tool, forever. Separately,
when an agent says a job is done, that is a claim, not a fact — the same system
that did the work also graded it.

Cherry fixes both: the method becomes a durable artefact, and completion is
decided by something other than the worker.

## 3. Architecture

### 3.1 Three surfaces, one state machine

```
                    ┌─────────────────────────────────────┐
   Browser agent ──▶│  WebMCP site tools                  │
   (in-page)        │  document.modelContext.registerTool │
                    ├─────────────────────────────────────┤
   Local agent   ──▶│  stdio MCP bridge                   │──▶  Cherry state
   (Codex CLI etc.) │  runner/mcp/server.mjs              │     (IndexedDB)
                    ├─────────────────────────────────────┤
   Any host      ──▶│  Agent Skills bundle (SKILL.md)     │
   (file-based)     │  + standalone verify.mjs            │
                    └─────────────────────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  Paired local runner :47821   │
                    │  loopback only, token paired  │
                    └───────────────────────────────┘
```

The in-page WebMCP tools and the UI genuinely share one state: both call the same
domain services over the same IndexedDB, so a tool call changes exactly what the
page shows, with no separate agent backend and no divergent code path.

The other two surfaces do not, and it would be wrong to imply otherwise. The
stdio MCP bridge is a separate Node process and cannot read browser IndexedDB at
all; it reads a **saved workspace export** and recomputes hashes from its bytes.
A skills bundle is a file a host installs, pinned to the revision it was
compiled from. What all three share is the object definitions and the
verification rules, not one live store.

### 3.2 The WebMCP surface (the competition-relevant part)

- Registration through `document.modelContext.registerTool`, feature-detected
  once at boot, with an `AbortController` lifecycle per tool.
- **Bounded aperture: 7 always-on tools plus at most 5 for the current
  surface.** Tools are registered and retired as the mission state machine
  advances; calling a retired closure returns a `conflict` error rather than
  mutating stale state.
- Always-on: `read_cherry_context`, `list_cherry_capabilities`,
  `get_cherry_status`, `introduce_agent`, `list_skills`, `recommend_skills`,
  `get_skill`.
- Arguments are re-validated with zod at execute time even when the host claims
  it validated them. Oversized results are truncated by binary search so the
  payload is still valid JSON, never a corrupt prefix.
- `/studio/agent` is a live inspector: current aperture, registration and
  retirement diff, and the real tool-call log.
- **The inversion:** most agent-ready sites let an agent operate the page.
  Cherry's site sends the agent away more capable — `recommend_skills` returns
  the user's approved methods ranked for the task, and `get_skill` streams an
  install-ready file in bounded parts with a full-file SHA-256, pinned to the
  exact revision a human approved.

### 3.3 Execution model

- A plan is validated as an acyclic, bounded graph: every task has a definition
  of done and a real check.
- The paired runner leases **one sandbox per task** — a directory or a git
  worktree. The boundary is recorded honestly as `process` or
  `worktree-process`, never described as a VM.
- Up to three tasks run at once; finished artefacts are handed to dependants.
- A task becomes `succeeded` only when its own check passes or a human says so.
  Provider completion alone never sets success.
- A failed check gets one bounded repair attempt with the failure as input.

### 3.4 The trust boundary

- Approvals, trust promotion and memory activation are **human-only code
  paths**. No registered tool reaches them, verified by test.
- An agent can propose, retrieve and execute. It cannot approve.
- Every mutation writes a ProofEvent in the same transaction.
- Receipts are SHA-256 over RFC 8785 canonical JSON, recomputable by anyone.
- Creator content is untrusted data, never instructions.

### 3.5 Security posture

Loopback-only runner, pairing token required, origin allowlist, root and
executable allowlists, argument arrays with no shell strings, minimal
environment, output caps with secret redaction, crash recovery. Artifact
previews render hostile HTML inert: empty sandbox, `script-src` and
`connect-src` none, remote references stripped, zero outbound requests.

## 4. Stack

Vite 6, React 19, TypeScript strict, IndexedDB via Dexie, Zod, JSZip.
Dependency-free Node runner. Static deploy on Vercel.
Self-hosted fonts (EB Garamond, Figtree, IBM Plex Mono — all SIL OFL), served
from our own origin.

The CSP is `default-src 'self'` and is deliberately not `'self'`-only overall:
it additionally permits YouTube embeds (`frame-src`, `child-src`, and the
player script), Google Fonts (`style-src`/`font-src`), `https://auth.privy.io`
for optional sign-in, and `http://127.0.0.1:47821` so the page can reach a
paired runner on your own machine. `vercel.json` is the authority; read it
rather than this sentence.

No Cherry-hosted backend stores your work: the core path keeps state in your
browser and on your paired computer, and Cherry makes no model API calls of its
own and asks for no model API key. Sign-in is optional and off by default, and
it uses Privy when configured, so "no accounts" is true of the default local
path but not of the product as a whole.

## 5. Verification (measured 2026-09-04, not estimated)

| Gate | Command | Result |
| --- | --- | --- |
| Unit | `npm run test` | 623 passed, 2 opt-in skips |
| Runner and MCP bridge | `npm run test:runner` | 135 passed |
| End-to-end | `npm run test:e2e` | 130 passed, 0 failed, 0 skipped, 0 flaky |
| Bundle integrity | `npm run verify:pack` | 6/6, tamper-evident |
| Service worker | `npm run verify:sw` | 5/5 |
| Submission audit | `npm run audit:submission` | 0 failures, 0 warnings |

Playwright covers desktop 1440x1024 and Pixel 7, including hostile-artifact
sandboxing, axe accessibility audits, keyboard-only journeys, a
browser-to-real-runner mission, and a WebMCP journey that asserts the
*registered closures* actually execute.

## 6. What is proven, and what is not

**Captured live:**
- **A proprietary in-browser WebMCP host.** ChatGPT desktop, Work mode, model
  5.6 Sol, 2026-09-04, against the deployed site: registration and invocation
  through `document.modelContext`, an aperture that grew 10 to 11 to 12 as
  state advanced, and an install-ready `SKILL.md` with a full-file SHA-256
  leaving with the agent. A later session in the same host was asked to approve
  a skill with any tool it could find and reported that none of the twelve
  registered tools can. Two defects that session exposed, and their fixes, are
  written up alongside the passing run
  (`docs/release/WEBMCP_LIVE_HOST_CAPTURE.md`). `/compatibility` marks this row
  **Validated**; this section previously said the capture was pending, and it
  no longer is.
- Codex CLI 0.152.1 executing a real mission: two workers, two git worktrees,
  34.5 seconds of measured overlap (`docs/release/GOD_MODE_REAL_HOST_CAPTURE.md`).
- Codex CLI registering the stdio MCP bridge and verifying a bundle's SHA-256
  (`docs/release/CODEX_MCP_CAPTURE.md`).
- A second MCP host recomputing the workspace integrity digest and a proof
  receipt, both matching, with a clean refusal on an unknown id
  (`docs/release/LIVE_MCP_HOST_CAPTURE.md`).
- A stdio MCP session on commit `3c38684` recomputing both digests from the
  export's own bytes and then attempting `approve_skill`, which came back
  JSON-RPC `-32602`, unknown tool. The approval boundary is enforced by the
  absence of the tool, not by a permission check
  (`docs/release/MCP_CAPTURE_3c38684.md`).

**Still not captured, and labelled accordingly:**
- The full learn to approve to retrieve journey *inside* a browser host. The
  live sessions above proved registration, invocation, state mutation and
  retrieval, but no human approval was exercised in them. That boundary rests
  on the unit tests, the Playwright journey, and the stdio capture where
  `approve_skill` does not exist. `/compatibility` says so on the row itself.
- Claude Code mission execution, which needs a human sign-in that was not
  available on the build machine. Labelled Experimental.
- Chrome behind the WebMCP flag. Same code path, feature-detected, but not run
  against a flagged build in this release. Labelled Experimental.
- A transcript of a skills bundle being installed into a live host. The install
  happened and is recorded in the decision log, but no session was captured, so
  that row stays Shipped rather than Validated.

Anyone can see the tool surface work in an ordinary browser: on
`/studio/agent`, run `sessionStorage.setItem('cherry.standInHost','1')` and
reload. Cherry installs an opt-in, per-tab stand-in host before boot, the
aperture fills with the real registrations, and `cherryCall('read_cherry_context')`
executes the real closure. It is a stand-in, not a WebMCP client, and the page
says so. It is a convenience for a reader without a WebMCP host, not the
evidence; the evidence is the ChatGPT capture above.

## 7. Why this is hard to copy

This is a positioning argument, not a measured claim, and it is worth saying so
before making it: we have not audited the market and cannot prove a negative
about what other products do.

What is hard is the full chain: creator content ingested with provenance,
evidence carrying trust labels, versioned skill compilation, exact-revision
human approval, deterministic verification that can genuinely fail,
tamper-evident receipts, and serving the result over three open conventions at
once. Each link is cheap on its own. Keeping them honest together is the work,
because every link has to survive a stranger recomputing it. The parts of that
chain we can demonstrate are the ones cited in section 6; the claim that no one
else has assembled it is our reading of the field, and a judge should treat it
as such.

## 8. Economics

The user brings the reasoning: their existing ChatGPT, Codex or Claude
subscription does the thinking. Cherry is memory, approval and serving. That
means near-zero marginal inference cost, no API-key wall at onboarding, and no
vendor lock — a better model arriving makes Cherry more useful, not obsolete,
because the approved methods are portable across every host that speaks WebMCP,
MCP, or the Agent Skills format.
