import * as api from './api';
import { ConflictError } from './api';
import type { Workout, Set as WorkoutSet } from './api';
import type { MuscleGroup } from './api';
import type { CreateWorkoutRequest } from '../types';
import { state, ALL_MUSCLE_GROUPS } from './state';
import { $, formatDate, getAllExercises, getTypeColor, getTypeLabel } from './helpers';
import { loadData } from './data';
import { showWorkoutScreen } from './nav';
import { recalculateAllPRs } from './pr-calc';

// ==================== WORKOUT STATE ====================
let isEditingFromHistory = false;
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let editingWorkoutUpdatedAt: number | null = null;
let autoSaveConflictRetries = 0;
const MAX_AUTO_SAVE_CONFLICT_RETRIES = 3;
let expandedNotes = new Set<string>();
let selectedTargetCategories = new Set<MuscleGroup>();
let isEditingCategories = false;
let editingNotesExerciseIndex: number | null = null;

// ==================== CATEGORY SELECTION ====================
export function showCategorySelection(): void {
  selectedTargetCategories.clear();
  isEditingCategories = false;
  $('category-select-title').textContent = 'What are you training today?';
  $('category-select-subtitle').textContent = 'Select muscle groups to focus on (optional)';
  $('category-select-new-buttons').classList.remove('hidden');
  $('category-select-edit-buttons').classList.add('hidden');
  renderCategorySelectionGrid();
  showWorkoutScreen('workout-category-select');
}

export function showEditCategories(): void {
  if (!state.currentWorkout) return;

  selectedTargetCategories.clear();
  if (state.currentWorkout.targetCategories) {
    state.currentWorkout.targetCategories.forEach(cat => selectedTargetCategories.add(cat));
  }

  isEditingCategories = true;
  $('category-select-title').textContent = 'Edit Focus Areas';
  $('category-select-subtitle').textContent = 'Change the muscle groups for this workout';
  $('category-select-new-buttons').classList.add('hidden');
  $('category-select-edit-buttons').classList.remove('hidden');
  renderCategorySelectionGrid();
  showWorkoutScreen('workout-category-select');
}

export function saveEditedCategories(): void {
  if (!state.currentWorkout) return;

  const newCategories = selectedTargetCategories.size > 0
    ? Array.from(selectedTargetCategories)
    : undefined;

  state.currentWorkout.targetCategories = newCategories;
  updateWorkoutTitle();
  selectedTargetCategories.clear();
  isEditingCategories = false;
  showWorkoutScreen('workout-active');
  scheduleAutoSave();
}

export function cancelEditCategories(): void {
  selectedTargetCategories.clear();
  isEditingCategories = false;
  showWorkoutScreen('workout-active');
}

function renderCategorySelectionGrid(): void {
  const grid = $('category-select-grid');
  grid.innerHTML = ALL_MUSCLE_GROUPS.map(category => {
    const isSelected = selectedTargetCategories.has(category);
    const selectedClass = isSelected
      ? 'bg-blue-600 border-blue-500 text-white'
      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600';
    return `
      <button onclick="app.toggleTargetCategory('${category}')" class="p-3 rounded-lg border-2 text-sm font-medium transition-colors ${selectedClass}">
        ${category}
      </button>
    `;
  }).join('');
}

export function toggleTargetCategory(category: MuscleGroup): void {
  if (selectedTargetCategories.has(category)) {
    selectedTargetCategories.delete(category);
  } else {
    selectedTargetCategories.add(category);
  }
  renderCategorySelectionGrid();
}

export function startWorkoutWithCategories(): void {
  const targetCategories = selectedTargetCategories.size > 0
    ? Array.from(selectedTargetCategories)
    : undefined;
  startWorkoutInternal(targetCategories);
}

export function skipCategorySelection(): void {
  startWorkoutInternal(undefined);
}

// ==================== WORKOUT LIFECYCLE ====================
function startWorkoutInternal(targetCategories?: MuscleGroup[]): void {
  state.currentWorkout = {
    startTime: Date.now(),
    targetCategories,
    exercises: [],
  };
  state.editingWorkoutId = null;
  editingWorkoutUpdatedAt = null;
  autoSaveConflictRetries = 0;
  isEditingFromHistory = false;
  expandedNotes.clear();
  selectedTargetCategories.clear();
  updateWorkoutTitle();
  showWorkoutScreen('workout-active');
  renderWorkout();
}

