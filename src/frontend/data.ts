import * as api from './api';
import { state } from './state';
import { cacheGet, cacheSet } from './offline/db';

export async function loadData(): Promise<void> {
  try {
    const [workouts, exercises, prs] = await Promise.all([
      api.getWorkouts(),
      api.getCustomExercises(),
      api.getAllPRs(),
    ]);
    state.history = workouts;
    state.customExercises = exercises;
    state.allPRs = prs;
    // Write-through cache so the next cold start can hydrate offline.
    try {
      await Promise.all([
        cacheSet('workouts', workouts),
        cacheSet('exercises', exercises),
        cacheSet('prs', prs),
      ]);
    } catch (err) {
      console.warn('Failed to update offline cache:', err);
    }
  } catch (error) {
    console.error('Failed to load data:', error);
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
