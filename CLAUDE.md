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
| MCP Server | @modelcontextprotocol/sdk + Zod (Node.js, stdio) |

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
  shared/
    schemas.ts       # Zod schemas (API contracts, used by MCP server)
  mcp/
    index.ts         # MCP server entry point (stdio transport)
    client.ts        # HTTP client for workout API
    tsconfig.json    # Node.js target tsconfig for MCP build
    tools/
      workouts.ts    # list, get, log, update workout tools
      exercises.ts   # list exercises tool
      prs.ts         # PR query tools
  middleware/
    auth.ts          # JWT + API key auth middleware
migrations/          # D1 database migrations
e2e/                 # Playwright e2e tests
android/             # Capacitor Android project
.mcp.json            # Claude Code MCP server configuration
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

# MCP Server
npm run build:mcp        # Build MCP server to dist-mcp/

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
- JWT-based auth stored in localStorage (frontend)
- Persistent API keys with `wt_` prefix (machine access, e.g. MCP server)
- Auth middleware accepts both: `wt_` prefix → API key lookup, otherwise → JWT verification
- API keys are SHA-256 hashed before storage; raw key returned only at creation
- Create API keys: `POST /api/auth/api-keys` (JWT-protected, body: `{"name": "..."}`)
- JWT_SECRET stored in Cloudflare secrets (`.dev.vars` locally)

### Database Schema
Tables: `users`, `custom_exercises`, `workouts`, `workout_exercises`, `sets`, `personal_records`, `api_keys`
- Workouts contain exercises (via `workout_exercises`)
- Each exercise has ordered sets
- PRs are detected and recorded when sets beat previous bests at the same weight

### Frontend State
- Single-file app in `src/frontend/app.ts`
- Global `state` object manages current workout, history, and exercises
- Auto-save triggers 1.5s after any change

### API Routes
```
POST /api/auth/login       # Login
POST /api/auth/register    # Register
GET  /api/auth/me          # Get current user
POST /api/auth/api-keys    # Create API key (JWT-protected)

GET/POST        /api/workouts          # List/create workouts
GET/PUT/DELETE  /api/workouts/:id      # Single workout operations
GET             /api/workouts/prs/all  # All personal records
GET             /api/workouts/prs/:name # PRs for specific exercise

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

### Workflows
- `.github/workflows/ci-feature.yml` - Runs build check on `claude/**` branches
- `.github/workflows/ci.yml` - Runs typecheck, unit tests, build, and e2e tests on `claude/**` branches
- `.github/workflows/android.yml` - Android build workflow
- `.github/workflows/migrate-db.yml` - Database migration workflow

### CI Monitoring Requirements
**CRITICAL:** Always verify CI passes before considering work complete:

1. **After pushing changes**, immediately check that all CI workflows pass
2. **Before amending commits**, ensure previous CI run completed successfully
3. **For e2e test changes**, verify tests pass in CI environment (not just locally)
4. **Common CI failures:**
   - E2E tests with stale element references (re-query elements after re-renders)
   - Missing `.dev.vars` file (created automatically by ci.yml)
   - Database not initialized (done by ci.yml)
   - Playwright browser installation issues (handled by ci.yml)

5. **If CI fails:**
   - Read the error logs carefully
   - Fix the issue locally
   - Amend the commit (don't create new commits for CI fixes)
   - Push again and verify CI passes

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

## MCP Server

An MCP (Model Context Protocol) server allows Claude Code to interact with the workout API natively — listing workouts, logging new ones, checking PRs — without manual curl commands.

### Architecture
```
Claude Code ◄──stdio──► MCP Server (Node.js) ──HTTPS──► Workout API (CF Workers)
```

- **Transport:** stdio (local process, zero-config)
- **Auth:** Persistent API key (`wt_` prefix), read from `WORKOUT_API_KEY` env var
- **Schemas:** Shared Zod schemas in `src/shared/schemas.ts` used for MCP input validation

### Available Tools

| Tool | Description |
|------|-------------|
| `list_exercises` | List all exercises with type, category, unit |
| `list_workouts` | List workout history (newest first) |
| `get_workout` | Get a specific workout with full details |
| `log_workout` | Log a new workout with exercises and sets |
| `update_workout` | Update an existing workout |
| `get_all_prs` | Get all personal records |
| `get_exercise_prs` | Get PRs for a specific exercise |

### Setup
1. Set env var: `export WORKOUT_API_KEY="wt_..."` (in shell profile)
2. Build: `npm run build:mcp`
3. Config is in `.mcp.json` (auto-loaded by Claude Code)
4. Restart Claude Code to pick up the MCP server

### Generating a New API Key
```bash
# Login to get JWT
TOKEN=$(curl -s https://workout.emilycogsdill.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"...","password":"..."}' | jq -r .token)

# Create API key
curl -s https://workout.emilycogsdill.com/api/auth/api-keys \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"claude-code"}'
```

### Development
- MCP source: `src/mcp/` (separate tsconfig targeting Node.js)
- Shared schemas: `src/shared/schemas.ts` (Zod, used by MCP for validation)
- Main app tsconfig excludes `src/mcp/` — the MCP server has its own build
- Build output: `dist-mcp/` (gitignored)
- **Never use `console.log` in MCP server code** — stdout is the JSON-RPC channel; use `console.error` instead
