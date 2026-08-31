# Status — Cherry Workforce v2

Updated: 2026-08-30 (phase 2 complete) · main @ ff07b8f · live: getcherry.vercel.app = cherry-wine.vercel.app

## Completed
- Phase 1 (see git history): domain core, state machine, DST schedules, Dexie v2, crew/inbox/thread
  surfaces, attention queue, copy truths.
- Surface-selected WebMCP apertures: inbox / crew / routines / run tool sets, selected by route +
  mission state, each ≤5 tools + 3 globals, retired-tools diff on every switch. 14 new workforce
  tools; agents can draft/schedule/queue but can never approve, enable, or mark success.
- Routines end-to-end: draft from approved SkillGraph → schedule (validated, DST-aware) → exact-
  revision human approval binding an action hash → pause/resume; every schedule edit invalidates
  approval. Full UI at /studio/routines(+detail). ApprovalObjectType widened with 'routine'.
- Runner v2 (dependency-free Node, evolves the secure v1): durable queue with immutable hashed
  envelopes, leases+heartbeats+expiry recovery, worker pool 1–3, idempotency refusal, bounded retry,
  cancellation/timeout, crash recovery, exactly-once schedule materialisation with missed-run
  policies, hash-chained events log + /events?since sync, adapters: cherry-verify, cherry-export,
  codex-cli, claude-cli (dual-allowlist, never 'verified'), safe-command. v1 endpoints untouched.
- Motion: honest status pulse on running stickers (reduced-motion safe).
- Evidence, all run fresh by the lead after integration:
  typecheck ✓ · lint ✓ · unit 116 passed + 2 skipped · runner 42/42 · build ✓ · e2e 33/33 ·
  production routes /studio/inbox|crew|routines live (HTTP 200 smoke).

## Honest limitations (unchanged claims never shipped)
- Provider-CLI success path (spawning a real codex/claude binary) has no automated test on Windows
  (.cmd shim limitation under shell:false); gating/refusal/never-verified contracts ARE tested.
- Work items reach RUNNING only via the service/runner path; the browser UI offers legal human moves
  only. Studio↔runner event import UI is wired at the protocol level (/events + chain verify) but
  the Studio-side import screen is not built yet.
- The 25-step full workforce journey e2e is partial (crew→handoff→assign→queue→cancel + routine
  smoke covered; runner-backed live-run steps need the import screen).
- Live ChatGPT/Codex WebMCP host validation requires the owner present in a supported client.

## Owner-only actions remaining
1. Live host validation session (open getcherry.vercel.app in a WebMCP-capable ChatGPT/Codex
   browser; the Agent page brief drives it).
2. Record the <3-minute video; submit on Devpost before Sep 3, 1 PM PT.

2026-09-01 00:20 claude PACK PUBLISHED — master directive + tickets T1-T7 in docs/codex-takeover/; production restored (blank-page incident closed at c450b50); Codex lane: start T1
