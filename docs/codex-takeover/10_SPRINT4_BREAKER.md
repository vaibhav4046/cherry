# SPRINT 4 — THE BREAKER: SURVIVE 200,000 STRANGERS (paste into Codex; queues after Sprint 3)

Still under `00_MASTER_PROMPT.md`; every non-negotiable holds. This sprint exists because of a
simple observation: a product that goes viral is not the one that works when its maker
demonstrates it — it is the one that CANNOT BE BROKEN by strangers with no patience, wrong
files, weird clicks, and bad networks. TraceCode's landing works because the product proves
itself instead of describing itself, and because nothing a visitor tries makes it lie, crash, or
confuse them. Cherry already proves itself; this sprint makes it unbreakable and removes every
trace of sloppiness. Interleave with Sprint 3: the Breaker sweep is now PART of the endgame loop
and it outranks any new feature work.

The rules of engagement: every attack below is run against OUR product to harden it — standard
adversarial QA. Every break found becomes three things, always: a STATUS entry with severity, a
fix, and a PERMANENT regression test (unit or e2e) so it can never return silently. Script the
sweep where possible (a dedicated Playwright chaos spec battery) so re-sweeps are cheap.
Sub-agents may fan out to generate attack inputs and score results; one writer on the tree.

## T21 · P0 — The attack catalog (run it all, log it all)

Log every case in `docs/release/proof/BREAKER_LOG.md` as: attack → expected honest behavior →
actual → verdict → fix commit (if any). Expected behavior is never a crash, never a blank
screen, never a fake success: it is a designed state with a plain sentence and one next step.

**A. Input abuse (every text field and URL box in the product)**
Empty · single character · 10,000 characters · emoji and RTL text · `<script>` and HTML tags
(must render inert everywhere — this is a sanitization check of our own surfaces) · quotes and
backslashes · whitespace-only · a URL that is not a URL · every YouTube URL shape: youtu.be,
watch?v=, shorts, playlist, timestamped t=, live, music.youtube, invalid video id, a private
video id · a non-YouTube video site pasted where YouTube is expected.

**B. File abuse (every upload and import)**
Zero-byte file · a PNG renamed .srt · 50 MB text file (must refuse or handle with a stated
limit) · malformed JSON workspace import · a valid export with one byte flipped (must reject
with zero writes — prove it from the UI, not just the unit test) · wrong extensions · a Takeout
history file with broken rows · the same file imported five times (duplicate handling states
itself).

**C. Flow abuse (impatient-user behavior)**
Double-click and triple-click every submit and approve control (no double records, no double
downloads) · refresh in the middle of every multi-step flow (state survives or restarts
honestly) · browser back mid-wizard · two tabs mutating the same workspace · approve in one tab,
edit in the other (staleness must win) · delete or archive things that other things point at
(routine bound to a skill, lesson behind evidence) · export when there is nothing to export ·
"do very bullshit to export things": spam every export format on unapproved skills (refusals
stay calm and identical), tamper bundles then run verify (must fail), export → import → export →
import (ids remap, references intact, no growth).

**D. State and environment abuse**
Deep-link every route cold on a fresh profile (no crash, honest empty states, including
/studio/skills/<garbage-id> and /studio/proof/<garbage-id>) · clear site data mid-session ·
large realistic load: 100 skills, 500 evidence rows, 50 sources (lists stay usable, search stays
fast, nothing unbounded) · offline: airplane-mode the tab and touch every fetch surface (oEmbed,
runner, RSS check, Privy) — each fails closed with a plain sentence · runner killed mid-job
(job shows failed, never stuck running) · slow network throttle on first load (no layout lies,
no infinite spinners without words).

**E. WebMCP host abuse (mock host battery)**
Call every tool in wrong states (refusals, not crashes) · invalid, missing, huge, and
wrong-typed args (zod refusals stay bounded) · get_skill part=0, part=999, negative · rapid
tool-call floods (results stay bounded, UI stays alive) · repeated approval requests (no queue
explosion, human still required) · tool results always parse as JSON (no truncation corruption
anywhere — assert on every tool, not just get_skill).

**F. Access and assistive abuse**
320px width · 200% browser zoom · keyboard-only through the entire first-skill flow and an
export · screen-reader label spot-check on every icon button · focus never trapped or lost after
dialogs and approvals.

**G. Copy and honesty sweep (the anti-sloppiness pass)**
Read every string a stranger can see, in every state the sweep produced: zero banned jargon
(04_COPY_GUIDE list) on first-run surfaces, zero placeholder text, zero "TODO", zero silent
failures, zero claims ahead of evidence, consistent capitalization and punctuation, every error
names its fix. File each miss as `SLOP:` in STATUS and fix in-lane.

## T22 · P0 — The chaos battery becomes code

Distill the catalog's automatable cases into `e2e/cherry/chaos.spec.ts` (plus unit fuzz cases
where they belong). It runs with the suite from now on. Manual-only cases (airplane mode, zoom,
screen reader) stay in BREAKER_LOG with dates and screenshots.

## T23 · P1 — The landing proves itself harder

TraceCode's lesson applied honestly: the landing's live lesson card is Cherry's self-demo — make
sure it NEVER fails a stranger: fresh profile, slow network, example unavailable, reduced
motion, mobile. If T9's recording is live, position it one scroll away with the honest label.
No new sections, no new claims; just make the proof element bulletproof and obvious.

## Done criterion (this is what "perfect" means, measurably)

Two consecutive FULL sweeps of the catalog with zero new P0/P1 findings, chaos battery green in
the suite, SLOP list empty on first-run surfaces, BREAKER_LOG complete with evidence. Reaching
freeze (Wednesday 12:00 London) with open P2s is acceptable ONLY if they are listed honestly in
the log and the technical report. After freeze: fixes for P0/P1 regressions only.
