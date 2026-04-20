// Regression tests for 3-way merge in src/frontend/merge.ts, covering the
// "exercise resurrection / completed-sets vanishing" bug (issue #102).
import { describe, it, expect } from 'vitest';
import { mergeWorkouts, type LocalWorkoutView } from './merge';
import type { Workout, WorkoutExercise, Set as WorkoutSet } from './api';

function ex(name: string, sets: WorkoutSet[] = [], extras: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return { name, sets, ...extras };
}

function baseWorkout(id: string, exercises: WorkoutExercise[]): Workout {
  return {
    id,
    user_id: 'u1',
    start_time: 1_700_000_000_000,
    exercises,
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
  };
}

function serverWorkout(id: string, exercises: WorkoutExercise[], updatedAt = 1_700_000_500_000): Workout {
  return {
    id,
    user_id: 'u1',
    start_time: 1_700_000_000_000,
    exercises,
    created_at: 1_700_000_000_000,
    updated_at: updatedAt,
  };
}

function localView(exercises: WorkoutExercise[], targetCategories?: LocalWorkoutView['targetCategories']): LocalWorkoutView {
  return { exercises, targetCategories };
}

describe('mergeWorkouts — 3-way merge', () => {
  describe('exercise-level triage (issue #102 regressions)', () => {
    it('preserves local deletion when server has not changed that exercise (no resurrection)', () => {
      // Base: [Bench, Squat]. User deletes Squat locally. Server still has both.
      const base = baseWorkout('w1', [ex('Bench'), ex('Squat')]);
      const local = localView([ex('Bench')]);
      const server = serverWorkout('w1', [ex('Bench'), ex('Squat')]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      const names = result.exercises.map(e => e.name);
      expect(names).toEqual(['Bench']);
      expect(names).not.toContain('Squat');
    });

    it('drops an exercise that was deleted on the server (remote deletion)', () => {
      // Base: [Bench, Squat]. Server deleted Squat. Local still has both.
      const base = baseWorkout('w1', [ex('Bench'), ex('Squat')]);
      const local = localView([ex('Bench'), ex('Squat')]);
      const server = serverWorkout('w1', [ex('Bench')]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      expect(result.exercises.map(e => e.name)).toEqual(['Bench']);
    });

    it('adds a remote-added exercise (not in base, not in local)', () => {
      // Base: [Bench]. Server added Deadlift. Local unchanged.
      const base = baseWorkout('w1', [ex('Bench')]);
      const local = localView([ex('Bench')]);
      const server = serverWorkout('w1', [ex('Bench'), ex('Deadlift', [{ weight: 225, reps: 5 }])]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      expect(result.exercises.map(e => e.name)).toEqual(['Bench', 'Deadlift']);
      const dl = result.exercises.find(e => e.name === 'Deadlift')!;
      expect(dl.sets).toEqual([{ weight: 225, reps: 5 }]);
    });

    it('keeps a local-added exercise (not in base, not on server)', () => {
      // Base: [Bench]. Local added Squat. Server unchanged.
      const base = baseWorkout('w1', [ex('Bench')]);
      const local = localView([ex('Bench'), ex('Squat', [{ weight: 185, reps: 5 }])]);
      const server = serverWorkout('w1', [ex('Bench')]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      expect(result.exercises.map(e => e.name)).toEqual(['Bench', 'Squat']);
      const sq = result.exercises.find(e => e.name === 'Squat')!;
      expect(sq.sets).toEqual([{ weight: 185, reps: 5 }]);
    });

    it('preserves concurrent additions on both sides (different exercises)', () => {
      // Base: [Bench]. Local added Squat. Server added Deadlift.
      const base = baseWorkout('w1', [ex('Bench')]);
      const local = localView([ex('Bench'), ex('Squat')]);
      const server = serverWorkout('w1', [ex('Bench'), ex('Deadlift')]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      const names = result.exercises.map(e => e.name).sort();
      expect(names).toEqual(['Bench', 'Deadlift', 'Squat']);
    });
  });

  describe('set-level merge (vanishing-sets regression)', () => {
    it('preserves local completed:true when server has no change on that exercise', () => {
      // Base: one set uncompleted. Local toggled completed=true. Server unchanged.
      const baseSet: WorkoutSet = { weight: 135, reps: 10, completed: false };
      const base = baseWorkout('w1', [ex('Bench', [baseSet])]);
      const local = localView([ex('Bench', [{ weight: 135, reps: 10, completed: true }])]);
      const server = serverWorkout('w1', [ex('Bench', [{ weight: 135, reps: 10, completed: false }])]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      const mergedSet = result.exercises[0].sets[0];
      expect(mergedSet.completed).toBe(true);
      expect(mergedSet.weight).toBe(135);
      expect(mergedSet.reps).toBe(10);
    });

    it('applies a remote set change when local is unchanged', () => {
      const baseSet: WorkoutSet = { weight: 135, reps: 10, completed: false };
      const base = baseWorkout('w1', [ex('Bench', [baseSet])]);
      const local = localView([ex('Bench', [{ weight: 135, reps: 10, completed: false }])]);
      const server = serverWorkout('w1', [ex('Bench', [{ weight: 135, reps: 12, completed: false }])]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: false });

      expect(result.exercises[0].sets[0].reps).toBe(12);
    });

    it('true conflict with localAuthoritative: local wins, hadConflict is true', () => {
      const baseSet: WorkoutSet = { weight: 135, reps: 10, completed: false };
      const base = baseWorkout('w1', [ex('Bench', [baseSet])]);
      const local = localView([ex('Bench', [{ weight: 140, reps: 10, completed: false }])]);
      const server = serverWorkout('w1', [ex('Bench', [{ weight: 150, reps: 10, completed: false }])]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      expect(result.exercises[0].sets[0].weight).toBe(140);
      expect(result.hadConflict).toBe(true);
    });

    it('true conflict with localAuthoritative=false: server wins', () => {
      const baseSet: WorkoutSet = { weight: 135, reps: 10, completed: false };
      const base = baseWorkout('w1', [ex('Bench', [baseSet])]);
      const local = localView([ex('Bench', [{ weight: 140, reps: 10, completed: false }])]);
      const server = serverWorkout('w1', [ex('Bench', [{ weight: 150, reps: 10, completed: false }])]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: false });

      expect(result.exercises[0].sets[0].weight).toBe(150);
      expect(result.hadConflict).toBe(true);
    });

    it('preserves a local-added set (local has more sets than base/server)', () => {
      // Base and server have one set; local added a second.
      const base = baseWorkout('w1', [ex('Bench', [{ weight: 135, reps: 10, completed: true }])]);
      const local = localView([
        ex('Bench', [
          { weight: 135, reps: 10, completed: true },
          { weight: 145, reps: 8, completed: false },
        ]),
      ]);
      const server = serverWorkout('w1', [ex('Bench', [{ weight: 135, reps: 10, completed: true }])]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      expect(result.exercises[0].sets).toHaveLength(2);
      expect(result.exercises[0].sets[1]).toMatchObject({ weight: 145, reps: 8 });
    });
  });

  describe('known limitations — documented, not fixed here', () => {
    // TODO: set identity by index; revisit with stable set ids.
    // Sets are identified positionally (by array index) within an exercise.
    // When local deletes a set, the indexes of subsequent sets shift, so a
    // concurrent server edit to a later set (e.g. a `note` change on set C)
    // is aligned against the wrong local slot and silently dropped. A proper
    // fix requires stable per-set ids in the schema — deferred to a follow-up.
    it('DOCUMENTS: server edit to a later set is lost when local deletes an earlier set (index-based identity)', () => {
      // Base: [A, B, C]. Local deletes B -> [A, C]. Server edits C's note -> [A, B, C'].
      const base = baseWorkout('w1', [
        ex('Bench', [
          { weight: 100, reps: 5 },
          { weight: 110, reps: 5 },
          { weight: 120, reps: 5, note: 'original' },
        ]),
      ]);
      const local = localView([
        ex('Bench', [
          { weight: 100, reps: 5 },
          { weight: 120, reps: 5, note: 'original' },
        ]),
      ]);
      const server = serverWorkout('w1', [
        ex('Bench', [
          { weight: 100, reps: 5 },
          { weight: 110, reps: 5 },
          { weight: 120, reps: 5, note: 'server edit' },
        ]),
      ]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      // CURRENT behavior: local deletion of B wins, and because set identity
      // is positional the server's note change on C never lands on the
      // surviving slot. The 'server edit' note is silently dropped.
      const sets = result.exercises[0].sets;
      expect(sets).toHaveLength(2);
      expect(sets[0]).toMatchObject({ weight: 100, reps: 5 });
      expect(sets[1]).toMatchObject({ weight: 120, reps: 5 });
      // This is the known-limitation assertion — not desired behavior, just
      // locked-in so any future change to set identity semantics will
      // surface here and force a conscious revisit.
      expect(sets[1].note).toBe('original');
      expect(sets[1].note).not.toBe('server edit');
    });
  });

  describe('baseline behavior', () => {
    it('with null base (no common ancestor), falls back gracefully without crashing', () => {
      const local = localView([ex('Bench', [{ weight: 135, reps: 10, completed: true }])]);
      const server = serverWorkout('w1', [ex('Bench', [{ weight: 135, reps: 10, completed: false }])]);

      expect(() => mergeWorkouts(null, local, server, { localAuthoritative: true })).not.toThrow();

      const result = mergeWorkouts(null, local, server, { localAuthoritative: true });
      // Legacy behavior: server exercise is taken as base, local notes preserved.
      // The exact set-level semantics of the null-base path aren't under test here —
      // this assertion just confirms non-crash behavior returns a plausible result.
      expect(result.exercises).toHaveLength(1);
      expect(result.exercises[0].name).toBe('Bench');
    });
  });

  describe('isPR field stripping', () => {
    it('does not leak server-side isPR through a merged set', () => {
      const baseSet: WorkoutSet = { weight: 135, reps: 10, completed: false };
      const base = baseWorkout('w1', [ex('Bench', [baseSet])]);
      // Server has isPR=true; we don't want to trust it — PR flags are recomputed client-side.
      const serverSet: WorkoutSet = { weight: 135, reps: 10, completed: false, isPR: true };
      const local = localView([ex('Bench', [{ weight: 135, reps: 10, completed: true }])]);
      const server = serverWorkout('w1', [ex('Bench', [serverSet])]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      expect(result.exercises[0].sets[0].isPR).toBeUndefined();
    });

    it('does not leak isPR when the set is a remote append', () => {
      const base = baseWorkout('w1', [ex('Bench', [])]);
      const local = localView([ex('Bench', [])]);
      const server = serverWorkout('w1', [
        ex('Bench', [{ weight: 200, reps: 5, completed: true, isPR: true }]),
      ]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      expect(result.exercises[0].sets).toHaveLength(1);
      expect(result.exercises[0].sets[0].isPR).toBeUndefined();
      expect(result.exercises[0].sets[0].weight).toBe(200);
    });

    it('does not leak isPR on a local-appended set', () => {
      const base = baseWorkout('w1', [ex('Bench', [])]);
      // Local added a set the client mis-flagged with isPR=true; we still strip it.
      const local = localView([ex('Bench', [{ weight: 225, reps: 5, completed: true, isPR: true }])]);
      const server = serverWorkout('w1', [ex('Bench', [])]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      expect(result.exercises[0].sets).toHaveLength(1);
      expect(result.exercises[0].sets[0].isPR).toBeUndefined();
    });
  });

  describe('hadConflict reporting', () => {
    it('does not report conflict when only one side changed a set field', () => {
      const baseSet: WorkoutSet = { weight: 135, reps: 10, completed: false };
      const base = baseWorkout('w1', [ex('Bench', [baseSet])]);
      const local = localView([ex('Bench', [{ weight: 135, reps: 10, completed: true }])]);
      const server = serverWorkout('w1', [ex('Bench', [{ weight: 135, reps: 10, completed: false }])]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      expect(result.hadConflict).toBe(false);
    });

    it('does not report conflict when both sides wrote the same value', () => {
      const baseSet: WorkoutSet = { weight: 135, reps: 10, completed: false };
      const base = baseWorkout('w1', [ex('Bench', [baseSet])]);
      const local = localView([ex('Bench', [{ weight: 140, reps: 10, completed: false }])]);
      const server = serverWorkout('w1', [ex('Bench', [{ weight: 140, reps: 10, completed: false }])]);

      const result = mergeWorkouts(base, local, server, { localAuthoritative: true });

      expect(result.hadConflict).toBe(false);
      expect(result.exercises[0].sets[0].weight).toBe(140);
    });
  });
});
