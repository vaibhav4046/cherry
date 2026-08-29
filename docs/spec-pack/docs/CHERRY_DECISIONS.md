# Cherry Locked Product and Architecture Decisions

**Prepared:** 29 August 2026  
**Status:** Approved baseline. Future changes require a new dated entry; do not silently edit prior decisions.

| ID | Decision | Reason | Consequence |
|---|---|---|---|
| CHR-001 | Cherry is the user-owned apprenticeship, memory, mission, and verification layer for AI agents. | A generic chatbot, prompt generator, or MCP directory is crowded and does not solve workflow loss or proof. | Product screens and copy must centre Watch → SkillGraph → Approval → Run → Verify → Memory/Export. |
| CHR-002 | Preserve and transform the existing Enough-derived application rather than starting over. | Existing route-aware WebMCP, approvals, revocation/audit, state, and tests reduce risk. | Engineering begins with a repository map and regression baseline. |
| CHR-003 | The required v1 is local-first and provider-optional. | This is the only honest zero-dollar core and gives a complete fallback when WebMCP/provider access is unavailable. | IndexedDB, manual operation, export/import, deterministic verification, and static hosting are release-critical. |
| CHR-004 | No model API, hosted database, or YouTube API key is mandatory for core Studio. | Core correctness must not depend on credit, quota, or subscription. | Hidden model calls, automatic caption promises, and cloud-only state are prohibited. |
| CHR-005 | WebMCP is the live page tool surface, not a free always-on runtime. | Tools are client/page/state scoped. | UI must disclose attached state; manual mode remains complete; 24/7 claims require a separate runner/scheduler. |
| CHR-006 | Tool Aperture exposes two global read tools plus at most five state-valid tools. | Smaller, non-overlapping tool sets improve discovery, reduce context, and shrink attack surface. | Register/unregister dynamically; tool names/descriptions/results follow current official budgets. |
| CHR-007 | YouTube learning uses the official visible iframe and permitted transcript input. | Player control does not grant arbitrary caption download or media rights. | No caption scraping, video download, hidden playback, or re-hosting. |
| CHR-008 | “Watching” means timestamped transcript and visual evidence with explicit coverage and uncertainty. | Claiming perfect whole-video understanding is unprovable. | No “100% learned” status; coverage identifies processed segments, inspected intervals, action-bearing gaps, and accepted uncertainty. |
| CHR-009 | SkillGraph is Cherry’s vendor-neutral intermediate representation. | Host-specific instruction files are not a durable common model. | Export canonical graph/evidence/policy/evals plus Agent Skills, Codex, Claude Code, WebMCP, and prompt targets. |
| CHR-010 | Memory is proposed, source-linked, scoped, sensitive-aware, expirable, versioned, and user-approved. | Automatic opaque memory creates privacy and authority conflicts. | External content cannot silently become global memory; agents may propose but never approve. |
| CHR-011 | Human approval binds to the exact content revision/hash. | Approval must not survive material changes. | Edits invalidate approval; UI shows diff, consequence, requester, approver, time, and scope. |
| CHR-012 | Provider completion and Cherry verification are separate states. | A process exit or plausible response is not proof of result. | “Verified” derives only from stored deterministic assertions against the current revision. |
| CHR-013 | Generated artifacts run in a network-blocked sandbox without same-origin access. | Generated code is untrusted and must not access Cherry data or exfiltrate information. | Preview uses restrictive iframe sandbox/CSP and a validated message protocol. |
| CHR-014 | Proof is recomputable and tamper-evident through canonical data plus SHA-256. | This is achievable locally without a signing service. | Do not call a hash a signature; a signed-receipt claim requires a real protected signing key and separate decision. |
| CHR-015 | Local Runner and native MCP are optional release claims gated by tests. | A broken autonomy layer would weaken the core and create security risk. | Hide/remove their UI and claims unless pairing, permissions, recovery, and deterministic post-run verification pass. |
| CHR-016 | Optional cloud sync stores only client-side encrypted workspace blobs. | Local-first ownership and free-tier resilience matter more than cloud dependence. | Local state remains authoritative; keys/passphrases never reach provider; RLS/conflict tests required. |
| CHR-017 | The product contains no fake demo mode. | A scripted dashboard is not a golden product. | Samples may exist only as explicit importable/deletable examples; every primary control operates on real state. |
| CHR-018 | Black Cherry OS is the locked visual direction. | Cherry needs a distinct premium identity without generic purple AI styling or childish fruit imagery. | Cinematic marketing; calm high-density product; semantic garnet accents; system/free fonts; accessible contrast and reduced motion. |
| CHR-019 | Android means a responsive installable PWA; WebMCP support remains client-dependent. | A mobile web app and agent-native browser integration are different capabilities. | Mobile journey is release-critical; do not claim universal mobile WebMCP or native background execution. |
| CHR-020 | Public claims follow `08_CHERRY_PRODUCT_COPY_AND_CLAIMS.md`. | Overclaiming autonomy, security, or compatibility destroys credibility. | QA must remove any stronger unsupported language from UI, README, submission, or video. |
| CHR-021 | Authoritative specification/prompt documents may quote prohibited placeholder/debug marker names only to define release scanning rules. | A repo-wide blind scan would otherwise flag the contract itself. | Scan shipped source, UI copy, generated exports, fixtures used as production data, and release evidence; do not treat quoted policy examples as product placeholders. |

## Decision-entry format

Append future decisions using:

```markdown
### CHR-022 — Descriptive title

- Date: YYYY-MM-DD
- Status: proposed | approved | superseded
- Context: the concrete conflict or new evidence
- Decision: one unambiguous outcome
- Alternatives rejected: concise reasons
- Consequences: code, data, UI, testing, migration, and claims affected
- Rollback: how to reverse safely
- Evidence: source links, tests, or screenshots
```
