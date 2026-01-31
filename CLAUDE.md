# Workout Tracker - Claude Code Configuration

## Git Worktrees (REQUIRED)

**Always use a worktree for feature work.** Never commit directly to main.

```bash
# Create worktree in parent directory
git fetch origin
git worktree add ../exercise-tracker-<feature-name> -b claude/<feature-name> origin/main

# Work in the worktree
cd ../exercise-tracker-<feature-name>
npm install

# When done, clean up
git worktree remove ../exercise-tracker-<feature-name>
```

Worktree naming: `../exercise-tracker-<descriptive-name>` (e.g., `../exercise-tracker-add-rest-timer`)

## Project Overview

Mobile-first workout tracking web app with Android companion. Users log exercises, track sets/reps/weights, and monitor personal records (PRs).

**Live URL:** https://workout.emilycogsdill.com

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Cloudflare Workers + Hono (TypeScript) |
| Database | Cloudflare D1 (SQLite) |
| Frontend | Vanilla TypeScript + Tailwind CSS |
| Build | Vite |
| Testing | Vitest (unit), Playwright (e2e) |
| Mobile | Capacitor (Android) |

## Key Commands

```bash
# Development
npm run dev              # Build frontend + run wrangler dev (remote D1)
npm run build:frontend   # Build frontend with Vite

# Testing
npm test                 # Run unit tests (vitest)
npm run test:e2e         # Run e2e tests against production
npm run typecheck        # TypeScript type checking

# Database
npm run db:init          # Initialize local D1 database
npm run db:init:remote   # Initialize remote D1 database

# Deployment
npm run deploy           # Build + deploy to Cloudflare Workers

# Android
npm run cap:sync         # Sync web app to Android
npm run cap:open         # Open Android Studio
```

## Project Structure

```
src/
  index.ts           # Hono app entry point, API routes
  types.ts           # Shared TypeScript types
  auth.ts            # JWT token utilities
  api/               # API route handlers
    auth.ts          # Login/register endpoints
    workouts.ts      # Workout CRUD
    exercises.ts     # Custom exercise CRUD
  db/
    schema.sql       # Database schema
    queries.ts       # Database query functions
    queries.test.ts  # Unit tests for DB queries
  frontend/
    app.ts           # Main frontend application logic
    api.ts           # Frontend API client
    index.html       # HTML template
    styles.css       # Tailwind CSS
  middleware/
    auth.ts          # JWT auth middleware
migrations/          # D1 database migrations
e2e/                 # Playwright e2e tests
android/             # Capacitor Android project
```

## Architecture

### Authentication
- JWT-based auth stored in localStorage
- Tokens validated via middleware on protected routes
- JWT_SECRET stored in Cloudflare secrets (`.dev.vars` locally)

### Database Schema
Tables: `users`, `custom_exercises`, `workouts`, `workout_exercises`, `sets`, `personal_records`
- Workouts contain exercises (via `workout_exercises`)
- Each exercise has ordered sets
- PRs detected when sets beat previous bests at same weight

### Frontend State
- Single-file app in `src/frontend/app.ts`
- Global `state` object manages current workout, history, and exercises
- Auto-save triggers 1.5s after any change

### API Routes
```
POST /api/auth/login        # Login
POST /api/auth/register     # Register
GET  /api/auth/me           # Get current user

GET/POST        /api/workouts       # List/create workouts
GET/PUT/DELETE  /api/workouts/:id   # Single workout operations

GET/POST        /api/exercises      # List/create exercises
GET/PUT/DELETE  /api/exercises/:id  # Single exercise operations

POST /api/data/clear                # Clear all user data
```

## Development Workflow

1. Create worktree (see above)
2. Make changes
3. `npm run typecheck` - verify types
4. `npm test` - run unit tests
5. `npm run dev` - manual testing for UI changes
6. `npm run test:e2e` - e2e tests
7. Commit and push
8. Verify CI passes before merging

## Testing Strategy

### Unit Tests (Vitest)
- Run with Cloudflare Workers test pool
- Tests in `src/db/queries.test.ts` verify PR detection logic
- Requires wrangler config for D1 bindings

### E2E Tests (Playwright)
- Tests run against production URL by default
- Register unique test users to avoid conflicts
- Test files in `e2e/` directory

## Environment Variables

Local development uses `.dev.vars`:
```
JWT_SECRET=your-secret-here
```

## CI/CD

### Workflows
- `ci.yml` - Typecheck, unit tests, build, e2e tests on `claude/**` branches
- `ci-feature.yml` - Build check on `claude/**` branches
- `android.yml` - Android build
- `migrate-db.yml` - Database migrations

### CI Requirements
**CI is the source of truth.** Local test results don't matter if CI fails. Always verify CI passes before considering work complete.

- Keep working until all CI checks pass
- If CI fails: read logs with `gh run view <run-id> --log-failed`, fix locally, amend commit, push, verify CI passes
- Don't trust "it works locally" - CI environment may differ

Common CI failures:
- E2E tests with stale element references (re-query elements after re-renders)
- Missing `.dev.vars` file (created automatically by ci.yml)
- Playwright browser installation issues

## Common Patterns

### Adding API Endpoint
1. Define types in `src/types.ts`
2. Add query functions in `src/db/queries.ts`
3. Create route handler in `src/api/*.ts`
4. Add route in `src/index.ts`

### Modifying Database Schema
1. Create migration in `migrations/` with incrementing number
2. Run `npm run db:init:remote` to apply
3. Update `src/db/schema.sql` to match

### Adding Frontend Features
1. Update types/state in `src/frontend/app.ts`
2. Add API calls in `src/frontend/api.ts`
3. Export functions to `window.app` for onclick handlers
