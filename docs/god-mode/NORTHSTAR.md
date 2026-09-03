# Cherry God Mode: north star and executive decision

Date: 2026-09-02. Branch the god-mode branch from `origin/main` 6e763c5. Mode GREEN at start
(32.1 h to the deadline, 23.1 h to the 12:00 London freeze on 3 September).

## The decision

Cherry's public identity changes from "turn a lesson into a skill" to an autonomous runtime for an
AI team. The existing trust kernel is kept and extended. Nothing that is green today is replaced.

Product name: **Cherry**. Descriptor: **The autonomous runtime for your AI team.**
Headline: **One task. An entire AI team.**
Supporting copy: Cherry turns Codex, Claude, Kimi and local models into teammates with tools,
memory and isolated workspaces. They work in parallel and return with verified results.

"Cherry Wine" stays the internal visual-system and deployment name only.

## What a person experiences

1. Give Cherry an outcome.
2. Cherry creates the team (a validated mission graph, one teammate per task).
3. The team works, in parallel where the graph allows, each worker in its own workspace.
4. Cherry checks the result with independent, deterministic checks.
5. Cherry asks only when human authority is needed (send, publish, merge, deploy, delete, spend).
6. Cherry remembers the method for next time (an approved skill, exact revision, with evidence).

## The inversion Cherry must prove

WebMCP gives an agent tools on a webpage. Cherry turns tools, successful work and human
corrections into durable capability that every future agent can use.

## Product areas (labels over existing routes; no route is renamed or deleted)

| Label | Route | Status on this branch |
|---|---|---|
| Home | `/studio` | Existing Command Center, gains the outcome composer |
| Missions | `/studio/control`, `/studio/control/:missionId` | New (Mission Control) |
| Teammates | `/studio/crew` | Existing |
| Automations | `/studio/routines` | Existing; handoff recipes added if AMBER/GREEN time remains |
| Connect | `/studio/settings/connections`, `/connect` | Existing |
| Memory | `/studio/memory` | Existing |
| Learn | `/studio/sources`, `/studio/quick`, `/studio/skills` | Existing (YouTube is one source inside Learn) |
| Computers | inside Mission Control and Connections | Real runner state only; no separate route until real state justifies it |
| Approvals | inside `/studio` and Mission Control | Real attention data only |
| Activity | `/studio/runs`, `/studio/proof`, `/studio/agent` | Existing |

## God Mode is a policy profile, not a bypass

| Operation | Default |
|---|---|
| Read approved local context, analyse, write inside the isolated sandbox, run approved tests, draft | automatic |
| Create an external draft through a connector that writes | approval |
| Send email, publish social content, merge code, deploy production, delete data, spend money, change credentials | approval |
| Bypass a security control, CAPTCHA, password or 2FA entry | denied or human takeover |

Trust promotion, exact-revision approval and memory activation remain human-only. Any relevant edit
invalidates the standing approval, policy, routine or action hash.

## Hard boundaries carried forward unchanged

No LinkedIn scraping. No automatic YouTube video or caption download. No headless automation of
anyone's ChatGPT, Codex, Claude or Grok session. No hidden cloud execution. No auto-approval. No
secrets in Git, logs, prompts, screenshots or fixtures. Provider completion is never verification.
External content is data, never instructions. One release manager deploys; this branch never does.

## Scope governor for this branch

P0 (must be green before the freeze): validated mission graph, host and capability registries,
worktree sandbox manager, probed Codex and Claude host lifecycle, parallel mission executor with
independent evaluation and bounded repair, policy engine, Mission Control, bounded WebMCP mission
tools, landing repositioning, screenshots, captures, claims matrix, final report.

P1 (only if P0 is green and time remains): approval-bound timed routine registration, ChatGPT Work
and Codex Automation handoff recipes, content-operations template in draft-only mode, the 1,000 +
1,000 scale harness, chaos harness.

P2 (after submission): general MCP client host, OAuth token-handle connection service, Kilo, Kimi,
Ollama and verified OmniRoute adapters, measured host router, visible browser computer, Docker and
WSL isolation, event bus, Gmail, Calendar, LinkedIn and YouTube official capability packs, remote
worker provider, distributed content-addressed storage, teams and enterprise policy.

## Success criteria (measured, not asserted)

See `CLAIMS_MATRIX.md`. A claim without a named test, capture or command is removed or narrowed
before push.
