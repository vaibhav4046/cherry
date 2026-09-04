# Operating model — Codex, GitHub Actions, and human authority

## Roles

- **Codex:** investigates, writes tests, implements, reviews the diff, updates current documentation, and prepares a pull request.
- **GitHub Actions:** runs deterministic verification on pushes and pull requests; every hour it also checks the critical WebMCP journeys and the public app.
- **Human maintainer:** supplies protected credentials, decides product approvals, reviews and merges pull requests, and performs production deployment.

No other session owns a live file lane. Historical status entries remain evidence, not an active staffing model.

## Development loop

1. Start from current `main` on a narrow branch or worktree.
2. Reproduce the defect and add the failing regression test.
3. Implement the smallest root-cause fix.
4. Run `npm run gates`; run `npm run verify:all` for UI, WebMCP, release, security, or cross-layer work.
5. Review the complete diff, generated reports, changed claims, and secret scan.
6. Push and open a pull request. Never call a local build deployed.
7. A human merges and deploys after checks and review.

## Hourly loop

`.github/workflows/hourly-maintenance.yml` runs once per hour and on manual dispatch. It:

1. verifies the lockfile install, types, lint, unit/runner tests, production build, bundle, service worker, and submission audit;
2. runs the two critical registered-closure WebMCP journeys;
3. always checks `/`, `/showcase`, `/compatibility`, and `/connect` on the live domain and uploads JSON evidence;
4. opens or updates one incident issue on failure and closes it after recovery;
5. when `OPENAI_API_KEY` is available and repair is not disabled, lets Codex investigate in a credential-free workspace and return a schema-constrained textual patch as the final step of that job;
6. applies and verifies the patch in a new read-only job, rejecting protected paths and hashing both the proposal and staged diff;
7. uses a third fresh job to reapply the exact verified hashes, then introduces a GitHub token only for branch push, pull-request creation, and explicit dispatch of the ordinary verification workflow;
8. never auto-merges, deploys, changes its own control plane, or accepts instructions from failing page content.

Full setup and threat boundaries: `docs/CODEX_AUTOMATION.md`.

## Git and evidence rules

- Preserve unrelated work and stage explicit paths.
- Never rewrite `docs/codex-takeover/STATUS.md`; it is append-only historical evidence.
- Keep `package.json` and `package-lock.json` synchronized when dependency metadata changes. Automated hourly repair is not allowed to change either file.
- Conventional commits state only behavior and checks actually observed.
- One Git operation at a time. Do not delete a live lock owned by another process.
- Generated artifacts are evidence, not implementation. Automated repair must not commit transient health output or a locally rewritten Playwright report.
- No trusted or credentialed command runs after Codex in the same job. Candidate code is verified without repository write permission; publication occurs in a fresh job that does not execute it.
