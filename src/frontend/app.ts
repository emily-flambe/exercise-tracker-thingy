import * as api from './api';
import type { Workout, WorkoutExercise, Set, CustomExercise, User, PersonalRecord } from './api';
import type { CreateWorkoutRequest } from '../types';

// Injected by Vite at build time
declare const __APP_VERSION__: string;

// ==================== AUTH STATE ====================
let currentUser: User | null = null;
let isRegisterMode = false;

// ==================== EXERCISE TYPES ====================
interface Exercise {
  name: string;
  type: 'total' | '/side' | '+bar' | 'bodyweight';
  category: string;
  unit: 'lbs' | 'kg';
}

// ==================== STATE ====================
interface AppState {
  currentWorkout: {
    startTime: number;
    exercises: WorkoutExercise[];
  } | null;
  editingWorkoutId: string | null;
  history: Workout[];
  customExercises: CustomExercise[];
  editingExercise: {
    id: string | null;
    name: string;
    isCustom: boolean;
  } | null;
  allPRs: PersonalRecord[];
}

const state: AppState = {
  currentWorkout: null,
  editingWorkoutId: null,
  history: [],
  customExercises: [],
  editingExercise: null,
  allPRs: [],
};

// Track whether we're editing an existing workout from history (vs a new workout that was auto-saved)
let isEditingFromHistory = false;

let currentExerciseUnit: 'lbs' | 'kg' = 'lbs';
let workoutExerciseUnit: 'lbs' | 'kg' = 'lbs';
let pendingDeleteWorkoutId: string | null = null;
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let expandedNotes = new Set<string>(); // Track which notes are expanded (format: "exerciseIndex-setIndex")
let toastTimeout: ReturnType<typeof setTimeout> | null = null;
let currentCalendarDate = new Date(); // Track current month/year for calendar view

// ==================== HELPERS ====================
function getAllExercises(): Exercise[] {
  return state.customExercises.map(c => ({
    name: c.name,
    type: c.type,
    category: c.category,
    unit: c.unit,
  }));
}

function getExerciseUnit(exerciseName: string): 'lbs' | 'kg' {
  const exercise = getAllExercises().find(e => e.name === exerciseName);
  return exercise?.unit || 'lbs';
}

function getTypeColor(type: string): string {
  if (type === '+bar') return 'text-yellow-500';
  if (type === '/side') return 'text-purple-400';
  if (type === 'bodyweight') return 'text-green-400';
  return 'text-cyan-400';
}

function getTypeLabel(type: string): string {
  if (type === '+bar') return '+bar weight';
  if (type === '/side') return 'per side';
  if (type === 'bodyweight') return 'bodyweight';
  return 'total weight';
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const y = String(d.getFullYear()).slice(-2);
  return `${m}/${day}/${y}`;
}

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function $input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function $select(id: string): HTMLSelectElement {
  return document.getElementById(id) as unknown as HTMLSelectElement;
}

// Show a temporary toast notification
function showToast(message: string = 'Saved'): void {
  const toast = $('save-toast');

  // Clear any existing timeout
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  // Update message and show toast
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.style.opacity = '1';

  // Hide after 2 seconds
  toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 300); // Wait for fade transition
  }, 2000);
}

// Check if a set is a PR based on exercise name, weight, reps, and position
function calculateIsPR(exerciseName: string, weight: number, reps: number, exerciseIndex: number, setIndex: number): boolean {
  if (!state.currentWorkout) return false;

  // Find the best reps at this weight in previous workouts (completed and not missed sets only)
  let previousBestReps: number | null = null;
  for (const workout of state.history) {
    // Skip the workout being edited if we're editing
    if (state.editingWorkoutId && workout.id === state.editingWorkoutId) continue;

    // Only look at workouts before the current one's start time
    if (workout.start_time >= state.currentWorkout.startTime) continue;

    const exercise = workout.exercises.find(e => e.name === exerciseName);
    if (!exercise) continue;

    for (const set of exercise.sets) {
      // Only consider completed sets that are not missed (matching backend logic)
      if (set.completed === false || set.missed === true) continue;

      if (set.weight === weight) {
        if (previousBestReps === null || set.reps > previousBestReps) {
          previousBestReps = set.reps;
        }
      }
    }
  }

  // Find the best reps at this weight in earlier sets of the current workout
  let currentWorkoutBestReps: number | null = null;
  const exercises = state.currentWorkout.exercises;

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    if (ex.name !== exerciseName) continue;

    // For the same exercise, only look at sets before the current one
    const maxSetIndex = (i === exerciseIndex) ? setIndex : ex.sets.length;

    for (let j = 0; j < maxSetIndex; j++) {
      const set = ex.sets[j];
      // Only consider completed sets that are not missed
      if (set.completed === false || set.missed === true) continue;

      if (set.weight === weight) {
        if (currentWorkoutBestReps === null || set.reps > currentWorkoutBestReps) {
          currentWorkoutBestReps = set.reps;
        }
      }
    }
  }

  // Determine the maximum reps to beat
  let maxToBeat: number | null = null;

  if (previousBestReps !== null && currentWorkoutBestReps !== null) {
    maxToBeat = Math.max(previousBestReps, currentWorkoutBestReps);
  } else if (previousBestReps !== null) {
    maxToBeat = previousBestReps;
  } else if (currentWorkoutBestReps !== null) {
    maxToBeat = currentWorkoutBestReps;
  }

  // It's a PR if there's no previous record, or if reps exceed the max to beat
  return maxToBeat === null || reps > maxToBeat;
}

// Recalculate PR status for all sets in the current workout
function recalculateAllPRs(): void {
  if (!state.currentWorkout) return;

  for (let i = 0; i < state.currentWorkout.exercises.length; i++) {
    const exercise = state.currentWorkout.exercises[i];
    for (let j = 0; j < exercise.sets.length; j++) {
      const set = exercise.sets[j];
      set.isPR = calculateIsPR(exercise.name, set.weight, set.reps, i, j);
    }
  }
}

