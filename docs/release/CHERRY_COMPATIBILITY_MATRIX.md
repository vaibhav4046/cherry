# Cherry compatibility matrix

**Date:** 2026-08-29

| Surface | Status | Notes |
|---|---|---|
| Manual browser (Chrome/Edge/Firefox current) | Working | Full product; e2e-tested on Chromium. |
| WebMCP host (ChatGPT/Codex compatible client) | Implemented, feature-detected | Registers via `document.modelContext.registerTool` with AbortController lifecycle. Verified against the API contract by unit tests with a mock model context; not exercised against a live proprietary client in this environment — the diagnostic panel in Connections shows live registration state in a real host. |
| Unsupported browsers (no WebMCP) | Working | Complete manual product + honest "manual mode" status. |
| PWA install | Implemented | manifest + service worker (static shell only); requires HTTPS host for install prompt. |
| Local runner | Working | `node runner/server.mjs`; 9 integration tests. Windows/macOS/Linux (pure Node stdlib). |
| Mission Control on the paired runner (outcome to validated graph to parallel sandboxed workers to independent checks) | Working; real Codex captured, Claude Code not captured | `runner/server.mjs` mission routes (`/v2/hosts`, `/v2/missions`); one directory or git-worktree sandbox per task, boundary stated as process or worktree-process; up to three tasks at once; artifacts handed to dependants; succeeded only on the runner's own checks or a person's decision. Runner executor, sandbox and host suites, a browser-to-real-runner integration test and two Playwright journeys. Real Codex CLI 0.152.1 run recorded in `docs/release/GOD_MODE_REAL_HOST_CAPTURE.md`; Claude Code needs a sign-in on this machine; the `--allow-mock-host` rehearsal host is test-only. |
| Native MCP bridge (Claude Code / Codex CLI) | Working, read/verify scope | `node runner/mcp/server.mjs --workspace export.json`; stdio JSON-RPC (initialize, tools/list, tools/call); 6 integration tests. Mutations intentionally excluded (decision D-005). |
| Codex CLI / MCP | Validated, opt-in | Live Codex CLI host validation recorded 2026-09-01. Provider exit codes never count as verification. |
| Claude Code / MCP | Validated, opt-in | Live Claude Code host validation recorded 2026-08-29. Provider exit codes never count as verification. |
| Optional encrypted sync | Not implemented | Explicitly out of golden v1; no UI pretends otherwise. |
