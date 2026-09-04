# Cherry WebMCP judge-readiness checklist

**Maintained:** 4 September 2026. The original challenge submission deadline has passed; this checklist protects the artifact judges and reviewers can inspect.

## Required artifact

| Surface | Repository evidence | Runtime evidence |
| --- | --- | --- |
| Project description | `README.md`, `docs/release/DEVPOST_SUBMISSION.md` | Landing page and `/showcase` |
| Working live app | canonical URL in `README.md` and submission audit | hourly checks for `/`, `/showcase`, `/compatibility`, `/connect` |
| Public source repository | this repository, MIT `LICENSE`, clean setup commands | `npm ci` and CI on the exact commit |
| Demo material | `docs/release/DEMO_SCRIPT.md`, shipped recording, capture scripts | `/showcase#real-run` |
| Thoughtful WebMCP use | `src/cherry/webmcp/registration-manager.ts`, `tool-definitions.ts` | `document.modelContext` host capture and registered-closure tests |
| Human-agent experience | exact-revision approval service and deep-link handoff | host requests; person decides in Cherry; agent reads the result |
| Usefulness and execution | skill library, mission plan, runner, verification, receipts | full journey fails honestly, repairs, passes, exports, and recomputes hashes |
| Honest compatibility | `docs/release/CHERRY_COMPATIBILITY_MATRIX.md` | `/compatibility` labels each surface by evidence level |

## Critical commands

```bash
npm ci
npm run gates
npm run build
npm run test:e2e:critical
npm run verify:pack
npm run verify:sw
npm run audit:submission
npm run health:hourly
```

`npm run verify:all` remains the full repository gate. The hourly workflow repeats the critical WebMCP and public-route path after merge.

## Claims that must stay true

- The page registers real tools through `document.modelContext` when a compatible host exists.
- Tool schemas reject unknown input and tool results stay bounded and parseable.
- No registered tool can approve its own work, activate memory, or promote trust.
- The approval request returns a deep link to the exact pending revision; the person decides on Cherry's screen.
- Execution/export tools are absent until the state permits them.
- A verification failure remains in evidence; a repair counts only after the same checks pass.
- Exported skill content and proof receipts have hashes a reviewer can recompute.
- Labelled sample approvals are never presented as the user's decision.
- The app makes no hidden background fetch and does not require a login for the judge path.

## Before any public claim update

1. Run the relevant test against the exact commit.
2. Link the claim to a report, receipt, or captured session.
3. Update `/compatibility` and release docs at the same evidence level.
4. Run `npm run audit:submission`.
5. Do not edit historical Git metadata or backdate evidence.
