# Cherry — 3-minute challenge video script

Every beat below is a real interaction on https://cherry-wine.vercel.app — no staging, no cuts that
hide state. Record at 1440×900+, normal browser profile (or incognito for the true fresh-user shot).
Total ≈ 2:55, leaving buffer.

> **Alternate opening (added 2026-08-31):** if you prefer to lead with the judge route, open
> https://cherry-wine.vercel.app/showcase in incognito instead of the landing — it starts from a
> genuinely blank session, shows the WebMCP host panel honestly, and the 12-step story fills in
> live as you (or an attached agent) work. The beats below still apply; the showcase's inline
> approval card replaces the Command Center approval shot at 1:15.

## 0:00–0:20 — The hook (landing)

Open the landing page. Let the hero and the live lesson card breathe for a beat.

> "You learn your craft from creators. Your agents can not — every lesson you teach them dies with
> the chat. Cherry is where it survives. Teach a workflow once — Cherry turns it into evidence, an
> approved skill, and proof, and serves it to every agent you already pay for."

The hero says it: **Turn a lesson into a skill every agent you own can run.**

## 0:20–0:50 — Guided example (real state, one click)

Go back, click **Try the guided example**.

> "This isn't a mock. One click imported a real workspace — a mission that was actually learned,
> approved, executed, verified, and receipted. The walkthrough drives the real screens."

Walkthrough step 2 (mission): point at the state chip and the evidence ledger's **untrusted** labels.

> "Everything Cherry learns from the outside world starts untrusted. Only a human can promote it."

## 0:50–1:25 — The part nobody else shows: honest failure

Walkthrough to the SkillGraph step.

> "Observations become a versioned SkillGraph. Approval binds to the exact revision I reviewed —
> edit one node and the approval goes stale."

Walkthrough to artifacts, then Proof. Open **failures and repairs** on the receipt.

> "In this mission the first artifact genuinely failed verification — no h1. It was repaired and
> re-verified. Cherry keeps that failure in the receipt, because proof that never fails isn't proof."

Click **Recompute hashes** → "Receipt verifies".

> "SHA-256 over canonical JSON, recomputed live. Change one byte anywhere and this turns red."

## 1:25–1:55 — The WebMCP story (Agent View)

Walkthrough lands on **Agent View**.

> "Here's the WebMCP part. Cherry registers site tools for agents — but never more than five at a
> time, chosen by the mission's phase. Learning tools exist only while learning; export tools only
> after verification passes. The aperture table is the live truth, and every real tool call lands in
> this log. Right now I'm in a normal browser, so it says exactly that: manual mode, nothing
> registered, nothing fake."

(If recording inside a WebMCP-capable client instead: show the live registrations and ask the agent
to `read_cherry_context` — the call appears in the log. Then the money shot: ask it to
`recommend_skills` for a task you just taught — it gets your approved skill back, pinned to the
revision and approval hash, and can pull the install file with `get_skill`.)

## 1:55–2:15 — Creators (the watch engine)

**Creators** (`/studio/creators`). With the sample library loaded, point at the followed creator
(marked SAMPLE DATA) and the two rows under **New from your creators**: one **Ready to draft**, one
**Needs transcript**.

> "This is the part I built Cherry for. Follow a creator once. The paired runner checks the
> channel's public feed every day, and every new upload shows up here with a proposed skill:
> a name, what it teaches, and once I add the transcript, the candidate steps. Cherry never
> downloads the video and never calls a model. I add the transcript, I approve, and the skill
> lands in the library every agent reads."

Click **Draft the skill** on the ready row to show it opening in Quick Skill with the source
already selected, then come back.

## 2:15–2:40 — Take it anywhere

**Skill Library** (`/studio/skills`) → search, point at the install-ready sticker and the approval
hash chip → open the skill → **Download SKILL.md**, **Copy AGENTS.md (Codex)**, **Compile skill
bundle**. Then flash `/connect` and its Codex `config.toml` block.

> "Every approved skill lands in one library. From here it installs into the agents you already
> have: SKILL.md for Claude Code and Hermes-class agents, an AGENTS.md block for Codex, the full
> bundle with a standalone verify script that fails on tampering. And agents do not even need the
> download — visiting this site, they can ask recommend_skills mid-task and pull the install file
> themselves, hash-pinned to the exact revision I approved. Your data, your browser, your skills —
> in every agent."

## 2:40–2:55 — Close

Back to landing, scroll to the **Teach once. Every agent gets better.** band.

> "No API key, no account, no cloud — the core is free forever, and attaching an agent accelerates
> the same product instead of unlocking a different one. Cherry: teach once. Every agent gets better."

## Don'ts

- Don't claim live ChatGPT attachment unless you actually record inside one (compat page labels it
  Experimental).
- Don't call receipts "signed" — they're tamper-evident hashes.
- Don't trim out the failed-verification beat; it's the credibility peak.
