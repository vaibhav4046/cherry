# Cherry: the three-minute video script

Every beat is a real interaction on https://cherry-wine.vercel.app. No staging, no cuts that hide
state. Record at 1440x900 or larger. Under 3:00 with audio: the challenge asks for a clear demo of
the project functioning and audio that covers what was built and how WebMCP is used. Read the
lines; do not narrate architecture.

The centrepiece is a real WebMCP host session. The challenge resources say site tools work out of
the box in the built-in browser of the ChatGPT desktop app, ChatGPT Work and Codex (GPT-5.6 Sol or
Terra; Luna has WebMCP disabled), and in Chrome 149+ with `chrome://flags/#enable-webmcp-testing`.
Record that session first, before anything else; the rest of the film is cut around it. If neither
host shows the tools on your machine, the FALLBACK lines below are honest replacements. Never claim
a live host you did not record.

## Before recording (once)

1. Start the runner: `node runner/server.mjs --root D:\project --allow-exec node --allow-exec codex --concurrency 3`.
   Pair it in Studio > Connect with the printed token. Codex CLI is found on PATH.
2. The mission target is a small real repository under `D:\project` with a `node --test` suite
   (for example `D:\project\orbit-runner`, a three.js ring runner; its README and key bindings carry
   real onboarding defects for the audit to find).
3. In the ChatGPT desktop app open the built-in browser at https://cherry-wine.vercel.app/studio/control
   and confirm **Site tools** appears in the address bar.
4. Loopback check. Modern Chromium asks a public site for permission before it may reach
   127.0.0.1 (Local Network Access), and an embedded browser may simply refuse. If the start call
   says no runner is listening while `node runner/server.mjs` is clearly up, serve the same build
   locally and use that URL for the mission part: in `D:\project\cherry` run `npm run build` then
   `npm run preview`, open http://127.0.0.1:4173/studio/control in the same built-in browser (the
   runner already allows that origin), and say on camera that it is the same build served locally.
   The Site tools shot can still be taken on the live URL.

## 0:00 to 0:12, hook (landing)

Open https://cherry-wine.vercel.app.

> "Every agent you use is capable. Your tools, your memory and the way you work are not shared
> between them. Cherry turns the agents you already pay for into one team, and keeps the decisions
> with you. And Cherry's website is itself a set of tools any agent can pick up."

## 0:12 to 1:05, the WebMCP session (CAPTURE)

Cut to the ChatGPT built-in browser on `/studio/control`. Click **Site tools**, then
**Available site tools**.

> "This is ChatGPT's own browser looking at Cherry. No plugin, no MCP server: the page registers
> its tools on document.modelContext. Seven always-on reads, and on Mission Control, five mission
> tools. Not one of them can approve anything."

Type to ChatGPT: "Use this site's tools. Create an outcome mission with the outcome 'Fix the
highest-impact onboarding defect in Orbit Runner and prepare the release notes. Nothing public
without my approval.' and repositoryRoot D:\project\orbit-runner. Then plan it and tell me what the
plan contains." (The words "onboarding" and "release" select the release mission: research, audit,
prioritise, a Codex developer fix in a worktree, release notes, independent verification, and a
publish decision that only you can make.)

> "ChatGPT calls create_outcome_mission and plan_current_mission. Cherry validates the plan:
> bounded, acyclic, a definition of done and a real check on every task, and a human decision
> before anything public."

Ask ChatGPT to start it. It refuses.

> "It cannot start it. The plan carries consequential work, and no tool can approve it."

Click **Approve plan** yourself, then ask ChatGPT to start it again. Show two nodes running.

> "I approved this exact revision. Now the runner on my machine leases one git worktree per task
> and Codex works two of them at the same time. The boundary label says worktree-process. It never
> says VM, because it is not one."

FALLBACK (no host showed the tools): show Agent View instead and say: "Cherry registers seven
always-on reads and at most five state-scoped tools on document.modelContext. This browser has no
WebMCP host, so the panel says manual mode and nothing is registered. Nothing on this page fakes an
agent." Then plan and start the mission by hand in Mission Control.

## 1:05 to 1:35, verification and the human decision (Mission Control)

Stay on the mission page while the verify node runs.

> "The host reports completion. Cherry does not believe it. The runner runs the repository's own
> tests and its file checks; a failed check gets one bounded repair, and only a passed report or a
> person moves a task to succeeded."

When the publish node waits, decide it.

> "The agents could finish the work. They could not release it. That decision is mine, and it
> binds to the evidence I just read."

## 1:35 to 1:50, Agent View

Click **Agent** in the Studio nav.

> "Every tool call ChatGPT made is here: name, input, result, revision. If a page can be driven by
> an agent, the person must be able to see exactly what the agent did."

## 1:50 to 2:15, the committed run (Showcase)

Click **Showcase**. It opens on "One outcome. Two agents. Human authority intact." Press **Next
step** twice, then **Open evidence**.

> "This is a committed real Codex run, replayed from a digest-pinned fixture: 34 seconds of
> measured overlap between two worktrees, codex-cli 0.152.1, node --test run by the runner itself.
> Anyone can recompute the hash."

## 2:15 to 2:38, the inversion (Creators and Skills)

Click **Open Studio**, then **Creators** (load the sample library from the Showcase first if the
space is empty), then **Skills**, open one, show **Download SKILL.md** and **Copy AGENTS.md (Codex)**.

> "Most agent-ready sites let an agent operate them. Cherry's site upgrades the agent. Follow a
> creator, the runner checks the public feed daily, I add the transcript, I approve the exact
> version I read. Then recommend_skills hands my approved skills to any agent that visits, pinned to
> the revision I approved, and the same skills follow me into Codex and Claude Code."

## 2:38 to 2:52, proof and what is proven

Click **Proof**, open a receipt, click **Recompute hashes**. Then **What's proven**.

> "Every action is a ProofEvent; receipts are SHA-256 over canonical JSON, and one changed byte
> turns this red. And every capability is labelled by the test or capture behind it. We would
> rather show you the label than the claim."

## 2:52 to 3:00, close

Back to the landing.

> "No API key. No cloud. Open source. One task, an entire AI team, and the authority stays with
> you. Cherry."

## Do not say

Cloud VM or container (it is a worktree-process boundary), signed receipts (they are
tamper-evident hashes), runs 24/7 (it runs while your paired runner is online), connected to
LinkedIn, watches videos, replaces any named product, "works in ChatGPT" unless you recorded it,
AAA anything.

## Do say

Runs while your paired runner is online; uses your Codex sign-in and available Codex usage;
worktree-process boundary; tamper-evident hashes; experimental where the compatibility page says
experimental.

## After recording

Send the WebMCP session recording to the release manager before the freeze. It gets pinned into
the Showcase with its hash and the compatibility row for the live host moves from Experimental to
Validated. After 13:00 PT on 3 September nothing changes.
