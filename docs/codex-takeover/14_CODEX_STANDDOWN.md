# 14 · CODEX STAND-DOWN — read-only reviewer from now (the 5 percent)

**Issued:** 2026-09-02, 10:15 London, by Claude Cowork (release manager), on the owner's
instruction: Claude takes 90 percent of the remaining work, Codex keeps 5 percent.

## What changes

From this moment Codex **does not edit any file in `D:\project\cherry` or any worktree**. Not
docs, not evidence, not STATUS beyond the two line types below, not the working tree you have
open. Do not commit. Do not merge. Do not push. Do not deploy. Do not open new tickets. Do not
"quickly fix" anything you notice; record it and stop.

**One exception, then stop:** at 10:12 London you were mid-way through the owner's "make the
logo consistent" request (`src/components/CherryHomeLink.tsx`, `tests/cherry/cherry-logo.test.tsx`,
the five pages that now import it, and the `.logo-mark` rules). Finish exactly that: one canonical
mark (`/cherry.svg`) in every masthead, one `.logo-mark` rule (delete the dead `#d52f58` one), the
stale `public/og.png` removed, no other change. Run `npm run gates`, `npm run build`, and the full
`npx playwright test`; commit as `fix(brand): one canonical Cherry mark in every masthead` with no
attribution trailers; push to `origin/main`; append one STATUS line with the counts. Include the
refreshed evidence files you already modified under `docs/release/` only if they reflect a run you
actually completed; otherwise restore them. Then you are read-only.

## Your 5 percent, exactly

1. **Review on request only.** When STATUS gains a line `claude-cowork REVIEW REQUEST <branch> <sha>`,
   check out that sha in a *separate* read-only worktree
   (`git worktree add D:\project\cherry-codex-review <sha>`), run the Windows-native full
   matrix there:

   ```powershell
   npm ci
   npm run gates
   npm run build
   npx playwright test
   npm run verify:pack
   npm run audit:submission
   ```

   and append one STATUS line:
   `YYYY-MM-DD HH:MM codex REVIEW <sha> — typecheck N, lint N, unit N (+S skips), runner N, build N, e2e P passed F failed, verify:pack N, audit:submission F FAIL W WARN; findings: <none | list>`.
   Findings are observations with file and line. They are not fixes. Remove the review worktree
   after.
2. **Answer questions in STATUS** when a line `claude-cowork QUESTION FOR CODEX` appears, in one
   appended line, with evidence (a path, a command, a count). Nothing else.

That is all. If neither line appears, you are idle, and idle is correct.

## Why

Two agents editing one tree cost this project a night of git locks, a drifted lockfile that
broke `npm ci`, and duplicate fixes. One builder, one release manager, one reviewer is the
fastest configuration that stays honest. Your earlier work is in main and stays in main.
