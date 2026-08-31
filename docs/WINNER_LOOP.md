# The full loop — every stage real, every stage tested

The complete Cherry pipeline, each stage mapped to the surface that implements it and the test
that proves it. No stage is decorative; the golden e2e drives stages 1–12 in **one fresh browser
session** with no seeded state.

| # | Stage | Where it lives | Proven by |
|---|-------|----------------|-----------|
| 1 | Sources | Quick Skill wizard + Add-a-source dialog (YouTube official embed, transcript paste/upload, files, on-device Whisper, labelled sample) | `golden-manual`, `upgrade` (wizard honesty) |
| 2 | Auto extraction | Deterministic step derivation (D-011), Whisper WebGPU/WASM, notebook digest — extraction mode always shown, never faked frames | `quick-steps` assertions in `upgrade`, whisper-format unit tests |
| 3 | Evidence | Evidence ledger — timestamped, provenance-tagged, untrusted by default | `golden-manual` (Raise trust), evidence unit tests |
| 4 | Skill compiler | SkillGraph draft → readable document contract | `golden-manual` (Draft the skill) |
| 5 | Human approval | Exact-revision approval; no WebMCP tool can approve; edits go stale | `golden-manual`, `showcase-host` (agent cannot approve), domain-flow unit tests |
| 6 | Agent / subagent execution | WebMCP registered closures (state-aware tools), crew work items + handoffs, runner v2 durable queue with host adapters | `showcase-host` (registered-closure journey), `workforce` e2e, 42 runner tests |
| 7 | Real artifact | Artifact workspace, versioned files, sealed sandbox preview | `golden-manual`, malicious-artifact isolation e2e |
| 8 | Failure | Deterministic verification failure (heading hierarchy) — preserved, not theatrical | `golden-manual` |
| 9 | Repair | Repair on the artifact, "Apply repair and rerun" | `golden-manual` |
| 10 | Verification | Assertions rerun to a genuine pass; report stored | `golden-manual` |
| 11 | Memory graph | Correction compiler → proposed memory with provenance links (evidence/mission refs) → human-only promotion; agents may only propose | `golden-manual` (Compile correction → Approve), memory unit tests |
| 12 | Routine reuse | Routines bind to the **approved skill revision only**; draft → human approves the schedule revision → enabled; every schedule change clears approval | `golden-manual` (added 2026-08-31: draft → approve → enabled), routines unit tests |
| 13 | Portable export | Workspace export/import (id-remapped, hash-verified) + skill bundle with standalone verifier + recomputable receipt | `golden-manual` (export→import→reload), `verify:pack` (one-byte tamper FAILS) |

Cross-cutting proofs: refresh-safe at every stage (`golden-manual` reload), keyboard-only entry
(`responsive`), honest host status (`showcase-host`), tamper-evident receipts (unit +
`scripts/verify-release.mjs`).
