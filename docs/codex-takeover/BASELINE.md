# Baseline — codex/cherry-workforce-v2

Date: 2026-08-30 · Branch base: 15cb3d7 (main) · node v24.12.0 · npm 11.6.2

Fresh gate run (all commands executed 2026-08-30, outputs live in terminal log):

| Gate | Result |
|---|---|
| git status | clean except build artifacts (e2e-results.json, tsbuildinfo) |
| npm run typecheck | pass |
| npm run lint | pass |
| vitest run | 88 passed, 2 skipped (10 files) |
| npm run test:runner | pass (runner 9 + bridge 6) |
| npm run build | pass (1.67s) |
| playwright test | 31 passed (56.4s) |

Live: https://cherry-wine.vercel.app = https://getcherry.vercel.app (project domain, tracks production)
Production smoke this session: Karpathy "Let's build GPT" (2,212-segment transcript, byte-verified 233,217 chars) → notebook → 10-node skill → approved r2 → verify passed 3/3 — real run in a real Chrome against production.

Baseline preserved. Feature work starts on this branch only.
