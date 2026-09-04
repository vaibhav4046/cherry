# Devpost submission kit (paste-ready)

Submit at https://webmcp.devpost.com/ before 3 Sep 2026, 1:00 PM PT (21:00 London). Every claim
below is backed by a test, a capture, or a live page; the compatibility page says which.

## Project name

Cherry

## Tagline (60 chars or fewer)

One task. An entire AI team. Human authority intact.

## Links

- Live app: https://cherry-wine.vercel.app (canonical; public alias https://getcherry.vercel.app)
- Judge route: https://cherry-wine.vercel.app/showcase (a recorded real mission, evidence first)
- Mission Control: https://cherry-wine.vercel.app/studio/control
- What is proven: https://cherry-wine.vercel.app/compatibility
- Repository (MIT): https://github.com/vaibhav4046/cherry
- Video: (add after recording; script in docs/release/DEMO_SCRIPT.md)

## The four required points, answered directly

Devpost asks every entry to cover four things. Here they are, in order, with nothing between them.

**1. Why this use case is a strong fit for WebMCP.** Cherry is a page whose whole purpose is live,
structured state: a plan with tasks and dependencies, work running in isolated sandboxes, checks
passing or failing, and decisions waiting for a person. An agent trying to help with that through
screenshots and button-guessing is working blind against a moving target. WebMCP is exactly the
right shape here, because the site can hand the agent the small set of operations that are legal
*right now*, in this state, on this surface — and withdraw them the moment they stop being legal.
A planning-and-approval workflow is one of the few interfaces where a bounded, state-aware tool
surface is strictly better than both a screenshot agent and a static REST API.

**2. How it creates a better user experience.** The person stops writing prompts and starts reading
decisions. They state an outcome once; the plan, the parallel work, the failures, the repairs and
the receipts all arrive as things to review rather than things to drive. Because the agent acts
through named site tools, every action it takes is legible in the same UI the person is using — no
hidden clicking, no "what did it just do". And the entire product works by hand: with no agent and
no runner, every screen still functions, so the agent is an accelerator, never a dependency.

**3. What people and agents can do together that was difficult or impossible before.** Build one
library of working methods, together, that every agent can use and only a human can extend. Before
this, a useful method you taught an agent died in that chat: not portable, not versioned, not
verifiable, and re-taught from scratch in every other tool forever. In Cherry an agent can call
`recommend_skills` for the task in front of it and receive the person's approved methods, pinned to
the exact revision that person read and approved, with a SHA-256 it can verify itself. The agent
can propose, retrieve, and execute; it cannot approve, promote trust, or activate memory, because
no registered tool reaches those code paths. That asymmetry — agents contribute at machine speed,
humans retain authority — is what was missing.

**4. How WebMCP was implemented.** Registration goes through `document.modelContext.registerTool`,
feature-detected, with an AbortController lifecycle so tools are registered and retired as the
mission state machine advances. The aperture is deliberately bounded: seven always-on tools (six
reads plus `introduce_agent`, which only labels the session) and at most five mutation tools for
the current surface, so an agent never faces a wall of ambiguous options. Tool names are canonical
with legacy aliases, and every mutation tool's description states what it does *not* do. `/studio/agent`
is an in-page inspector showing the live aperture, the registration and retirement diff, and the
real tool-call log. Coverage is unit tests against a mock model context plus a Playwright journey
that installs a mock `modelContext` before page load and asserts the *registered closures* actually
execute. In a browser with no WebMCP host the panel says so plainly and registers nothing.

## Inspiration

Every agent we use is capable. Our tools, memory, and ways of working are not shared between
them, and every useful thing we teach an agent dies in a chat transcript. We also noticed that
"done" from an agent is a claim, not a fact. Cherry is the layer underneath: a person states an
outcome, the agents they already pay for do the work in bounded workspaces, nothing counts as done
until an independent check passes, and nothing consequential happens without a human decision.
The site itself is an agent-facing surface: a visiting agent leaves with the person's approved
skills instead of merely operating the page.

## What it does

**Mission Control.** A person types an outcome. Cherry turns it into a validated plan: an acyclic,
bounded graph of tasks with dependencies, a definition of done and a real check on every task, and
a human decision before anything public. The paired local runner leases one sandbox per task (a
directory or a git worktree; the boundary is labelled process or worktree-process, never a VM),
runs up to three tasks at once, hands finished artifacts to dependants, and never marks a task
succeeded on provider completion alone: only its own checks or a person can. A failed check gets
one bounded repair with the failure as data. Real Codex CLI execution is captured in the repo (two
workers in two worktrees with measured overlap); Claude Code execution is labelled Experimental
because it needs a human sign-in that was not available on the build machine.

**Creators and skills.** Follow a creator and the paired runner checks the channel's public feed
daily; each new upload arrives with a deterministic skill proposal. Cherry never downloads a video
or captions and makes no model API calls of its own: the person adds the transcript (or transcribes
on-device with Whisper), Cherry drafts the steps, and approval binds to the exact revision the
person read. Reasoning comes from the agent hosts the person already pays for; Cherry never asks
for an API key.
Approved skills live in a cross-workspace Skill Library and export as SKILL.md, AGENTS.md, or
CLAUDE.md, or as a zip bundle whose standalone verifier fails on tampering.

**Proof.** Every mutation writes a ProofEvent in the same transaction. Verification runs
deterministic checks that can genuinely fail; the shipped example's first artifact does fail and is
repaired. Receipts are SHA-256 over RFC 8785 canonical JSON, recomputable by anyone. Approvals,
trust promotion, and memory activation are human-only code paths.

