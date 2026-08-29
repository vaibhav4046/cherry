# Cherry baseline

**Date:** 2026-08-29
**Machine:** Windows 11, Node v24.12.0, npm 11.6.2, git 2.49.0.windows.1

## Repository archaeology

The execution pack instructs building inside the existing Enough-derived repository. A full-disk search
found **no Enough repository on this machine** (no directory, package, or WebMCP code matching "enough"
or "webmcp" outside the pack itself — only `D:\movies\Enough product design package.zip`, a design
asset archive, not a codebase). Per `00_EXECUTE_THIS_FIRST.md` §"Immediate instruction" item 2 (archive
attached outside the repository), Cherry was therefore built as a fresh repository at `D:\project\cherry`
implementing the full locked product contract directly. This decision is recorded in
`docs/CHERRY_DECISIONS.md` (D-001).

## Toolchain baseline (fresh repository)

| Command | Result |
|---|---|
| `npm install` | 286 packages, 0 vulnerabilities |
| `npm run typecheck` (`tsc --noEmit`) | exit 0 |
| `npm run lint` (`eslint .`) | exit 0 |
| `npm run test` (vitest) | 61 passed, 1 skipped (fixture generator, opt-in) |
| `npm run test:runner` (node:test) | 15 passed (9 runner + 6 MCP bridge) |
| `npm run test:e2e` (Playwright) | 19 passed (golden journey, responsive, axe, sandbox) |
| `npm run build` (vite) | exit 0 — main chunk 344 kB (102 kB gzip) |

## Stack

- Vite 6 + React 19 + TypeScript 5.8 strict
- Dexie 4 (IndexedDB), Zod 3, JSZip 3, react-router 7
- Vitest 3 + fake-indexeddb, Playwright 1.52 + axe-core
- Runner: dependency-free Node ESM (`runner/server.mjs`), native MCP bridge (`runner/mcp/server.mjs`)
