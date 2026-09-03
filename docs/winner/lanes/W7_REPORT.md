# W7: Hostile Release Audit

Status: **PASS_WITH_EXTERNAL_BLOCKERS**

Audited product tip: `57f3d488d1be57c954323e62ce91144aa741d50f`

Integration base: `35f8d33094f322f080c2eae0b778a603cef27fa4`

Branch: `lane/cherry-landing`

## W2 verdict

W2 passes hostile review within its locked scope. The landing fails closed when replay evidence is loading, missing, or forged. Only a digest-verified replay exposes the bounded `RECORDED` and `VERIFIED` claims, the real Codex run title, and the task and worktree facts.

Fresh focused evidence on the exact product tip:

- Landing Vitest: 14/14 passed.
- A self-consistent forged replay was rejected.
- The forged state rendered `UNAVAILABLE` and exposed none of the replay title, task/worktree claims, `RECORDED`, or `VERIFIED` labels.
- The valid state retained the bounded recorded and verified facts and visible SHA-256 verification.
- No dependency, lockfile, protected-path, prohibited-claim, attribution, or punctuation regression was found.
- Protected W3 and W4 paths are byte-identical to the integration base.

The conductor's authoritative clean `npm run verify:all` on the same product tip passed: typecheck 0 errors; lint 0 problems; Vitest 62 passed files and 1 skipped, 588 passed tests and 2 skipped; runner/MCP 131/131; production build passed; Playwright 129/129 in 9.3 minutes; release pack 6/6; service worker 5/5; submission audit 0 FAIL and 0 WARN.

## Release blockers outside W2 ownership

### Fragment navigation does not reach Showcase proof

`src/app/RouteMeta.tsx:200-207` has no fragment-scroll lifecycle. `/showcase#recorded-mission` and `/showcase#real-run` retain `scrollY = 0` while their targets are approximately 3,892 px and 6,321 px below the viewport. The linked proof exists, but the landing links do not take a judge to it.

### Chronicle verification is line-ending dependent on Windows

`scripts/verify-cherry-chronicle-assets.mjs:139-148` hashes checkout bytes directly. Under an autocrlf checkout, Chronicle verification reports 3/4, with 0/14 raw SVG hashes matching. All 14 match after LF normalization. This is a verifier portability defect, not an asset provenance failure.

### WebMCP API presence can be misreported as an attached agent

`src/pages/studio/StudioLayout.tsx:101-106` and `src/cherry/webmcp/registration-manager.ts:122-134` equate WebMCP API presence with an attached agent. A no-call stub registered 10 tools and executed zero calls while the interface displayed `Agent connected`. Upstream commits `6efe318` and `e1ebfdf` contain the fix chain. Release authority must decide whether to integrate them.

### Evidence documentation contains obsolete hashes

`docs/winner/lanes/W3_REPORT.md:51,80,135`, `docs/release/GOD_MODE_FINAL_REPORT.md:29`, and the pinned-base `docs/release/GOD_MODE_REAL_HOST_CAPTURE.md:54` require hash alignment. Canonical values are:

- Replay digest: `bd68e563073fc63eb06902ae2747395ec447852f52b825c17b2bac8b5ec1ea23`
- LF replay-file SHA-256: `cc05533fdb4302c5b372dd42e07fa523767d5947a847bb4bf2c4025cc7bfc41c`
- LF capture SHA-256: `c93e03d22f71f8ca9dca7e43b3f1396d3a713337f426614fd39cb3b72772a8b3`

### Raw host evidence needs owner privacy review

`docs/release/benchmarks/god-mode-hosts.json` contains local identity/path metadata and full provider output tails. The public replay is sanitized and the secret scan is green, but release authority must explicitly accept or redact the raw repository artifact before public release.

## Claim ruling

The live proprietary WebMCP host remains **Experimental**. W2 does not claim a captured proprietary chat-host path, does not claim named model execution, does not overstate the scope of the Three.js prototype, and does not claim replacement of another product. Those claims require direct, reviewable evidence.

## Handoff

W7 made no product, dependency, lockfile, protected-runtime, release-source, authentication, merge, or deployment change. The findings above were appended to the shared status ledger for release-authority disposition.

---

## Release authority disposition (2026-09-03, the release manager)

Every blocker above is now closed. This section is appended, not edited into the report body: the
findings above stand as W7 recorded them.

| W7 finding | Disposition | Commit |
|---|---|---|
| Fragment navigation does not reach Showcase proof | Fixed. `RouteMeta` now takes a fragment to its target once the route mounts, respects reduced motion, and moves focus there. A browser test asserts the judge lands on the recorded mission, not at the top of the page. | `db41134` |
| Chronicle verification is line-ending dependent on Windows | Fixed. Text assets are hashed as git stores them (LF), binaries byte for byte. Verified by simulating a CRLF checkout. That verifier's own test also ran in no gate, so it is part of `test:runner` now. | `db41134` |
| WebMCP API presence can be misreported as an attached agent | Integrated. The tribunal fix chain is on main: the header pill, Agent View and onboarding read "site tools available" until a host calls a tool or introduces itself. | `6efe318`, `e1ebfdf` |
| Evidence documentation contains obsolete hashes | Closed by the redaction below, which supersedes every earlier value. | `d0ddefe` |
| Raw host evidence needs owner privacy review | **Redacted**, not accepted. The capture machine's Windows account name and per-run temporary directory are now `<user>` and `<run>`. No version, exit code, timing, evaluation result or base commit changed. | `d0ddefe` |

Canonical hashes after the redaction, recomputable from what the repository ships:

- Capture file SHA-256: `baed40e34ce702642040e4198c821c0b35a0e7509fe661b0c0a7e486db71b9e5`
- Compact-JSON content SHA-256: `20fc34e9d11225f1adaf0481a1f0fb08e83f9ea687923d0c3973fb76bf1b6dc2`
- Replay digest (`recorded-mission-trust.mjs`): `edd88812aaf1c91ad58e542362fb05908a9b0b373803dd7e132980f0284b5cad`

The values listed in W7's own finding were canonical for the pre-redaction artifact and are recorded
in `docs/release/GOD_MODE_REAL_HOST_CAPTURE.md` for anyone comparing against the earlier evidence.
