import { state } from './state';
import { $, getExerciseUnit, formatDate } from './helpers';

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
      // Include prior non-missed planned sets so duplicate planned PRs
      // only show a ghost star on the first matching instance.
      if (set.missed === true) continue;
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
      set.isPR = set.missed !== true && calculateIsPR(exercise.name, set.weight, set.reps, i, j);
    }
  }
}

// ==================== TAB STATE ====================
let currentTab = 0;

export function switchPRTab(index: number): void {
  currentTab = index;
  const slider = $('pr-modal-slider');
  slider.style.transform = `translateX(-${index * 100}%)`;

  // Update tab header styles
  const tabPRs = $('pr-tab-prs');
  const tabLast = $('pr-tab-last');

  if (index === 0) {
    tabPRs.className = 'flex-1 py-2 text-xs font-bold uppercase tracking-[0.15em] text-center border-b-2 border-swiss-red text-white';
    tabLast.className = 'flex-1 py-2 text-xs font-bold uppercase tracking-[0.15em] text-center border-b-2 border-transparent text-swiss-text-secondary';
  } else {
    tabPRs.className = 'flex-1 py-2 text-xs font-bold uppercase tracking-[0.15em] text-center border-b-2 border-transparent text-swiss-text-secondary';
    tabLast.className = 'flex-1 py-2 text-xs font-bold uppercase tracking-[0.15em] text-center border-b-2 border-swiss-red text-white';
  }

  // Update dot indicators
  $('pr-dot-0').className = `w-2 h-2 rounded-full ${index === 0 ? 'bg-swiss-red' : 'bg-[#444]'}`;
  $('pr-dot-1').className = `w-2 h-2 rounded-full ${index === 1 ? 'bg-swiss-red' : 'bg-[#444]'}`;
}

// ==================== SWIPE HANDLING ====================
function initSwipe(): void {
  const swipeContainer = $('pr-modal-swipe');
  let startX = 0;
  let startY = 0;
  let isDragging = false;

  swipeContainer.addEventListener('touchstart', (e: TouchEvent) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = true;
  }, { passive: true });

  swipeContainer.addEventListener('touchmove', (_e: TouchEvent) => {
    // We track but don't preventDefault to allow vertical scroll
  }, { passive: true });

  swipeContainer.addEventListener('touchend', (e: TouchEvent) => {
    if (!isDragging) return;
    isDragging = false;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - startX;
    const diffY = endY - startY;

    // Only trigger if horizontal movement exceeds vertical and threshold
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0 && currentTab === 0) {
        switchPRTab(1);
      } else if (diffX > 0 && currentTab === 1) {
        switchPRTab(0);
      }
    }
  }, { passive: true });
}

// ==================== PR TABLE RENDERING ====================
function renderPRsPanel(exerciseName: string): void {
  const panel = $('pr-panel-prs');

  const prs = state.allPRs
    .filter(pr => pr.exercise_name === exerciseName)
    .sort((a, b) => b.achieved_at - a.achieved_at);

  // Merge in real-time PRs from the current workout (not yet saved to server)
  if (state.currentWorkout) {
    for (const exercise of state.currentWorkout.exercises) {
      if (exercise.name !== exerciseName) continue;
      for (const set of exercise.sets) {
        if (!set.isPR || set.missed === true || set.completed !== true) continue;
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

  if (prs.length === 0) {
    panel.innerHTML = `
      <div class="text-center text-[#888888] py-8">
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

    panel.innerHTML = `
      <table class="w-full text-sm font-mono">
        <thead>
          <tr class="text-[#888888] text-left text-xs uppercase tracking-wider">
            <th class="pb-2">Weight</th>
            <th class="pb-2">Best Reps</th>
            <th class="pb-2">Date</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[#2A2A2A]">
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
                <td class="py-2 text-[#888888]">${dateStr}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }
}

// ==================== LAST WORKOUT RENDERING ====================
function renderLastWorkoutPanel(exerciseName: string): void {
  const panel = $('pr-panel-last');
  const unit = getExerciseUnit(exerciseName);

  // Find last workout containing this exercise, skipping the current one
  let lastWorkout = null;
  let lastExercise = null;

  for (const workout of state.history) {
    // Skip the workout currently being edited
    if (state.editingWorkoutId && workout.id === state.editingWorkoutId) continue;
    // Skip workouts at or after current workout start time
    if (state.currentWorkout && workout.start_time >= state.currentWorkout.startTime) continue;

    const ex = workout.exercises.find(e => e.name === exerciseName);
    if (ex && ex.sets.length > 0) {
      lastWorkout = workout;
      lastExercise = ex;
      break;
    }
  }

  if (!lastWorkout || !lastExercise) {
    panel.innerHTML = `
      <div class="text-center text-[#888888] py-8">
        <p>No previous workout found.</p>
        <p class="text-sm mt-2">Complete a workout with this exercise to see history here.</p>
      </div>
    `;
    return;
  }

  const dateStr = formatDate(lastWorkout.start_time);

  panel.innerHTML = `
    <div class="text-xs text-[#888888] uppercase tracking-wider mb-3">${dateStr}</div>
    <table class="w-full text-sm font-mono">
      <thead>
        <tr class="text-[#888888] text-left text-xs uppercase tracking-wider">
          <th class="pb-2">Set</th>
          <th class="pb-2">Weight</th>
          <th class="pb-2">Reps</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[#2A2A2A]">
        ${lastExercise.sets.map((set, i) => {
          const missed = set.missed === true;
          const rowClass = missed ? 'opacity-40 line-through' : '';
          return `
            <tr class="${rowClass}">
              <td class="py-2">${i + 1}</td>
              <td class="py-2 font-medium">${set.weight} ${unit}</td>
              <td class="py-2">${set.reps}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ==================== MODAL SHOW/HIDE ====================
let swipeInitialized = false;

export function showPRHistory(exerciseName: string): void {
  const modal = $('pr-modal');
  const title = $('pr-modal-title');

  title.textContent = exerciseName;

  // Reset to first tab
  currentTab = 0;
  switchPRTab(0);

  // Render both panels
  renderPRsPanel(exerciseName);
  renderLastWorkoutPanel(exerciseName);

  // Initialize swipe once
  if (!swipeInitialized) {
    initSwipe();
    swipeInitialized = true;
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

export function hidePRHistory(): void {
  const modal = $('pr-modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}
