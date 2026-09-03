# Cherry: the three-minute video script

Every beat is a real interaction on https://cherry-wine.vercel.app. No staging, no cuts that hide
state. Record at 1440x900 in a normal browser window, incognito for the fresh-user shots. Total
about 2:55. Read the lines; do not narrate architecture.

Two beats are marked CAPTURE. If you managed to record a real WebMCP host calling Cherry's tools,
use that footage there and say so. If not, show Agent View in manual mode and say that too. Never
claim a live host you did not record.

## 0:00 to 0:15, landing

Open https://cherry-wine.vercel.app. Let the hero and the teammate rail breathe.

> "Every agent you use is capable. Your tools, your memory, and the way you work are not shared
> between them. Cherry is the runtime that turns the agents you already pay for into one team,
> and keeps the decisions with you."

## 0:15 to 0:40, the recorded mission (Showcase)

Click **Showcase**. The page opens on "One outcome. Two agents. Human authority intact." Press
play on the replay.

> "This is a real mission, not a mock. One outcome went in. Cherry validated a plan, and Codex
> worked two tasks at the same time in two separate git worktrees. The overlap is measured from
> the runner's own event log."

Scroll to "Completion was checked, not inferred."

> "Provider completion is not trusted. Cherry ran the fixture's own tests. One check failed, one
> bounded repair ran, the evaluator reran every check, and only then did the task count as done.
> The agents could finish the work. They could not release it."

## 0:40 to 1:10, Mission Control, live

Click **Open Studio**, then **Team** in the Studio nav (this is Mission Control). Type an outcome (use the example
"Audit this repository and fix the highest-impact defect"). Show the plan card.

> "Here is the same thing live. An outcome becomes a graph Cherry validated: bounded, acyclic,
> every task with a definition of done and a real check, and a human decision before anything
> public. With a paired runner and your Codex sign-in, the tasks run in isolated worktrees. The
> boundary label says worktree-process. It never says VM, because it is not one."

If your runner is paired, start it and show two nodes running. If not, say: "Without a paired
runner this stays a plan; nothing pretends to run."

## 1:10 to 1:35, the WebMCP moment (CAPTURE)

Open **Agent** in the Studio nav (Agent View).

With a real host recorded: "This is a WebMCP host calling Cherry's tools. It asked
`recommend_skills` for its task and got my approved skills back, pinned to the revision I
approved. It called `plan_current_mission`. It cannot approve anything: the tools that could are
not registered for it."

Without one: "Cherry registers seven always-on read tools and at most five state-scoped tools on
`document.modelContext`. I am in a normal browser, so the panel says manual mode and nothing is
registered. Nothing on this page fakes an agent."

## 1:35 to 2:00, Creators and the library

Click **Creators** (load the sample library from the Showcase first if the space is empty).

> "This is how Cherry learns. Follow a creator; the paired runner checks the public feed daily,
> and each upload arrives with a proposed skill. Cherry never downloads the video. I add the
> transcript, Cherry drafts the steps, I approve the exact version I read."

Click **Skills**, open one, show **Download SKILL.md** and **Copy AGENTS.md (Codex)**.

> "Approved skills follow me into Codex through the MCP bridge, into Claude Code and Hermes-class
> agents as bundles, and to any agent that visits this site."

## 2:00 to 2:25, proof (CAPTURE if a real receipt exists from your own run)

Click **Proof**, open a receipt, click **Recompute hashes**.

> "Every action is a ProofEvent. Receipts are SHA-256 over canonical JSON. Change one byte and
> this turns red. Approvals bind to the exact content hash, and no agent tool can grant one."

## 2:25 to 2:45, what is proven

Click **What's proven**.

> "Every capability is labelled by the test or capture behind it. Codex execution: captured.
> Claude Code execution: experimental, it needs a sign-in. WebMCP in a real browser host:
> experimental until recorded. We would rather show you the label than the claim."

## 2:45 to 2:55, close

Back to the landing.

> "No API key. No cloud. The core is free and open source. One task, an entire AI team, and the
> authority stays with you. Cherry."

## Do not say

Works in ChatGPT (unless you recorded it), runs 24/7, cloud VM, connected to LinkedIn, signed
receipts, replaces any named product, watches videos.

## Do say

Runs while your paired runner is online; tamper-evident hashes; uses your Codex sign-in and
available Codex usage; worktree-process boundary; experimental where it is experimental.
