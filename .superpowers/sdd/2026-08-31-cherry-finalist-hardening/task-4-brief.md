# Task 4 brief — Glass-premium product surfaces and accessible memory graph

Read this first; it is the complete requirements and exact interfaces.

Repository: `D:\project\cherry`. Work directly there. Do not dispatch subagents. Follow TDD and commit. Write the full report to `D:\project\cherry\.superpowers\sdd\2026-08-31-cherry-finalist-hardening\task-4-report.md`.

## Goal

Turn the existing product surfaces into a premium restrained glass system with real semantic icons, recognizable inline SVG brand marks, a real accessible memory graph, honest source/execution language, resilient showcase routing, and persisted routine inspection.

## Files

- Create `src/pages/studio/MemoryGraph.tsx`, `src/components/BrandIcons.tsx`, `src/pages/NotFound.tsx`.
- Modify `src/pages/studio/MemoryVault.tsx`, `RoutinesPage.tsx`, `RoutineDetail.tsx`, `Watch.tsx`, `src/pages/Showcase.tsx`, `src/pages/Landing.tsx`, `src/pages/studio/StudioLayout.tsx`, `src/app/App.tsx`, and design-system CSS files.
- Add `tests/cherry/memory-graph.test.tsx`, `e2e/cherry/memory-routine.spec.ts`, and update responsive/auth tests only where shell behavior changes.

## Required behavior

- `MemoryGraph` consumes `buildMemoryGraph` only, exposes `onSelectNode(nodeId: string)`, renders semantic nodes/edges plus a synchronized accessible table fallback, and exposes status/version/provenance with keyboard activation and reduced-motion behavior.
- Memory inbox controls remain real persisted actions; no decorative/fake nodes or guessed edges.
- Routine pages show approved graph revision/hash, schedule/next run, local runner pairing/setup, persisted run history, output/error/provider/receipt evidence, rerun and setup actions, and reload survival. Never imply cloud execution.
- Source labels distinguish “Transcript supplied”, “Local Whisper”, “Tab capture”, and “Deterministic sample”; show timestamps/confidence only when present; state that frame-level vision is not implemented; official YouTube is an embed only.
- `BrandIcons.tsx` contains local inline SVG marks for Slack, Microsoft Teams, Discord, Telegram, GitHub, and YouTube. Every mark is paired with visible text and an accessible name; no emoji, generic glyph, or copied image asset.
- Glass system uses translucent panels with opaque fallback, restrained deep cherry/wine/blush/mint accents, visible focus states, 44px controls, no information-bearing gradients, responsive stacking, and reduced-motion support. Use existing semantic icons for actions/navigation/status.
- Showcase first viewport explains the transformation, demotes reset/refresh, uses try/finally for async loading, preserves disclosure state, and has resilient empty/error states. Unknown routes render a real not-found page.

## Tests to write first

1. Memory graph node labels/status/provenance, synchronized fallback, keyboard selection, reduced-motion and empty state.
2. Routine run evidence survives reload and does not mention cloud execution.
3. Brand icons expose labels/ARIA names and do not contain emoji placeholders.
4. Responsive routes have no horizontal overflow and unknown routes render not-found.

Run focused Vitest and Playwright specs before and after implementation, then full `npm test` and `npm run typecheck`.

## Constraints

- Do not add fake data or claim capabilities that are not implemented.
- Do not use external icon/image assets for the required brand marks.
- Keep all async mutations error-safe and local-first.
- Do not disable lint globally or change domain invariants.
