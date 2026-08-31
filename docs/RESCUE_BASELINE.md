# Rescue baseline — 2026-08-31

Baseline commit: `c11f150` (historical). Rescue pass applied on top; deployment is not asserted here.

## What works in a fresh browser (verified, not assumed)

Verified with clean Playwright contexts (no seeded storage) and pinned by 41 e2e tests:

- `/` — landing renders, all CTAs route, brand clips play in-view with posters, zero page errors.
- `/showcase` — starts from a genuinely blank session ("Fresh session — no workspace exists in
  this browser yet"), honest host panel (distinguishes *no host* from *tool returned an error*,
  shows last call + timestamp + result preview), judge script on-page, Start fresh /
  Load labelled sample / Refresh / Reset demo all wired. Reset demo deletes only demo
  workspaces (`isExample`, "Showcase run", "EXAMPLE…") — pinned by e2e.
- `/studio` — first-run flow: workspace creation works keyboard-only (e2e), state persists
  across refresh in IndexedDB, empty states honest (no runner → "No runner detected").
- Golden path end-to-end: lesson → transcript → evidence → skill draft → exact-revision human
  approval → artifact → deterministic failure (heading hierarchy) → repair → verified pass →
  bundle + receipt. Driven both manually (golden-manual e2e) and through **registered WebMCP
  closures** on a mock host installed before app load (showcase-host e2e) — the agent cannot
  approve; the one human act is the approval click.
- All 17 required tools registered by state:
  read_cherry_context, get_cherry_status, start_apprenticeship, create_workspace,
  create_mission, load_lesson, import_transcript, record_lesson_observation,
  add_source_evidence, generate_quick_skill, define_skillgraph, request_checkpoint_approval,
  write_artifact_file, record_task_result, run_cherry_verification, compile_skill_bundle,
  export_proof_receipt (+ workforce surface tools). Strict schemas,
  `additionalProperties: false`, ≤5 per aperture + global reads.
- Export/import: workspace JSON export, portable bundle with standalone verifier;
  `npm run verify:pack` proves one-byte mutation and deleted evidence both FAIL.

## What is only decorative

- Landing brand clips and editorial plates (aria-hidden, poster-first, reduced-motion safe) —
  they never carry a claim; all copy is live DOM.
- The CHERRY WINE watermark and marquee — identity, not information.

## Honest capability gaps (not decorative — labelled in-product)

- **WebMCP browser host:** no host on this machine exposes `document.modelContext`
  (Chrome 151 probed with 5 flag combos — all negative; see CHERRY_RELEASE_EVIDENCE.md).
  Host panel says so honestly. Registered-closure behavior is pinned by the mock-host e2e.
- **YouTube transcript fetch:** not implemented by design — no scraping. Extraction modes are:
  official embed + user-pasted/uploaded transcript (.txt/.srt/.vtt), on-device Whisper for
  user-owned media, labelled offline sample. The UI shows the extraction mode; frames are never
  claimed when only a transcript was processed.
- **PDF/DOCX/EPUB adapters:** absent; text/Markdown/transcript paste + file upload work.
- **Privy auth:** `setup_required` until `VITE_PRIVY_APP_ID` exists (docs/PRIVY_SETUP.md);
  guest mode is the default and fully functional.
- **Studio search/filters:** mission/skill lists render directly; no search box. With
  single-digit record counts in any demo session this is a non-blocking gap, recorded here
  rather than padded in.

## Failing tests / missing environment variables

- No failing tests. Gate results (2026-08-31, serial, commands in docs/TEST_EVIDENCE.md):
  typecheck PASS · lint PASS · unit 152 passed + 2 skipped · runner 42 passed · build PASS ·
  e2e 41 passed · verify:pack 6/6 · audit:submission 0 FAIL 0 WARN.
- Optional env (all absent by design in the verified local build): `VITE_PRIVY_APP_ID`,
  `VITE_PRIVY_CLIENT_ID` (see `.env.example`). Core needs none.

## Redesign decision (recorded deliberately)

A ground-up "Apple-restraint" reskin was **not** performed: the shipped system already commits
to one coherent identity (wine ground, cream/blush cards, copper-pink accent, script + condensed
display + grotesk body, reduced-motion discipline, state-complete screens), passed visual QA and
axe, and 41 e2e tests pin its selectors. Two days before the deadline, a reskin risks the
working golden path for aesthetic delta. Applied instead: judge script on /showcase, demo-only
reset control, host-panel timestamp + clearer error wording. The oversized hero words on the
landing are brand identity retained on purpose; /showcase (the judge's route) is restrained.

## Screenshots (fresh contexts, zero page errors on every route)

`docs/release/screenshots/`: rescue-home-{desktop,mobile}.png,
rescue-showcase-{desktop,mobile}.png, rescue-studio-firstrun-{desktop,mobile}.png,
plus showcase-live-desktop.png (production).
