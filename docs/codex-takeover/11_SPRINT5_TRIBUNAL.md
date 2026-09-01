# SPRINT 5 — THE TRIBUNAL: JUDGED UNTIL PERFECT, THEN THE HANDOFF (paste into Codex; final sprint)

Still under `00_MASTER_PROMPT.md`; every non-negotiable holds. This is the last directive. Its
two jobs: simulate the real judging so hard that the actual judging holds no surprises, and then
produce the single Final Handoff that verifies everything from every sprint. Two standing orders
that override your instincts:

1. **Never present a sub-10 score as a stopping point.** No "it's an 8, good enough to submit".
   A score below 10 is only ever a work order. You do not ask the owner whether to continue; you
   continue.
2. **Never disturb the owner.** No questions, no intermediate scores, no reassurance requests.
   Your only outputs are STATUS lines, commits, and the Final Handoff. The one thing that ends
   the loop besides perfection is the clock, and the clock's handling is already decided below.

## T24 · Continuous — The judge tribunal (five personas, real criteria, full sessions)

Fan out five sub-agent judge personas. Each runs a COMPLETE session against the real product
(fresh profile, live build) before scoring. Scores are 1 to 10 with written, evidence-linked
reasons; every point short of 10 must name the exact defect that cost it.

- **The Spec Purist** (criterion: WebMCP leverage) — reads the tool surface like the MCP-B
  creator would: canonical names, aperture discipline, state-gating, argument validation,
  bounded results, the library inversion, the inspector. Calls every tool through the mock host,
  including wrongly.
- **The Shipper** (criterion: execution) — clicks everything like a Vercel or Shopify engineer:
  is this a complete product or a proof of concept? First-skill flow, sources, library, exports,
  routines, receipts, import/export, reload survival, error states. Anything broken, stuck, or
  fake costs points brutally.
- **The Skeptic** (criterion: potential impact) — tries to catch us overstating: reads every
  claim on the site, README, and Devpost draft, then checks the evidence behind it. Also judges
  whether the problem and audience are real and the demo proves the solution. One claim ahead of
  evidence is an automatic 6 until fixed.
- **The Taste Judge** (criterion: creativity and design) — holds every screen to the
  Apple/Hermes/TraceCode bar and the T15 rubric, and judges the concept's novelty as presented:
  does "the site upgrades the agent" land in ten seconds on the landing page? Jargon sighted on
  a first-run surface caps the score at 7 until purged.
- **The Stranger** (cross-criterion) — no patience, wrong files, weird clicks: runs a fresh
  Sprint 4 sweep sample. Any lie, crash, or confusion is a P0.

Protocol per round: all five run → scores + defect lists land in
`docs/release/proof/TRIBUNAL_LOG.md` (round number, persona, score, reasons, evidence links) →
defects become fixes with regression tests (your lane) or `BOUNCE-TO-CLAUDE:` STATUS entries
(design/copy/landing lanes; the release manager clears them each cycle) → gates → push → next
round. **Perfect = two consecutive rounds of straight 10s from all five.** Grade inflation is a
protocol violation: a 10 requires the persona to write "nothing I tried broke, nothing claimed
exceeded evidence, nothing confused me, and I would feature this" and mean it against the log.

## The clock (already decided; not yours to renegotiate)

The loop runs until two perfect rounds OR **Wednesday 10:00 London**, whichever comes first.
Missing the submission window is the only unrecoverable failure, so at 10:00 the loop ends
regardless of score, the last round's true scores stand, and T25 executes immediately. This is
not "settling for a 9"; it is refusing to lose the tournament over the last polish pass. Until
that moment: again and again and again.

## T25 · P0 — THE FINAL HANDOFF (one document that verifies everything)

`docs/release/FINAL_HANDOFF.md`, assembled from evidence, nothing invented:

1. **Sprint verification table**: every ticket T1–T23, status (DONE / VERIFIED / BOUNCED /
   NOT DONE — honest), commit hash, and its evidence link (spec name, proof screenshot, capture,
   log entry). Anything not done is listed plainly, never hidden.
2. **Final tribunal scorecard**: last two rounds, all five personas, scores and remaining
   defects if any.
3. **State of the product**: live URL and deploy id, current commit, gate counts (typecheck,
   lint, unit, runner, e2e, chaos), GitHub push state, README render check.
4. **Evidence index**: PROOF_LOG, BREAKER_LOG, TRIBUNAL_LOG, CODEX_MCP_CAPTURE, the uncut
   recording path, TECHNICAL_REPORT, compatibility snapshot.
5. **The owner's script, minute by minute**: exact video recording steps against the current
   DEMO_SCRIPT (under 3 minutes, public YouTube), then the Devpost form field by field from
   DEVPOST_SUBMISSION.md, then a 15-minute pre-submit checklist (repo public and pushed, live
   URL loads in incognito, video link plays, every form field pasted).
6. **Anything left**, honestly, with what it would take.

Mark `HANDOFF READY` in STATUS when it's committed. The release manager (Claude) verifies the
handoff against the repo on the Wednesday morning cycle, signs it, deploys the final build, and
delivers the go-record message to the owner. Your work ends with a clean tree, everything
pushed, and a handoff that never needs you in the room to be believed.
