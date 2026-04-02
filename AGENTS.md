# Agent Instructions

This file defines the minimum required rules for automated coding agents.
`CLAUDE.md` contains full project context and detailed procedures.
If there is a conflict, follow the stricter rule.

## Non-Negotiable Rules

- Do all implementation work in a dedicated git worktree; never work directly in the primary checkout.
- Every feature and bug fix must include test coverage.
- Run `npm run typecheck`, `npm test`, and `npm run test:e2e` before finalizing changes.
- Use non-destructive git commands only (no force push, no hard reset, no destructive checkout).
- All changes must go through a pull request; do not push directly to `main`.
- CI is the source of truth; if local and CI results differ, follow CI and fix until it passes.
- YOUR WORK IS NOT DONE AND YOU MUST NOT STOP UNTIL THE PR IS MERGED.

## Worktree Bootstrap (REQUIRED)

- Create a new worktree from `origin/main` with a unique branch name before editing.
- In the new worktree, run `npm install` before any checks.
- Run `npm run build:frontend` once in a fresh worktree before `npm test` (Vitest expects `dist/` to exist).
- If a previous worktree path was removed manually, run `git worktree prune` before creating a new one.

## API and Data Operations (MANDATORY)

- Prefer API-driven workflows for functional verification; avoid manual database edits unless the task explicitly requires a migration or targeted repair.
- For schema changes, add a new migration in `migrations/` and keep `src/db/schema.sql` in sync.
- Keep API contracts and shared schemas aligned (`src/types.ts`, `src/shared/schemas.ts`, route handlers, and DB queries).

### Required Auth for Non-Interactive Flows

Wrangler and protected API operations require the appropriate credentials.

```powershell
$env:CLOUDFLARE_API_TOKEN="<token>"
```

For machine/API key access, use the app's `wt_` API keys where required.

## Reference

- Read `CLAUDE.md` before substantial changes for architecture, testing matrix, deployment, and workflow details.
