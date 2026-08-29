# Cherry repository map

Command mapping (pack names → this repo):

| Pack command | This repo | Notes |
|---|---|---|
| `npm run typecheck` | `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint` | `npm run lint` | eslint 9 flat config |
| `npm run test` | `npm run test` | vitest, jsdom + fake-indexeddb |
| `npm run test:e2e` | `npm run test:e2e` | Playwright, builds + previews automatically |
| — | `npm run test:runner` | node:test for runner + MCP bridge |
| `npm run build` | `npm run build` | vite production build |
| — | `npm run preview` | serves `dist/` on 127.0.0.1:4173 |

Module map (spec responsibility → file):

| Responsibility | Location |
|---|---|
| Result/error contract, IDs, clock | `src/cherry/core/{result,errors,ids,clock}.ts` |
| RFC 8785 canonical JSON + SHA-256 | `src/cherry/core/{canonical-json,hash}.ts` |
| ProofEvent ledger types | `src/cherry/core/domain-event.ts` |
| IndexedDB schema + migrations + transactions | `src/cherry/persistence/{cherry-db,migrations,transactions}.ts` |
| Workspace export/import (id-remapped, hash-verified) | `src/cherry/persistence/workspace-archive.ts` |
| Mission model/state machine/services + runs | `src/cherry/mission/*` |
| Evidence ledger (untrusted-by-default) | `src/cherry/evidence/*` |
| Cherry Watch (YouTube URL, transcript parsers, coverage, observations) | `src/cherry/watch/*` |
| Approvals (exact revision) | `src/cherry/approval/*`, enforcement in `skillgraph-service.ts` |
| SkillGraph model/validator/versions/approval/rollback | `src/cherry/skillgraph/*` |
| Memory Vault, inbox, correction compiler | `src/cherry/memory/*` |
| Artifact files, versions, path validation, sandboxed preview | `src/cherry/artifacts/*` |
| Deterministic verification | `src/cherry/verify/verification-service.ts` |
| Proof receipts + independent verifier | `src/cherry/proof/*` |
| Agent Skills compiler + Codex/Claude targets + ZIP | `src/cherry/compiler/*` |
| WebMCP tool contract/definitions/aperture/registration | `src/cherry/webmcp/*` |
| Runner client (pairing, jobs) | `src/cherry/runner-client/*` |
| Local runner (loopback, pairing, adapters) | `runner/server.mjs` (see D-004) |
| Native MCP bridge (stdio, read/verify) | `runner/mcp/server.mjs` (see D-005) |
| Design system | `src/design-system/tokens.css` (Slush sticker-book, see D-002) |
| Routes | `src/app/App.tsx`, pages under `src/pages/` |
| Canonical schemas | `schemas/*.schema.json` (from the pack, unmodified) |
| Example workspace (real export) | `public/examples/example-workspace.json`, generator in `tests/cherry/example-workspace.gen.test.ts` |
| Release evidence | `docs/release/*` |
| Original execution pack | `docs/spec-pack/` (reference copy) |