**The WebMCP part.** Cherry registers state-aware site tools on `document.modelContext`: seven
always-on tools, six reads plus `introduce_agent`, which only labels the session
(`read_cherry_context`, `list_cherry_capabilities`, `get_cherry_status`, `introduce_agent`,
`list_skills`, `recommend_skills`, `get_skill`), plus at most five contextual
tools per mission state or route surface, registered and retired as the product's state machine
moves. On the control surface a visiting agent can `create_outcome_mission`,
`plan_current_mission`, `start_current_mission`, `cancel_current_mission`, and
`request_mission_action`; no tool approves anything. Every call lands in the Agent View inspector.
In a browser without WebMCP the complete product works manually, because the agent path and the
human path share one implementation.

The inversion: most agent-ready sites let an agent operate them. Cherry's site upgrades the agent.
`recommend_skills` returns the person's approved skills for the task at hand, and `get_skill`
streams the install file in bounded parts with a full-file sha256, pinned to the approved
revision. The same skills reach a local agent host through the stdio MCP bridge — captured twice in
live sessions, once in Codex CLI 0.152.1 (docs/release/CODEX_MCP_CAPTURE.md) and once on 3 Sep where
a host recomputed the workspace integrity digest and a proof receipt and both matched
(docs/release/LIVE_MCP_HOST_CAPTURE.md) — and any Agent Skills host through the exported bundle.
Bundle compilation and hash verification are test-covered; we have captured transcripts only for the
two MCP host sessions above, so the skills-bundle install row stays Shipped rather than Validated.

## How we built it

React 19, TypeScript strict, Vite. A framework-independent domain layer (`src/cherry/*`) that
the UI, the WebMCP layer, and the native MCP bridge all call, so an agent can never do something
the UI would refuse. Dexie over IndexedDB with versioned migrations; every mutation emits a
ProofEvent inside the same transaction. A zero-dependency Node runner: loopback-only, pairing
token, exact-origin CORS, allowlisted executables, argument arrays and no shell, minimal child
environment, output caps with redaction, physical-path guards that refuse symlink and junction
traversal, hash-chained event log, per-task sandbox leases. No model API key anywhere: the
reasoning engine is the agent the person already pays for.

## Challenges

- Making "sandbox" mean something honest: per-task directories and git worktrees give isolation
  of work, not OS containment, so the product labels the boundary as process or worktree-process
  and never claims a VM.
- Keeping provider completion out of the trust chain: adapters return completed, never verified;
  only a passed evaluation report or a person can move a task to succeeded.
- A WebMCP tool lifecycle that registers and retires by real product state without stale
  closures; tools re-read persisted state at execution time.
- Portability of the verification harness itself: two defects that Windows hides (an unflushed
  pipe in a test fixture, an 11 px overflow from an unbreakable file path) were found by
  re-running the gates from a fresh Linux clone before release.

## Accomplishments

- A real mission on film: Codex CLI 0.152.1 running two nodes in two worktrees with a measured
  overlap, success decided by the runner's own checks, replayed on the showcase from a pinned and
  validated evidence fixture.
- 623 unit tests, 135 runner and MCP bridge tests, and a 130-journey browser matrix including
  hostile-artifact sandboxing, axe audits, keyboard-only journeys, mobile overflow checks, a
  browser-to-real-runner integration test, and a service-worker redeploy check. The unit, runner,
  build, pack and audit gates pass on Linux CI and locally. Two browser journeys currently fail on
  Linux CI on a 390px viewport, where a hero element ends 1.4px below the fold; they pass on
  Windows. The run is public in the repository's Actions tab, and this page would rather point at
  it than claim a green matrix it cannot show.
- A compatibility page that labels every surface Validated, Shipped, Experimental, or Roadmap
  with the test or capture behind the label, including what was not tested.
- Receipts a stranger can recompute; `npm run verify:pack` proves a one-byte tamper fails.
- An adversarial review of the runtime that failed its own release once, then closed three
  critical boundary defects test-first (command execution, link traversal, plan contract parity)
  before the branch was allowed to merge.

## What's next

A live WebMCP browser-host capture (the registration contract is covered by unit and mock-host
tests; the compatibility page keeps the surface Experimental until a real host session is
recorded), Claude Code mission execution once a signed-in capture exists, container and remote
workers behind the same lease interface, connectors behind official APIs only, and a local vision
model over videos the person owns.

## Built with

react, typescript, vite, dexie (indexeddb), zod, jszip, web-crypto, webmcp (document.modelContext),
mcp (stdio), node, playwright, vitest

## Judging-criteria cheat sheet (for the form and the video description)

- **Use of WebMCP:** seven always-on tools (six reads plus `introduce_agent`, which only labels
  the session) plus at most five state-scoped tools, registered and
  retired live on a real state machine, runtime re-validation, cancellation, untrusted-content
  hints, and a visible Agent View call log. Mission tools let a visiting agent create, plan, start
  and cancel a mission but never approve one.
- **Real product:** local-first persistence, refresh-safe, import and export with hash-verified
  archives, no fake states. The showcase replays a real captured mission.
- **Safety story:** untrusted-by-default evidence, human-only approvals, exact-revision
  approvals, fail-closed runner policy, per-task sandboxes labelled honestly, recomputable proof.
- **The inversion:** the site makes the visiting agent smarter. Library reads are global,
  installs are hash-pinned to human approvals, and the same skills follow the person into any
  host that speaks WebMCP, MCP, or the Agent Skills bundle format.
