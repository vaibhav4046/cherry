# Cherry build status

**Date:** 2026-08-31 · **Commit:** working tree after 7058c78 (commit pending) · **Branch/tree:** main working tree at `D:\project\cherry`

## Gates (full suite re-run 2026-08-31 on the current tree)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | PASS (tsc --noEmit, strict) |
| Lint | `npm run lint` | PASS (eslint 9 flat config) |
| Unit/integration | `npm run test` | PASS — 135 passed, 2 skipped (15 files, vitest) — 2026-08-31 |
| Runner + bridge + v2 | `npm run test:runner` | PASS — 42 passed (node:test) |
| Production build | `npm run build` | PASS (vite; largest chunk `transformers.web` ~549 KB) |
| E2E | `npm run test:e2e` | PASS — 36 passed (incl. 3 registered-closure showcase-host tests), 2026-08-31; see docs/release/e2e-results.json |
| Pack verify | `npm run verify:pack` | PASS — 6/6 checks (zip hash matches meta, standalone verifier passes, one-byte tamper FAILS, missing evidence FAILS) |
| Submission audit | `npm run audit:submission` | PASS — 13 checks, 0 FAIL, 0 WARN |

Skipped unit tests are the opt-in fixture generators (`GENERATE_EXAMPLE=1`), not
release-critical.

**Note on verify:pack:** the wired script was missing from the tree when this snapshot was first
taken; `scripts/verify-release.mjs` now exists (added 2026-08-30). It checks the shipped
`docs/release/sample-bundle.zip` hash against `sample-bundle.meta.json`, extracts with a
path-traversal guard, runs the bundle's own standalone verifier, then proves tamper-evidence by
flipping one byte of `SKILL.md` (must FAIL) and deleting `references/evidence.md` (must FAIL).

## Landed 2026-08-31 (god-mode master prompt)

- **/showcase judge route** — one linear 12-step apprenticeship story rendered from real persisted
  state; fresh-start, opt-in labelled sample, inline human-only approval card, live host panel,
  append-only event timeline. Pinned by `e2e/cherry/showcase-host.spec.ts`.
- **Fresh-journey WebMCP repair (D-021)** — mutation→shell sync, `load_lesson` reachable from
  onboarding, quick-skill/mission linking, new `get_cherry_status` + `start_apprenticeship` tools.
- **Privy auth boundary (D-019)** — guest-first, provider-neutral, setup_required without
  `VITE_PRIVY_APP_ID`, SDK pinned 3.38.0 in a lazy chunk (+~1.7 kB gzip entry in guest mode),
  10 mocked-provider tests, docs/PRIVY_SETUP.md.
- **WEBMCP_CHANGELOG.md** (post-Aug-25 evidence) and capability-matrix refresh.

## Queued owner actions (gated by the autonomy contract)

1. **Push + deploy:** commits are local only. One command from `D:\project\cherry`:
   `git push origin main` (Vercel auto-deploys; then smoke /showcase on the live origin).
2. **Live WebMCP host validation:** your Chrome is 151 (>=149) but `document.modelContext` is
   undefined — enable the WebMCP testing flag (chrome://flags) or use a ChatGPT desktop browser
   with Site Tools, open https://cherry-wine.vercel.app/showcase after deploy, and the host panel
   + Agent View will log real calls. Until then the claim stays experimental/mock-tested.
3. **Privy smoke test:** set a real `VITE_PRIVY_APP_ID` in .env.local, run one email-OTP login.
4. **Vercel alias:** remove/redirect `getcherry.vercel.app` (D-020).
5. **npm audit triage:** the Privy dependency tree added 29 advisories (23 moderate, 6 high) — 
   advisory-level, review before final submission.
6. **Demo video + Devpost submission** before 3 Sep 1PM PT.

## Known limitations (from release evidence + compatibility matrix)

- WebMCP tools exist only while the page is open in a compatible client; no live
  ChatGPT/Codex browser host was available to test against — verified with a mock model
  context in unit tests AND a registered-closure Playwright journey (mock host installed before
  app load), feature-detected at runtime (Connections and /showcase show live state).
- Receipts are hash-based tamper-evidence, not cryptographic signatures.
- The local runner runs while the machine is on — it is not a cloud.
- "Full lesson coverage" means declared segments/criteria were processed, not semantic
  understanding of every frame.
- The native MCP bridge is read/verify over exports only (browser IndexedDB is unreachable
  from Node — decision D-005).
- Codex/Claude CLI adapters are present but opt-in and untested here (no CLI credentials on
  this machine, by design).
- Optional encrypted sync is not implemented; auth is guest-first with an optional Privy
  boundary that is setup_required until `VITE_PRIVY_APP_ID` is configured (D-019 supersedes
  D-008).
- Automated axe coverage runs on representative routes; deeper routes were checked manually.
- PWA install prompt requires the HTTPS deployment; the service worker caches the static
  shell only.
