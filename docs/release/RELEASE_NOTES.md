# Cherry release notes

## v1.4.0 — The Notebook (2026-08-29)

NotebookLM-grade autonomy, zero-dollar honest. Drop sources → instant overview → one-click studio
outputs → approved skill. No model call anywhere: the digest engine is classic extractive
summarisation (term-frequency scoring + position boost), so every overview sentence exists verbatim
in your sources — and the UI says so.

### Added
- **Digest engine** (src/cherry/notebook/digest.ts): deterministic extractive summary, key-topic
  extraction (unigrams + bigrams), per-source one-line summaries, template-generated review checks.
- **Three-pane Notebook** in the wizard: Sources (auto-titled cards with summaries and segment
  counts) · Overview (instant summary, topic chips, things-to-check) · Studio.
- **Studio outputs**: Briefing doc, Study guide (real checklist with rewatch timestamps), FAQ —
  generated as genuine markdown, written into the mission's file workspace as versioned artifacts
  AND downloaded. Fully cited with source names and timestamps.
- 8 digest unit tests (incl. verbatim-in-source guarantee and determinism) + notebook e2e
  (two-source ingest → overview → briefing artifact → skill generation).

### Totals
86 unit + 15 runner/bridge + 31 e2e — all passing.

## v1.3.0 — Cherry Wine: Autopilot + live-host proof (2026-08-29)

### Added
- **Autopilot brief** (Agent View): copy one brief into an attached ChatGPT/Claude client and your
  own subscription drives the whole loop through Cherry's tools — including watching the embedded
  video with the host's browser vision. New WebMCP tools: import_transcript (append-capable) and
  generate_quick_skill (auto-named); load_lesson now advances the mission state. Aperture still ≤5+2.
- **Live Claude Code validation** (D-012): compiled bundle installed and discovered as a real skill
  in a live host session; MCP bridge registered via claude mcp add → ✔ Connected.
- **Multi-source ingestion** (NotebookLM-style): drop several .txt/.srt/.vtt files at once in the
  wizard; each appends with a monotonic timeline. "Add another source" from the review step.
- **Auto-naming**: leave the skill name blank — Cherry names it from the content.
- **Playback speeds** (1x/1.5x/2x/3x) on the Watch page and wizard player via the official IFrame API.
- **Cherry Wine identity**: product renamed across title/meta/marquee/watermark; plain-words pass on
  the artifact screens.

### Tests
- 78 unit (+3: append shifting, auto-name, autonomous Autopilot loop through tools only) +
  15 runner/bridge + 30 e2e — all passing. Autopilot test caught and fixed a real gap
  (load_lesson tool didn't advance DRAFT→LEARNING).

## v1.2.0 — Quick Skill pipeline (2026-08-29)

### Added
- **Quick Skill wizard** (/studio/quick): YouTube link (official player) or manual → paste the
  transcript (YouTube's Show-transcript copy formats now parse natively: bare 0:05 lines,
  alternating timestamp/text rows) → Cherry deterministically derives steps and principles →
  per-step review with keep/drop → real exact-revision approval → verification + receipt →
  downloadable Agent Skills bundle with install guidance. ~4 clicks, no API key. (Decision D-011)
- Deterministic auto-draft engine (auto-draft.ts) + pipeline service (quick-skill.ts): every kept
  step becomes a node with its transcript line attached as untrusted, timestamped evidence.
- Sticker-weight SVG icon set across the Studio nav; copy-to-clipboard buttons.
- Mission phase stepper on the mission page (live state machine visual).
- Connect page: copyable Claude Code MCP-bridge and runner commands.
- Landing/Command Center CTAs route straight into the wizard.

### Fixed
- Stale runner path in three screens (runner/dist/server.js → runner/server.mjs).

### Tests
- 75 unit (+10: derivation heuristics, spread cap, determinism, pipeline E2E through compile,
  YouTube copy-format parsing) + 15 runner/bridge + 30 e2e (+2: full wizard journey incl. download
  and Skills hand-off; honest empty-transcript refusal).

## v1.1.0 — "Winner perception" upgrade (2026-08-29)

Engine untouched; perception, guidance, and WebMCP visibility upgraded. All prior guarantees hold.

### Added
- **Agent View (MCP Inspector)** at `/studio/agent`: live mode (attached/manual), current phase,
  the full tool-aperture table with the active phase highlighted, live registrations with
  annotations, tools retired by the last phase change, and a real tool-call log (max 50, honest
  ok/error per call). Manual mode shows zero fake activity by design.
- **Guided example + replayable walkthrough**: the landing "Try the guided example" CTA imports the
  real example workspace and walks 8 steps across real routes (Command Center → mission → Watch →
  SkillGraph → artifacts → Proof → Agent View → Skills). Replayable from the Command Center.
- **Cherry burst hero**: the landing cherry splits open on tap and transitions into the Studio;
  reduced-motion users navigate instantly.
- **Cherry mascot**: a sticker-book SVG figure explaining each landing section and greeting new
  users in the Studio empty state.
- **Compatibility & proof page** at `/compatibility`: every surface labelled
  Validated / Shipped / Experimental / Roadmap with the actual test that backs the label.
- **Earned motion**: approval stamp, verification pop, receipt print-in, scroll-depth reveals —
  all CSS, all disabled under prefers-reduced-motion.
- **Cherry-native palette**: dark cherry/maroon + cream + blush layered onto the sticker system;
  CHERRY OS watermark band.

### Changed
- Landing copy rewritten for sub-30-second comprehension; three first-run CTAs.
- WebMCP registration manager now records a session tool-call log and the retired-tools diff
  (4 new unit tests).

### Explicitly not done
- Auth/Privy — declined with rationale (decision D-008). Guest-first stays.
- No fake states, no seeded activity, no unverified compatibility claims.

### Test counts
- 65 unit/integration (vitest) + 15 runner/bridge (node:test) + 28 e2e (Playwright, incl. 4 axe
  audits, hostile-artifact sandbox probe at 2 viewports, guided-walkthrough end-to-end).

## v1.0.0 (2026-08-29)

Initial release candidate. See `CHERRY_RELEASE_EVIDENCE.md`.
