import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  createUser,
  createWorkout,
  getWorkout,
  updateWorkout,
  createCustomExercise,
  updateCustomExercise,
  getAllCustomExercises,
  getPRsForExercise,
  type UpdateWorkoutResult
} from './queries';
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
      start_time: Date.now() - 86400000, // 1 day ago
      end_time: Date.now() - 86400000 + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 8, completed: true }
          ]
        }
      ]
    };
    await createWorkout(env.DB, userId, workout1);

    // Second workout: 100 lbs × 10 reps (beats previous 8)
    const workout2: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 10, completed: true }
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
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 10, completed: true },
            { weight: 100, reps: 12, completed: true }  // More reps than first set
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
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 10, completed: true },
            { weight: 100, reps: 10, completed: true }  // Same reps as first set
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
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 12, completed: true },
            { weight: 100, reps: 10, completed: true }  // Fewer reps than first set
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
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 10, completed: true },  // PR
            { weight: 100, reps: 11, completed: true },  // PR (beats previous)
            { weight: 100, reps: 12, completed: true },  // PR (beats previous)
            { weight: 100, reps: 11, completed: true }   // NOT PR (less than 12)
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
      start_time: Date.now() - 86400000, // 1 day ago
      end_time: Date.now() - 86400000 + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 8, completed: true }
          ]
        }
      ]
    };
    await createWorkout(env.DB, userId, workout1);

    // Second workout: 100 lbs × 9 reps, then 10 reps
    const workout2: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 9, completed: true },   // PR (beats previous workout's 8)
            { weight: 100, reps: 10, completed: true }   // PR (beats the 9 from this workout)
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
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 10, completed: true },
            { weight: 100, reps: 10, completed: true }  // Should NOT be PR (same as first)
          ]
        },
        {
          name: 'Squat',
          sets: [
            { weight: 100, reps: 10, completed: true },  // Should be PR (first time for Squat)
            { weight: 100, reps: 10, completed: true }   // Should NOT be PR (same as first)
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

  it('should NOT mark missed sets as PRs', async () => {
    // First workout with completed set
    const workout1: CreateWorkoutRequest = {
      start_time: Date.now() - 86400000, // 1 day ago
      end_time: Date.now() - 86400000 + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 8, completed: true }
          ]
        }
      ]
    };
    await createWorkout(env.DB, userId, workout1);

    // Second workout with missed set that would beat previous PR
    const workout2: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 12, missed: true }  // Would be PR if not missed
          ]
        }
      ]
    };
    const result = await createWorkout(env.DB, userId, workout2);

    // Set should NOT be marked as PR because it's missed
    expect(result.exercises[0].sets[0].isPR).toBe(false);
  });

  it('should ignore missed sets when comparing against previous workouts', async () => {
    // First workout with one normal set and one missed set
    const workout1: CreateWorkoutRequest = {
      start_time: Date.now() - 86400000, // 1 day ago
      end_time: Date.now() - 86400000 + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 8 },
            { weight: 100, reps: 12, missed: true }  // Higher reps but missed
          ]
        }
      ]
    };
    await createWorkout(env.DB, userId, workout1);

    // Second workout with 10 reps (more than non-missed 8, but less than missed 12)
    const workout2: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
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

    // Should be PR because it beats the non-missed 8 (ignore missed 12)
    expect(result.exercises[0].sets[0].isPR).toBe(true);
  });

  it('should count sets without completed flag toward PRs', async () => {
    // First workout without completed flag (how sets are normally logged)
    const workout1: CreateWorkoutRequest = {
      start_time: Date.now() - 86400000, // 1 day ago
      end_time: Date.now() - 86400000 + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 8 }  // No completed flag
          ]
        }
      ]
    };
    await createWorkout(env.DB, userId, workout1);

    // Second workout with same reps - should NOT be PR
    const workout2: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 100, reps: 8 }  // Same reps as previous
          ]
        }
      ]
    };
    const result = await createWorkout(env.DB, userId, workout2);

    // Should NOT be PR - previous set at same weight/reps counts
    expect(result.exercises[0].sets[0].isPR).toBe(false);
  });
});

