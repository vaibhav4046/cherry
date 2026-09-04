# Codex hourly maintenance

Cherry has two separate automation layers. They deliberately do not share authority.

## 1. Verification on every change

`.github/workflows/verify.yml` runs the deterministic gates and the complete Playwright suite for pushes to `main` and pull requests. This is the merge signal.

## 2. Hourly production and submission monitor

`.github/workflows/hourly-maintenance.yml` runs at minute 17 of every hour and can also be dispatched manually. The offset avoids the busiest top-of-hour period.

The monitor performs:

1. `npm ci` from the committed lockfile;
2. typecheck, lint, unit tests, runner/MCP tests, build, release-pack verification, service-worker verification, and the submission audit;
3. the focused registered-closure journeys in `showcase-host.spec.ts` and `webmcp-full-journey.spec.ts`;
4. read-only HTTP checks of `/`, `/showcase`, `/compatibility`, and `/connect` on `https://cherry-wine.vercel.app`;
5. artifact upload of Playwright traces, the JSON health report, and release evidence.

A failure opens or updates one issue named `[hourly] Cherry maintenance failure`. The next fully healthy run closes that issue. The issue points to the exact workflow run rather than copying a partial log into prose.

## Optional Codex repair

The monitor always works without secrets. Automated repair is enabled only when the repository has an `OPENAI_API_KEY` Actions secret. Set the repository variable `CODEX_HOURLY_REPAIR=disabled` to turn repair off while leaving monitoring active.

When enabled after a failed monitor run, `openai/codex-action@v1` receives only the committed static prompt at `.github/codex/prompts/hourly-repair.md`. It does not receive issue bodies, pull-request descriptions, commit messages, production HTML, or other untrusted text as instructions.

The repair job:

- starts from the current default branch;
- creates `codex/hourly-repair-<run-id>`;
- runs Codex with the built-in `:workspace` permission profile and the default sudo-dropping safety strategy;
- rejects edits to `.github/workflows/**`, `.env*`, generated health artifacts, and the historical status ledger;
- runs `git diff --check`, deterministic gates, integrity checks, the focused WebMCP journeys, and the submission audit;
- restores transient reports before committing;
- opens a pull request only when the bounded diff passes.

It never auto-merges and never deploys. A person still reviews the diff, merges it, and performs any production release.

## Manual run

Open GitHub Actions → **Hourly Cherry maintenance** → **Run workflow**. The same checks and boundaries apply. No additional prompt text is accepted.

Local equivalents:

```bash
npm ci
npm run verify:hourly
```

The live check writes `artifacts/hourly/health.json`. That directory is transient CI evidence and must not be committed.

## Failure handling

- A dependency-install failure stops the monitor immediately and still creates the incident issue.
- A deterministic or browser failure keeps its logs and traces in the workflow run.
- A live-route failure records status, content type, same-origin redirect behavior, app-shell marker, and Cherry title marker for each route.
- A repair that cannot pass verification remains uncommitted; the incident issue and run logs are the evidence.
- Missing or invalid OpenAI credentials skip repair but do not suppress monitoring or incident reporting.
