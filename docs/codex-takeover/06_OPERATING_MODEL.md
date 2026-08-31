# Operating model — two agents, one repo, zero supervision needed

Vaibhav's role shrinks to three human-only acts (see `07_HUMAN_CHECKLIST.md`). Everything else
runs on this loop:

## The loop

1. **Codex** takes the next ticket from `02_TICKETS.md`, marks it IN_PROGRESS in
   `docs/codex-takeover/STATUS.md`, builds it with tests, runs the gates, commits, pushes,
   marks it DONE with the commit hash and gate counts.
2. **Claude** (architect/release manager) reviews DONE tickets against acceptance criteria on a
   clean snapshot, runs the full merged gates including e2e, does browser QA on the real UI,
   fixes or bounces (STATUS note: `T3 BOUNCED — <reason>`; bounced tickets outrank new work),
   and owns design/copy/docs passes in parallel.
3. **Claude deploys** via the verified prebuilt flow (local `npm ci` → `vercel build` →
   render-smoke → `vercel deploy --prebuilt --prod` → content + render verification on the live
   domain). Nobody else deploys, ever.
4. Repeat until freeze (Wed 12:00 London), then: evidence refresh, final deploy, handoff.

## File-lane map (prevents every collision we've had)

| Path | Owner |
| --- | --- |
| `src/cherry/source/**`, `src/pages/studio/Sources.tsx`, Quick Skill flow, `/ingest` | Codex |
| `src/cherry/library/**`, `src/cherry/webmcp/**` (additive only, invariants in 00) | Codex features / Claude review |
| `src/design-system/**`, `src/pages/Landing.tsx`, `Showcase.tsx`, `Connect.tsx`, `Compatibility.tsx` | Claude |
| `runner/**` | Codex (tests mandatory) |
| `docs/codex-takeover/STATUS.md` | both, append-only |
| `docs/` records (DECISIONS, CHANGELOG, release evidence, Devpost, demo script) | Claude |
| `vercel.json`, deploy config, Vercel dashboard | Claude |
| `package.json` + `package-lock.json` | whoever changes deps, always together, same commit |

Working on a file outside your lane: don't. Need something there: STATUS note, the owner does it.

## Git etiquette on this mount (learned the hard way)

- One git operation at a time per agent; never run long-lived interactive git.
- Stale `.git/*.lock` (>60s old) blocks you: move it to `work/_to_delete/` and retry. Never
  delete another agent's fresh lock.
- Commit messages: conventional, honest, gate counts when relevant.
- Push after every DONE ticket. The public repo is a judged artifact.

## Reporting protocol (STATUS.md is the only channel either agent polls)

Append lines, never rewrite history:

```
2026-09-01 09:40 codex  T1 IN_PROGRESS
2026-09-01 12:05 codex  T1 DONE 1a2b3c4 — gates green, unit 174, e2e 45 (added first-skill.spec)
2026-09-01 13:10 claude T1 VERIFIED — deployed dpl_xxx, live render checked
```

Blocked? `T3 BLOCKED — <what you need>` and move to the next ticket. Never idle, never improvise
outside the queue.
