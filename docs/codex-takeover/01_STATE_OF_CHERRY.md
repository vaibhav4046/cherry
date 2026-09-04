# State of Cherry — current operating truth

**Updated:** 4 September 2026, London. Resolve the exact commit with `git rev-parse HEAD`; do not copy a stale SHA or test count into this file.

## Product state

Cherry is a local-first apprenticeship, memory, mission, and verification layer for AI agents. The public app is `https://cherry-wine.vercel.app`; the judge route is `/showcase`, and `/compatibility` separates validated, shipped, experimental, and roadmap claims.

The repository currently contains:

- state-aware WebMCP tools registered through `document.modelContext`;
- a full learn → derive → exact-revision human approval → execute → verify → repair → export journey;
- a cross-workspace skill library with bounded delivery and recomputable content hashes;
- mission planning, isolated runner work, evidence, receipts, memory, routines, and archive import/export;
- guest-first operation, with optional sign-in kept outside the judge path;
- deterministic gates, Playwright journeys, release-pack checks, service-worker checks, and a submission audit.

Portable output formats remain supported for compatible agent runtimes. That compatibility is a product feature, not an authorship statement.

## Current maintenance baseline

The authoritative baseline is the latest green GitHub Actions run on the current commit. Use:

```bash
npm ci
npm run gates
npm run verify:all
npm run health:hourly
```

Do not call the repository green from prose alone. A successful pull request requires both jobs in `.github/workflows/verify.yml`; hourly monitoring adds a focused WebMCP/judge path and live-route evidence.

## Judge-path regression now protected

The showcase-host regression was corrected on `main`: an approval request presents the dedicated decision screen, the test follows that handoff, and the person clicks Cherry's human-only control. The hourly workflow now locks this behavior together with the complete registered-closure journey.

## Ownership and provenance

Codex is the active implementation and maintenance workflow. Existing Git commits and the append-only status ledger are preserved as historical evidence. Current policy files must not assign live engineering, review, or deployment authority to a retired session.

## Release posture

The original WebMCP Challenge deadline has passed. Keep the repository review-ready: live app reachable, critical journeys green, release evidence present, no stale success claims, and no hidden approval or deployment automation.
