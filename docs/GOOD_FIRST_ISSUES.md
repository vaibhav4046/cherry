# Good first issues

Real, scoped work that helps Cherry without needing the whole picture in your head. Every one of
these lands inside the existing gates: `npm run gates` must pass, and anything user-facing needs a
test. Read [CONTRIBUTING.md](../CONTRIBUTING.md) first; it explains the lanes and the claim rules.

Each item lists the files you will touch and how you will know you are done.

## 1. Add a source kind: RSS or Atom article feeds

Sources currently accept YouTube, articles, notes, and files. Add a feed kind that stores the feed
URL as metadata, with fetching left to the paired runner exactly like channel watches.
Files: `src/cherry/source/source-model.ts`, `source-service.ts`, `src/pages/studio/Sources.tsx`.
Done when: a feed source saves with provenance, unit tests cover the new kind, and nothing fetches
from the browser.

## 2. Add an export target: plain Markdown runbook

Alongside SKILL.md, AGENTS.md, and CLAUDE.md, emit a human-readable runbook that a person could
follow without any agent.
Files: `src/cherry/compiler/target-files.ts`, `src/cherry/library/library-service.ts`.
Done when: the new format is gated behind the same exact-revision approval and covered by a unit
test asserting the gate refuses an edited-after-approval skill.

## 3. Library: filter by source creator

The Skill Library filters by text and install-readiness. Add a creator filter drawn from source
provenance so you can find everything learned from one person.
Files: `src/cherry/library/library-service.ts`, `src/pages/studio/Skills.tsx`.
Done when: filtering is pure and unit-tested, and the UI uses existing tokens and components only.

## 4. Keyboard shortcut for the first-skill flow

Submitting the paste step currently needs a click or Tab-to-button. Add Cmd/Ctrl+Enter, announced
in the field's help text.
Files: `src/pages/studio/QuickSkill.tsx`.
Done when: an e2e test completes the step by keyboard alone and the hint text is honest about the
platform key.

## 5. Empty-state copy pass for the workforce screens

Inbox, Crew, and Routines have empty states that could teach better in one sentence plus one action.
Files: `src/pages/studio/WorkInbox.tsx`, `CrewPage.tsx`, `RoutinesPage.tsx`.
Done when: no banned jargon (see the copy guide in `docs/codex-takeover/04_COPY_GUIDE.md`), one
primary action per state, and existing e2e text assertions updated in the same commit.

## 6. Receipt page: copy the recompute command

The proof page explains that anyone can recompute a receipt. Add a copy button that puts the exact
verification command on the clipboard.
Files: `src/pages/studio/Proof.tsx`.
Done when: the copied text is the command that actually works against a downloaded bundle, asserted
in a unit test on the string builder.

## 7. Runner: friendlier pairing error messages

When pairing fails, the message could name the cause and the fix.
Files: `runner/server.mjs`, `src/cherry/runner-client/`.
Done when: each failure path states what happened and the one next step, with runner tests covering
the new messages.

## 8. Accessibility: prefers-reduced-motion audit

Confirm every transition honors reduced motion, including the showcase timeline and the landing
lesson card.
Files: `src/design-system/*.css`.
Done when: an e2e run with reduced motion forced shows no animation and no layout difference.

## 9. Docs: a worked example of installing a skill into Codex

CONTRIBUTING explains the extension points; a short end-to-end walkthrough of exporting a skill and
registering the bridge would help newcomers.
Files: `docs/`.
Done when: someone can follow it start to finish without asking a question, and every command in it
was actually run.

## 10. Bundle size watch

Add a script that fails if the entry chunk grows beyond a stated budget, so weight regressions are
caught by the gates instead of by users.
Files: `scripts/`, `package.json`.
Done when: the script passes at the current size, fails on an artificial increase, and is wired
into `verify:all`.