describe('Exercise Rename Synchronization', () => {
  let userId: string;
  const testUsername = 'testuser_rename';
  const testPasswordHash = 'hash123';

  beforeEach(async () => {
    // Clean up any existing test data
    await env.DB.prepare('DELETE FROM users WHERE username = ?').bind(testUsername).run();

    // Create a test user
    const user = await createUser(env.DB, testUsername, testPasswordHash);
    userId = user.id;
  });

  it('should update workout_exercises when exercise is renamed', async () => {
    // Create a custom exercise
    const exercise = await createCustomExercise(env.DB, userId, {
      name: 'Old Exercise Name',
      type: 'total',
      category: 'Chest',
      muscle_group: 'Upper',
      unit: 'lbs'
    });

    // Create a workout using this exercise
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Old Exercise Name',
          sets: [
            { weight: 100, reps: 10, completed: true }
          ]
        }
      ]
    };
    const createdWorkout = await createWorkout(env.DB, userId, workout);

    // Verify workout uses old name
    expect(createdWorkout.exercises[0].name).toBe('Old Exercise Name');

    // Rename the exercise
    await updateCustomExercise(env.DB, exercise.id, userId, {
      name: 'New Exercise Name',
      type: 'total',
      category: 'Chest',
      muscle_group: 'Upper',
      unit: 'lbs'
    });

    // Fetch the workout again
    const updatedWorkout = await getWorkout(env.DB, createdWorkout.id, userId);

    // Verify workout now uses new name
    expect(updatedWorkout?.exercises[0].name).toBe('New Exercise Name');
  });

  it('should update personal_records when exercise is renamed', async () => {
    // Create a custom exercise
    const exercise = await createCustomExercise(env.DB, userId, {
      name: 'Press Exercise',
      type: 'total',
      category: 'Shoulders',
      muscle_group: 'Upper',
      unit: 'lbs'
    });

    // Create a workout with a PR
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Press Exercise',
          sets: [
            { weight: 100, reps: 10, completed: true }
          ]
        }
      ]
    };
    await createWorkout(env.DB, userId, workout);

    // Verify PR exists with old name
    const oldPRs = await getPRsForExercise(env.DB, userId, 'Press Exercise');
    expect(oldPRs.length).toBe(1);
    expect(oldPRs[0].exercise_name).toBe('Press Exercise');

    // Rename the exercise
    await updateCustomExercise(env.DB, exercise.id, userId, {
      name: 'Renamed Press',
      type: 'total',
      category: 'Shoulders',
      muscle_group: 'Upper',
      unit: 'lbs'
    });

    // Verify PR now uses new name
    const newPRs = await getPRsForExercise(env.DB, userId, 'Renamed Press');
    expect(newPRs.length).toBe(1);
    expect(newPRs[0].exercise_name).toBe('Renamed Press');

    // Verify old name has no PRs
    const oldNamePRs = await getPRsForExercise(env.DB, userId, 'Press Exercise');
    expect(oldNamePRs.length).toBe(0);
  });

  it('should update multiple workouts when exercise is renamed', async () => {
    // Create a custom exercise
    const exercise = await createCustomExercise(env.DB, userId, {
      name: 'Multi Workout Exercise',
      type: 'total',
      category: 'Back',
      muscle_group: 'Upper',
      unit: 'lbs'
    });

    // Create multiple workouts using this exercise
    const workout1: CreateWorkoutRequest = {
      start_time: Date.now() - 86400000,
      end_time: Date.now() - 86400000 + 3600000,
      exercises: [
        {
          name: 'Multi Workout Exercise',
          sets: [{ weight: 100, reps: 8, completed: true }]
        }
      ]
    };
    const workout2: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Multi Workout Exercise',
          sets: [{ weight: 100, reps: 10, completed: true }]
        }
      ]
    };

    const created1 = await createWorkout(env.DB, userId, workout1);
    const created2 = await createWorkout(env.DB, userId, workout2);

    // Rename the exercise
    await updateCustomExercise(env.DB, exercise.id, userId, {
      name: 'Renamed Multi',
      type: 'total',
      category: 'Back',
      muscle_group: 'Upper',
      unit: 'lbs'
    });

    // Verify both workouts now use new name
    const updated1 = await getWorkout(env.DB, created1.id, userId);
    const updated2 = await getWorkout(env.DB, created2.id, userId);

    expect(updated1?.exercises[0].name).toBe('Renamed Multi');
    expect(updated2?.exercises[0].name).toBe('Renamed Multi');
  });

  it('should not update workout_exercises when only type/category/unit changes', async () => {
    // Create a custom exercise
    const exercise = await createCustomExercise(env.DB, userId, {
      name: 'Consistent Name',
      type: 'total',
      category: 'Chest',
      muscle_group: 'Upper',
      unit: 'lbs'
    });

    // Create a workout
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Consistent Name',
          sets: [{ weight: 100, reps: 10, completed: true }]
        }
      ]
    };
    const createdWorkout = await createWorkout(env.DB, userId, workout);

    // Update only type, category, and unit (not name)
    await updateCustomExercise(env.DB, exercise.id, userId, {
      name: 'Consistent Name',
      type: '+bar',
      category: 'Shoulders',
      muscle_group: 'Upper',
      unit: 'kg'
    });

    // Verify workout still has same name
    const updatedWorkout = await getWorkout(env.DB, createdWorkout.id, userId);
    expect(updatedWorkout?.exercises[0].name).toBe('Consistent Name');
  });

  it('should only update exercises for the specific user when renamed', async () => {
    // Create second user
    const user2 = await createUser(env.DB, 'testuser_rename2', 'hash456');

    // Both users create exercise with same name
    const exercise1 = await createCustomExercise(env.DB, userId, {
      name: 'Shared Name',
      type: 'total',
      category: 'Chest',
      muscle_group: 'Upper',
      unit: 'lbs'
    });

    const exercise2 = await createCustomExercise(env.DB, user2.id, {
      name: 'Shared Name',
      type: 'total',
      category: 'Back',
      muscle_group: 'Upper',
      unit: 'kg'
    });

    // Both users create workouts
    const workout1: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Shared Name',
          sets: [{ weight: 100, reps: 10, completed: true }]
        }
      ]
    };

    const created1 = await createWorkout(env.DB, userId, workout1);
    const created2 = await createWorkout(env.DB, user2.id, workout1);

    // User 1 renames their exercise
    await updateCustomExercise(env.DB, exercise1.id, userId, {
      name: 'User1 Renamed',
      type: 'total',
      category: 'Chest',
      muscle_group: 'Upper',
      unit: 'lbs'
    });

    // Verify user 1's workout is updated
    const updated1 = await getWorkout(env.DB, created1.id, userId);
    expect(updated1?.exercises[0].name).toBe('User1 Renamed');

    // Verify user 2's workout is NOT updated
    const updated2 = await getWorkout(env.DB, created2.id, user2.id);
    expect(updated2?.exercises[0].name).toBe('Shared Name');
  });
});

