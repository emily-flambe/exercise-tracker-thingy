---
description: Run tests for a specific file or pattern
allowed-tools: Bash, Read, Glob
---

# Run Tests for File

Run tests related to the specified file or pattern: $ARGUMENTS

## Instructions

1. Determine the type of test to run based on the file:
   - If the file is in `src/` and has a corresponding `.test.ts` file, run vitest for that file
   - If the file is in `e2e/`, run playwright for that test file
   - If the file is in `src/frontend/`, suggest running both unit tests and relevant e2e tests

2. For unit tests (files in `src/`):
   ```bash
   npm test -- --reporter=verbose $ARGUMENTS
   ```

3. For e2e tests (files in `e2e/`):
   ```bash
   npm run test:e2e -- $ARGUMENTS
   ```

4. Report the test results clearly:
   - Number of tests passed/failed
   - Any error messages or stack traces
   - Suggestions for fixing failures

5. If no test file matches the pattern, search for related tests:
   - Look for tests that import or reference the changed file
   - Suggest which tests might be relevant
