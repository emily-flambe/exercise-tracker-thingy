// Pure 3-way merge logic for the active-edit workout sync.
// Extracted from workout.ts so it can be unit-tested without the DOM.
//
// See src/frontend/workout.ts::mergeServerWorkout for the stateful caller that
// applies these results to `state.currentWorkout` and re-renders.
import type { Workout, Set as WorkoutSet, WorkoutExercise, MuscleGroup } from './api';

export interface MergeOpts {
  localAuthoritative: boolean;
}

// A "local" workout view mirrors the shape held in state.currentWorkout:
// no id (when brand new), targetCategories instead of target_categories, etc.
// We accept both shapes here by requiring only the fields we read.
export interface LocalWorkoutView {
  exercises: WorkoutExercise[];
  targetCategories?: MuscleGroup[];
}

export interface MergeResult {
  exercises: WorkoutExercise[];
  targetCategories: MuscleGroup[] | undefined;
  hadConflict: boolean;
}

// Sets lack stable ids, so match by position within an exercise.
// When lengths differ, indices beyond the shortest list are treated as
// one-sided additions (local append or server append).
export function mergeSets(
  baseSets: WorkoutSet[] | null,
  localSets: WorkoutSet[],
  serverSets: WorkoutSet[],
  opts: MergeOpts
): { sets: WorkoutSet[]; hadConflict: boolean } {
  const maxLen = Math.max(localSets.length, serverSets.length);
  const merged: WorkoutSet[] = [];
  let hadConflict = false;

  for (let i = 0; i < maxLen; i++) {
    const baseSet = baseSets && i < baseSets.length ? baseSets[i] : null;
    const localSet = i < localSets.length ? localSets[i] : null;
    const serverSet = i < serverSets.length ? serverSets[i] : null;

    if (localSet && !serverSet) {
      if (baseSet) {
        // In base, still local, gone from server -> remote deletion. Drop.
        continue;
      }
      // Local append (not in base) -> keep local addition.
      const out = structuredClone(localSet);
      delete out.isPR;
      merged.push(out);
      continue;
    }
    if (!localSet && serverSet) {
      if (baseSet) {
        // In base, still on server, gone locally -> local deletion. Drop.
        continue;
      }
      // Remote append -> keep server addition.
      const out = structuredClone(serverSet);
      delete out.isPR;
      merged.push(out);
      continue;
    }
    if (!localSet && !serverSet) {
      continue;
    }

    // Both sides have the set at this index: do per-field 3-way merge.
    const out: WorkoutSet = structuredClone(localSet!);
    const s = serverSet!;
    const b = baseSet;

    const mergeField = <K extends keyof WorkoutSet>(key: K): void => {
      const lv = localSet![key];
      const sv = s[key];
      const bv = b ? b[key] : undefined;
      const localChanged = b ? lv !== bv : lv !== undefined;
      const serverChanged = b ? sv !== bv : sv !== undefined;

      if (localChanged && !serverChanged) {
        out[key] = lv;
      } else if (!localChanged && serverChanged) {
        out[key] = sv;
      } else if (localChanged && serverChanged) {
        if (lv !== sv) hadConflict = true;
        out[key] = opts.localAuthoritative ? lv : sv;
      } else {
        out[key] = lv;
      }
    };

    mergeField('weight');
    mergeField('reps');
    mergeField('completed');
    mergeField('missed');
    mergeField('note');
    delete out.isPR;

    merged.push(out);
  }

  return { sets: merged, hadConflict };
}

