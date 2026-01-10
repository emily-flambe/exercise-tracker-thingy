# Workout Tracker - Claude Code Configuration

## Project Overview

A mobile-first workout tracking web app with an Android companion. Users can log exercises, track sets/reps/weights, and monitor personal records (PRs).

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
    schema.sql       # Database schema (users, workouts, exercises, sets, PRs)
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

## Key Commands

```bash
# Development
npm run dev              # Build frontend + run wrangler dev (remote D1)
npm run build:frontend   # Build frontend with Vite

# Testing
npm test                 # Run unit tests (vitest)
npm run test:e2e         # Run e2e tests against production (playwright)
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

## Architecture Notes

### Authentication
- JWT-based auth stored in localStorage
- Tokens validated via middleware on protected routes
- JWT_SECRET stored in Cloudflare secrets (`.dev.vars` locally)

### Database Schema
Tables: `users`, `custom_exercises`, `workouts`, `workout_exercises`, `sets`, `personal_records`
- Workouts contain exercises (via `workout_exercises`)
- Each exercise has ordered sets
- PRs are detected and recorded when sets beat previous bests at the same weight

### Frontend State
- Single-file app in `src/frontend/app.ts`
- Global `state` object manages current workout, history, and exercises
- Auto-save triggers 1.5s after any change

### API Routes
```
POST /api/auth/login     # Login
POST /api/auth/register  # Register
GET  /api/auth/me        # Get current user

GET/POST        /api/workouts       # List/create workouts
GET/PUT/DELETE  /api/workouts/:id   # Single workout operations

GET/POST        /api/exercises      # List/create exercises
GET/PUT/DELETE  /api/exercises/:id  # Single exercise operations

POST /api/data/clear                # Clear all user data
```

## Testing Strategy

### Unit Tests (Vitest)
- Run with Cloudflare Workers test pool
- Tests in `src/db/queries.test.ts` verify PR detection logic
- Requires wrangler config for D1 bindings

### E2E Tests (Playwright)
- Tests run against production URL by default
- Register unique test users to avoid conflicts
- Test files in `e2e/` directory

## Development Workflow

1. Make changes to source files
2. Run `npm run typecheck` to verify types
3. Run `npm test` to run unit tests
4. For UI changes, manually test with `npm run dev`
5. Run `npm run test:e2e` to verify e2e tests pass
6. Deploy with `npm run deploy`

## Environment Variables

Local development uses `.dev.vars`:
```
JWT_SECRET=your-secret-here
```

## CI/CD

- `.github/workflows/ci-feature.yml` - Runs build check on `claude/**` branches
- `.github/workflows/android.yml` - Android build workflow
- `.github/workflows/migrate-db.yml` - Database migration workflow

## Common Patterns

### Adding a New API Endpoint
1. Define types in `src/types.ts`
2. Add query functions in `src/db/queries.ts`
3. Create route handler in appropriate `src/api/*.ts` file
4. Add route in `src/index.ts`

### Modifying Database Schema
1. Create migration in `migrations/` with incrementing number
2. Run `npm run db:init:remote` to apply to production
3. Update `src/db/schema.sql` to match

### Adding Frontend Features
1. Update types/state in `src/frontend/app.ts`
2. Add API calls in `src/frontend/api.ts`
3. Export new functions to `window.app` object for onclick handlers