function updateWorkoutTitle(): void {
  if (!state.currentWorkout) return;

  if (isEditingFromHistory) {
    $('workout-title').textContent = formatDate(state.currentWorkout.startTime);
  } else {
    $('workout-title').textContent = "Today's Workout";
  }
}

export function startWorkout(): void {
  state.currentWorkout = {
    startTime: Date.now(),
    exercises: [],
  };
  state.editingWorkoutId = null;
  editingWorkoutUpdatedAt = null;
  autoSaveConflictRetries = 0;
  isEditingFromHistory = false;
  expandedNotes.clear();
  $('workout-title').textContent = "Today's Workout";
  showWorkoutScreen('workout-active');
  renderWorkout();
}

// ==================== DELETE CURRENT WORKOUT ====================
export function showDeleteCurrentWorkoutConfirm(): void {
  $('delete-workout-btn').classList.add('hidden');
  $('delete-workout-confirm').classList.remove('hidden');
}

export function cancelDeleteCurrentWorkout(): void {
  $('delete-workout-confirm').classList.add('hidden');
  $('delete-workout-btn').classList.remove('hidden');
}

export async function confirmDeleteCurrentWorkout(): Promise<void> {
  try {
    if (state.editingWorkoutId) {
      await api.deleteWorkout(state.editingWorkoutId);
      await loadData();
    }

    state.currentWorkout = null;
    state.editingWorkoutId = null;
    editingWorkoutUpdatedAt = null;
    autoSaveConflictRetries = 0;
    isEditingFromHistory = false;
    expandedNotes.clear();

    $('delete-workout-confirm').classList.add('hidden');
    $('delete-workout-btn').classList.remove('hidden');

    showWorkoutScreen('workout-empty');
  } catch (error) {
    console.error('Failed to delete workout:', error);
    alert('Failed to delete workout');
  }
}

// ==================== AUTO-SAVE ====================
export function scheduleAutoSave(): void {
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }

  autoSaveTimeout = setTimeout(() => {
    autoSaveWorkout();
  }, 1500);
}

async function autoSaveWorkout(): Promise<void> {
  if (!state.currentWorkout || state.currentWorkout.exercises.length === 0) {
    return;
  }

  try {
    const workoutData: CreateWorkoutRequest & { updated_at?: number } = {
      start_time: state.currentWorkout.startTime,
      target_categories: state.currentWorkout.targetCategories,
      exercises: state.currentWorkout.exercises,
    };

    if (state.editingWorkoutId) {
      const originalWorkout = state.history.find(w => w.id === state.editingWorkoutId);
      if (originalWorkout?.end_time) {
        workoutData.end_time = originalWorkout.end_time;
      }
      if (editingWorkoutUpdatedAt !== null) {
        workoutData.updated_at = editingWorkoutUpdatedAt;
      }
      const savedWorkout = await api.updateWorkout(state.editingWorkoutId, workoutData);
      editingWorkoutUpdatedAt = savedWorkout.updated_at;
    } else {
      const savedWorkout = await api.createWorkout(workoutData);
      state.editingWorkoutId = savedWorkout.id;
      editingWorkoutUpdatedAt = savedWorkout.updated_at;
    }

    await loadData();
    autoSaveConflictRetries = 0;
    console.log('Workout auto-saved');
  } catch (error) {
    if (error instanceof ConflictError) {
      autoSaveConflictRetries++;
      if (autoSaveConflictRetries > MAX_AUTO_SAVE_CONFLICT_RETRIES) {
        console.error(`Auto-save conflict persists after ${MAX_AUTO_SAVE_CONFLICT_RETRIES} retries, giving up`);
        autoSaveConflictRetries = 0;
        alert('Your workout could not be saved due to repeated conflicts with another session. Your changes are still in the editor — please try saving manually.');
        return;
      }
      console.log(`Auto-save conflict detected (attempt ${autoSaveConflictRetries}/${MAX_AUTO_SAVE_CONFLICT_RETRIES}), merging server changes`);
      mergeServerWorkout(error.currentWorkout);
      scheduleAutoSave();
    } else {
      console.error('Failed to auto-save workout:', error);
    }
  }
}

