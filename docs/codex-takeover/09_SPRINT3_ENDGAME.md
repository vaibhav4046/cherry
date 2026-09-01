# SPRINT 3 — ENDGAME: THE 10/10 LOOP, THE PROOF, THE LAUNCH (paste into Codex after Sprint 2)

Still under `00_MASTER_PROMPT.md`. Every non-negotiable holds: gates before commits, npm ci with
lockfile in the same commit, push after every DONE, you never deploy, design changes only inside
`03_DESIGN_DIRECTIVE.md`, copy per `04_COPY_GUIDE.md`, claims per `05_GUARDRAILS.md`, STATUS.md
is the channel. Timing: T15 and T16 run as continuous loops the moment Sprint 2's P0s are DONE;
T17–T19 are concrete tickets due before freeze (Wednesday 12:00 London); T20 is stretch. After
freeze: only bounced-ticket fixes, evidence, and docs.

Sub-agents: you may fan out your own sub-agents for READ-ONLY work — research, screenshot
sweeps, rubric scoring, report drafting. Exactly one writer touches the working tree at a time,
and every write still goes through the gates. Parallel eyes, single hand.

---

## T15 · Continuous — The 10/10 loop (brutal, measurable, endless until freeze)

"Looks premium" is not a gate; this rubric is. For every route (/, /showcase, /connect,
/compatibility, /ingest, 404, and each /studio page) at 375 / 768 / 1440, score these ten
binary checks from screenshots and DOM:

1. One primary action, accent-colored, visible without scrolling.
2. Spacing comes only from the token scale; no cramped or uneven gaps at any width.
3. Type hierarchy: one display moment per page, consistent subheads, body measure ≤ 70ch.
4. Exactly one accent (cherry wine); semantic colors only on status; zero stray blues.
5. Every state honest and designed: loading says loading, empty teaches one next step, errors
   name the fix.
6. No banned jargon on first-run surfaces; every button a verb of ≤ 3 words.
7. Full keyboard path, visible focus, zero serious axe violations.
8. No horizontal scroll, no clipped text or focus rings, at all three widths.
9. Route code is lazy-loaded; no visible layout jump on load.
10. The screenshot could sit beside an Apple product page or the Hermes Agent site without
    embarrassment. (Judged last, only after 1–9 pass.)

Loop: sweep → log `RUBRIC: <route> <width> = n/10 — <failing checks>` in STATUS → fix your-lane
failures inside existing tokens/components → gates → push → re-sweep. Claude-lane failures
(landing, showcase, connect, compatibility, design system) stay as STATUS entries; the release
manager clears them on each review cycle. The loop ends only at 10/10 across the board or at
freeze. Never "improve" by adding decoration; these checks reward restraint.

## T16 · Continuous — Real-usage proof runs (screenshots or it didn't happen)

Between rubric sweeps, USE the product like the person it was built for, and file the evidence:

- Real YouTube material, sourced exactly per T8's rules (paraphrased evidence, at most two short
  attributed quoted lines per video, no transcript files in the repo): run the full first-skill
  flow on at least 3 new real content-creation videos across the sprint. Approve, verify,
  export, install.
- Exercise every listed feature at least once against the feature inventory you build from the
  UI itself: sources (each kind), watch-history import, bookmarklet/ingest, library search and
  filters, every export format, routines (draft → human-style approval in UI → runner dispatch
  with the paired local runner), memory, receipts recompute, workspace export/import, WebMCP
  tools through the mock host, MCP bridge through your own Codex config (extend the T10
  capture).
- Every run produces artifacts in `docs/release/proof/`: timestamped screenshots named
  `<feature>-<yyyymmdd-hhmm>.png` plus one `PROOF_LOG.md` table (feature · when · what happened
  · screenshot). Failures get filed as tickets, not retouched.

AC: PROOF_LOG.md covers the full feature inventory with screenshots; at least 3 real-video runs
logged; every discovered defect is a STATUS ticket with severity.

## T17 · P0 — Codify the harness so nothing more is ever required

Make this repo's operating system explicit and permanent, at the level of the best agent
harnesses: layered, constrained, self-describing.

- Rewrite `AGENTS.md` as the layered contract: Layer 1 invariants (domain purity, ProofEvents,
  untrusted-by-default, human-only approvals, no secrets); Layer 2 process (gates, lockfile,
  lanes, single deployer, STATUS protocol); Layer 3 pointers (directive pack, tickets, design,
  copy, guardrails). Short, numbered, enforceable — every rule phrased so a violation is
  detectable.
- `docs/HARNESS.md`: the full architecture of both harnesses — the product engine (five
  movements, serving rails, trust boundaries) and the team harness (lanes, gates, review/deploy
  loop, the 10/10 rubric) — with the repo paths that implement each part.
- Scripts that make discipline one command: `npm run gates` (typecheck + lint + unit + runner),
  `npm run verify:all` (gates + build + e2e + verify:pack + audit:submission). Wire nothing to
  CI services; the scripts ARE the CI.

AC: AGENTS.md rewritten (keep every current rule, none weakened); HARNESS.md complete and
accurate to the code; scripts green; docs cross-referenced from README.

## T18 · P0 — Contribution-ready, star-ready repository

The repo is a judged deliverable and the launch surface. Make a stranger's first five minutes
excellent:

- README overhaul: one hero screenshot of the wine landing (commit to `docs/media/`), the
  one-paragraph pitch (site upgrades the agent · human gates · receipts · zero model calls),
  test counts as plain text, quickstart (`npm ci && npm run dev`), the uncut demo video link,
  live URL, harness diagram reference, honest compatibility summary, MIT license badge.
- `CONTRIBUTING.md`: how the gates work, the lanes idea for humans, how to run everything, and
  the four documented extension points with a worked outline each: add a source kind, add a
  WebMCP tool (aperture rules), add an export target, add a runner job type.
- `docs/GOOD_FIRST_ISSUES.md`: 8–10 real, scoped, honest starter tasks.
- Issue/PR templates under `.github/` that ask for gates output and claims honesty.

AC: fresh-clone quickstart works as written; README renders clean on GitHub; no claim in any of
it exceeds the evidence; screenshots current (wine design).

## T19 · P0 — The final technical report (the "good to go" document)

`docs/release/TECHNICAL_REPORT.md`, assembled from evidence that exists, nothing invented:

- Harness architecture (link HARNESS.md, embed the summary), live deployment
  (https://cherry-wine.vercel.app + alias), current commit, gate counts on that commit.
- Feature inventory with proof links (PROOF_LOG entries, e2e spec names, captures, recording).
- Compatibility table snapshot with the honest labels, including the T10 live-Codex capture.
- Security posture summary, known limitations, and the roadmap (extension bubble, encrypted
  sync, community registry, creator packs).
- Final rubric scoreboard from T15.

AC: every statement carries a pointer to its evidence; report linked from README and STATUS;
release manager signs it off on the last review cycle.

## T20 · Stretch — Launch kit

Drafts only, committed to `docs/release/launch/`: a LinkedIn post, an X thread (6–8 posts), and
a Devpost description sync check — all in Vaibhav's direct voice, all claims traceable to the
report. No posting; humans post.

---

## The finish line

By freeze, the loop is at 10/10 or the gaps are listed honestly; the proof log covers the
product; the harness is codified; the repo welcomes contributors; the report says exactly what
is true with links. That is what "perfect" means here: not louder claims — fewer unproven ones.
Ship it, push it, and leave the tree clean.
