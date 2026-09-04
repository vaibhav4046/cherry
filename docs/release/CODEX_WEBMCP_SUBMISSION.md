# Cherry — Codex + WebMCP submission brief

This is the canonical judge-facing brief for Cherry's **OpenAI WebMCP Challenge 2026** submission.
It points only to behaviour that can be reproduced from the repository or inspected in the live app.

## Open these first

- Live app: https://cherry-wine.vercel.app
- Judge route: https://cherry-wine.vercel.app/showcase
- Live tool inspector: https://cherry-wine.vercel.app/studio/agent
- Evidence matrix: https://cherry-wine.vercel.app/compatibility
- Repository: https://github.com/vaibhav4046/cherry

## The 60-second judge path

1. Open the judge route. The hero replays a captured Codex mission from evidence whose fingerprint is checked before playback.
2. Open **Agent View**. Cherry shows the exact site tools currently registered, the aperture diff, and every tool call.
3. Ask the visiting agent to call `read_cherry_context`, then `list_cherry_capabilities`.
4. Load the labelled example, inspect one approved skill, and ask for it through `get_skill`.
5. Recompute a proof receipt. A one-byte change makes verification fail.

## Why this is a WebMCP product

Cherry is not a page with a giant static tool catalogue. It registers a bounded set through
`document.modelContext.registerTool`, re-reads persisted state at execution time, and retires tools
as the route or mission state changes. Seven always-on tools explain context and serve the approved
skill library. At most five contextual mutation tools are visible for the current surface.

The same domain services power the human UI, WebMCP tools, and the local MCP bridge. A site tool
cannot bypass a state transition that the UI would reject. Agents may request approval, but no
registered tool can grant approval, promote trust, or activate memory.

## What is captured

- **Live WebMCP host:** on 4 September 2026, the deployed site registered its tools in the ChatGPT
  desktop in-app browser. The visiting agent called Cherry's registered tools without clicking or
  typing into the page. The full transcript and aperture changes are in
  `docs/release/WEBMCP_LIVE_HOST_CAPTURE.md`.
- **Real Codex execution:** a captured Codex CLI mission ran two workers concurrently in separate
  git worktrees. The runner's checks, not provider completion, decided success. See
  `docs/release/GOD_MODE_REAL_HOST_CAPTURE.md` and the fingerprint-checked replay on `/showcase`.
- **Local MCP bridge:** Codex registered Cherry's stdio bridge, listed the exported tools, read the
  workspace, and recomputed bundle hashes. See `docs/release/CODEX_MCP_CAPTURE.md`.
- **Adversarial browser matrix:** the Playwright suite covers state-aware tool registration,
  registered closure execution, cancellation, exact-revision approvals, hostile artifact isolation,
  persistence across reloads, keyboard access, mobile overflow, and the full learn-to-proof path.

## Reproduce the release checks

```bash
npm ci
npm run gates
npm run build
npm run test:e2e
npm run verify:pack
npm run verify:sw
npm run audit:submission
npm run audit:codex-submission
```

`npm run verify:all` runs the complete release sequence. GitHub Actions publishes reports against a
specific commit so a prose number is never the only evidence.

## Hourly monitoring

`.github/workflows/hourly-health.yml` runs at minute 17 of every hour and can also be dispatched by
hand. It installs from the lockfile, runs deterministic gates, builds the production app, checks the
release bundle and service worker, runs both submission audits, and exercises focused WebMCP,
showcase, and persistence journeys.

On failure it updates one deduplicated repair issue with the commit and diagnostics. On recovery it
records the passing run and closes that issue. The workflow does not edit product code, approve its
own work, merge, deploy, or rewrite history; repair remains reviewable and release authority remains
human.

## Submission integrity

- The Git history is the source of truth for authorship and chronology.
- Historical evidence is not rewritten to imply a run that did not happen.
- Compatibility readers may retain legacy export identifiers so previously downloaded bundles keep
  working; the live application and canonical submission surfaces stay Codex/WebMCP focused.
- Every public capability is labelled Validated, Shipped, Experimental, or Roadmap with its evidence.
- The application works manually when no WebMCP host is present. The agent path accelerates the same
  product rather than hiding a separate demo.

## Readiness handoff

The readiness branch was rebuilt on the newest `main` with a two-parent merge commit. Concurrent demo
film work was preserved, temporary audit transport files were removed, and GitHub Actions remains the
authoritative source for pass/fail status on the exact submission commit.

## Final checklist

- [x] Public live URL and dedicated judge route
- [x] Real `document.modelContext` implementation
- [x] Visible registration and call log
- [x] Human-only approval boundary
- [x] Real Codex execution capture
- [x] Live WebMCP host capture
- [x] Recomputable proof and tamper failure
- [x] Hourly verification monitor
- [x] Lockfile-based reproducibility
- [x] MIT licence and no account wall