// ==================== DATA LOADING ====================
async function loadData(): Promise<void> {
  try {
    const [workouts, exercises, prs] = await Promise.all([
      api.getWorkouts(),
      api.getCustomExercises(),
      api.getAllPRs(),
    ]);
    state.history = workouts;
    state.customExercises = exercises;
    state.allPRs = prs;
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}

// ==================== TAB NAVIGATION ====================
function switchTab(tabName: string): void {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  $('tab-' + tabName).classList.add('active');
  document.querySelectorAll('nav button').forEach(btn => {
    btn.classList.remove('text-blue-400');
    btn.classList.add('text-gray-400');
  });
  $('nav-' + tabName).classList.remove('text-gray-400');
  $('nav-' + tabName).classList.add('text-blue-400');

  if (tabName === 'history') renderHistory();
  if (tabName === 'exercises') renderExerciseCategories();
}

function showWorkoutScreen(screenId: string): void {
  document.querySelectorAll('#tab-workout .screen').forEach(s => s.classList.remove('active'));
  $(screenId).classList.add('active');
}

// ==================== WORKOUT ====================
function startWorkout(): void {
  state.currentWorkout = {
    startTime: Date.now(),
    exercises: [],
  };
  state.editingWorkoutId = null;
  isEditingFromHistory = false;
  expandedNotes.clear();
  $('workout-title').textContent = "Today's Workout";
  $('workout-finish-btn').textContent = 'Finish';
  showWorkoutScreen('workout-active');
  renderWorkout();
}

async function finishWorkout(): Promise<void> {
  if (!state.currentWorkout || state.currentWorkout.exercises.length === 0) {
    state.currentWorkout = null;
    state.editingWorkoutId = null;
    expandedNotes.clear();
    showWorkoutScreen('workout-empty');
    return;
  }

  try {
    const workoutData = {
      start_time: state.currentWorkout.startTime,
      end_time: Date.now(),
      exercises: state.currentWorkout.exercises,
    };

    if (isEditingFromHistory) {
      // Editing existing workout from history - save and stay on workout screen
      const btn = $('workout-finish-btn');

      await api.updateWorkout(state.editingWorkoutId!, workoutData);
      await loadData();

      // Show "Saved" feedback
      btn.textContent = 'Saved';
      btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
      btn.classList.remove('bg-green-600', 'hover:bg-green-700');

      // Restore "Save" text after 2 seconds
      setTimeout(() => {
        btn.textContent = 'Save';
        btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        btn.classList.add('bg-green-600', 'hover:bg-green-700');
      }, 2000);

      // Keep user on workout - don't clear state or navigate away
    } else if (state.editingWorkoutId) {
      // New workout that was auto-saved - update it and go to empty screen
      await api.updateWorkout(state.editingWorkoutId, workoutData);
      await loadData();
      state.currentWorkout = null;
      state.editingWorkoutId = null;
      isEditingFromHistory = false;
      expandedNotes.clear();
      showWorkoutScreen('workout-empty');
    } else {
      // Brand new workout - create and go to empty screen
      await api.createWorkout(workoutData);
      await loadData();
      state.currentWorkout = null;
      state.editingWorkoutId = null;
      isEditingFromHistory = false;
      expandedNotes.clear();
      showWorkoutScreen('workout-empty');
    }
  } catch (error) {
    console.error('Failed to save workout:', error);
    alert('Failed to save workout');
  }
}

function scheduleAutoSave(): void {
  // Clear any pending auto-save
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }

  // Schedule a new auto-save after 1.5 seconds of inactivity
  autoSaveTimeout = setTimeout(() => {
    autoSaveWorkout();
  }, 1500);
}

async function autoSaveWorkout(): Promise<void> {
  // Don't auto-save if there's no workout or no exercises yet
  if (!state.currentWorkout || state.currentWorkout.exercises.length === 0) {
    return;
  }

  try {
    const workoutData: CreateWorkoutRequest = {
      start_time: state.currentWorkout.startTime,
      // Keep workout active - don't set end_time for new workouts
      // For edited workouts, we need to preserve that it was already finished
      exercises: state.currentWorkout.exercises,
    };

    if (state.editingWorkoutId) {
      // Updating an existing workout - need to check if it was already finished
      const originalWorkout = state.history.find(w => w.id === state.editingWorkoutId);
      if (originalWorkout?.end_time) {
        // Preserve the original end_time for finished workouts being edited
        workoutData.end_time = originalWorkout.end_time;
      }
      await api.updateWorkout(state.editingWorkoutId, workoutData);
    } else {
      // Creating a new workout - don't set end_time to keep it active
      const savedWorkout = await api.createWorkout(workoutData);
      // Set the editingWorkoutId so future auto-saves update this workout
      state.editingWorkoutId = savedWorkout.id;
    }

    // Reload data to refresh history, but keep current workout active
    await loadData();
    console.log('Workout auto-saved');
  } catch (error) {
    console.error('Failed to auto-save workout:', error);
    // Silently fail - don't interrupt user's workflow with alerts
  }
}

function renderWorkout(): void {
  const list = $('exercise-list');
  if (!state.currentWorkout) {
    list.innerHTML = '';
    return;
  }

  const exercises = state.currentWorkout.exercises;
  const exerciseCount = exercises.length;

  list.innerHTML = exercises.map((ex, i) => {
    const exercise = getAllExercises().find(e => e.name === ex.name) || { type: 'total', unit: 'lbs' };
    const prevSets = getPreviousSets(ex.name);

    const lastSet = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : (prevSets[0] || { weight: 0, reps: 10 });
    const nextSetNum = ex.sets.length + 1;

    let setsHtml = `
      <div class="text-sm">
        ${ex.sets.length > 0 ? `
          ${ex.sets.map((set, si) => {
            const isSetCompleted = set.completed || false;
            const isSetMissed = set.missed || false;
            const setCheckmarkIcon = isSetCompleted
              ? '<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/></svg>'
              : '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg>';
            const missIcon = isSetMissed
              ? '<svg class="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>'
              : '<svg class="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 7v6m0 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            const hasNote = !!set.note;
            const isNoteExpanded = expandedNotes.has(i + '-' + si);
            const pencilColor = hasNote ? 'text-blue-400' : 'text-gray-500';
            const noteInput = isNoteExpanded ? `
              <input type="text" value="${set.note || ''}" onchange="app.updateSet(${i}, ${si}, 'note', this.value)" placeholder="note" class="mt-1 ml-6 w-32 bg-transparent border-b border-gray-600 px-1 py-0.5 text-xs text-gray-400 focus:outline-none focus:border-blue-500 placeholder-gray-600 ${isSetCompleted ? 'opacity-50' : ''}">
              ` : '';
            return `
            <div class="py-1 border-b border-gray-600">
              <div class="flex items-center gap-2">
                <button onclick="app.toggleSetCompleted(${i}, ${si})" class="flex-shrink-0 hover:opacity-80 transition-opacity">
                  ${setCheckmarkIcon}
                </button>
                <span class="w-6 text-gray-400 text-xs ${isSetCompleted ? 'line-through' : ''}">${si + 1}</span>
                <input type="number" value="${set.weight}" onchange="app.updateSet(${i}, ${si}, 'weight', this.value)" class="w-16 bg-gray-600 border border-gray-500 rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-blue-500 ${isSetCompleted ? 'opacity-50' : ''}">
                <span class="text-gray-400 ${isSetCompleted ? 'line-through' : ''}">x</span>
                <input type="number" value="${set.reps}" onchange="app.updateSet(${i}, ${si}, 'reps', this.value)" class="w-14 bg-gray-600 border border-gray-500 rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-blue-500 ${isSetCompleted ? 'opacity-50' : ''}">
                ${set.isPR ? (set.completed && !isSetMissed ? '<span class="text-yellow-400 text-lg">★</span>' : '<span class="text-yellow-400 text-lg opacity-40">★</span>') : ''}
                <button onclick="app.toggleSetMissed(${i}, ${si})" class="flex-shrink-0 hover:opacity-80 transition-opacity" title="${isSetMissed ? 'Mark as not missed' : 'Mark as missed'}">
                  ${missIcon}
                </button>
                <button onclick="app.toggleNoteField(${i}, ${si})" class="${pencilColor} text-sm hover:opacity-80 transition-opacity" title="${hasNote ? 'Edit note' : 'Add note'}">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                  </svg>
                </button>
                <button onclick="app.deleteSet(${i}, ${si})" class="text-red-400 hover:opacity-80 transition-opacity" title="Delete set">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
              ${noteInput}
            </div>
          `;}).join('')}
        ` : ''}

        <div id="add-set-collapsed-${i}" class="mt-2 pt-2 ${ex.sets.length > 0 ? 'border-t border-gray-600' : ''}">
          <button onclick="app.showAddSetForm(${i})" class="text-blue-400 text-sm">+ Add set</button>
        </div>
        <div id="add-set-expanded-${i}" class="hidden mt-2 pt-2 ${ex.sets.length > 0 ? 'border-t border-gray-600' : ''}">
          <div class="flex items-center gap-2">
            <span class="text-gray-400 text-xs w-6">${nextSetNum}</span>
            <input type="number" id="weight-${i}" class="w-16 bg-gray-600 border border-gray-500 rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-blue-500" placeholder="wt">
            <span class="text-gray-400">x</span>
            <input type="number" id="reps-${i}" class="w-14 bg-gray-600 border border-gray-500 rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-blue-500" placeholder="reps">
            <button onclick="app.saveSetInline(${i})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm">Save</button>
            <button onclick="app.hideAddSetForm(${i})" class="text-gray-400 text-sm">Cancel</button>
          </div>
          <input type="text" id="note-${i}" placeholder="note (optional)" class="mt-2 ml-6 w-40 bg-transparent border-b border-gray-600 px-1 py-0.5 text-xs text-gray-400 focus:outline-none focus:border-blue-500 placeholder-gray-600">
        </div>
      </div>
    `;

    const isCompleted = ex.completed || false;
    const checkmarkIcon = isCompleted
      ? '<svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/></svg>'
      : '<svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg>';

    return `
      <div class="bg-gray-700 rounded-lg p-4 mb-3">
        <div class="flex justify-between items-start mb-3">
          <div class="flex items-center gap-3">
            <button onclick="app.toggleExerciseCompleted(${i})" class="flex-shrink-0 hover:opacity-80 transition-opacity">
              ${checkmarkIcon}
            </button>
            <div>
              <div class="font-medium ${isCompleted ? 'text-gray-400 line-through' : ''}">${ex.name}</div>
              <div class="text-xs ${getTypeColor(exercise.type)}">${getTypeLabel(exercise.type)}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="app.moveExerciseUp(${i})" class="text-gray-400 hover:text-blue-400 transition-colors ${i === 0 ? 'opacity-30 cursor-not-allowed' : ''}" ${i === 0 ? 'disabled' : ''} title="Move up">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
              </svg>
            </button>
            <button onclick="app.moveExerciseDown(${i})" class="text-gray-400 hover:text-blue-400 transition-colors ${i === exerciseCount - 1 ? 'opacity-30 cursor-not-allowed' : ''}" ${i === exerciseCount - 1 ? 'disabled' : ''} title="Move down">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            <button onclick="app.removeExercise(${i})" class="text-red-400 text-sm px-2 hover:text-red-300">x</button>
          </div>
        </div>
        ${setsHtml}
      </div>
    `;
  }).join('');
}

