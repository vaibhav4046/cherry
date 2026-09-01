## Outcome

What changed for the user, and which issue or ticket does it close?

## Evidence

- [ ] A regression or contract test failed before the implementation.
- [ ] `npm run gates` passes.
- [ ] `npm run verify:all` passes when this touches UI, release, security, or multiple layers.
- [ ] Scraper contracts pass when fetch boundaries changed.

Paste concise gate counts or link the captured evidence.

## Claims

List every user-facing or release claim changed by this pull request and the exact test, receipt, or
capture that supports it. Write “none” if no claim changed.

## Trust and release checklist

- [ ] External content remains untrusted data.
- [ ] Approval, trust, and memory decisions remain human-only.
- [ ] No secret, private material, hidden network work, or new origin is included.
- [ ] Package and lockfile changed together if dependencies changed.
- [ ] The change stayed inside its owner lane or the handoff is recorded.
- [ ] This pull request does not claim deployment; the release manager deploys.
