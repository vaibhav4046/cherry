# Status — codex/cherry-workforce-v2

Updated: 2026-08-30

## Completed
- Baseline preserved and recorded (BASELINE.md); all prior gates green before feature work.
- Workforce domain core (`src/cherry/workforce/workforce-model.ts`): AgentProfile, Crew, WorkItem,
  WorkMessage, HandoffRecord, ExecutionHost + capability routing, Routine + ExecutionEnvelope types,
  the locked work-item state machine, ScheduleSpec validation (5min–30d bounds, IANA tz required),
  DST-aware nextRunAt (Europe/London spring-forward covered by test), attention sorting.
- Persistence v2 (Dexie migration 2: agentProfiles, crews, workItems, workMessages, handoffs,
  executionHosts, routines) — additive, no data loss.
- Workforce service: proof-evented mutations (same-transaction), starter five-agent crew (editable,
  deletable, honest idle status), work-item transitions with stale-revision refusal, assignment
  validation, thread messages, attention queue (approvals, waiting, failed, memory proposals).
- Product surfaces: /studio/inbox (composer "What should your crew get done?", attention queue,
  item list), /studio/crew (starter crew, profile cards, archive, add), /studio/work/:id (thread,
  DoD, legal-moves-only controls). Rail + routes wired; every existing route preserved.
- Copy corrections: landing chapter 03 now states the supported-host truth (ChatGPT/Codex browser
  over WebMCP; Claude Code via Agent Skills + MCP; host reasons under its own plan).
- Tests: +16 unit (state machine, schedules incl. DST, capability routing, service incl. proof
  events and stale revisions) and +1 e2e journey (crew → handoff → thread → transitions). Full run:
  104 unit passed + 2 skipped, 32 e2e passed.
- Production content proof (pre-branch): Karpathy "Let's build GPT" full transcript (233,217 chars,
  byte-verified) → 10-node skill, approved r2, verification passed 3/3, on the live site.

## Active
- None (end of this working session).

## Blocked
- Real ChatGPT/Codex WebMCP host validation: requires a live supported client session (owner-present).

## Next Merge
1. WebMCP workforce apertures (inbox/crew/routines/run tool sets, surface+state selection).
2. Runner v2: durable queue, leases/heartbeats, worker pool, scheduler, event sync protocol.
3. Routines UI + approval-bound schedules (model + math already landed and tested).
4. Host adapters (cherry-verify, cherry-export, codex-cli, claude-cli, allowlisted safe commands).
5. Full 25-step workforce journey e2e; live host validation; motion pass.

## Evidence
- BASELINE.md; vitest/playwright outputs in terminal log; e2e/cherry/workforce.spec.ts.

## Honest limitations
- Work items can reach RUNNING/VERIFYING/SUCCEEDED only through the service API today; no execution
  host leases them yet — the UI says exactly that and offers only legal human moves.
- Attention queue covers approvals, waiting-for-human, failures, memory proposals; host/routine
  kinds land with Runner v2.