function getPreviousSets(exerciseName: string): Set[] {
  for (const workout of state.history) {
    const ex = workout.exercises.find(e => e.name === exerciseName);
    if (ex && ex.sets.length > 0) return ex.sets;
  }
  return [];
}

function removeExercise(index: number): void {
  if (confirm('Remove this exercise?')) {
    state.currentWorkout!.exercises.splice(index, 1);
    renderWorkout();
    scheduleAutoSave();
  }
}

function moveExerciseUp(index: number): void {
  if (index === 0) return; // Already at the top
  const exercises = state.currentWorkout!.exercises;
  // Swap with previous exercise
  [exercises[index - 1], exercises[index]] = [exercises[index], exercises[index - 1]];
  renderWorkout();
  scheduleAutoSave();
}

function moveExerciseDown(index: number): void {
  const exercises = state.currentWorkout!.exercises;
  if (index === exercises.length - 1) return; // Already at the bottom
  // Swap with next exercise
  [exercises[index], exercises[index + 1]] = [exercises[index + 1], exercises[index]];
  renderWorkout();
  scheduleAutoSave();
}

function toggleExerciseCompleted(index: number): void {
  const exercise = state.currentWorkout!.exercises[index];
  exercise.completed = !exercise.completed;
  renderWorkout();
  scheduleAutoSave();
}

function toggleSetCompleted(exerciseIndex: number, setIndex: number): void {
  const set = state.currentWorkout!.exercises[exerciseIndex].sets[setIndex];
  set.completed = !set.completed;
  // Recalculate PRs after toggling completion (affects which sets count toward PRs)
  recalculateAllPRs();
  renderWorkout();
  scheduleAutoSave();
}

function toggleSetMissed(exerciseIndex: number, setIndex: number): void {
  const set = state.currentWorkout!.exercises[exerciseIndex].sets[setIndex];
  set.missed = !set.missed;
  // Recalculate PRs after toggling missed (affects which sets count toward PRs)
  recalculateAllPRs();
  renderWorkout();
  scheduleAutoSave();
}

function toggleNoteField(exerciseIndex: number, setIndex: number): void {
  const key = `${exerciseIndex}-${setIndex}`;
  if (expandedNotes.has(key)) {
    expandedNotes.delete(key);
  } else {
    expandedNotes.add(key);
  }
  renderWorkout();
}

// ==================== INLINE SET LOGGING ====================
function showAddSetForm(exerciseIndex: number): void {
  const ex = state.currentWorkout!.exercises[exerciseIndex];
  const prevSets = getPreviousSets(ex.name);
  const lastSet = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : (prevSets[0] || { weight: 0, reps: 10 });

  $('add-set-collapsed-' + exerciseIndex).classList.add('hidden');
  $('add-set-expanded-' + exerciseIndex).classList.remove('hidden');
  ($('weight-' + exerciseIndex) as HTMLInputElement).value = String(lastSet.weight);
  ($('reps-' + exerciseIndex) as HTMLInputElement).value = String(lastSet.reps);
  ($('weight-' + exerciseIndex) as HTMLInputElement).focus();
}

function hideAddSetForm(exerciseIndex: number): void {
  $('add-set-collapsed-' + exerciseIndex).classList.remove('hidden');
  $('add-set-expanded-' + exerciseIndex).classList.add('hidden');
}

function saveSetInline(exerciseIndex: number): void {
  const weight = parseFloat(($('weight-' + exerciseIndex) as HTMLInputElement).value) || 0;
  const reps = parseInt(($('reps-' + exerciseIndex) as HTMLInputElement).value) || 0;
  const note = ($('note-' + exerciseIndex) as HTMLInputElement).value.trim();

  const set: Set = { weight, reps };
  if (note) set.note = note;

  state.currentWorkout!.exercises[exerciseIndex].sets.push(set);
  // Recalculate PRs after adding a new set
  recalculateAllPRs();
  renderWorkout();
  scheduleAutoSave();
}

