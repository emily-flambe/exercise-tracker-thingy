---
description: Pull and fix a GitHub issue by number
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, TodoWrite
---

# Fix GitHub Issue

Fix issue #$ARGUMENTS from the exercise-tracker-thingy repository.

## Instructions

1. Fetch the issue details using the GitHub CLI:
   ```bash
   gh issue view $ARGUMENTS --repo emily-flambe/exercise-tracker-thingy
   ```

2. Analyze the issue and create a todo list to track the fix

3. Implement the fix following project conventions:
   - Run `npm run typecheck` after changes
   - Run `npm test` to verify unit tests pass
   - Test UI changes manually if needed

4. Verify the fix:
   - Ensure all tests pass
   - Run `npm run test:e2e` if the fix involves user-facing changes

5. Summarize what was changed and how it addresses the issue
