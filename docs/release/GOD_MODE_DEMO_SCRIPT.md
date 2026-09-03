# God Mode demo script (under three minutes)

Record at 1440x900 in a normal browser window. Read the lines; do not narrate architecture. Every
beat below points at something that exists on the god-mode branch; beats marked CAPTURE
require the real-host capture recorded in `GOD_MODE_REAL_HOST_CAPTURE.md`, otherwise the mock
host is shown and named as a mock on screen.

| Time | Screen | Line |
|---|---|---|
| 0:00 | Landing hero | Every agent you use is intelligent. Your tools, memory and workflows are not shared between them. Cherry is the runtime that turns them into one team. |
| 0:15 | Mission Control composer | Type the outcome: "Audit Cherry against its strongest competitor, fix the highest-impact onboarding defect, and prepare the launch content. Nothing public without approval." Point the mission at a repository so the developer fix gets its own worktree. |
| 0:30 | Plan card | Cherry turns that into a graph it validated: research and audit in parallel, prioritise, then a developer fix and a content draft side by side, independent verification, and a human decision before anything public. Every task has a definition of done and a real check. Codex is preferred for the fix, Claude Code for the review. |
| 0:45 | Mission detail, two nodes running | Two teammates are working at the same time in two separate worktrees. The boundary label says worktree-process, not VM. The overlap is in the runner event log. CAPTURE beat when real hosts ran; otherwise say "this is the mock host". |
| 1:05 | Verification node | Provider completion is not trusted. Cherry runs the fixture's own tests. Here one check fails. |
| 1:20 | Repair | One bounded repair with the failed check as data. The evaluator reruns every check. It passes. |
| 1:40 | Agent View with a visiting agent | A visiting agent calls plan_current_mission and reads the result. It cannot approve anything; the tools that could are not registered. |
| 2:00 | Skills | The successful method is proposed as a skill. Approval stays human, at this exact revision. |
| 2:20 | Proof | Policy, artifacts, evaluation report, receipt. Recompute the hash. |
| 2:40 | Landing sections | YouTube learning, content operations, connectors: capability packs in the same runtime, each labelled with what is actually proven. |

Do not say: works in ChatGPT (unless the live capture exists), 24/7, cloud VM, connected to LinkedIn,
signed receipts, replaces Grok Bot. Do say: runs while your paired runner is online; tamper-evident
hashes; Uses your Codex sign-in and available Codex usage.
