# SPRINT 2 — THE CLOSING DIRECTIVE (paste into Codex after the master pack; it queues behind T1–T7)

You are still operating under `00_MASTER_PROMPT.md`. Every non-negotiable there stays in force:
gates before commits, npm ci discipline, push after every DONE ticket, you never deploy, design
frozen except through `03_DESIGN_DIRECTIVE.md`, copy per `04_COPY_GUIDE.md`, claims per
`05_GUARDRAILS.md`, STATUS.md as the only channel. This file adds the second wave: the work that
turns a strong submission into the one judges remember. Finish T1–T7 first; then run T8–T13 in
order. Vaibhav is asleep. Do not wait for him; do not ask him anything the pack already answers.

One point of clarity, because "win at any cost" is the brief: the cost we never pay is a claim
that outruns the tests or a fetch that breaks a platform's rules. Every hackathon has ten teams
with faked demos and inflated claims; judges have learned to poke. The submission that survives
poking wins. The guardrails are the weapon. Inside them, be maximally ambitious.

---

## T8 · P0 — The judge is never empty-handed (real starter library)

Problem: a judge lands with an empty browser profile, so `recommend_skills` has nothing to serve
and the inversion demo falls flat. Fix it with real content, honestly sourced.

- Build a labeled starter library: 8 to 10 skills derived from real, named, public YouTube
  videos in the content-creation world (thumbnails, titles/hooks, shorts repurposing, scripting,
  SEO for video, publishing checklists). For each: creator name, video title, and URL as
  provenance; evidence entries that PARAPHRASE the method in our words, timestamped; at most two
  short quoted lines per video (a sentence or two, quoted and attributed), never long excerpts,
  never full transcripts committed to the repo. Derived method steps are our own writing.
- Ship it through the existing labeled-sample mechanism (the `isExample` path): one click on
  /showcase (and the T1 done-screen) loads "the labeled sample library"; the demo-reset already
  removes example workspaces, keep that true. Every skill shows its "where this came from" panel.
- The moment it loads, the WebMCP tools serve it: a judge in a host can call `recommend_skills`
  with "I need a thumbnail for my video" and get a real, cited, approved skill back.

AC: fixture-built sample imports cleanly on a fresh profile; e2e proves load → recommend →
get_skill on the sample; no transcript files in the repo, only paraphrased evidence + short
attributed quotes; reset removes it fully.

## T9 · P0 — Watch it run: the uncut recording on the site

The strongest possible proof for "this is real" is the product running with no cuts.

- Record the golden loop with Playwright's built-in video capture: a dedicated spec (e.g.
  `e2e/cherry/demo-recording.spec.ts`, `test.use({ video: { mode: 'on', size: { width: 1280,
  height: 720 } } })`) that walks the full journey at a human-followable pace (brief waits
  between beats). Copy the resulting webm into `public/media/demo/golden-loop.webm` (keep it
  under ~12 MB; lower the size or fps if needed).
- Add a quiet "Watch the real run" section on /showcase (and link from the landing's every-agent
  band): a native `<video>` with controls, labeled exactly: "Uncut recording of the automated
  end-to-end test driving the real product. Nothing staged."
- This is a repo asset, not a claim inflation: the label says precisely what it is.

AC: video plays on the live site from the repo asset; label present; page passes axe; e2e suite
still green (the recording spec can be excluded from the default run via testIgnore and run by an
explicit script, e.g. `npm run record:demo`).

## T10 · P0 — Validate the Codex path against yourself (you ARE a live Codex host)

You are running inside Codex with this repo. That makes you the live host we could not claim.

- Export a real workspace JSON (drive the app headlessly via the existing e2e infra, or use a
  committed fixture built by the golden loop), compile one real bundle, then register the bridge
  in your own MCP config: `codex mcp add cherry -- node runner/mcp/server.mjs --workspace <path>
  --bundles <path>` (or the config.toml equivalent) and exercise it: initialize, list tools,
  read the library, verify the bundle hash.
- Capture the session honestly: the exact commands, the JSON-RPC exchanges (trim noise), date,
  Codex version, into `docs/release/CODEX_MCP_CAPTURE.md`.
- Note it in STATUS so the release manager flips the compatibility row from "shipped" to
  "validated (live Codex session, 2 Sep 2026)" with the capture as evidence. Do not edit the
  compatibility page yourself; it is Claude's lane.

AC: capture file committed with reproducible steps; bridge tests still green; STATUS updated.

## T11 · P1 — Inspection sweep: hold every screen to the reference bar

Use your browser/screenshot capability to LOOK at what you build, the way a design reviewer at
Refero-quality studios would (the bar: Linear, Vercel, Perplexity levels of restraint and
finish). For every route (/, /showcase, /connect, /compatibility, /studio and each studio page,
/ingest, 404) at 375, 768, and 1440 widths:

- Screenshot, then check: spacing rhythm on the token scale; one accent; aligned baselines; no
  orphaned controls; empty states teach; no text overflow or clipped focus rings; dark-vs-light
  parity if applicable; no jargon from the banned list visible on first-run surfaces.
- File every defect as a STATUS line (`UIQA: <route> <width> — <defect>`), fix the ones inside
  your lane within existing tokens/components, and leave Claude-lane defects (landing, showcase,
  connect, compatibility, design system) as STATUS entries for the release manager.

AC: STATUS carries the full sweep log; your-lane defects fixed with gates green; zero new colors,
fonts, or components introduced.

## T12 · P1 — Performance and meta polish

- Confirm the Privy chunk never loads in guest mode (network assertion in e2e).
- Bundle sanity: keep the main chunk from growing; lazy-load anything new and heavy.
- Meta: wine favicon variant if trivial (SVG favicon), correct `<title>`/description per route
  where the shell allows, og:image still valid; 404 route intact.
- `npm run smoke`: add a script that runs typecheck + lint + unit in one command for fast loops.

AC: e2e network assertion for guest mode; scripts added; gates green.

## T14 · P1 — "Add anything": one door for every ingestion path

The user should feel spoiled for choice at one single entry point, not hunt across pages.

- One "Add to Cherry" menu (Sources page header + the T1 screen + Command Center empty state)
  listing every path with a plain one-liner each: paste a YouTube link · paste an article link ·
  paste raw text · upload a file (.txt, .md, .srt, .vtt) · import your watch history ·
  save-from-any-tab bookmarklet (T2) · watch a channel (T7).
- "Auto-ingest" exists in exactly one honest form and is labeled as such: watched channels
  checked through your paired runner on a schedule you approved (T7). New drafts arrive; nothing
  is fetched or believed without you. No other background ingestion, ever.
- File upload accepts the listed text formats only, parsed client-side, provenance recorded.

AC: every path reachable within two clicks of /studio; e2e covers the menu and the file-upload
path; copy per the guide; no new fetch surfaces beyond T4/T7's.

## T13 · Stretch — The 90-second judge card

A small dismissible card on /showcase: "Judging Cherry? The 90-second path" with four steps
(load the sample library, ask your agent to recommend_skills, approve an edit to see the gate,
open the receipt and recompute). Plain language, no new components.

AC: e2e for render + dismiss persistence; copy per the guide.

---

## While you work (the harness running around you)

Claude reviews and deploys on schedule twice on Tuesday and continuously Wednesday morning;
bounced tickets outrank new ones. Push after every DONE. Freeze is Wednesday 12:00 London:
after freeze, only fixes for bounced tickets, evidence, and docs. The demo video and the Devpost
form are Vaibhav's and happen Wednesday afternoon; everything you ship before freeze is what the
video can show. Make the recording, the sample library, and the first-skill flow so good that
the video narrates itself.
