---
description: Run full verification suite (typecheck, unit tests, build)
allowed-tools: Bash
---

# Full Verification

Run all verification commands to ensure the codebase is in a healthy state.

## Instructions

Run each verification step and report results:

1. TypeScript type checking:
   ```bash
   npm run typecheck
   ```

2. Unit tests:
   ```bash
   npm test
   ```

3. Frontend build:
   ```bash
   npm run build:frontend
   ```

4. Report summary:
   - All checks passed: Ready to commit/deploy
   - Any failures: List what failed and suggest fixes