function mergeServerWorkout(serverWorkout: Workout): void {
  if (!state.currentWorkout) return;

  editingWorkoutUpdatedAt = serverWorkout.updated_at;

  const localExercises = state.currentWorkout.exercises;
  const serverExercises = serverWorkout.exercises;

  for (const localEx of localExercises) {
    const serverEx = serverExercises.find(se => se.name === localEx.name);
    if (!serverEx) continue;

    if (serverEx.notes && !localEx.notes) {
      localEx.notes = serverEx.notes;
    }
  }

  for (const serverEx of serverExercises) {
    const localEx = localExercises.find(le => le.name === serverEx.name);
    if (!localEx) {
      localExercises.push(JSON.parse(JSON.stringify(serverEx)));
    }
  }

  renderWorkout();
}

// ==================== RENDER WORKOUT ====================
export function renderWorkout(): void {
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
              <span class="font-medium ${isCompleted ? 'text-gray-400 line-through' : ''}">${ex.name}</span>
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
        <div class="flex justify-between items-center mt-2">
          <button onclick="app.showExerciseNotes(${i})" class="${ex.notes ? 'text-blue-400' : 'text-gray-500'} hover:text-blue-300 transition-colors" title="${ex.notes ? 'Edit notes' : 'Add notes'}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button onclick="app.showPRHistory('${ex.name.replace(/'/g, "\\'")}')" class="text-gray-500 hover:text-yellow-400 transition-colors" title="View PR history">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function getPreviousSets(exerciseName: string): WorkoutSet[] {
  for (const workout of state.history) {
    const ex = workout.exercises.find(e => e.name === exerciseName);
    if (ex && ex.sets.length > 0) return ex.sets;
  }
  return [];
}

// ==================== EXERCISE REORDER/REMOVE ====================
export function removeExercise(index: number): void {
  if (confirm('Remove this exercise?')) {
    state.currentWorkout!.exercises.splice(index, 1);
    renderWorkout();
    scheduleAutoSave();
  }
}

export function moveExerciseUp(index: number): void {
  if (index === 0) return;
  const exercises = state.currentWorkout!.exercises;
  [exercises[index - 1], exercises[index]] = [exercises[index], exercises[index - 1]];
  renderWorkout();
  scheduleAutoSave();
}

export function moveExerciseDown(index: number): void {
  const exercises = state.currentWorkout!.exercises;
  if (index === exercises.length - 1) return;
  [exercises[index], exercises[index + 1]] = [exercises[index + 1], exercises[index]];
  renderWorkout();
  scheduleAutoSave();
}

export function toggleExerciseCompleted(index: number): void {
  const exercise = state.currentWorkout!.exercises[index];
  exercise.completed = !exercise.completed;
  renderWorkout();
  scheduleAutoSave();
}

// ==================== SET OPERATIONS ====================
export function toggleSetCompleted(exerciseIndex: number, setIndex: number): void {
  const set = state.currentWorkout!.exercises[exerciseIndex].sets[setIndex];
  set.completed = !set.completed;
  recalculateAllPRs();
  renderWorkout();
  scheduleAutoSave();
}

export function toggleSetMissed(exerciseIndex: number, setIndex: number): void {
  const set = state.currentWorkout!.exercises[exerciseIndex].sets[setIndex];
  set.missed = !set.missed;
  recalculateAllPRs();
  renderWorkout();
  scheduleAutoSave();
}

export function toggleNoteField(exerciseIndex: number, setIndex: number): void {
  const key = `${exerciseIndex}-${setIndex}`;
  if (expandedNotes.has(key)) {
    expandedNotes.delete(key);
  } else {
    expandedNotes.add(key);
  }
  renderWorkout();
}

export function showAddSetForm(exerciseIndex: number): void {
  const ex = state.currentWorkout!.exercises[exerciseIndex];
  const prevSets = getPreviousSets(ex.name);
  const lastSet = ex.sets.length > 0 ? ex.sets[ex.sets.length - 1] : (prevSets[0] || { weight: 0, reps: 10 });

  $('add-set-collapsed-' + exerciseIndex).classList.add('hidden');
  $('add-set-expanded-' + exerciseIndex).classList.remove('hidden');
  ($('weight-' + exerciseIndex) as HTMLInputElement).value = String(lastSet.weight);
  ($('reps-' + exerciseIndex) as HTMLInputElement).value = String(lastSet.reps);
  ($('weight-' + exerciseIndex) as HTMLInputElement).focus();
}

