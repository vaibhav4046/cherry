# Cherry build status

**Date:** 2026-08-30 · **Commit:** 5297dad · **Branch/tree:** working tree at `D:\project\cherry`

## Gates (run 2026-08-30 on commit 5297dad)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | PASS (tsc --noEmit, strict) |
| Lint | `npm run lint` | PASS (eslint 9 flat config) |
| Unit/integration | `npm run test` | PASS — 119 passed, 2 skipped (13 files, vitest) |
| Runner + bridge + v2 | `npm run test:runner` | PASS — 42 passed (node:test) |
| Production build | `npm run build` | PASS (vite; largest chunk `transformers.web` ~549 KB) |
| E2E | `npm run test:e2e` | See `docs/release/e2e-results.json` (latest recorded run: 33 expected, 0 unexpected, 0 flaky, 2026-08-30T12:43Z) |
| Pack verify | `npm run verify:pack` | PASS — 6/6 checks (zip hash matches meta, standalone verifier passes, one-byte tamper FAILS, missing evidence FAILS) |
| Submission audit | `npm run audit:submission` | PASS — 13 checks, 0 FAIL, 0 WARN |

Skipped unit tests are the opt-in fixture generators (`GENERATE_EXAMPLE=1`), not
release-critical.

**Note on verify:pack:** the wired script was missing from the tree when this snapshot was first
taken; `scripts/verify-release.mjs` now exists (added 2026-08-30). It checks the shipped
`docs/release/sample-bundle.zip` hash against `sample-bundle.meta.json`, extracts with a
path-traversal guard, runs the bundle's own standalone verifier, then proves tamper-evidence by
flipping one byte of `SKILL.md` (must FAIL) and deleting `references/evidence.md` (must FAIL).

## In flight

- God-mode pack asset integration: editorial plates + 3 Veo chapter clips being wired to the
  landing page (`src/components/ClipVideo.tsx`; prompts in `docs/release/VEO3_VIDEO_PROMPTS.md`).
- Submission audit script added: `scripts/audit-submission.mjs`, run as
  `npm run audit:submission` (checks canonical URL, LICENSE, setup docs, release artifacts,
  secret scan, stale-claim scan, demo route).

## Known limitations (from release evidence + compatibility matrix)

- WebMCP tools exist only while the page is open in a compatible client; no live
  ChatGPT/Codex browser host was available to test against — verified with a mock model
  context in unit tests, feature-detected at runtime (Connections shows live state).
- Receipts are hash-based tamper-evidence, not cryptographic signatures.
- The local runner runs while the machine is on — it is not a cloud.
- "Full lesson coverage" means declared segments/criteria were processed, not semantic
  understanding of every frame.
- The native MCP bridge is read/verify over exports only (browser IndexedDB is unreachable
  from Node — decision D-005).
- Codex/Claude CLI adapters are present but opt-in and untested here (no CLI credentials on
  this machine, by design).
- Optional encrypted sync is not implemented in golden v1; auth is deliberately absent
  (guest-first, decision D-008).
- Automated axe coverage runs on representative routes; deeper routes were checked manually.
- PWA install prompt requires the HTTPS deployment; the service worker caches the static
  shell only.
