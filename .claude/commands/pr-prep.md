---
description: Run all checks, stage changes, and generate a commit message
allowed-tools: Bash, Read, Glob, Grep
---

# PR Preparation

Prepare changes for a pull request by running all verification steps and staging changes.

## Instructions

1. Run all verification commands:
   ```bash
   npm run typecheck
   npm test
   npm run build:frontend
   ```

2. If any checks fail, report the failures and stop

3. Show the current git status:
   ```bash
   git status
   ```

4. Show the diff of all changes:
   ```bash
   git diff
   git diff --cached
   ```

5. Based on the changes, generate an appropriate commit message:
   - Summarize the nature of changes (feature, bugfix, refactor, etc.)
   - Focus on "why" not "what"
   - Keep it concise (1-2 sentences)

6. Stage all relevant changes (exclude any unintended files):
   ```bash
   git add -A
   ```

7. Show what will be committed:
   ```bash
   git diff --cached --stat
   ```

8. Provide the suggested commit command but do NOT execute it - let the user review first