export function hideAddSetForm(exerciseIndex: number): void {
  $('add-set-collapsed-' + exerciseIndex).classList.remove('hidden');
  $('add-set-expanded-' + exerciseIndex).classList.add('hidden');
}

export function saveSetInline(exerciseIndex: number): void {
  const weight = parseFloat(($('weight-' + exerciseIndex) as HTMLInputElement).value) || 0;
  const reps = parseInt(($('reps-' + exerciseIndex) as HTMLInputElement).value) || 0;
  const note = ($('note-' + exerciseIndex) as HTMLInputElement).value.trim();

  const set: WorkoutSet = { weight, reps };
  if (note) set.note = note;

  state.currentWorkout!.exercises[exerciseIndex].sets.push(set);
  recalculateAllPRs();
  renderWorkout();
  scheduleAutoSave();
}

export function updateSet(exerciseIndex: number, setIndex: number, field: string, value: string): void {
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
    recalculateAllPRs();
    renderWorkout();
  } else if (field === 'reps') {
    set.reps = parseInt(value) || 0;
    recalculateAllPRs();
    renderWorkout();
  }
  scheduleAutoSave();
}

export function deleteSet(exerciseIndex: number, setIndex: number): void {
  state.currentWorkout!.exercises[exerciseIndex].sets.splice(setIndex, 1);
  recalculateAllPRs();
  renderWorkout();
  scheduleAutoSave();
}

// ==================== EXERCISE NOTES ====================
export function showExerciseNotes(exerciseIndex: number): void {
  if (!state.currentWorkout) return;
  const exercise = state.currentWorkout.exercises[exerciseIndex];
  editingNotesExerciseIndex = exerciseIndex;

  const modal = $('exercise-notes-modal');
  const title = $('exercise-notes-title');
  const textarea = $('exercise-notes-textarea') as HTMLTextAreaElement;

  title.textContent = `${exercise.name} Notes`;
  textarea.value = exercise.notes || '';

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  textarea.focus();
}

export function hideExerciseNotes(): void {
  const modal = $('exercise-notes-modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  editingNotesExerciseIndex = null;
}

export function saveExerciseNotes(): void {
  if (editingNotesExerciseIndex === null || !state.currentWorkout) return;
  const textarea = $('exercise-notes-textarea') as HTMLTextAreaElement;
  const notes = textarea.value.trim();
  state.currentWorkout.exercises[editingNotesExerciseIndex].notes = notes || undefined;
  hideExerciseNotes();
  renderWorkout();
  scheduleAutoSave();
}

// ==================== EDIT FROM HISTORY ====================
export function editWorkout(id: string): void {
  const source = state.history.find(w => w.id === id);
  if (!source) return;

  state.currentWorkout = {
    startTime: source.start_time,
    targetCategories: source.target_categories,
    exercises: JSON.parse(JSON.stringify(source.exercises)),
  };
  state.editingWorkoutId = id;
  editingWorkoutUpdatedAt = source.updated_at;
  isEditingFromHistory = true;
  expandedNotes.clear();
  updateWorkoutTitle();
  switchTabDirect('workout');
  showWorkoutScreen('workout-active');
  renderWorkout();
}

// Internal helper to switch tab without triggering the callback's render cycle
// (editWorkout calls renderWorkout directly)
function switchTabDirect(tabName: string): void {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  $('tab-' + tabName).classList.add('active');
  document.querySelectorAll('nav button').forEach(btn => {
    btn.classList.remove('text-blue-400');
    btn.classList.add('text-gray-400');
  });
  $('nav-' + tabName).classList.remove('text-gray-400');
  $('nav-' + tabName).classList.add('text-blue-400');
}

// ==================== RESET HELPERS ====================
export function resetWorkoutState(): void {
  editingWorkoutUpdatedAt = null;
  autoSaveConflictRetries = 0;
}
