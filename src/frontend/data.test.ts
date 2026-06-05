// Tests for loadData()'s failure contract. The api and offline/db modules are
// mocked so these run in the Cloudflare Workers test pool with no real network
// or IndexedDB.
//
// Regression guard: loadData() used to swallow fetch errors and return void,
// which meant a slow-network fetch aborted by its timeout silently left stale
// data on screen (the newest month's workouts never appeared). loadData() now
// THROWS on failure so callers can surface a retry affordance.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const api = {
  getWorkouts: vi.fn(),
  getCustomExercises: vi.fn(),
  getAllPRs: vi.fn(),
};
vi.mock('./api', () => ({
  getWorkouts: (...a: unknown[]) => api.getWorkouts(...a),
  getCustomExercises: (...a: unknown[]) => api.getCustomExercises(...a),
  getAllPRs: (...a: unknown[]) => api.getAllPRs(...a),
}));

const cache: { sets: Record<string, unknown> } = { sets: {} };
vi.mock('./offline/db', () => ({
  cacheGet: async (k: string) => cache.sets[k],
  cacheSet: async (k: string, v: unknown) => {
    cache.sets[k] = v;
  },
}));

import { loadData } from './data';
import { state } from './state';

beforeEach(() => {
  api.getWorkouts.mockReset();
  api.getCustomExercises.mockReset();
  api.getAllPRs.mockReset();
  cache.sets = {};
  state.history = [];
  state.customExercises = [];
  state.allPRs = [];
});

describe('loadData', () => {
  it('populates state and write-through caches on success', async () => {
    const workouts = [{ id: 'w1', start_time: 1, exercises: [] }];
    const exercises = [{ id: 'e1', name: 'Bench' }];
    const prs = [{ exercise_name: 'Bench' }];
    api.getWorkouts.mockResolvedValue(workouts);
    api.getCustomExercises.mockResolvedValue(exercises);
    api.getAllPRs.mockResolvedValue(prs);

    await loadData();

    expect(state.history).toEqual(workouts);
    expect(state.customExercises).toEqual(exercises);
    expect(state.allPRs).toEqual(prs);
    expect(cache.sets.workouts).toEqual(workouts);
  });

  it('THROWS when the workouts fetch fails (e.g. aborted by timeout)', async () => {
    api.getWorkouts.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    api.getCustomExercises.mockResolvedValue([]);
    api.getAllPRs.mockResolvedValue([]);

    await expect(loadData()).rejects.toThrow();
  });

  it('does not clobber existing state when the load fails', async () => {
    const existing = [{ id: 'cached', start_time: 1, exercises: [] }];
    state.history = existing as typeof state.history;
    api.getWorkouts.mockRejectedValue(new Error('network down'));
    api.getCustomExercises.mockResolvedValue([]);
    api.getAllPRs.mockResolvedValue([]);

    await expect(loadData()).rejects.toThrow();
    // Stale-but-present data is preferable to wiped state on a failed refresh.
    expect(state.history).toEqual(existing);
  });
});
