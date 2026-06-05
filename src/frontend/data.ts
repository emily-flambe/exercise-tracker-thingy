import * as api from './api';
import { state } from './state';
import { cacheGet, cacheSet } from './offline/db';

// Loads workouts/exercises/PRs into state and write-through caches them.
//
// THROWS on failure (network error, or a fetch aborted by its timeout on a slow
// connection). Callers MUST handle the rejection — historically this swallowed
// errors and returned void, which meant a timed-out load silently left stale
// state on screen (e.g. the newest month's workouts never appeared because the
// big /workouts payload aborted before it arrived). Surfacing the error lets the
// caller show a retry affordance instead of pretending the load succeeded.
export async function loadData(): Promise<void> {
  const [workouts, exercises, prs] = await Promise.all([
    api.getWorkouts(),
    api.getCustomExercises(),
    api.getAllPRs(),
  ]);
  state.history = workouts;
  state.customExercises = exercises;
  state.allPRs = prs;
  // Write-through cache so the next cold start can hydrate offline. Best-effort:
  // a cache write failure must not fail the load itself.
  try {
    await Promise.all([
      cacheSet('workouts', workouts),
      cacheSet('exercises', exercises),
      cacheSet('prs', prs),
    ]);
  } catch (err) {
    console.warn('Failed to update offline cache:', err);
  }
}

// Cache-first startup hydration. Returns true if any cached data was loaded.
export async function hydrateFromCache(): Promise<boolean> {
  try {
    const [workouts, exercises, prs] = await Promise.all([
      cacheGet<typeof state.history>('workouts'),
      cacheGet<typeof state.customExercises>('exercises'),
      cacheGet<typeof state.allPRs>('prs'),
    ]);
    let loaded = false;
    if (workouts) {
      state.history = workouts;
      loaded = true;
    }
    if (exercises) {
      state.customExercises = exercises;
      loaded = true;
    }
    if (prs) {
      state.allPRs = prs;
      loaded = true;
    }
    return loaded;
  } catch (err) {
    console.warn('Failed to hydrate from offline cache:', err);
    return false;
  }
}
