# Claims matrix

Statuses: VALIDATED_REAL (real host or real capture plus deterministic check), SHIPPED_TESTED (code
in the tree with a named green test), EXPERIMENTAL (built, not captured on the real surface),
DESIGNED (specified, not built), NOT_BUILT. Updated at every ticket boundary; the last column is
the commit and date of the last verification.

| Claim | Status | Implementation | Test | Capture | Boundary | Verified |
|---|---|---|---|---|---|---|
| A person can create an outcome-first mission | DESIGNED | GOD-1/GOD-7 | tests/cherry/mission-plan.test.ts, e2e/cherry/god-mode-mission.spec.ts | | | pending |
| Cherry persists a validated acyclic work graph | DESIGNED | GOD-1 | tests/cherry/mission-plan.test.ts | | Dexie v5 | pending |
| At least two tasks run in parallel | DESIGNED | GOD-5 | runner/mission-executor.test.mjs (overlapping intervals in the event log) | | mock host in tests | pending |
| Each repository-writing worker gets its own git worktree | DESIGNED | GOD-3 | runner/sandbox-manager.test.mjs | | worktree-process, not a VM | pending |
| UI states the actual sandbox boundary | DESIGNED | GOD-7 | e2e | | | pending |
| Provider completion is not verification | SHIPPED_TESTED | runner/lib/adapters.mjs | runner/v2.test.mjs | | | 6e763c5 |
| Independent checks determine the result; a failed check can produce a bounded repair | DESIGNED | GOD-5/GOD-6 | runner/mission-executor.test.mjs | | | pending |
| Consequential action stops at approval | DESIGNED | GOD-6 | tests/cherry/policy-service.test.ts | | | pending |
| WebMCP can create, plan and start a mission through bounded tools; no tool can approve | DESIGNED | GOD-8 | tests/cherry/webmcp-god-mode.test.ts, e2e/cherry/webmcp-god-mode.spec.ts | mock host | live ChatGPT: EXPERIMENTAL | pending |
| Every WebMCP call appears in Agent View | SHIPPED_TESTED | registration-manager.ts callLog | tests/cherry/webmcp.test.ts | | | 6e763c5 |
| Works with Codex (real execution captured) | NOT_BUILT | GOD-12 | | none yet | needs a Codex CLI and sign-in on this machine | pending |
| Works with Claude Code (real execution captured) | NOT_BUILT | GOD-12 | | none yet | claude 2.1.224 present | pending |
| Works in ChatGPT (live site tools) | EXPERIMENTAL | webmcp | mock-host e2e only | none | | 6e763c5 |
| Runs while the paired runner is online | SHIPPED_TESTED (queue), DESIGNED (missions) | runner | runner/v2.test.mjs | | never "24/7" | 6e763c5 |
| Runs when the laptop is closed | NOT_BUILT | | | | forbidden claim | |
| Connected to LinkedIn, Gmail, YouTube publishing | NOT_BUILT | capability catalogue marks `designed` | | | forbidden claim | |
| Learns from YouTube | SHIPPED_TESTED | source/watch modules | golden e2e | | transcript, embed, RSS metadata only | 6e763c5 |
| Approved skills are recommended to a visiting agent | SHIPPED_TESTED | library-service.ts, WebMCP globals | e2e/cherry/showcase-host.spec.ts | | | 6e763c5 |
| Tamper-evident receipts | SHIPPED_TESTED | proof | tests/cherry/proof.test.ts | | hashes, not signatures | 6e763c5 |
| Billions of artifacts | FORBIDDEN | SCALE_DESIGN.md is architecture only | | | | |
| 1,000 + 1,000 record harness produces reproducible metrics | NOT_BUILT | GOD-11 | tests/scale | | | pending |