function updateSet(exerciseIndex: number, setIndex: number, field: string, value: string): void {
  const set = state.currentWorkout!.exercises[exerciseIndex].sets[setIndex];
  if (field === 'note') {
    if (value.trim()) {
      set.note = value.trim();
    } else {
      delete set.note;
    }
    renderWorkout();
  } else if (field === 'weight') {
    set.weight = parseFloat(value) || 0;
    // Recalculate PRs when weight changes
    recalculateAllPRs();
    renderWorkout();
  } else if (field === 'reps') {
    set.reps = parseInt(value) || 0;
    // Recalculate PRs when reps change
    recalculateAllPRs();
    renderWorkout();
  }
  scheduleAutoSave();
}

function deleteSet(exerciseIndex: number, setIndex: number): void {
  state.currentWorkout!.exercises[exerciseIndex].sets.splice(setIndex, 1);
  // Recalculate PRs after deleting a set (affects subsequent sets' PR status)
  recalculateAllPRs();
  renderWorkout();
  scheduleAutoSave();
}

// ==================== ADD EXERCISE ====================
let addExerciseSort = { field: 'recent', asc: true };
const expandedAddExerciseCategories = new Set<string>();

function getLastLoggedDate(exerciseName: string): number | null {
  for (const workout of state.history) {
    const ex = workout.exercises.find(e => e.name === exerciseName);
    if (ex && ex.sets.length > 0) {
      return workout.start_time;
    }
  }
  return null;
}

function getLatestPRForExercise(exerciseName: string): PersonalRecord | null {
  const prs = state.allPRs.filter(pr => pr.exercise_name === exerciseName);
  if (prs.length === 0) return null;

  // Sort by achieved_at descending to get the most recent
  prs.sort((a, b) => b.achieved_at - a.achieved_at);
  return prs[0];
}

// Get co-occurrence information for an exercise with the current workout's exercises
function getCoOccurrenceInfo(exerciseName: string, currentExerciseNames: string[]): { hasCoOccurred: boolean; lastCoOccurrence: number | null } {
  if (currentExerciseNames.length === 0 || currentExerciseNames.includes(exerciseName)) {
    return { hasCoOccurred: false, lastCoOccurrence: null };
  }

  let lastCoOccurrenceTime: number | null = null;

  // Look through all past workouts
  for (const workout of state.history) {
    const exerciseNamesInWorkout = workout.exercises.map(e => e.name);

    // Check if this workout contains the exercise we're checking
    const containsTargetExercise = exerciseNamesInWorkout.includes(exerciseName);

    // Check if this workout contains any of the current workout's exercises
    const containsCurrentExercise = currentExerciseNames.some(name =>
      exerciseNamesInWorkout.includes(name)
    );

    // If both conditions are true, this is a co-occurrence
    if (containsTargetExercise && containsCurrentExercise) {
      if (lastCoOccurrenceTime === null || workout.start_time > lastCoOccurrenceTime) {
        lastCoOccurrenceTime = workout.start_time;
      }
    }
  }

  return { hasCoOccurred: lastCoOccurrenceTime !== null, lastCoOccurrence: lastCoOccurrenceTime };
}

function sortAddExercises(exercises: Exercise[]): Exercise[] {
  const sorted = [...exercises];
  if (addExerciseSort.field === 'alpha') {
    sorted.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return addExerciseSort.asc ? cmp : -cmp;
    });
  } else {
    // Get current workout exercise names for smart ranking
    const currentExerciseNames = state.currentWorkout?.exercises.map(e => e.name) || [];

    sorted.sort((a, b) => {
      // Get co-occurrence information
      const aCoOccurrence = getCoOccurrenceInfo(a.name, currentExerciseNames);
      const bCoOccurrence = getCoOccurrenceInfo(b.name, currentExerciseNames);

      // First priority: exercises that have co-occurred with current workout exercises
      if (aCoOccurrence.hasCoOccurred && !bCoOccurrence.hasCoOccurred) {
        return -1; // a comes first
      }
      if (!aCoOccurrence.hasCoOccurred && bCoOccurrence.hasCoOccurred) {
        return 1; // b comes first
      }

      // If both have co-occurred, sort by most recent co-occurrence
      if (aCoOccurrence.hasCoOccurred && bCoOccurrence.hasCoOccurred) {
        const aTime = aCoOccurrence.lastCoOccurrence || 0;
        const bTime = bCoOccurrence.lastCoOccurrence || 0;
        return bTime - aTime; // Most recent co-occurrence first
      }

      // If neither have co-occurred, sort by last logged date
      const aDate = getLastLoggedDate(a.name) || 0;
      const bDate = getLastLoggedDate(b.name) || 0;
      const cmp = bDate - aDate;
      return addExerciseSort.asc ? cmp : -cmp;
    });
  }
  return sorted;
}

function toggleAddExerciseSort(field: string): void {
  if (addExerciseSort.field === field) {
    addExerciseSort.asc = !addExerciseSort.asc;
  } else {
    addExerciseSort.field = field;
    addExerciseSort.asc = true;
  }
  updateAddExerciseSortButtons();
  renderAddExerciseCategories();
}

function updateAddExerciseSortButtons(): void {
  const alphaBtn = $('add-exercise-sort-alpha');
  const recentBtn = $('add-exercise-sort-recent');

  if (addExerciseSort.field === 'alpha') {
    alphaBtn.className = 'text-blue-400';
    alphaBtn.textContent = addExerciseSort.asc ? 'A-Z' : 'Z-A';
    recentBtn.className = 'text-gray-400';
    recentBtn.textContent = 'Recent';
  } else {
    recentBtn.className = 'text-blue-400';
    recentBtn.textContent = addExerciseSort.asc ? 'Recent' : 'Oldest';
    alphaBtn.className = 'text-gray-400';
    alphaBtn.textContent = 'A-Z';
  }
}