describe('Exercise Notes', () => {
  let userId: string;
  const testUsername = 'testuser_notes';
  const testPasswordHash = 'hash123';

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM users WHERE username = ?').bind(testUsername).run();
    const user = await createUser(env.DB, testUsername, testPasswordHash);
    userId = user.id;
  });

  it('should persist notes through createWorkout and return them in getWorkout', async () => {
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          notes: 'Felt strong today, good form on all reps',
          sets: [
            { weight: 135, reps: 10, completed: true }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);

    expect(created.exercises[0].notes).toBe('Felt strong today, good form on all reps');

    // Also verify via a fresh getWorkout call (not the returned object)
    const fetched = await getWorkout(env.DB, created.id, userId);
    expect(fetched).not.toBeNull();
    expect(fetched!.exercises[0].notes).toBe('Felt strong today, good form on all reps');
  });

  it('should handle exercises without notes (undefined)', async () => {
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Squat',
          sets: [
            { weight: 225, reps: 5, completed: true }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);

    // notes should be undefined, not null
    expect(created.exercises[0].notes).toBeUndefined();

    const fetched = await getWorkout(env.DB, created.id, userId);
    expect(fetched!.exercises[0].notes).toBeUndefined();
  });

  it('should handle exercises with explicitly null notes', async () => {
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Deadlift',
          notes: undefined,
          sets: [
            { weight: 315, reps: 3, completed: true }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);

    // Should come back as undefined (not null) in the API response
    expect(created.exercises[0].notes).toBeUndefined();
  });

  it('should preserve notes through updateWorkout', async () => {
    // Create workout with notes
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          notes: 'Original note',
          sets: [
            { weight: 135, reps: 10, completed: true }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);
    expect(created.exercises[0].notes).toBe('Original note');

    // Update workout - change the note
    const updateData: CreateWorkoutRequest = {
      start_time: created.start_time,
      end_time: created.end_time,
      exercises: [
        {
          name: 'Bench Press',
          notes: 'Updated note after review',
          sets: [
            { weight: 135, reps: 10, completed: true },
            { weight: 155, reps: 8, completed: true }
          ]
        }
      ]
    };
    const result = await updateWorkout(env.DB, created.id, userId, updateData);

    expect(result.status).toBe('success');
    const updated = (result as Extract<UpdateWorkoutResult, { status: 'success' }>).workout;
    expect(updated.exercises[0].notes).toBe('Updated note after review');

    // Verify with fresh fetch
    const fetched = await getWorkout(env.DB, created.id, userId);
    expect(fetched!.exercises[0].notes).toBe('Updated note after review');
  });

  it('should allow removing notes via updateWorkout (set to undefined)', async () => {
    // Create workout with notes
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          notes: 'Will remove this',
          sets: [
            { weight: 135, reps: 10, completed: true }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);
    expect(created.exercises[0].notes).toBe('Will remove this');

    // Update workout - remove note by omitting it
    const updateData: CreateWorkoutRequest = {
      start_time: created.start_time,
      end_time: created.end_time,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 135, reps: 10, completed: true }
          ]
        }
      ]
    };
    const result = await updateWorkout(env.DB, created.id, userId, updateData);

    expect(result.status).toBe('success');
    const updated = (result as Extract<UpdateWorkoutResult, { status: 'success' }>).workout;
    expect(updated.exercises[0].notes).toBeUndefined();
  });

  it('should handle notes on multiple exercises independently', async () => {
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          notes: 'Chest day main lift',
          sets: [
            { weight: 135, reps: 10, completed: true }
          ]
        },
        {
          name: 'Incline DB Press',
          sets: [
            { weight: 50, reps: 12, completed: true }
          ]
        },
        {
          name: 'Cable Fly',
          notes: 'Squeeze at the top',
          sets: [
            { weight: 30, reps: 15, completed: true }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);

    expect(created.exercises[0].notes).toBe('Chest day main lift');
    expect(created.exercises[1].notes).toBeUndefined();
    expect(created.exercises[2].notes).toBe('Squeeze at the top');
  });

  it('should handle empty string notes', async () => {
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          notes: '',
          sets: [
            { weight: 135, reps: 10, completed: true }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);

    // Empty string should be stored and returned (not converted to undefined)
    // This tests whether the implementation treats '' differently from null/undefined
    const fetched = await getWorkout(env.DB, created.id, userId);
    // Empty string is falsy but not null, so it depends on the ?? operator behavior
    // '' ?? undefined === '' (nullish coalescing does NOT trigger on empty string)
    expect(fetched!.exercises[0].notes).toBe('');
  });

  it('should handle very long notes', async () => {
    const longNote = 'A'.repeat(5000);
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          notes: longNote,
          sets: [
            { weight: 135, reps: 10, completed: true }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);

    expect(created.exercises[0].notes).toBe(longNote);

    const fetched = await getWorkout(env.DB, created.id, userId);
    expect(fetched!.exercises[0].notes).toBe(longNote);
  });

  it('should handle notes with special characters', async () => {
    const specialNote = "Used Smith machine. Weight doesn't include bar.\nForm: 3-1-2 tempo.\tRest: 90s.\n\"PR attempt\" — failed at lockout (≥90% 1RM)";
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          notes: specialNote,
          sets: [
            { weight: 135, reps: 10, completed: true }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);

    expect(created.exercises[0].notes).toBe(specialNote);

    const fetched = await getWorkout(env.DB, created.id, userId);
    expect(fetched!.exercises[0].notes).toBe(specialNote);
  });

  it('should not confuse exercise notes with set notes', async () => {
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          notes: 'Exercise-level note',
          sets: [
            { weight: 135, reps: 10, completed: true, note: 'Set-level note' }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);

    // Exercise note and set note should be independent
    expect(created.exercises[0].notes).toBe('Exercise-level note');
    expect(created.exercises[0].sets[0].note).toBe('Set-level note');

    const fetched = await getWorkout(env.DB, created.id, userId);
    expect(fetched!.exercises[0].notes).toBe('Exercise-level note');
    expect(fetched!.exercises[0].sets[0].note).toBe('Set-level note');
  });

  it('should preserve notes when adding notes to previously note-less exercise via update', async () => {
    // Create workout without notes
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 135, reps: 10, completed: true }
          ]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);
    expect(created.exercises[0].notes).toBeUndefined();

    // Update to add notes
    const updateData: CreateWorkoutRequest = {
      start_time: created.start_time,
      end_time: created.end_time,
      exercises: [
        {
          name: 'Bench Press',
          notes: 'Added note after the fact',
          sets: [
            { weight: 135, reps: 10, completed: true }
          ]
        }
      ]
    };
    const result = await updateWorkout(env.DB, created.id, userId, updateData);

    expect(result.status).toBe('success');
    const updated = (result as Extract<UpdateWorkoutResult, { status: 'success' }>).workout;
    expect(updated.exercises[0].notes).toBe('Added note after the fact');
  });
});

