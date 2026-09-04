# Cherry maintenance queue

Execute top to bottom. Every behavior change needs a regression test and every claim needs evidence on the same commit.

## M1 · P0 — Protect the judge journey

- Keep `showcase-host.spec.ts` aligned with the real approval deep-link handoff.
- Keep `webmcp-full-journey.spec.ts` proving learn → approve → execute → fail → repair → export through registered closures.
- Never add a test-only approval path.

Acceptance: both focused Playwright specs pass on desktop and no registered tool can decide an approval.

## M2 · P0 — Hourly repository and production monitoring

- Run deterministic gates, build/integrity checks, submission audit, focused WebMCP journeys, and public-route health once per hour.
- Write machine-readable health evidence and keep failure artifacts.
- Open or update one incident issue when a run fails; close it after recovery.
- When an OpenAI key is configured, let Codex attempt a bounded repair on a new branch and open a pull request. Never auto-merge or deploy.

Acceptance: `.github/workflows/hourly-maintenance.yml`, `scripts/hourly-health.mjs`, tests, and `docs/CODEX_AUTOMATION.md` agree exactly.

## M3 · P0 — Keep current ownership accurate

- Current operational docs use one Codex engineering loop.
- Historical Git metadata and `STATUS.md` remain unchanged.
- Portable formats and compatible runtimes stay supported.
- The submission audit rejects strong stale authorship markers in active policy files.

Acceptance: `npm run audit:submission` reports no active-policy attribution failure.

## M4 · P0 — Keep WebMCP submission evidence reproducible

- Live app, repository, description, demo material, compatibility evidence, and the human-agent journey remain discoverable.
- The audit requires the critical WebMCP implementation and tests rather than accepting prose alone.
- Claims remain bounded to what a test, receipt, or captured session proves.

Acceptance: `docs/release/CODEX_SUBMISSION_CHECKLIST.md` maps each judged surface to its evidence and `npm run verify:all` is green on the current commit.

## M5 · P1 — Future product changes

Only start after M1–M4 remain green. Priorities are first-run comprehension, useful skill recommendations, runner reliability, accessibility, and measured performance. Do not add broad features merely to increase surface area.
