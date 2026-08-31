# Task 3 report — state-aware WebMCP aperture and host evidence

## Delivered

- Hardened the WebMCP contract with explicit side-effect metadata (`none`, `write`, `execute`, `export`) and approval metadata.
- Added the canonical `export_workspace` tool to the passed/verification aperture; it returns only bounded archive metadata and never uploads data.
- Added UTF-8 byte-aware output capping (8 KiB hard ceiling) and bounded secret redaction for text and structured errors.
- Added strict origin allowlist and versioned `cherry-webmcp` postMessage envelope validators.
- Registration status now exposes safe, user-visible diagnostics for unsupported hosts and per-tool registration failures without echoing thrown payloads.
- Registered closures re-check the current state/surface aperture at invocation time, so an aborted or non-compliant host cannot invoke a retired tool after a transition.
- Closures also bind the active workspace/mission IDs at registration; ID changes trigger re-registration and stale local/host calls return structured conflicts.
- Capabilities expose canonical safe-sequence aliases for legacy names (`record_observation`, `derive_skill`, `request_skill_approval`, `propose_memory`, `run_verification`).
- WebMCP registration now exposes those canonical names in the host aperture; legacy names remain executable through the local/bridge path.
- Inspector metadata reports each registered tool's allowed product states and owning route surface.
- Mutation wrappers continue to call the shared app refresh callback; active-selection callbacks remain domain-owned through `ToolContext`.
- Preserved the bounded global + five-tool surface behavior and the human-only approval boundary.
- Route apertures now intersect product state: inbox/crew require a workspace, routines open from planning, and run controls open from learning; globals remain available in empty state.

## Tests

- `npm test -- --run tests/cherry/webmcp.test.ts` — 28 passed.
- `npx playwright test e2e/cherry/showcase-host.spec.ts --grep "clear storage"` — 1 passed (full spec was green before the extension; rerun full spec in the final gate).
- `npm run typecheck` — passed.
- Post-review route/state intersection and active-identity retirement checks — passed in the focused WebMCP suite.

The host journey still drives the registered closures through create → lesson → evidence → skill → approval request, then stops at the visible human approval checkpoint. No protocol tool approves a skill, memory, or routine.

## Notes

The workforce route apertures remain independently selectable where their product state allows them; the explicit state allowlist is intersected with the selected route, while domain services still enforce workspace and approval state. The closure-level check is authoritative even when a host ignores `AbortSignal`.
