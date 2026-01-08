# Workout Tracker

A simple workout tracking app for logging exercises, sets, and reps.

**Web**: https://workout.emilycogsdill.com

**Android**: [Download APK](https://github.com/emily-flambe/exercise-tracker-thingy/releases/latest)

## Features

- User accounts with username/password authentication
- Per-user exercise library with customizable exercises
- Log workouts with weight, reps, and notes
- View workout history
- Copy previous workouts as templates

## Tech Stack

- **Backend**: Cloudflare Workers + Hono
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla TypeScript + Tailwind CSS
- **Build**: Vite

## Development

```bash
npm install
npm run dev
```

## Deployment

```bash
npm run deploy
```
