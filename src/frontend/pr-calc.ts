import { state } from './state';
import { $, getExerciseUnit } from './helpers';

export function calculateIsPR(exerciseName: string, weight: number, reps: number, exerciseIndex: number, setIndex: number): boolean {
  if (!state.currentWorkout) return false;

  let previousBestReps: number | null = null;
  for (const workout of state.history) {
    if (state.editingWorkoutId && workout.id === state.editingWorkoutId) continue;
    if (workout.start_time >= state.currentWorkout.startTime) continue;

    const exercise = workout.exercises.find(e => e.name === exerciseName);
    if (!exercise) continue;

    for (const set of exercise.sets) {
      if (set.missed === true || set.completed !== true) continue;
      if (set.weight === weight) {
        if (previousBestReps === null || set.reps > previousBestReps) {
          previousBestReps = set.reps;
        }
      }
    }
  }

  let currentWorkoutBestReps: number | null = null;
  const exercises = state.currentWorkout.exercises;

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    if (ex.name !== exerciseName) continue;

    const maxSetIndex = (i === exerciseIndex) ? setIndex : ex.sets.length;

    for (let j = 0; j < maxSetIndex; j++) {
      const set = ex.sets[j];
      if (set.missed === true || set.completed !== true) continue;
      if (set.weight === weight) {
        if (currentWorkoutBestReps === null || set.reps > currentWorkoutBestReps) {
          currentWorkoutBestReps = set.reps;
        }
      }
    }
  }

  let maxToBeat: number | null = null;

  if (previousBestReps !== null && currentWorkoutBestReps !== null) {
    maxToBeat = Math.max(previousBestReps, currentWorkoutBestReps);
  } else if (previousBestReps !== null) {
    maxToBeat = previousBestReps;
  } else if (currentWorkoutBestReps !== null) {
    maxToBeat = currentWorkoutBestReps;
  }

  return maxToBeat === null || reps > maxToBeat;
}

export function recalculateAllPRs(): void {
  if (!state.currentWorkout) return;

  for (let i = 0; i < state.currentWorkout.exercises.length; i++) {
    const exercise = state.currentWorkout.exercises[i];
    for (let j = 0; j < exercise.sets.length; j++) {
      const set = exercise.sets[j];
      set.isPR = set.completed === true && set.missed !== true && calculateIsPR(exercise.name, set.weight, set.reps, i, j);
    }
  }
}

export function showPRHistory(exerciseName: string): void {
  const modal = $('pr-modal');
  const title = $('pr-modal-title');
  const content = $('pr-modal-content');

  const prs = state.allPRs
    .filter(pr => pr.exercise_name === exerciseName)
    .sort((a, b) => b.achieved_at - a.achieved_at);

  // Merge in real-time PRs from the current workout (not yet saved to server)
  if (state.currentWorkout) {
    for (const exercise of state.currentWorkout.exercises) {
      if (exercise.name !== exerciseName) continue;
      for (const set of exercise.sets) {
        if (!set.isPR || set.missed === true || set.completed !== true) continue;
        // Check if this PR already exists in server data (avoid duplicates)
        const alreadyRecorded = prs.some(pr =>
          pr.weight === set.weight && pr.reps === set.reps &&
          pr.workout_id === state.editingWorkoutId
        );
        if (!alreadyRecorded) {
          prs.push({
            id: '',
            user_id: '',
            exercise_name: exerciseName,
            weight: set.weight,
            reps: set.reps,
            workout_id: state.editingWorkoutId || '',
            set_index: 0,
            achieved_at: state.currentWorkout.startTime,
          });
        }
      }
    }
  }

  title.textContent = `${exerciseName} PRs`;

  if (prs.length === 0) {
    content.innerHTML = `
      <div class="text-center text-gray-400 py-8">
        <p>No PRs recorded yet.</p>
        <p class="text-sm mt-2">PRs are tracked when you beat your best reps at a given weight.</p>
      </div>
    `;
  } else {
    const prsByWeight = new Map<number, { reps: number; achieved_at: number }[]>();
    for (const pr of prs) {
      if (!prsByWeight.has(pr.weight)) {
        prsByWeight.set(pr.weight, []);
      }
      prsByWeight.get(pr.weight)!.push({ reps: pr.reps, achieved_at: pr.achieved_at });
    }

    const sortedWeights = [...prsByWeight.keys()].sort((a, b) => b - a);
    const unit = getExerciseUnit(exerciseName);

    content.innerHTML = `
      <table class="w-full text-sm">
        <thead>
          <tr class="text-gray-400 text-left">
            <th class="pb-2">Weight</th>
            <th class="pb-2">Best Reps</th>
            <th class="pb-2">Date</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-700">
          ${sortedWeights.map(weight => {
            const entries = prsByWeight.get(weight)!;
            const best = entries.reduce((best, curr) =>
              curr.reps > best.reps || (curr.reps === best.reps && curr.achieved_at > best.achieved_at) ? curr : best
            );
            const date = new Date(best.achieved_at);
            const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
            return `
              <tr>
                <td class="py-2 font-medium">${weight} ${unit}</td>
                <td class="py-2">${best.reps}</td>
                <td class="py-2 text-gray-400">${dateStr}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

export function hidePRHistory(): void {
  const modal = $('pr-modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}
