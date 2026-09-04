# Codex hourly maintenance

Cherry has separate monitoring, proposal, verification, and publication boundaries. They deliberately do not share authority.

## 1. Verification on every change

`.github/workflows/verify.yml` runs the deterministic gates and the complete Playwright suite for pushes to `main` and pull requests. This is the merge signal.

## 2. Hourly production and submission monitor

`.github/workflows/hourly-maintenance.yml` runs at minute 17 of every hour and can also be dispatched manually. The offset avoids the busiest top-of-hour period.

The monitor performs:

1. `npm ci` from the committed lockfile;
2. typecheck, lint, unit tests, runner/MCP tests, build, release-pack verification, service-worker verification, and the submission audit;
3. the focused registered-closure journeys in `showcase-host.spec.ts` and `webmcp-full-journey.spec.ts`;
4. read-only HTTP checks of `/`, `/showcase`, `/compatibility`, and `/connect` on `https://cherry-wine.vercel.app`, even when an earlier repository check failed;
5. artifact upload of Playwright traces, the JSON health report, and release evidence.

A failure opens or updates one issue named `[hourly] Cherry maintenance failure`. The next fully healthy run closes that issue. The issue points to the exact workflow run rather than copying a partial log into prose.

## Optional Codex repair

Monitoring needs no secret. Repair is attempted only when the repository has an `OPENAI_API_KEY` Actions secret. Set the repository variable `CODEX_HOURLY_REPAIR=disabled` to leave monitoring active while disabling repair.

The repair path has three isolated jobs.

### A. Propose

- Checks out the exact default-branch commit with `persist-credentials: false`.
- Installs dependencies and Chromium before Codex starts, because the `:workspace` profile has no network access.
- Removes the Git remote from the agent workspace.
- Gives `openai/codex-action@v1` only the committed static prompt at `.github/codex/prompts/hourly-repair.md`.
- Uses the built-in `:workspace` permission profile, the action's default sudo-dropping strategy, and a strict JSON output schema.
- Runs Codex as the final step of the job. No trusted or credentialed command runs on that host afterward.

Codex may investigate and test in the disposable workspace. It returns either `no_change` or one bounded textual Git patch. It cannot publish anything from this job.

### B. Verify

A fresh job with read-only repository permission checks out the exact proposal base. The trusted `scripts/apply-codex-proposal.mjs` validator rejects malformed JSON, binary or oversized patches, more than 25 changed paths, symlinks, protected control-plane files, dependency metadata, credentials, and generated reports. It hashes the raw patch and canonical staged diff.

Only then does the job install from the unchanged lockfile and run `npm run verify:repair`. After removing known transient output, it proves the staged diff did not change during verification. This job has no repository write credential.

### C. Publish

A third fresh job runs only after the verification attestation. It reapplies the same proposal and requires both the raw-patch and staged-diff SHA-256 values to match. It does not execute candidate code. Only after the commit exists does the job introduce the GitHub token, push a unique branch, and open a pull request.

After opening the pull request, the publish job explicitly dispatches `verify.yml` on the repair branch. This avoids relying on recursive push/PR events created by `GITHUB_TOKEN`. Nothing auto-merges or deploys.

## Protected surfaces

Automated repair cannot edit:

- `.github/**`, `.git/**`, `.env*`, or account material;
- `AGENTS.md`, package manifests/lockfiles, and root build/test configuration;
- the automation prompt, validator, audit, guardrails, or historical status ledger;
- generated health, release, Playwright, or test output.

A failure requiring one of these surfaces remains an incident for human repair.

## Manual run

Open GitHub Actions → **Hourly Cherry maintenance** → **Run workflow**. The same checks and boundaries apply. No additional prompt text is accepted.

Local equivalents:

```bash
npm ci
npm run verify:hourly
```

The live check writes `artifacts/hourly/health.json`. That directory is transient CI evidence and must not be committed.

## Failure handling

- A dependency-install failure stops repository checks but the `always()` live health step still records public-route evidence.
- A deterministic or browser failure keeps its logs and traces in the workflow run.
- A live-route failure records status, content type, same-origin redirect behavior, app-shell marker, and Cherry title marker for each route.
- Missing OpenAI credentials skip proposal generation without suppressing monitoring or incident reporting.
- An unsafe, malformed, protected, or unverifiable patch is never pushed.
- A production-only outage or repair requiring credentials remains an incident rather than becoming a fabricated code change.
