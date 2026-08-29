# Cherry compatibility matrix

**Date:** 2026-08-29

| Surface | Status | Notes |
|---|---|---|
| Manual browser (Chrome/Edge/Firefox current) | Working | Full product; e2e-tested on Chromium. |
| WebMCP host (ChatGPT/Codex compatible client) | Implemented, feature-detected | Registers via `document.modelContext.registerTool` with AbortController lifecycle. Verified against the API contract by unit tests with a mock model context; not exercised against a live proprietary client in this environment — the diagnostic panel in Connections shows live registration state in a real host. |
| Unsupported browsers (no WebMCP) | Working | Complete manual product + honest "manual mode" status. |
| PWA install | Implemented | manifest + service worker (static shell only); requires HTTPS host for install prompt. |
| Local runner | Working | `node runner/server.mjs`; 9 integration tests. Windows/macOS/Linux (pure Node stdlib). |
| Native MCP bridge (Claude Code / Codex CLI) | Working, read/verify scope | `node runner/mcp/server.mjs --workspace export.json`; stdio JSON-RPC (initialize, tools/list, tools/call); 6 integration tests. Mutations intentionally excluded (decision D-005). |
| Codex CLI adapter | Present, opt-in | Runs only if `codex` is on PATH; exit codes never count as verification. Untested here (no CLI credentials on this machine — by design, core needs none). |
| Claude CLI adapter | Present, opt-in | Same policy as Codex adapter. |
| Optional encrypted sync | Not implemented | Explicitly out of golden v1; no UI pretends otherwise. |