describe('Optimistic Locking', () => {
  let userId: string;
  const testUsername = 'testuser_locking';
  const testPasswordHash = 'hash123';

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM users WHERE username = ?').bind(testUsername).run();
    const user = await createUser(env.DB, testUsername, testPasswordHash);
    userId = user.id;
  });

  it('should set updated_at on createWorkout', async () => {
    const before = Date.now();
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [{ weight: 135, reps: 10, completed: true }]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);
    const after = Date.now();

    expect(created.updated_at).toBeGreaterThanOrEqual(before);
    expect(created.updated_at).toBeLessThanOrEqual(after);
  });

  it('should update updated_at on successful updateWorkout', async () => {
    const workout: CreateWorkoutRequest = {
      start_time: Date.now() - 10000,
      end_time: Date.now() - 5000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [{ weight: 135, reps: 10, completed: true }]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);
    const originalUpdatedAt = created.updated_at;

    // Wait a bit so timestamps differ
    await new Promise(r => setTimeout(r, 10));

    const updateData: CreateWorkoutRequest & { updated_at?: number } = {
      start_time: created.start_time,
      end_time: created.end_time,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 135, reps: 10, completed: true },
            { weight: 135, reps: 12, completed: true }
          ]
        }
      ],
      updated_at: originalUpdatedAt,
    };
    const result = await updateWorkout(env.DB, created.id, userId, updateData);

    expect(result.status).toBe('success');
    const updated = (result as Extract<UpdateWorkoutResult, { status: 'success' }>).workout;
    expect(updated.updated_at).toBeGreaterThan(originalUpdatedAt);
  });

  it('should return conflict when updated_at does not match', async () => {
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [{ weight: 135, reps: 10, completed: true }]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);

    // Simulate external update (updates updated_at on server)
    const externalUpdate: CreateWorkoutRequest = {
      start_time: created.start_time,
      end_time: created.end_time,
      exercises: [
        {
          name: 'Bench Press',
          notes: 'Coach says: great form!',
          sets: [{ weight: 135, reps: 10, completed: true }]
        }
      ],
    };
    const externalResult = await updateWorkout(env.DB, created.id, userId, externalUpdate);
    expect(externalResult.status).toBe('success');

    // Now try to update with stale updated_at (from original create)
    const staleUpdate: CreateWorkoutRequest & { updated_at: number } = {
      start_time: created.start_time,
      end_time: created.end_time,
      exercises: [
        {
          name: 'Bench Press',
          sets: [
            { weight: 135, reps: 10, completed: true },
            { weight: 155, reps: 8, completed: true }
          ]
        }
      ],
      updated_at: created.updated_at, // Stale!
    };
    const result = await updateWorkout(env.DB, created.id, userId, staleUpdate);

    expect(result.status).toBe('conflict');
    const conflict = result as Extract<UpdateWorkoutResult, { status: 'conflict' }>;
    // Should return the current server state
    expect(conflict.current.exercises[0].notes).toBe('Coach says: great form!');
  });

  it('should allow update without updated_at (backward compatible)', async () => {
    const workout: CreateWorkoutRequest = {
      start_time: Date.now(),
      end_time: Date.now() + 3600000,
      exercises: [
        {
          name: 'Bench Press',
          sets: [{ weight: 135, reps: 10, completed: true }]
        }
      ]
    };
    const created = await createWorkout(env.DB, userId, workout);

    // Update without sending updated_at - should always succeed (backward compat)
    const updateData: CreateWorkoutRequest = {
      start_time: created.start_time,
      end_time: created.end_time,
      exercises: [
        {
          name: 'Bench Press',
          notes: 'No version check',
          sets: [{ weight: 135, reps: 10, completed: true }]
        }
      ],
    };
    const result = await updateWorkout(env.DB, created.id, userId, updateData);

    expect(result.status).toBe('success');
    const updated = (result as Extract<UpdateWorkoutResult, { status: 'success' }>).workout;
    expect(updated.exercises[0].notes).toBe('No version check');
  });

  it('should return not_found for non-existent workout', async () => {
    const updateData: CreateWorkoutRequest = {
      start_time: Date.now(),
      exercises: [
        {
          name: 'Bench Press',
          sets: [{ weight: 135, reps: 10, completed: true }]
        }
      ],
    };
    const result = await updateWorkout(env.DB, 'nonexistent-id', userId, updateData);

    expect(result.status).toBe('not_found');
  });
});
