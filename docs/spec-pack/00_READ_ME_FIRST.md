# CHERRY GOLDEN PRODUCT PACK v2.0 — READ THIS FIRST

**Prepared:** 29 August 2026  
**Challenge:** OpenAI WebMCP Challenge 2026  
**Submission deadline:** 3 September 2026, 1:00 PM PT / 9:00 PM BST  
**Product rule:** Build a real product. Do not build a staged dashboard that only works during a scripted demo.

## Locked definition

**Cherry is the user-owned apprenticeship, memory, mission, and verification layer for AI agents.** It lets a person and a connected agent turn permitted videos, transcripts, documentation, repositories, demonstrations, corrections, and completed work into an evidence-backed SkillGraph. Cherry then compiles that graph into portable Agent Skills and runtime-specific packages, helps execute it through supported agent hosts or a local runner, and records proof of every important decision and result.

The product is not another chatbot. ChatGPT, Codex, Claude Code, or another supported host supplies reasoning and generation. Cherry supplies structured state, memory, learning evidence, workflow compilation, approvals, artifacts, execution control, and verification.

## What “golden product” means here

A golden product is not every imagined future feature. It is a complete, honest v1 with no fake success paths:

- every primary control performs a real action;
- every mutation persists and survives refresh;
- every WebMCP tool changes the same state the human sees;
- every export is generated from current workspace data and can be opened and validated;
- every claim of “learned,” “approved,” “run,” or “verified” has inspectable evidence;
- every failure, offline state, unsupported capability, and missing provider has a useful fallback;
- every route is responsive and keyboard accessible;
- no mock API responses, fake model calls, fake analytics, fake activity logs, hard-coded verification badges, or dead buttons are permitted;
- optional example content may be shipped only as a clearly labelled importable workspace that users can delete. It may never masquerade as live agent activity.

## Critical credential rule

**Do not paste passwords, API keys, access tokens, service-role keys, cookies, or recovery codes into ChatGPT, Claude, issue comments, prompts, screenshots, or the repository.** Enter passwords directly on the provider’s website. Put local secrets in an ignored `.env.local`, platform secrets in the host’s secret manager, and local-runner credentials in environment variables or the operating system credential store.

Cherry’s core requires **no AI API key, no YouTube API key, no cloud database, and no paid backend**. Optional provider adapters must degrade cleanly when not configured.

## Source-of-truth order

Agents must resolve conflicts using this order:

1. `01_CHERRY_GOLDEN_PRODUCT_SPEC.md`
2. `02_CHERRY_ZERO_DOLLAR_ARCHITECTURE.md`
3. `03_CHERRY_SECURITY_PRIVACY_CREDENTIALS.md`
4. `docs/CHERRY_DECISIONS.md`
5. approved files under `docs/design/`
6. `docs/superpowers/plans/2026-08-29-cherry-golden-product.md`
7. existing repository conventions that do not contradict the above

No agent may silently reinterpret the product. Any necessary deviation must be written to `docs/CHERRY_DECISIONS.md` with the reason, consequence, and rollback plan before implementation.

## Exact execution order

### Stage 0 — install this pack into the repository

Copy the contents of this pack into the project root. Preserve the existing repository, especially the current Enough-derived state-aware routes, WebMCP tools, approvals, revocation/audit history, and test suite. Do not begin with a clean rewrite.

### Stage 1 — design execution

Paste the complete contents of `04_CHERRY_DESIGN_EXECUTION_PROMPT.md` into the dedicated design agent. Give that agent browser/Figma access only when already available. Figma is useful, but Cherry must not depend on Figma Make credits or a paid design service.

The design stage is complete only when all required design files exist and the golden user journey is fully specified for desktop, tablet, and mobile.

### Stage 2 — product implementation

Paste `05_CHERRY_CLAUDE_CODE_MASTER_BUILD_PROMPT.md` into Claude Code from the repository root. It must inspect the existing application, map the old Enough architecture to Cherry, execute the implementation plan, and run the test gates itself.

### Stage 3 — hostile QA and release hardening

Open a fresh Claude Code context and paste `06_CHERRY_QA_SECURITY_RELEASE_PROMPT.md`. A fresh context is intentional: it prevents the original builder from defending its own assumptions.

### Stage 4 — final verification

Run the commands defined by the repository and verify at minimum:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

When the existing package manager or command names differ, document the exact mapping in `docs/CHERRY_REPO_MAP.md`; do not add duplicate toolchains merely to match these example names.

## Files in this pack

- `01_CHERRY_GOLDEN_PRODUCT_SPEC.md` — locked product, flows, screens, data, and acceptance criteria.
- `02_CHERRY_ZERO_DOLLAR_ARCHITECTURE.md` — runtime, storage, deployment, local runner, native MCP bridge, and budget boundaries.
- `03_CHERRY_SECURITY_PRIVACY_CREDENTIALS.md` — threat model, secret handling, prompt-injection controls, and release requirements.
- `04_CHERRY_DESIGN_EXECUTION_PROMPT.md` — exact prompt for the UI/UX design phase.
- `05_CHERRY_CLAUDE_CODE_MASTER_BUILD_PROMPT.md` — exact implementation prompt.
- `06_CHERRY_QA_SECURITY_RELEASE_PROMPT.md` — exact hostile QA/fix prompt.
- `07_CHERRY_RESEARCH_AND_REFERENCES.md` — researched constraints and source board.
- `08_CHERRY_PRODUCT_COPY_AND_CLAIMS.md` — approved language and prohibited claims.
- `09_CHERRY_ONE_SHOT_ORCHESTRATOR_PROMPT.md` — fallback prompt when a single Claude Code session must drive all stages.
- `docs/superpowers/plans/2026-08-29-cherry-golden-product.md` — test-first implementation plan.
- `harness/CLAUDE.md` and `harness/AGENTS.md` — project-level agent contract.
- `harness/.env.example` — optional configuration without secrets.
- `schemas/*.json` — canonical interchange schemas.
- `templates/skill/cherry-learned-workflow/SKILL.md` — Agent Skills-compliant output template.

## Final non-negotiable

The product must remain useful when no external AI provider is connected. In that state users can still create missions, load permitted lessons, import transcripts, add evidence and observations manually, edit SkillGraphs, manage memory, run deterministic checks, export valid bundles, import workspaces, and inspect proof. Connecting an agent accelerates and automates the same product; it does not unlock a separate fake version.
