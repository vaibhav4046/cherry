# Premium UI review — 2026-08-31 overhaul sprint

**Apple-inspired restyle addendum:** commit `5b7d731` applies the provided Apple/Refero palette,
SF Pro fallback stack, 8px surfaces, 980px controls, and light glass treatment across the shared
shell, landing, Studio, and Showcase. The 41-test browser suite remains green after contrast fixes.

Three parallel tracks (shell, showcase, editor/run) plus a landing rebuild, integrated and
gate-verified serially. Product sentence everywhere: *Cherry turns one lesson into a skill that an
agent can safely run.*

## Before / after

Before (previous release): `docs/release/screenshots/before-home-desktop.png`,
`before-showcase-desktop.png`, `before-studio-desktop.png`.
After: `ui-home-*.png`, `ui-showcase-fresh-*.png`, `ui-showcase-exported-*.png`,
`ui-studio-overview-*.png`, `ui-studio-empty-*.png`, `ui-source-modal-*.png`,
`ui-skill-editor-*.png`, `ui-settings-trust-*.png` (desktop 1440 + mobile 390, clean profiles,
zero page errors on every capture).

## Routes changed

- `/` — rebuilt. Marquee, watermark, giant display hero, particles/burst, chapter clips and
  duplicate CTAs removed. First viewport: eyebrow, plain headline, one paragraph, one primary CTA +
  quiet Studio link, trust line, and a **live lesson card** rendering real fields from the labelled
  example export (source title, three timestamped evidence rows, skill draft, approval state,
  verified state, receipt prefix); hover/focus lift; click opens the guided example. Below: exactly
  three sections (Learn from the source / Approve the method / Run it with proof) with the seal as
  a small proof detail.
- `/showcase` — two-column demo. Breadcrumb + one-sentence intro + compact controls; left canvas
  with an 8-state progress rail (empty → learning → approval needed → approved → failed → repaired
  → verified → exported) and the 12 steps grouped into four chapters (Source/Shape/Prove/Carry),
  current chapter expanded, others one collapsed line; right sticky inspector (mission, source +
  extraction mode, approval, verification, export, WebMCP host with last-call timestamp, human-only
  approval card, judge script). Host-unavailable vs tool-error stay distinct.
- `/studio` shell — 240px quiet sidebar in two groups (primary + Workforce), hairline dividers,
  copper active/focus accents, workspace switcher when more than one workspace exists, humanized
  status pills (`No mission yet / Shaping the skill / Awaiting your approval / Running / Verifying
  / Verified` and `Local / Offline / Host connected · N tools`), calmed page titles (no 3D glow).
- `/studio` overview — **Add a source** is the primary first action: a focused native dialog with
  three honest options (YouTube link — official player, transcript paste/upload only, no caption
  scraping · Paste a transcript · Upload text/Markdown/JSON) plus a quiet labelled-sample link. No
  fake spinners anywhere.
- Skill editor — document contract: Goal / Inputs / Method (numbered, evidence-chipped) /
  Constraints / Evidence / Expected result / Failure checks, with a slim version rail and an
  "Approve revision {v}.{r}" action; after approval, a "Checkpoint — immutable once approved" panel
  with the full content hash. Empty sections say "None recorded" — nothing fabricated.
- Mission run screen — test-runner treatment: plain-word status, elapsed/updated times (tabular
  numerals), icon+time+action+result event rows, assertions as readable sentences, failure panel
  with cause + "Apply repair and rerun" (links to where repair genuinely lives), calm verified
  state.

## Interaction tests (commands + results, 2026-08-31)

Serial integrated run: typecheck ✅ · lint ✅ · unit **154 passed + 2 skipped** · runner **42
passed** · build ✅ · **e2e 41 passed** (golden manual
journey, registered-closure WebMCP host path, workforce, responsive incl. new /showcase mobile
no-overflow, landing lesson-card navigation incl. reduced-motion) · verify:pack **6/6** ·
audit:submission **0 FAIL 0 WARN**. Post-polish re-run: upgrade+showcase-host 16 passed, responsive
mobile 10 passed.

Manually driven (scripted browser, real build): source dialog focus-on-open/Escape/outside-click,
workspace switcher with 1 vs 2 workspaces, offline pill on connection loss, lesson-card click
navigation, sample load + demo-only reset.

## Accessibility

Axe suites green (landing, studio empty state, /compatibility, Agent View) after the sprint fixed
its own contrast regression (rail hints raised from ≈3.8:1 to ≈7.9:1). Keyboard-only workspace
creation pinned by e2e; focus-visible states styled on rail, buttons, cards, dialog. Reduced motion
honored globally (single 500ms page entrance and 150–240ms state transitions all gated).

## Performance

Landing no longer autoplays four videos — it now paints text + one card (LCP is the headline);
media budget on `/` dropped from ~11MB of lazy clips to ~340KB (seal + card data). Studio/showcase
unchanged code-wise beyond CSS. Largest chunk remains `transformers.web` (~549KB gzip 160KB,
lazy-loaded only for on-device Whisper).

## Remaining limitations (honest)

- "Showcase during approval" exists as an e2e-verified state, not a staged screenshot.
- The deliberate-failure/repair screen renders from real state; the sample workspace imports in its
  post-repair state, so the failure panel shows live only when driving the flow yourself.
- Brand clips and editorial plates remain in the repo but are no longer on the landing; the
  showcase/product IS the landing visual now.
- Sidebar keeps 11 destinations (grouped, not trimmed) — Workforce surfaces are real features and
  hiding them would be dishonest; they sit under a quiet divider.
- No search/filters in Studio lists (single-digit record counts in any demo session).
