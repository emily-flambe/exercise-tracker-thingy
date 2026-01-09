import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { createUser, createWorkout, getWorkout } from './queries';
import type { CreateWorkoutRequest } from '../types';

describe('PR Detection', () => {
  let userId: string;
  const testUsername = 'testuser_pr';
  const testPasswordHash = 'hash123';

  beforeEach(async () => {
    // Clean up any existing test data
    await env.DB.prepare('DELETE FROM users WHERE username = ?').bind(testUsername).run();

    // Create a test user
    const user = await createUser(env.DB, testUsername, testPasswordHash);
    userId = user.id;
  });

  it('should mark first set at a weight as PR when it beats previous best', async () => {
    // First workout: 100 lbs × 8 reps
    const workout1: CreateWorkoutRequest = {
      startTime: Date.now() - 86400000, // 1 day ago
      endTime: Date.now() - 86400000 + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 8 }
          ]
        }
      ]
    };
    await createWorkout(env.DB, userId, workout1);

    // Second workout: 100 lbs × 10 reps (beats previous 8)
    const workout2: CreateWorkoutRequest = {
      startTime: Date.now(),
      endTime: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 10 }
          ]
        }
      ]
    };
    const result = await createWorkout(env.DB, userId, workout2);

    // The set should be marked as a PR
    expect(result.exercises[0].sets[0].isPR).toBe(true);
  });

  it('should mark second set at same weight as PR when it has more reps than first set', async () => {
    // Workout with two sets at same weight, second has more reps
    const workout: CreateWorkoutRequest = {
      startTime: Date.now(),
      endTime: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 10 },
            { weight: 100, reps: 12 }  // More reps than first set
          ]
        }
      ]
    };
    const result = await createWorkout(env.DB, userId, workout);

    // Both sets should be PRs
    expect(result.exercises[0].sets[0].isPR).toBe(true);
    expect(result.exercises[0].sets[1].isPR).toBe(true);
  });

  it('should NOT mark second set as PR when it has same reps as first set', async () => {
    // Workout with two sets at same weight and same reps
    const workout: CreateWorkoutRequest = {
      startTime: Date.now(),
      endTime: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 10 },
            { weight: 100, reps: 10 }  // Same reps as first set
          ]
        }
      ]
    };
    const result = await createWorkout(env.DB, userId, workout);

    // First set should be PR, second should NOT
    expect(result.exercises[0].sets[0].isPR).toBe(true);
    expect(result.exercises[0].sets[1].isPR).toBe(false);
  });

  it('should NOT mark second set as PR when it has fewer reps than first set', async () => {
    // Workout with two sets at same weight, second has fewer reps
    const workout: CreateWorkoutRequest = {
      startTime: Date.now(),
      endTime: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 12 },
            { weight: 100, reps: 10 }  // Fewer reps than first set
          ]
        }
      ]
    };
    const result = await createWorkout(env.DB, userId, workout);

    // First set should be PR, second should NOT
    expect(result.exercises[0].sets[0].isPR).toBe(true);
    expect(result.exercises[0].sets[1].isPR).toBe(false);
  });

  it('should handle multiple PRs at same weight across multiple sets', async () => {
    // Workout with progressive PRs: 10 → 11 → 12 → 11
    const workout: CreateWorkoutRequest = {
      startTime: Date.now(),
      endTime: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 10 },  // PR
            { weight: 100, reps: 11 },  // PR (beats previous)
            { weight: 100, reps: 12 },  // PR (beats previous)
            { weight: 100, reps: 11 }   // NOT PR (less than 12)
          ]
        }
      ]
    };
    const result = await createWorkout(env.DB, userId, workout);

    // First three sets should be PRs, fourth should NOT
    expect(result.exercises[0].sets[0].isPR).toBe(true);
    expect(result.exercises[0].sets[1].isPR).toBe(true);
    expect(result.exercises[0].sets[2].isPR).toBe(true);
    expect(result.exercises[0].sets[3].isPR).toBe(false);
  });

  it('should consider both previous workouts and current workout when detecting PRs', async () => {
    // First workout: 100 lbs × 8 reps
    const workout1: CreateWorkoutRequest = {
      startTime: Date.now() - 86400000, // 1 day ago
      endTime: Date.now() - 86400000 + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 8 }
          ]
        }
      ]
    };
    await createWorkout(env.DB, userId, workout1);

    // Second workout: 100 lbs × 9 reps, then 10 reps
    const workout2: CreateWorkoutRequest = {
      startTime: Date.now(),
      endTime: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 9 },   // PR (beats previous workout's 8)
            { weight: 100, reps: 10 }   // PR (beats the 9 from this workout)
          ]
        }
      ]
    };
    const result = await createWorkout(env.DB, userId, workout2);

    // Both sets should be PRs
    expect(result.exercises[0].sets[0].isPR).toBe(true);
    expect(result.exercises[0].sets[1].isPR).toBe(true);
  });

  it('should track PRs independently for different exercises', async () => {
    // Workout with two different exercises, same weight/reps patterns
    const workout: CreateWorkoutRequest = {
      startTime: Date.now(),
      endTime: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 10 },
            { weight: 100, reps: 10 }  // Should NOT be PR (same as first)
          ]
        },
        {
          name: 'Squat',
          sets: [
            { weight: 100, reps: 10 },  // Should be PR (first time for Squat)
            { weight: 100, reps: 10 }   // Should NOT be PR (same as first)
          ]
        }
      ]
    };
    const result = await createWorkout(env.DB, userId, workout);

    // First set of each exercise should be PR, second should NOT
    expect(result.exercises[0].sets[0].isPR).toBe(true);
    expect(result.exercises[0].sets[1].isPR).toBe(false);
    expect(result.exercises[1].sets[0].isPR).toBe(true);
    expect(result.exercises[1].sets[1].isPR).toBe(false);
  });
});
