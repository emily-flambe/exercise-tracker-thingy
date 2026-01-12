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

let currentExerciseUnit: 'lbs' | 'kg' = 'lbs';
let pendingDeleteWorkoutId: string | null = null;
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let expandedNotes = new Set<string>(); // Track which notes are expanded (format: "exerciseIndex-setIndex")

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

    if (state.editingWorkoutId) {
      await api.updateWorkout(state.editingWorkoutId, workoutData);
    } else {
      await api.createWorkout(workoutData);
    }

    await loadData();
    state.currentWorkout = null;
    state.editingWorkoutId = null;
    expandedNotes.clear();
    showWorkoutScreen('workout-empty');
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

  list.innerHTML = state.currentWorkout.exercises.map((ex, i) => {
    const exercise = getAllExercises().find(e => e.name === ex.name) || { type: 'total', unit: 'lbs' };
    const prevSets = getPreviousSets(ex.name);

    const lastSet = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : (prevSets[0] || { weight: 0, reps: 10 });
    const nextSetNum = ex.sets.length + 1;

    let setsHtml = `
      <div class="text-sm">
        ${ex.sets.length > 0 ? `
          ${ex.sets.map((set, si) => {
            const isSetCompleted = set.completed || false;
            const setCheckmarkIcon = isSetCompleted
              ? '<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/></svg>'
              : '<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg>';
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
                ${set.isPR && set.completed !== false ? '<span class="text-yellow-400 text-lg">★</span>' : ''}
                <button onclick="app.toggleNoteField(${i}, ${si})" class="${pencilColor} text-sm hover:opacity-80 transition-opacity" title="${hasNote ? 'Edit note' : 'Add note'}">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                  </svg>
                </button>
                <button onclick="app.deleteSet(${i}, ${si})" class="text-red-400 text-xs px-2 hover:text-red-300">x</button>
              </div>
              ${noteInput}
            </div>
          `;}).join('')}
        ` : (prevSets.length > 0 ? `
          <div class="mb-3">
            <div class="text-gray-500 text-xs mb-2">Last time: ${prevSets.map(s => s.weight + 'x' + s.reps).join(', ')}</div>
            <button onclick="app.copyAllSets(${i})" class="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm">Copy all ${prevSets.length} sets</button>
          </div>
        ` : '')}

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
          <button onclick="app.removeExercise(${i})" class="text-red-400 text-sm px-2 hover:text-red-300">x</button>
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

function toggleExerciseCompleted(index: number): void {
  const exercise = state.currentWorkout!.exercises[index];
  exercise.completed = !exercise.completed;
  renderWorkout();
  scheduleAutoSave();
}

function toggleSetCompleted(exerciseIndex: number, setIndex: number): void {
  const set = state.currentWorkout!.exercises[exerciseIndex].sets[setIndex];
  set.completed = !set.completed;
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
  const weight = parseInt(($('weight-' + exerciseIndex) as HTMLInputElement).value) || 0;
  const reps = parseInt(($('reps-' + exerciseIndex) as HTMLInputElement).value) || 0;
  const note = ($('note-' + exerciseIndex) as HTMLInputElement).value.trim();

  const set: Set = { weight, reps };
  if (note) set.note = note;

  state.currentWorkout!.exercises[exerciseIndex].sets.push(set);
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
  } else if (field === 'weight') {
    set.weight = parseInt(value) || 0;
  } else if (field === 'reps') {
    set.reps = parseInt(value) || 0;
  }
  scheduleAutoSave();
}

function deleteSet(exerciseIndex: number, setIndex: number): void {
  state.currentWorkout!.exercises[exerciseIndex].sets.splice(setIndex, 1);
  renderWorkout();
  scheduleAutoSave();
}

function copyAllSets(exerciseIndex: number): void {
  const ex = state.currentWorkout!.exercises[exerciseIndex];
  const prevSets = getPreviousSets(ex.name);
  if (prevSets.length > 0) {
    ex.sets = prevSets.map(s => ({ weight: s.weight, reps: s.reps }));
    renderWorkout();
    scheduleAutoSave();
  }
}

// ==================== ADD EXERCISE ====================
const categoryMapping: Record<string, string[]> = {
  push: ['Chest', 'Shoulders', 'Triceps'],
  pull: ['Back', 'Biceps'],
  legs: ['Legs'],
  core: ['Core'],
};

let currentCategoryFilter = 'all';
let currentSort = { field: 'recent', asc: true };

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

function showAddExercise(): void {
  ($('add-exercise-search') as HTMLInputElement).value = '';
  currentCategoryFilter = 'all';
  currentSort = { field: 'recent', asc: true };
  updateCategoryPills();
  updateSortButtons();
  filterAddExercises();
  showWorkoutScreen('workout-add-exercise');
}

function hideAddExercise(): void {
  showWorkoutScreen('workout-active');
}

function filterByCategory(category: string): void {
  currentCategoryFilter = category;
  updateCategoryPills();
  filterAddExercises();
}

function updateCategoryPills(): void {
  document.querySelectorAll('.category-pill').forEach(pill => {
    const el = pill as HTMLElement;
    if (el.dataset.category === currentCategoryFilter) {
      el.className = 'category-pill bg-blue-600 text-white px-3 py-1 rounded-full text-sm whitespace-nowrap';
    } else {
      el.className = 'category-pill bg-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm whitespace-nowrap hover:bg-gray-600';
    }
  });
}

function toggleSort(field: string): void {
  if (currentSort.field === field) {
    currentSort.asc = !currentSort.asc;
  } else {
    currentSort.field = field;
    currentSort.asc = true;
  }
  updateSortButtons();
  filterAddExercises();
}

function updateSortButtons(): void {
  const alphaBtn = $('sort-alpha');
  const recentBtn = $('sort-recent');

  if (currentSort.field === 'alpha') {
    alphaBtn.className = 'text-blue-400';
    alphaBtn.textContent = currentSort.asc ? 'A-Z' : 'Z-A';
    recentBtn.className = 'text-gray-400';
    recentBtn.textContent = 'Recent';
  } else {
    recentBtn.className = 'text-blue-400';
    recentBtn.textContent = currentSort.asc ? 'Recent' : 'Oldest';
    alphaBtn.className = 'text-gray-400';
    alphaBtn.textContent = 'A-Z';
  }
}

function filterAddExercises(): void {
  const query = ($('add-exercise-search') as HTMLInputElement).value.toLowerCase();
  let filtered = getAllExercises();

  if (currentCategoryFilter !== 'all') {
    const allowedCategories = categoryMapping[currentCategoryFilter] || [];
    filtered = filtered.filter(e => allowedCategories.includes(e.category));
  }

  if (query) {
    filtered = filtered.filter(e => e.name.toLowerCase().includes(query));
  }

  if (currentSort.field === 'alpha') {
    filtered.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return currentSort.asc ? cmp : -cmp;
    });
  } else {
    filtered.sort((a, b) => {
      const aDate = getLastLoggedDate(a.name) || 0;
      const bDate = getLastLoggedDate(b.name) || 0;
      const cmp = bDate - aDate;
      return currentSort.asc ? cmp : -cmp;
    });
  }

  renderAddExerciseList(filtered);
}

function renderAddExerciseList(exercises: Exercise[]): void {
  const container = $('add-exercise-results');
  container.innerHTML = exercises.map(e => {
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

function addExerciseToWorkout(name: string): void {
  state.currentWorkout!.exercises.push({ name, sets: [], completed: false });
  renderWorkout();
  hideAddExercise();
  scheduleAutoSave();
}

// ==================== HISTORY ====================
function renderHistory(): void {
  const list = $('history-list');
  if (state.history.length === 0) {
    list.innerHTML = '<p class="text-gray-500 text-center py-8">No workout history yet</p>';
    return;
  }

  list.innerHTML = state.history.map((w) => {
    const exerciseNames = w.exercises.map(e => e.name).slice(0, 3).join(', ');
    const more = w.exercises.length > 3 ? ` +${w.exercises.length - 3} more` : '';
    const isDeleting = pendingDeleteWorkoutId === w.id;

    return `
      <div class="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600" onclick="app.editWorkout('${w.id}')">
        <div class="font-medium">${formatDate(w.start_time)}</div>
        <div class="text-sm text-gray-400">${w.exercises.length} exercises</div>
        <div class="text-xs text-gray-500 mt-1">${exerciseNames}${more}</div>
        <div class="mt-3 pt-3 border-t border-gray-600 flex justify-between items-center">
          <button onclick="event.stopPropagation(); app.copyWorkout('${w.id}')" class="text-gray-400 text-sm hover:text-blue-400">Copy to new workout</button>
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
  }).join('');
}

function showDeleteWorkoutConfirm(id: string): void {
  pendingDeleteWorkoutId = id;
  renderHistory();
}

function cancelDeleteWorkout(): void {
  pendingDeleteWorkoutId = null;
  renderHistory();
}

async function confirmDeleteWorkout(id: string): Promise<void> {
  try {
    await api.deleteWorkout(id);
    pendingDeleteWorkoutId = null;
    await loadData();
    renderHistory();
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
  expandedNotes.clear();
  $('workout-title').textContent = formatDate(source.start_time);
  $('workout-finish-btn').textContent = 'Save';
  switchTab('workout');
  showWorkoutScreen('workout-active');
  renderWorkout();
}

function copyWorkout(id: string): void {
  const source = state.history.find(w => w.id === id);
  if (!source) return;

  state.currentWorkout = {
    startTime: Date.now(),
    exercises: source.exercises.map(e => ({
      name: e.name,
      sets: [],
      completed: false,
    })),
  };
  state.editingWorkoutId = null;
  expandedNotes.clear();
  $('workout-title').textContent = "Today's Workout";
  $('workout-finish-btn').textContent = 'Finish';
  switchTab('workout');
  showWorkoutScreen('workout-active');
  renderWorkout();
}

// ==================== EXERCISES TAB ====================
const mainCategories = [
  { name: 'Push', subCategories: ['Chest', 'Shoulders', 'Triceps'] },
  { name: 'Pull', subCategories: ['Back', 'Biceps'] },
  { name: 'Legs', subCategories: ['Legs'] },
  { name: 'Core', subCategories: ['Core'] },
  { name: 'Other', subCategories: ['Cardio', 'Other'] },
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
                  ${isCustom ? `<span class="text-xs text-blue-400 ml-2">custom</span>` : ''}
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
    const isCustom = state.customExercises.some(c => c.name === e.name);
    return `
      <button onclick="app.showEditExercise('${e.name.replace(/'/g, "\\'")}')" class="w-full bg-gray-700 rounded-lg p-3 text-left hover:bg-gray-600 flex justify-between items-center">
        <div>
          <div class="font-medium">${e.name}</div>
          <div class="text-xs ${getTypeColor(e.type)}">${getTypeLabel(e.type)}</div>
        </div>
        ${isCustom ? '<span class="text-xs text-blue-400">custom</span>' : '<span class="text-gray-500 text-xs">&#9654;</span>'}
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
      renderAddExerciseList(getAllExercises());
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
  filterByCategory,
  toggleSort,
  filterAddExercises,
  addExerciseToWorkout,
  showAddSetForm,
  hideAddSetForm,
  saveSetInline,
  updateSet,
  deleteSet,
  copyAllSets,
  removeExercise,
  toggleExerciseCompleted,
  toggleSetCompleted,
  toggleNoteField,
  switchTab,
  editWorkout,
  copyWorkout,
  showDeleteWorkoutConfirm,
  cancelDeleteWorkout,
  confirmDeleteWorkout,
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
