# Dependency audit

**Date:** 2026-09-02  
**Environment of record:** Linux, Node 22.22.2, npm 10.9.7 (the numbers in Result were measured here). An earlier draft measured on Node 24.12.0 / npm 11.6.2; see the correction below.  
**Scope:** committed JavaScript lockfile, optional local Python scraper pins, and browser build output

## Result

Verified 2026-09-02 on the release-manager machine (Linux, Node 22.22.2, npm 10.9.7) against the
committed `package.json` / `package-lock.json` pair, from a clean checkout with no pre-existing
`node_modules`:

- `npm ci` exits 0: 996 packages added, 997 audited.
- `npm audit --omit=dev --audit-level=high` exits 0.
- Full audit metadata: 0 critical, 0 high, 10 moderate, 0 low.
- The full gate suite passes on that install: typecheck, lint, unit 385 (+2 opt-in skips),
  runner/bridge 69, production build, `verify:pack`, `audit:submission` 0 FAIL 0 WARN, and the
  complete Playwright suite 96 passed.
- The browser output contains no `onnxruntime-node`, `adm-zip`, or native Sharp module reference.
- The guest path keeps Privy behind an explicit dynamic import. The SDK is requested only after a
  configured user opens sign-in or when a stored Privy session must be restored.

Without the narrow overrides below, the same tree audits at 0 critical, 6 high, 25 moderate, and
`npm audit --omit=dev --audit-level=high` exits 1.

This is not a zero-vulnerability claim. Ten moderate advisories remain, all inside the optional
wallet and auth dependency tree, and the upstream peer-layout warnings are recorded below.

### Correction, 2026-09-02

An earlier draft of this document reported 988 packages and 14 moderate advisories. That draft was
written against a `package-lock.json` that had drifted out of sync with `package.json`: a clean
`npm ci` on it failed with `EUSAGE` and named four packages missing from the lock
(`@wagmi/core`, `use-sync-external-store`, `@base-org/account`, `zustand`). The lock was
regenerated with `npm install --package-lock-only` and every number above was re-measured on the
regenerated pair. The overrides themselves are unchanged; only the lock was resynced.

## Narrow resolutions

| Dependency edge | Resolution | Boundary checked |
|---|---|---|
| `@coinbase/cdp-sdk` → Axios | Axios 1.20.0, scoped to that parent | Keeps the latest Axios 1.x security fixes out of unrelated trees |
| `query-string@7.1.3` → `decode-uri-component` | Decoder 0.5.0 | Preserves WalletConnect's exact query-string API while replacing the vulnerable leaf |
| `ws@^8` | ws 8.21.3 | Does not force WalletConnect's separately maintained ws 7 line across a major boundary |
| `onnxruntime-node@1.24.3` → `adm-zip` | adm-zip 0.6.0 | Preserves Hugging Face's exact ONNX runtime and patches only ZIP extraction |
| `@huggingface/transformers` → Sharp | Sharp 0.35.4 | Intentional out-of-range security override; Node is new enough, build passes, and Sharp is absent from browser output |

The resolved tree retains `query-string@7.1.3`, `onnxruntime-node@1.24.3`, and
`ws@7.5.13` where upstream requires that line. It resolves the patched leaves to
`decode-uri-component@0.5.0`, `adm-zip@0.6.0`, `ws@8.21.3`, Axios 1.20.0, and Sharp 0.35.4.

## Remaining moderate advisory

The remaining npm report is `uuid <11.1.1` under the optional Privy wallet dependency chain:
Privy → x402 → wagmi → connectors → MetaMask. npm's automated force fix proposes downgrading
`@privy-io/react-auth` from 3.38.0 to 3.6.1. That is a breaking product regression, not a safe
security update, so it was rejected. Cherry does not configure wallet login; guest mode is the
default and never downloads the lazy Privy chunk. A live email-code smoke test is still a human
release check, so no stronger auth-runtime claim is made here.

## Upstream install-tree warnings

`npm ls --all` exits non-zero on the clean tree. The errors are in Privy's x402/wagmi/porto peer
layout and optional native-package layout, not in Cherry's direct imports: optional Sharp WASM
packages appear extraneous, while a nested wagmi 3 peer set expects newer TypeScript/wagmi peers
than the parent wagmi 2 tree provides. `npm ci`, typecheck, tests, and build succeed. These warnings
must remain visible until Privy publishes a consistent dependency graph; Cherry does not hide them
with global major-version overrides.

## Python boundary

`scraper/requirements.txt` pins `scrapling[fetchers]==0.4.15` and `markdownify==1.2.3` directly.
There is no hash-locked Python transitive environment. The runner performs a one-time capability
self-check and fails closed when the optional worker is not ready. Reproducible, hash-locked Python
installation remains a release follow-up rather than a completed claim.

## Commands retained as evidence

```text
npm install --package-lock-only
npm ci
npm ls axios query-string decode-uri-component ws onnxruntime-node adm-zip sharp --all
npm audit --omit=dev --audit-level=high
npm run build
npm exec vitest run tests/cherry/auth.test.ts tests/cherry/auth-panel.test.tsx tests/cherry/whisper-format.test.ts
python -m unittest scraper.tests.contract_test
rg -l "onnxruntime-node|adm-zip|sharp\\.node" dist
```

