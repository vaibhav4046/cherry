# Cherry release notes

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