function renderAddExerciseCategories(): void {
  const allExercises = getAllExercises();
  const container = $('add-exercise-categories');

  container.innerHTML = mainCategories.map(main => {
    let exercises = allExercises.filter(e => main.subCategories.includes(e.category));
    if (exercises.length === 0) return '';

    exercises = sortAddExercises(exercises);
    const isExpanded = expandedAddExerciseCategories.has(main.name);

    return `
      <div class="mb-4">
        <button onclick="app.toggleAddExerciseCategory('${main.name}')" class="flex justify-between items-center w-full py-2 text-left">
          <span class="font-medium text-gray-300">${main.name}</span>
          <span class="text-gray-500 text-sm mr-2">${exercises.length}</span>
          <span id="add-${main.name}-arrow" class="text-gray-400">${isExpanded ? '&#9660;' : '&#9654;'}</span>
        </button>
        <div id="add-${main.name}-exercises" class="space-y-2 mt-2 ${isExpanded ? '' : 'hidden'}">
          ${exercises.map(e => {
            const lastLogged = getLastLoggedDate(e.name);
            const lastLoggedText = lastLogged ? formatDate(lastLogged) : '';
            const latestPR = getLatestPRForExercise(e.name);
            const prText = latestPR ? `★ ${latestPR.weight}${e.unit} x ${latestPR.reps}` : '';
            return `
              <button onclick="app.addExerciseToWorkout('${e.name.replace(/'/g, "\\'")}')" class="w-full bg-gray-700 rounded-lg p-3 text-left hover:bg-gray-600">
                <div class="flex justify-between items-center">
                  <span class="font-medium">${e.name}</span>
                  ${lastLoggedText ? `<span class="text-xs text-gray-500">${lastLoggedText}</span>` : ''}
                </div>
                ${prText ? `<div class="text-xs text-yellow-400 mt-1">${prText}</div>` : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function toggleAddExerciseCategory(category: string): void {
  const exercises = $('add-' + category + '-exercises');
  const arrow = $('add-' + category + '-arrow');
  if (exercises.classList.contains('hidden')) {
    exercises.classList.remove('hidden');
    arrow.innerHTML = '&#9660;';
    expandedAddExerciseCategories.add(category);
  } else {
    exercises.classList.add('hidden');
    arrow.innerHTML = '&#9654;';
    expandedAddExerciseCategories.delete(category);
  }
}

function filterAddExerciseSearch(): void {
  const query = ($('add-exercise-search') as HTMLInputElement).value.toLowerCase();
  const categories = $('add-exercise-categories');
  const results = $('add-exercise-search-results');

  if (query.length === 0) {
    categories.classList.remove('hidden');
    results.classList.add('hidden');
    return;
  }

  categories.classList.add('hidden');
  results.classList.remove('hidden');

  const filtered = sortAddExercises(getAllExercises().filter(e => e.name.toLowerCase().includes(query)));
  results.innerHTML = filtered.map(e => {
    const lastLogged = getLastLoggedDate(e.name);
    const lastLoggedText = lastLogged ? formatDate(lastLogged) : '';
    const latestPR = getLatestPRForExercise(e.name);
    const prText = latestPR ? `★ ${latestPR.weight}${e.unit} x ${latestPR.reps}` : '';

    return `
      <button onclick="app.addExerciseToWorkout('${e.name.replace(/'/g, "\\'")}')" class="w-full bg-gray-700 rounded-lg p-3 text-left hover:bg-gray-600">
        <div class="flex justify-between items-center">
          <span class="font-medium">${e.name}</span>
          ${lastLoggedText ? `<span class="text-xs text-gray-500">${lastLoggedText}</span>` : ''}
        </div>
        ${prText ? `<div class="text-xs text-yellow-400 mt-1">${prText}</div>` : ''}
      </button>
    `;
  }).join('');
}

function showAddExercise(): void {
  ($('add-exercise-search') as HTMLInputElement).value = '';
  addExerciseSort = { field: 'recent', asc: true };
  updateAddExerciseSortButtons();
  renderAddExerciseCategories();
  showWorkoutScreen('workout-add-exercise');
}

function hideAddExercise(): void {
  showWorkoutScreen('workout-active');
}

function addExerciseToWorkout(name: string): void {
  state.currentWorkout!.exercises.push({ name, sets: [], completed: false });
  renderWorkout();
  hideAddExercise();
  scheduleAutoSave();
}

function showCreateExerciseFromWorkout(): void {
  $input('workout-exercise-name-input').value = '';
  $select('workout-exercise-category-input').value = 'Other';
  document.querySelectorAll('input[name="workout-weight-type"]').forEach(r => {
    (r as HTMLInputElement).checked = false;
  });
  (document.querySelector('input[name="workout-weight-type"][value="total"]') as HTMLInputElement).checked = true;
  setWorkoutExerciseUnit('lbs');
  showWorkoutScreen('workout-create-exercise');
}

function cancelCreateExerciseFromWorkout(): void {
  showWorkoutScreen('workout-add-exercise');
}

function setWorkoutExerciseUnit(unit: 'lbs' | 'kg'): void {
  workoutExerciseUnit = unit;
  $('workout-exercise-unit-lbs').className = unit === 'lbs' ? 'bg-blue-600 px-4 py-2 rounded-lg text-sm' : 'bg-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-500';
  $('workout-exercise-unit-kg').className = unit === 'kg' ? 'bg-blue-600 px-4 py-2 rounded-lg text-sm' : 'bg-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-500';
}

async function saveExerciseFromWorkout(): Promise<void> {
  const name = $input('workout-exercise-name-input').value.trim();
  const category = $select('workout-exercise-category-input').value;
  const typeInput = document.querySelector('input[name="workout-weight-type"]:checked') as HTMLInputElement | null;
  const unit = workoutExerciseUnit;

  if (!name) {
    alert('Please enter an exercise name');
    return;
  }
  if (!typeInput) {
    alert('Please select a weight type');
    return;
  }

  const type = typeInput.value as 'total' | '/side' | '+bar' | 'bodyweight';

  try {
    await api.createCustomExercise({ name, type, category, unit });
    await loadData();

    // Add the newly created exercise to the current workout
    state.currentWorkout!.exercises.push({ name, sets: [], completed: false });
    renderWorkout();
    showWorkoutScreen('workout-active');
    scheduleAutoSave();
  } catch (error) {
    console.error('Failed to save exercise:', error);
    alert('Failed to save exercise');
  }
}

// ==================== HISTORY ====================
function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getFirstDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}

function getWorkoutsForDate(date: Date): Workout[] {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const endOfDay = startOfDay + 86400000 - 1; // 24 hours - 1ms
  return state.history.filter(w => w.start_time >= startOfDay && w.start_time <= endOfDay);
}

function changeCalendarMonth(offset: number): void {
  currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + offset, 1);
  renderHistory();
}

function goToToday(): void {
  currentCalendarDate = new Date();
  renderHistory();
}

function renderHistory(): void {
  const container = $('history-list');

  const today = new Date();
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const daysInMonth = getDaysInMonth(currentCalendarDate);
  const firstDay = getFirstDayOfMonth(currentCalendarDate);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // Calendar header with navigation
  let html = `
    <div class="mb-4 flex items-center justify-between">
      <button onclick="app.changeCalendarMonth(-1)" class="text-blue-400 hover:text-blue-300 p-2">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <div class="flex flex-col items-center">
        <h2 class="text-xl font-bold">${monthNames[month]} ${year}</h2>
        ${!isCurrentMonth ? '<button onclick="app.goToToday()" class="text-xs text-blue-400 hover:text-blue-300 mt-1">Today</button>' : ''}
      </div>
      <button onclick="app.changeCalendarMonth(1)" class="text-blue-400 hover:text-blue-300 p-2">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  `;

  // Day headers
  html += '<div class="grid grid-cols-7 gap-1 mb-2">';
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
    html += `<div class="text-center text-xs text-gray-500 py-1">${day}</div>`;
  });
  html += '</div>';

  // Calendar grid
  html += '<div class="grid grid-cols-7 gap-1">';

  // Empty cells for days before the first of the month
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="aspect-square"></div>';
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const workouts = getWorkoutsForDate(date);
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    const hasWorkouts = workouts.length > 0;

    let cellClass = 'aspect-square flex flex-col items-center justify-center rounded-lg text-sm relative';

    if (hasWorkouts) {
      cellClass += ' bg-blue-600 hover:bg-blue-700 cursor-pointer';
    } else {
      cellClass += ' bg-gray-800';
    }

    if (isToday) {
      cellClass += ' ring-2 ring-green-400';
    }

    const onclick = hasWorkouts ? `onclick="app.showDayWorkouts('${date.toISOString()}')"` : '';

    html += `
      <div class="${cellClass}" ${onclick}>
        <div class="${isToday ? 'font-bold' : ''}">${day}</div>
        ${hasWorkouts ? `<div class="text-xs text-blue-200 mt-0.5">${workouts.length}</div>` : ''}
      </div>
    `;
  }

  html += '</div>';

  container.innerHTML = html;
}

