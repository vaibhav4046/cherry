# Workflow

1. Validate that the request matches the skill description.
2. Read the mission, evidence, memory policy, safety policy, originality policy, and acceptance tests.
3. Plan the required artifacts in dependency order.
4. Stop at every declared human gate.
5. Create or modify only the approved artifacts.
6. Run `node scripts/verify.mjs` from the skill directory.
7. Repair blocking or error-level failures and rerun verification.
8. Report remaining warnings and the exact evidence used.