// Core merge. Returns a plain result object; the caller is responsible for
// mutating state.currentWorkout, refreshing baseServerWorkout, showing toasts,
// and re-rendering.
export function mergeWorkouts(
  base: Workout | null,
  local: LocalWorkoutView,
  server: Workout,
  opts: MergeOpts
): MergeResult {
  const localExercises = local.exercises;
  const serverExercises = server.exercises;
  const baseExercises = base ? base.exercises : null;

  let hadConflict = false;
  const merged: WorkoutExercise[] = [];

  if (!base) {
    // Legacy two-way behavior (no common ancestor).
    if (opts.localAuthoritative) {
      if (localExercises.length === 0 && serverExercises.length > 0) {
        for (const serverEx of serverExercises) {
          merged.push(structuredClone(serverEx));
        }
      } else {
        for (const localEx of localExercises) {
          const serverEx = serverExercises.find(se => se.name === localEx.name);
          if (serverEx) {
            const mergedEx = structuredClone(serverEx);
            if (localEx.notes && !serverEx.notes) {
              mergedEx.notes = localEx.notes;
            }
            merged.push(mergedEx);
          } else {
            merged.push(structuredClone(localEx));
          }
        }
      }
    } else {
      for (const serverEx of serverExercises) {
        const localEx = localExercises.find(le => le.name === serverEx.name);
        const mergedEx = structuredClone(serverEx);
        if (localEx?.notes && !serverEx.notes) {
          mergedEx.notes = localEx.notes;
        }
        merged.push(mergedEx);
      }
      for (const localEx of localExercises) {
        const serverEx = serverExercises.find(se => se.name === localEx.name);
        if (!serverEx) {
          merged.push(structuredClone(localEx));
        }
      }
    }
  } else {
    // 3-way merge at the exercise level. Identify exercises by name.
    const seenNames = new Set<string>();

    for (const localEx of localExercises) {
      if (seenNames.has(localEx.name)) continue;
      seenNames.add(localEx.name);

      const inBase = baseExercises!.some(be => be.name === localEx.name);
      const serverEx = serverExercises.find(se => se.name === localEx.name);

      if (!serverEx && inBase) {
        // Remote deletion. Drop.
        continue;
      }
      if (!serverEx && !inBase) {
        // Local addition -> keep.
        merged.push(structuredClone(localEx));
        continue;
      }
      // Exists on both sides -> descend into set-level merge.
      const baseEx = baseExercises!.find(be => be.name === localEx.name) || null;
      const { sets, hadConflict: setConflict } = mergeSets(
        baseEx ? baseEx.sets : null,
        localEx.sets,
        serverEx!.sets,
        opts
      );
      if (setConflict) hadConflict = true;

      const mergedEx = structuredClone(serverEx!);
      mergedEx.sets = sets;

      const mergeExerciseField = <K extends keyof typeof localEx>(key: K): void => {
        const lv = localEx[key];
        const sv = serverEx![key];
        const bv = baseEx ? baseEx[key] : undefined;
        const localChanged = baseEx ? lv !== bv : lv !== undefined;
        const serverChanged = baseEx ? sv !== bv : sv !== undefined;
        if (localChanged && !serverChanged) {
          (mergedEx as typeof localEx)[key] = lv;
        } else if (!localChanged && serverChanged) {
          (mergedEx as typeof localEx)[key] = sv;
        } else if (localChanged && serverChanged) {
          if (lv !== sv) hadConflict = true;
          (mergedEx as typeof localEx)[key] = opts.localAuthoritative ? lv : sv;
        } else {
          (mergedEx as typeof localEx)[key] = lv;
        }
      };
      mergeExerciseField('completed');
      mergeExerciseField('notes');

      merged.push(mergedEx);
    }

    // Server-only additions: in server, not in local, not in base -> keep.
    for (const serverEx of serverExercises) {
      if (seenNames.has(serverEx.name)) continue;
      const inBase = baseExercises!.some(be => be.name === serverEx.name);
      if (inBase) {
        // In base, gone locally -> local deletion. Drop.
        continue;
      }
      merged.push(structuredClone(serverEx));
    }
  }

  // Merge target_categories / targetCategories
  let targetCategories: MuscleGroup[] | undefined;
  if (base) {
    const localCats = JSON.stringify(local.targetCategories ?? null);
    const serverCats = JSON.stringify(server.target_categories ?? null);
    const baseCats = JSON.stringify(base.target_categories ?? null);
    const localChanged = localCats !== baseCats;
    const serverChanged = serverCats !== baseCats;
    if (localChanged && !serverChanged) {
      targetCategories = local.targetCategories;
    } else if (!localChanged && serverChanged) {
      targetCategories = server.target_categories;
    } else if (localChanged && serverChanged) {
      if (localCats !== serverCats) hadConflict = true;
      targetCategories = opts.localAuthoritative ? local.targetCategories : server.target_categories;
    } else {
      targetCategories = server.target_categories;
    }
  } else {
    targetCategories = server.target_categories;
  }

  return { exercises: merged, targetCategories, hadConflict };
}