function showDayWorkouts(dateStr: string): void {
  const date = new Date(dateStr);
  const workouts = getWorkoutsForDate(date);

  if (workouts.length === 0) return;

  // If only one workout, go straight to edit
  if (workouts.length === 1) {
    editWorkout(workouts[0].id);
    return;
  }

  // Show a modal/view to choose which workout to view (for multiple workouts in one day)
  const container = $('history-list');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  let html = `
    <div>
      <button onclick="app.renderHistory()" class="text-blue-400 hover:text-blue-300 mb-4 flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to calendar
      </button>
      <h2 class="text-xl font-bold mb-4">${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}</h2>
      <div class="space-y-3">
  `;

  workouts.forEach(w => {
    const exerciseNames = w.exercises.map(e => e.name).slice(0, 3).join(', ');
    const more = w.exercises.length > 3 ? ` +${w.exercises.length - 3} more` : '';
    const isDeleting = pendingDeleteWorkoutId === w.id;
    const time = new Date(w.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    html += `
      <div class="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600" onclick="app.editWorkout('${w.id}')">
        <div class="font-medium">${time}</div>
        <div class="text-sm text-gray-400">${w.exercises.length} exercises</div>
        <div class="text-xs text-gray-500 mt-1">${exerciseNames}${more}</div>
        <div class="mt-3 pt-3 border-t border-gray-600 flex justify-end">
          ${isDeleting ? `
            <div class="flex items-center gap-2" onclick="event.stopPropagation()">
              <span class="text-red-400 text-sm">Delete?</span>
              <button onclick="app.confirmDeleteWorkout('${w.id}')" class="bg-red-600 hover:bg-red-700 text-white text-sm px-2 py-1 rounded">Yes</button>
              <button onclick="app.cancelDeleteWorkout()" class="text-gray-400 text-sm hover:text-gray-300">No</button>
            </div>
          ` : `
            <button onclick="event.stopPropagation(); app.showDeleteWorkoutConfirm('${w.id}')" class="text-gray-500 text-sm hover:text-red-400">Delete</button>
          `}
        </div>
      </div>
    `;
  });

  html += '</div></div>';
  container.innerHTML = html;
}

function showDeleteWorkoutConfirm(id: string): void {
  pendingDeleteWorkoutId = id;
  showDayWorkouts(new Date(state.history.find(w => w.id === id)!.start_time).toISOString());
}

function cancelDeleteWorkout(): void {
  const workoutId = pendingDeleteWorkoutId;
  pendingDeleteWorkoutId = null;
  const workout = state.history.find(w => w.id === workoutId);
  if (workout) {
    showDayWorkouts(new Date(workout.start_time).toISOString());
  } else {
    renderHistory();
  }
}

async function confirmDeleteWorkout(id: string): Promise<void> {
  try {
    const workout = state.history.find(w => w.id === id);
    await api.deleteWorkout(id);
    pendingDeleteWorkoutId = null;
    await loadData();

    // If there are still workouts on this day, show the day view, otherwise show calendar
    if (workout) {
      const workoutsOnDay = getWorkoutsForDate(new Date(workout.start_time));
      if (workoutsOnDay.length > 0) {
        showDayWorkouts(new Date(workout.start_time).toISOString());
      } else {
        renderHistory();
      }
    } else {
      renderHistory();
    }
  } catch (error) {
    console.error('Failed to delete workout:', error);
    alert('Failed to delete workout');
  }
}

function editWorkout(id: string): void {
  const source = state.history.find(w => w.id === id);
  if (!source) return;

  state.currentWorkout = {
    startTime: source.start_time,
    exercises: JSON.parse(JSON.stringify(source.exercises)),
  };
  state.editingWorkoutId = id;
  isEditingFromHistory = true;
  expandedNotes.clear();
  $('workout-title').textContent = formatDate(source.start_time);
  $('workout-finish-btn').textContent = 'Save';
  switchTab('workout');
  showWorkoutScreen('workout-active');
  renderWorkout();
}

// ==================== EXERCISES TAB ====================
const mainCategories = [
  { name: 'Chest', subCategories: ['Chest'] },
  { name: 'Shoulders', subCategories: ['Shoulders'] },
  { name: 'Triceps', subCategories: ['Triceps'] },
  { name: 'Back', subCategories: ['Back'] },
  { name: 'Biceps', subCategories: ['Biceps'] },
  { name: 'Legs', subCategories: ['Legs'] },
  { name: 'Core', subCategories: ['Core'] },
  { name: 'Cardio', subCategories: ['Cardio'] },
  { name: 'Other', subCategories: ['Other'] },
];

let exerciseTabSort = { field: 'recent', asc: true };
const expandedCategories = new Set<string>();

function toggleExerciseTabSort(field: string): void {
  if (exerciseTabSort.field === field) {
    exerciseTabSort.asc = !exerciseTabSort.asc;
  } else {
    exerciseTabSort.field = field;
    exerciseTabSort.asc = true;
  }
  updateExerciseTabSortButtons();
  renderExerciseCategories();
}

function updateExerciseTabSortButtons(): void {
  const alphaBtn = $('exercise-tab-sort-alpha');
  const recentBtn = $('exercise-tab-sort-recent');

  if (exerciseTabSort.field === 'alpha') {
    alphaBtn.className = 'text-blue-400';
    alphaBtn.textContent = exerciseTabSort.asc ? 'A-Z' : 'Z-A';
    recentBtn.className = 'text-gray-400';
    recentBtn.textContent = 'Recent';
  } else {
    recentBtn.className = 'text-blue-400';
    recentBtn.textContent = exerciseTabSort.asc ? 'Recent' : 'Oldest';
    alphaBtn.className = 'text-gray-400';
    alphaBtn.textContent = 'A-Z';
  }
}

function sortExercises(exercises: Exercise[]): Exercise[] {
  const sorted = [...exercises];
  if (exerciseTabSort.field === 'alpha') {
    sorted.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return exerciseTabSort.asc ? cmp : -cmp;
    });
  } else {
    sorted.sort((a, b) => {
      const aDate = getLastLoggedDate(a.name) || 0;
      const bDate = getLastLoggedDate(b.name) || 0;
      const cmp = bDate - aDate;
      return exerciseTabSort.asc ? cmp : -cmp;
    });
  }
  return sorted;
}

