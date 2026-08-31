# Cherry — 3-minute challenge video script

Every beat below is a real interaction on https://cherry-wine.vercel.app — no staging, no cuts that
hide state. Record at 1440×900+, normal browser profile (or incognito for the true fresh-user shot).
Total ≈ 2:50, leaving buffer.

> **Alternate opening (added 2026-08-31):** if you prefer to lead with the judge route, open
> https://cherry-wine.vercel.app/showcase in incognito instead of the landing — it starts from a
> genuinely blank session, shows the WebMCP host panel honestly, and the 12-step story fills in
> live as you (or an attached agent) work. The beats below still apply; the showcase's inline
> approval card replaces the Command Center approval shot at 1:15.

## 0:00–0:20 — The hook (landing)

Open the landing page. Let the marquee + hero breathe for a beat.

> "Every time you teach an AI agent how you work, that lesson dies with the chat. Cherry is where it
> survives. Teach a workflow once — Cherry turns it into memory, a portable skill, and proof."

**Tap the cherry** — it bursts, you land in the Studio. (One click, big smile moment.)

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

## 1:25–2:05 — The WebMCP story (Agent View)

Walkthrough lands on **Agent View**.

> "Here's the WebMCP part. Cherry registers site tools for agents — but never more than five at a
> time, chosen by the mission's phase. Learning tools exist only while learning; export tools only
> after verification passes. The aperture table is the live truth, and every real tool call lands in
> this log. Right now I'm in a normal browser, so it says exactly that: manual mode, nothing
> registered, nothing fake."

(If recording inside a WebMCP-capable client instead: show the live registrations and ask the agent
to `read_cherry_context` — the call appears in the log.)

## 2:05–2:35 — Take it anywhere

Skills page → open the skill → **Compile skill bundle**. Show the downloaded zip's tree briefly
(SKILL.md, targets/codex, targets/claude-code, scripts/verify.mjs).

> "Approved skills compile to a standards-aligned Agent Skills bundle — Codex and Claude Code install
> targets, the evidence, the policies, and a standalone verify script that fails on tampering.
> The workspace itself exports as hash-verified JSON. Your data, your browser, your skills."

## 2:35–2:50 — Close

Back to landing, scroll to the maroon CHERRY OS band.

> "No API key, no account, no cloud — the core is free forever, and attaching an agent accelerates
> the same product instead of unlocking a different one. Cherry: teach once. Every agent gets better."

## Don'ts

- Don't claim live ChatGPT attachment unless you actually record inside one (compat page labels it
  Experimental).
- Don't call receipts "signed" — they're tamper-evident hashes.
- Don't trim out the failed-verification beat; it's the credibility peak.