function renderExerciseCategories(): void {
  const allExercises = getAllExercises();
  const container = $('exercise-categories');

  container.innerHTML = mainCategories.map(main => {
    let exercises = allExercises.filter(e => main.subCategories.includes(e.category));
    if (exercises.length === 0) return '';

    exercises = sortExercises(exercises);
    const isExpanded = expandedCategories.has(main.name);

    return `
      <div class="mb-4">
        <button onclick="app.toggleCategory('${main.name}')" class="flex justify-between items-center w-full py-2 text-left">
          <span class="font-medium text-gray-300">${main.name}</span>
          <span class="text-gray-500 text-sm mr-2">${exercises.length}</span>
          <span id="${main.name}-arrow" class="text-gray-400">${isExpanded ? '&#9660;' : '&#9654;'}</span>
        </button>
        <div id="${main.name}-exercises" class="space-y-2 mt-2 ${isExpanded ? '' : 'hidden'}">
          ${exercises.map(e => {
            const isCustom = state.customExercises.some(c => c.name === e.name);
            const lastLogged = getLastLoggedDate(e.name);
            const lastLoggedText = lastLogged ? formatDate(lastLogged) : '';
            return `
              <button onclick="app.showEditExercise('${e.name.replace(/'/g, "\\'")}')" class="w-full bg-gray-700 rounded-lg p-3 text-left hover:bg-gray-600 flex justify-between items-center">
                <span class="font-medium">${e.name}</span>
                <div class="text-right">
                  ${lastLoggedText ? `<span class="text-xs text-gray-500">${lastLoggedText}</span>` : ''}
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function toggleCategory(category: string): void {
  const exercises = $(category + '-exercises');
  const arrow = $(category + '-arrow');
  if (exercises.classList.contains('hidden')) {
    exercises.classList.remove('hidden');
    arrow.innerHTML = '&#9660;';
    expandedCategories.add(category);
  } else {
    exercises.classList.add('hidden');
    arrow.innerHTML = '&#9654;';
    expandedCategories.delete(category);
  }
}

function filterExercises(): void {
  const query = ($('exercise-search') as HTMLInputElement).value.toLowerCase();
  const categories = $('exercise-categories');
  const results = $('exercise-search-results');

  if (query.length === 0) {
    categories.classList.remove('hidden');
    results.classList.add('hidden');
    return;
  }

  categories.classList.add('hidden');
  results.classList.remove('hidden');

  const filtered = getAllExercises().filter(e => e.name.toLowerCase().includes(query));
  results.innerHTML = filtered.map(e => {
    return `
      <button onclick="app.showEditExercise('${e.name.replace(/'/g, "\\'")}')" class="w-full bg-gray-700 rounded-lg p-3 text-left hover:bg-gray-600 flex justify-between items-center">
        <div>
          <div class="font-medium">${e.name}</div>
          <div class="text-xs ${getTypeColor(e.type)}">${getTypeLabel(e.type)}</div>
        </div>
        <span class="text-gray-500 text-xs">&#9654;</span>
      </button>
    `;
  }).join('');
}

// ==================== EXERCISE CRUD ====================
function showExercisesListView(): void {
  $('exercises-list-view').classList.remove('hidden');
  $('exercises-edit-view').classList.add('hidden');
}

function showExercisesEditView(): void {
  $('exercises-list-view').classList.add('hidden');
  $('exercises-edit-view').classList.remove('hidden');
}

function showCreateExercise(): void {
  state.editingExercise = null;
  $('edit-exercise-title').textContent = 'New Exercise';
  $input('exercise-name-input').value = '';
  $input('exercise-name-input').disabled = false;
  $select('exercise-category-input').value = 'Other';
  $select('exercise-category-input').disabled = false;
  document.querySelectorAll('input[name="weight-type"]').forEach(r => {
    (r as HTMLInputElement).checked = false;
    (r as HTMLInputElement).disabled = false;
  });
  (document.querySelector('input[name="weight-type"][value="total"]') as HTMLInputElement).checked = true;
  setExerciseUnit('lbs');
  $('exercise-history-section').classList.add('hidden');
  $('delete-exercise-section').classList.add('hidden');
  showExercisesEditView();
}

function showEditExercise(exerciseName: string): void {
  const allExercises = getAllExercises();
  const exercise = allExercises.find(e => e.name === exerciseName);
  if (!exercise) return;

  const customExercise = state.customExercises.find(c => c.name === exerciseName);
  const isCustom = !!customExercise;

  state.editingExercise = {
    id: customExercise?.id || null,
    name: exerciseName,
    isCustom,
  };

  $('edit-exercise-title').textContent = 'Edit Exercise';
  $input('exercise-name-input').value = exercise.name;
  $input('exercise-name-input').disabled = !isCustom;
  $select('exercise-category-input').value = exercise.category;
  $select('exercise-category-input').disabled = !isCustom;

  document.querySelectorAll('input[name="weight-type"]').forEach(r => {
    (r as HTMLInputElement).checked = (r as HTMLInputElement).value === exercise.type;
    (r as HTMLInputElement).disabled = false;
  });

  setExerciseUnit(exercise.unit);

  // Populate recent sets history and PRs
  const recentSets = getRecentSetsForExercise(exerciseName, 10);
  const exercisePRs = state.allPRs.filter(pr => pr.exercise_name === exerciseName);
  const historyList = $('exercise-history-list');
  $('exercise-history-section').classList.remove('hidden');

  let historyHTML = '';

  // Show PRs first if any
  if (exercisePRs.length > 0) {
    historyHTML += `
      <div class="mb-3">
        <div class="text-yellow-400 text-xs font-medium mb-2">★ PERSONAL RECORDS</div>
        <div class="flex text-gray-500 text-xs mb-1">
          <span class="w-20">DATE</span>
          <span class="w-16">WEIGHT</span>
          <span class="flex-1">REPS</span>
        </div>
        ${exercisePRs.sort((a, b) => b.achieved_at - a.achieved_at).slice(0, 5).map(pr => `
          <div class="flex text-sm py-1">
            <span class="w-20 text-gray-400">${formatDate(pr.achieved_at)}</span>
            <span class="w-16">${pr.weight} ${exercise.unit}</span>
            <span class="flex-1">${pr.reps}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Then show recent history
  if (recentSets.length > 0) {
    historyHTML += `
      <div>
        <div class="text-gray-400 text-xs font-medium mb-2">RECENT SETS</div>
        <div class="flex text-gray-500 text-xs mb-1">
          <span class="w-20">DATE</span>
          <span class="w-16">WEIGHT</span>
          <span class="flex-1">REPS</span>
        </div>
        ${recentSets.map(s => `
          <div class="flex text-sm py-1">
            <span class="w-20 text-gray-400">${formatDate(s.date)}</span>
            <span class="w-16">${s.weight} ${exercise.unit}</span>
            <span class="flex-1">${s.reps}${s.note ? ` <span class="text-gray-500 text-xs">${s.note}</span>` : ''}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (historyHTML) {
    historyList.innerHTML = historyHTML;
  } else {
    historyList.innerHTML = '<p class="text-gray-500 text-sm">No history yet</p>';
  }

  if (isCustom) {
    $('delete-exercise-section').classList.remove('hidden');
  } else {
    $('delete-exercise-section').classList.add('hidden');
  }

  showExercisesEditView();
}

function getRecentSetsForExercise(exerciseName: string, limit: number): Array<{ date: number; weight: number; reps: number; note?: string }> {
  const sets: Array<{ date: number; weight: number; reps: number; note?: string }> = [];
  for (const workout of state.history) {
    const ex = workout.exercises.find(e => e.name === exerciseName);
    if (ex) {
      for (const set of [...ex.sets].reverse()) {
        sets.push({
          date: workout.start_time,
          weight: set.weight,
          reps: set.reps,
          note: set.note,
        });
      }
    }
  }
  return sets.slice(0, limit);
}

function hideEditExercise(): void {
  $input('exercise-name-input').disabled = false;
  $select('exercise-category-input').disabled = false;
  document.querySelectorAll('input[name="weight-type"]').forEach(r => (r as HTMLInputElement).disabled = false);

  state.editingExercise = null;
  showExercisesListView();
  renderExerciseCategories();
}

function setExerciseUnit(unit: 'lbs' | 'kg'): void {
  currentExerciseUnit = unit;
  $('exercise-unit-lbs').className = unit === 'lbs' ? 'bg-blue-600 px-4 py-2 rounded-lg text-sm' : 'bg-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-500';
  $('exercise-unit-kg').className = unit === 'kg' ? 'bg-blue-600 px-4 py-2 rounded-lg text-sm' : 'bg-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-500';
}

async function saveExercise(): Promise<void> {
  const name = $input('exercise-name-input').value.trim();
  const category = $select('exercise-category-input').value;
  const typeInput = document.querySelector('input[name="weight-type"]:checked') as HTMLInputElement | null;
  const unit = currentExerciseUnit;

  if (!name) {
    alert('Please enter an exercise name');
    return;
  }
  if (!typeInput) {
    alert('Please select a weight type');
    return;
  }

  const type = typeInput.value as 'total' | '/side' | '+bar' | 'bodyweight';

  try {
    if (state.editingExercise?.id) {
      await api.updateCustomExercise(state.editingExercise.id, { name, type, category, unit });
    } else {
      await api.createCustomExercise({ name, type, category, unit });
    }
    await loadData();
    hideEditExercise();
  } catch (error) {
    console.error('Failed to save exercise:', error);
    alert('Failed to save exercise');
  }
}

async function deleteExercise(): Promise<void> {
  if (!state.editingExercise?.id) return;

  if (confirm(`Delete "${state.editingExercise.name}"? This cannot be undone.`)) {
    try {
      await api.deleteCustomExercise(state.editingExercise.id);
      await loadData();
      hideEditExercise();
    } catch (error) {
      console.error('Failed to delete exercise:', error);
      alert('Failed to delete exercise');
    }
  }
}

// ==================== SETTINGS ====================
async function clearAllData(): Promise<void> {
  if (confirm('This will delete all workout history. Are you sure?')) {
    try {
      await api.clearAllData();
      await loadData();
      state.currentWorkout = null;
      state.editingWorkoutId = null;
      showWorkoutScreen('workout-empty');
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert('Failed to clear data');
    }
  }
}

// ==================== AUTH ====================
function showAuthScreen(): void {
  $('auth-screen').classList.remove('hidden');
  $('main-app').classList.add('hidden');
}

function showMainApp(): void {
  $('auth-screen').classList.add('hidden');
  $('main-app').classList.remove('hidden');
  if (currentUser) {
    $('settings-username').textContent = currentUser.username;
  }
}

function showLoginForm(): void {
  isRegisterMode = false;
  $('auth-login-tab').classList.add('border-blue-500', 'text-blue-400');
  $('auth-login-tab').classList.remove('border-gray-700', 'text-gray-400');
  $('auth-register-tab').classList.remove('border-blue-500', 'text-blue-400');
  $('auth-register-tab').classList.add('border-gray-700', 'text-gray-400');
  $('auth-submit-btn').textContent = 'Login';
  ($('auth-password') as HTMLInputElement).autocomplete = 'current-password';
  hideAuthError();
}

function showRegisterForm(): void {
  isRegisterMode = true;
  $('auth-register-tab').classList.add('border-blue-500', 'text-blue-400');
  $('auth-register-tab').classList.remove('border-gray-700', 'text-gray-400');
  $('auth-login-tab').classList.remove('border-blue-500', 'text-blue-400');
  $('auth-login-tab').classList.add('border-gray-700', 'text-gray-400');
  $('auth-submit-btn').textContent = 'Create Account';
  ($('auth-password') as HTMLInputElement).autocomplete = 'new-password';
  hideAuthError();
}

function showAuthError(message: string): void {
  const errorEl = $('auth-error');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideAuthError(): void {
  $('auth-error').classList.add('hidden');
}

async function handleAuthSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const username = ($('auth-username') as HTMLInputElement).value.trim();
  const password = ($('auth-password') as HTMLInputElement).value;

  if (!username || !password) {
    showAuthError('Please enter username and password');
    return;
  }

  try {
    if (isRegisterMode) {
      const response = await api.register(username, password);
      currentUser = response.user;
    } else {
      const response = await api.login(username, password);
      currentUser = response.user;
    }
    await loadData();
    showMainApp();
  } catch (error) {
    if (error instanceof api.ApiError) {
      showAuthError(error.message);
    } else {
      showAuthError('An error occurred. Please try again.');
    }
  }
}

function logout(): void {
  api.logout();
  currentUser = null;
  state.history = [];
  state.customExercises = [];
  state.currentWorkout = null;
  state.editingWorkoutId = null;
  ($('auth-username') as HTMLInputElement).value = '';
  ($('auth-password') as HTMLInputElement).value = '';
  showLoginForm();
  showAuthScreen();
}

// ==================== INIT ====================
async function init(): Promise<void> {
  // Set version
  $('app-version').textContent = `v${__APP_VERSION__}`;

  // Set up auth form handler
  $('auth-form').addEventListener('submit', handleAuthSubmit);

  // Check if already authenticated
  if (api.isAuthenticated()) {
    try {
      currentUser = await api.getCurrentUser();
      await loadData();
      showMainApp();
    } catch {
      // Token invalid or expired
      api.logout();
      showAuthScreen();
    }
  } else {
    showAuthScreen();
  }
}

// Export app object to window for onclick handlers
(window as unknown as Record<string, unknown>).app = {
  startWorkout,
  finishWorkout,
  showAddExercise,
  hideAddExercise,
  toggleAddExerciseSort,
  toggleAddExerciseCategory,
  filterAddExerciseSearch,
  addExerciseToWorkout,
  showCreateExerciseFromWorkout,
  cancelCreateExerciseFromWorkout,
  setWorkoutExerciseUnit,
  saveExerciseFromWorkout,
  showAddSetForm,
  hideAddSetForm,
  saveSetInline,
  updateSet,
  deleteSet,
  removeExercise,
  moveExerciseUp,
  moveExerciseDown,
  toggleExerciseCompleted,
  toggleSetCompleted,
  toggleSetMissed,
  toggleNoteField,
  switchTab,
  editWorkout,
  showDeleteWorkoutConfirm,
  cancelDeleteWorkout,
  confirmDeleteWorkout,
  changeCalendarMonth,
  goToToday,
  showDayWorkouts,
  renderHistory,
  toggleExerciseTabSort,
  toggleCategory,
  filterExercises,
  showCreateExercise,
  showEditExercise,
  hideEditExercise,
  saveExercise,
  deleteExercise,
  setExerciseUnit,
  clearAllData,
  showLoginForm,
  showRegisterForm,
  logout,
};

init();
