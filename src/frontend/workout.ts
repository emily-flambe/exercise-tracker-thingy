import * as api from './api';
import { ApiError, ConflictError } from './api';
import type { Workout, Set as WorkoutSet } from './api';
import type { MuscleGroup } from './api';
import type { CreateWorkoutRequest } from '../types';
import { state, ALL_MUSCLE_GROUPS } from './state';
import { $, escapeHtml, formatDate, getAllExercises, getTypeColor, getTypeLabel, showToast } from './helpers';
import { loadData } from './data';
import { showWorkoutScreen } from './nav';
import { recalculateAllPRs } from './pr-calc';
import { enqueue, type Mutation } from './offline/db';
import { flushNow } from './offline/sync';
import {
  buildWorkoutUpsert,
  buildWorkoutDelete,
  newClientId,
} from './offline/mutations';
import { mergeWorkouts } from './merge';

// ==================== WORKOUT STATE ====================
let isEditingFromHistory = false;
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let editingWorkoutUpdatedAt: number | null = null;
// The "common ancestor" for 3-way merge: the last-known-server snapshot
// of the workout we're currently editing. Used by mergeServerWorkout to
// distinguish "local deletion" from "remote addition" (and vice versa).
// Deep-cloned whenever we take a fresh authoritative server view.
let baseServerWorkout: Workout | null = null;
let autoSaveConflictRetries = 0;
const MAX_AUTO_SAVE_CONFLICT_RETRIES = 3;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;
let isSyncPolling = false;
let isAutoSaving = false;
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
      ? 'bg-white border-white text-black'
      : 'bg-[#141414] border-[#2A2A2A] text-[#888888] hover:border-[#888888]';
    return `
      <button onclick="app.toggleTargetCategory('${category}')" class="p-3 rounded-sm border text-sm font-bold transition-colors uppercase tracking-wider ${selectedClass}">
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
  baseServerWorkout = null;
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
  baseServerWorkout = null;
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
      const deletedId = state.editingWorkoutId;
      // Optimistic: drop from local history immediately.
      state.history = state.history.filter(w => w.id !== deletedId);
      await enqueue(buildWorkoutDelete(deletedId));
      void flushNow();
    }

    state.currentWorkout = null;
    state.editingWorkoutId = null;
    editingWorkoutUpdatedAt = null;
    baseServerWorkout = null;
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
    autoSaveTimeout = null;
    autoSaveWorkout();
  }, 1500);
}

async function autoSaveWorkout(): Promise<void> {
  if (!state.currentWorkout || state.currentWorkout.exercises.length === 0) {
    return;
  }

  isAutoSaving = true;
  try {
    const workoutData: CreateWorkoutRequest & { updated_at?: number } = {
      start_time: state.currentWorkout.startTime,
      target_categories: state.currentWorkout.targetCategories,
      exercises: state.currentWorkout.exercises,
    };

    let resourceId: string;
    let isNew: boolean;
    if (state.editingWorkoutId) {
      resourceId = state.editingWorkoutId;
      isNew = false;
      const originalWorkout = state.history.find(w => w.id === state.editingWorkoutId);
      if (originalWorkout?.end_time) {
        workoutData.end_time = originalWorkout.end_time;
      }
      if (editingWorkoutUpdatedAt !== null) {
        workoutData.updated_at = editingWorkoutUpdatedAt;
      }
    } else {
      // New workout: assign a client-generated id so the outbox can POST
      // with idempotent semantics and subsequent edits route to the same resource.
      resourceId = newClientId();
      isNew = true;
      state.editingWorkoutId = resourceId;
      editingWorkoutUpdatedAt = null;
      baseServerWorkout = null;
    }

    await enqueue(buildWorkoutUpsert(resourceId, isNew, workoutData));
    // Fire-and-forget flush: don't block UI on network.
    void flushNow();
    autoSaveConflictRetries = 0;
  } catch (error) {
    console.error('Failed to enqueue auto-save:', error);
  } finally {
    isAutoSaving = false;
  }
}

// ==================== SYNC FEEDBACK CALLBACKS ====================
// Called by the sync engine (via app.ts) after a successful workout PUT/POST.
// Updates editingWorkoutUpdatedAt so subsequent auto-saves don't send stale
// updated_at and trigger infinite 409 loops.
export function handleWorkoutSynced(_mutation: Mutation, response: unknown): void {
  const res = response as (Workout & { updated_at?: number }) | null | undefined;
  if (res?.updated_at !== undefined && state.editingWorkoutId) {
    // Only update if this response is for the workout we're currently editing
    if (!res.id || res.id === state.editingWorkoutId) {
      editingWorkoutUpdatedAt = res.updated_at;
      // Refresh the 3-way merge baseline: the server has now accepted our
      // write, so that exact shape is the new common ancestor for any
      // future remote changes we haven't seen yet.
      if (res.id && Array.isArray(res.exercises)) {
        baseServerWorkout = structuredClone(res) as Workout;
      } else {
        // Thin response (bare ACK — has updated_at but no exercises array):
        // we cannot trust the existing base to still be the common ancestor
        // alongside the new updated_at. Invalidate it so the next merge
        // takes the null-base fallback path rather than comparing against
        // a stale snapshot and flagging everything as a conflict.
        baseServerWorkout = null;
      }
    }
  }
}

// Called by the sync engine on 409 conflict with current server state.
// Merges the server workout into the active editor and updates
// editingWorkoutUpdatedAt so the re-enqueued mutation carries the fresh value.
export function handleWorkoutConflict(mutation: Mutation, current: unknown): void {
  const serverWorkout = current as Workout | null | undefined;
  if (!serverWorkout || !state.currentWorkout || !state.editingWorkoutId) return;
  // Only handle conflicts for the workout we're currently editing
  if (mutation.resourceId !== state.editingWorkoutId) return;
  mergeServerWorkout(serverWorkout, { localAuthoritative: true });
  // Write the merged state back into the mutation body. Without this, the
  // 409-replay in sync.ts only patches `updated_at` into the original body
  // and re-sends the pre-merge local exercises — silently clobbering any
  // remote additions we just merged in (e.g. a concurrent Lat Pulldown add).
  if (mutation.body && typeof mutation.body === 'object') {
    const body = mutation.body as Record<string, unknown>;
    body.exercises = state.currentWorkout.exercises;
    body.target_categories = state.currentWorkout.targetCategories ?? null;
  }
  renderWorkout();
}

// ==================== 3-WAY MERGE ====================
// Pure merge logic lives in ./merge.ts so it can be unit-tested without DOM.
// This wrapper applies the result to state, refreshes the baseline, and
// re-renders.
function mergeServerWorkout(
  serverWorkout: Workout,
  opts: { localAuthoritative: boolean }
): void {
  if (!state.currentWorkout) return;

  editingWorkoutUpdatedAt = serverWorkout.updated_at;

  // Base must refer to the same workout we're merging; otherwise treat as
  // absent and fall back to the legacy two-way behavior.
  const base =
    baseServerWorkout && baseServerWorkout.id === serverWorkout.id
      ? baseServerWorkout
      : null;

  const result = mergeWorkouts(base, state.currentWorkout, serverWorkout, opts);

  state.currentWorkout.exercises = result.exercises;
  state.currentWorkout.targetCategories = result.targetCategories;

  // Update the baseline to the just-merged server view. This becomes the
  // common ancestor for the next merge round.
  baseServerWorkout = structuredClone(serverWorkout);

  if (result.hadConflict && opts.localAuthoritative) {
    // In the autosave (localAuthoritative) path local wins on true
    // conflicts; show a toast so the user knows their changes were kept.
    showToast('Merged conflicting edits — your changes kept');
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

  recalculateAllPRs();
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
              ? '<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/></svg>'
              : '<svg class="w-4 h-4 text-[#888888]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg>';
            const missIcon = isSetMissed
              ? '<svg class="w-4 h-4 text-[#FF0000]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>'
              : '<svg class="w-4 h-4 text-[#888888]" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 7v6m0 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            const hasNote = !!set.note;
            const isNoteExpanded = expandedNotes.has(i + '-' + si);
            const pencilColor = hasNote ? 'text-[#FF0000]' : 'text-[#888888]';
            const noteInput = isNoteExpanded ? `
              <input type="text" value="${set.note || ''}" onchange="app.updateSet(${i}, ${si}, 'note', this.value)" placeholder="note" class="mt-1 ml-6 w-32 bg-transparent border-b border-[#2A2A2A] px-1 py-0.5 text-xs text-[#888888] focus:outline-none focus:border-[#FF0000] placeholder-[#2A2A2A] ${isSetCompleted ? 'opacity-50' : ''}">
              ` : '';
            return `
            <div class="py-1 border-b border-[#2A2A2A]">
              <div class="flex items-center gap-2">
                <button onclick="app.toggleSetCompleted(${i}, ${si})" class="flex-shrink-0 hover:opacity-80 transition-opacity">
                  ${setCheckmarkIcon}
                </button>
                <span class="w-6 text-[#888888] text-xs font-mono ${isSetCompleted ? 'line-through' : ''}">${si + 1}</span>
                <input type="number" value="${set.weight}" oninput="app.updateSet(${i}, ${si}, 'weight', this.value)" class="w-16 bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm px-2 py-1 text-center text-sm font-mono focus:outline-none focus:border-[#FF0000] text-white ${isSetCompleted ? 'opacity-50' : ''}">
                <span class="text-[#888888] ${isSetCompleted ? 'line-through' : ''}">x</span>
                <input type="number" value="${set.reps}" oninput="app.updateSet(${i}, ${si}, 'reps', this.value)" class="w-14 bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm px-2 py-1 text-center text-sm font-mono focus:outline-none focus:border-[#FF0000] text-white ${isSetCompleted ? 'opacity-50' : ''}">
                <span id="star-${i}-${si}">${set.isPR ? (set.completed && !isSetMissed ? '<span class="text-[#FFD700] text-lg">★</span>' : '<span class="text-[#FFD700] text-lg opacity-40">★</span>') : ''}</span>
                <button onclick="app.toggleSetMissed(${i}, ${si})" class="flex-shrink-0 hover:opacity-80 transition-opacity" title="${isSetMissed ? 'Mark as not missed' : 'Mark as missed'}">
                  ${missIcon}
                </button>
                <button onclick="app.toggleNoteField(${i}, ${si})" class="${pencilColor} text-sm hover:opacity-80 transition-opacity" title="${hasNote ? 'Edit note' : 'Add note'}">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                  </svg>
                </button>
                <button onclick="app.deleteSet(${i}, ${si})" class="text-[#FF0000] hover:opacity-80 transition-opacity" title="Delete set">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
              ${noteInput}
            </div>
          `;}).join('')}
        ` : ''}

        <div id="add-set-collapsed-${i}" class="mt-2 pt-2 ${ex.sets.length > 0 ? 'border-t border-[#2A2A2A]' : ''}">
          <button onclick="app.showAddSetForm(${i})" class="text-[#FF0000] text-sm uppercase tracking-wider font-bold">+ Add set</button>
        </div>
        <div id="add-set-expanded-${i}" class="hidden mt-2 pt-2 ${ex.sets.length > 0 ? 'border-t border-[#2A2A2A]' : ''}">
          <div class="flex items-center gap-2">
            <span class="text-[#888888] text-xs w-6 font-mono">${nextSetNum}</span>
            <input type="number" id="weight-${i}" class="w-16 bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm px-2 py-1 text-center text-sm font-mono focus:outline-none focus:border-[#FF0000] text-white" placeholder="wt">
            <span class="text-[#888888]">x</span>
            <input type="number" id="reps-${i}" class="w-14 bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm px-2 py-1 text-center text-sm font-mono focus:outline-none focus:border-[#FF0000] text-white" placeholder="reps">
            <button onclick="app.saveSetInline(${i})" class="bg-[#FF0000] hover:bg-red-700 text-white px-3 py-1 rounded-sm text-sm font-bold">Save</button>
            <button onclick="app.hideAddSetForm(${i})" class="text-[#888888] text-sm">Cancel</button>
          </div>
          <input type="text" id="note-${i}" placeholder="note (optional)" class="mt-2 ml-6 w-40 bg-transparent border-b border-[#2A2A2A] px-1 py-0.5 text-xs text-[#888888] focus:outline-none focus:border-[#FF0000] placeholder-[#2A2A2A]">
        </div>
      </div>
    `;

    const isCompleted = ex.completed || false;
    const checkmarkIcon = isCompleted
      ? '<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/></svg>'
      : '<svg class="w-6 h-6 text-[#888888]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg>';

    return `
      <div class="bg-[#141414] border border-[#2A2A2A] rounded-sm p-4 mb-3">
        <div class="flex justify-between items-start mb-3">
          <div class="flex items-center gap-3">
            <button onclick="app.toggleExerciseCompleted(${i})" class="flex-shrink-0 hover:opacity-80 transition-opacity">
              ${checkmarkIcon}
            </button>
            <div>
              <span class="font-bold ${isCompleted ? 'text-[#888888] line-through' : ''}">${escapeHtml(ex.name)}</span>
              <div class="text-xs ${getTypeColor(exercise.type)}">${getTypeLabel(exercise.type)}</div>
              ${renderExerciseSettings(ex.name)}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="app.moveExerciseUp(${i})" class="text-[#888888] hover:text-white transition-colors ${i === 0 ? 'opacity-30 cursor-not-allowed' : ''}" ${i === 0 ? 'disabled' : ''} title="Move up">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
              </svg>
            </button>
            <button onclick="app.moveExerciseDown(${i})" class="text-[#888888] hover:text-white transition-colors ${i === exerciseCount - 1 ? 'opacity-30 cursor-not-allowed' : ''}" ${i === exerciseCount - 1 ? 'disabled' : ''} title="Move down">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            <button onclick="app.removeExercise(${i})" class="text-[#FF0000] text-sm px-2 hover:opacity-80">x</button>
          </div>
        </div>
        ${setsHtml}
        <div class="flex justify-between items-center mt-2">
          <button onclick="app.showExerciseNotes(${i})" class="${ex.notes ? 'text-[#FF0000]' : 'text-[#888888]'} hover:text-[#FF0000] transition-colors" title="${ex.notes ? 'Edit notes' : 'Add notes'}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button onclick="app.showPRHistory('${ex.name.replace(/'/g, "\\'")}')" class="text-[#888888] hover:text-[#FF0000] transition-colors" title="View PR history">
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
  renderWorkout();
  scheduleAutoSave();
}

export function toggleSetMissed(exerciseIndex: number, setIndex: number): void {
  const set = state.currentWorkout!.exercises[exerciseIndex].sets[setIndex];
  set.missed = !set.missed;
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
  } else if (field === 'reps') {
    set.reps = parseInt(value) || 0;
  }
  if (field === 'weight' || field === 'reps') {
    recalculateAllPRs();
    updateStarIndicators();
  }
  scheduleAutoSave();
}

// star-{i}-{si} IDs use array indices, which is safe because any set
// reordering (add/remove/splice) triggers a full renderWorkout() re-render.
function updateStarIndicators(): void {
  if (!state.currentWorkout) return;
  const exercises = state.currentWorkout.exercises;
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    for (let si = 0; si < ex.sets.length; si++) {
      const set = ex.sets[si];
      const starEl = document.getElementById('star-' + i + '-' + si);
      if (!starEl) continue;
      const isSetMissed = set.missed || false;
      if (set.isPR) {
        starEl.innerHTML = set.completed && !isSetMissed
          ? '<span class="text-[#FFD700] text-lg">★</span>'
          : '<span class="text-[#FFD700] text-lg opacity-40">★</span>';
      } else {
        starEl.innerHTML = '';
      }
    }
  }
}

export function deleteSet(exerciseIndex: number, setIndex: number): void {
  state.currentWorkout!.exercises[exerciseIndex].sets.splice(setIndex, 1);
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

// ==================== REFRESH CURRENT WORKOUT ====================
export async function refreshCurrentWorkout(): Promise<boolean> {
  if (!state.editingWorkoutId) return false;

  // Cancel any pending auto-save so it doesn't overwrite the fresh server data
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }

  try {
    const workout = await api.getWorkout(state.editingWorkoutId);
    state.currentWorkout = {
      startTime: workout.start_time,
      targetCategories: workout.target_categories,
      exercises: JSON.parse(JSON.stringify(workout.exercises)),
    };
    editingWorkoutUpdatedAt = workout.updated_at;
    // Fresh authoritative server view: reset the 3-way merge baseline so
    // subsequent server polls/conflicts have a correct common ancestor.
    baseServerWorkout = structuredClone(workout);
    renderWorkout();
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // Workout was deleted on the server — clean up local state
      state.currentWorkout = null;
      state.editingWorkoutId = null;
      editingWorkoutUpdatedAt = null;
      baseServerWorkout = null;
      autoSaveConflictRetries = 0;
      isEditingFromHistory = false;
      expandedNotes.clear();
      showWorkoutScreen('workout-empty');
      return true;
    } else {
      throw error;
    }
  }
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
  // Capture the initial server view as the 3-way merge baseline. Any
  // subsequent server poll/conflict compares local edits against this
  // snapshot to detect one-sided changes unambiguously.
  baseServerWorkout = structuredClone(source);
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
    btn.classList.remove('text-[#FF0000]');
    btn.classList.add('text-[#888888]');
  });
  $('nav-' + tabName).classList.remove('text-[#888888]');
  $('nav-' + tabName).classList.add('text-[#FF0000]');
}

// ==================== SYNC POLLING ====================
export function startSyncPolling(): void {
  stopSyncPolling();
  pollIntervalId = setInterval(syncPoll, 5000);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

export function stopSyncPolling(): void {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
  isSyncPolling = false;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

function handleVisibilityChange(): void {
  if (document.hidden) {
    if (pollIntervalId !== null) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  } else {
    if (pollIntervalId === null) {
      pollIntervalId = setInterval(syncPoll, 5000);
      syncPoll();
    }
  }
}

// Sync poll disabled (emergency hot-fix): the server-biased merge was
// racing with in-progress local edits and destroying sets/weight/reps
// values mid-workout. The guard `autoSaveTimeout !== null` is checked at
// entry, but any edit landing during the in-flight `getWorkout()` await
// is then clobbered by the merge when the response returns. Until a
// conflict-free merge is in place, never pull server state over the
// active workout. A deleted-on-server (404) workout is still handled.
async function syncPoll(): Promise<void> {
  if (!state.editingWorkoutId || isSyncPolling) return;
  isSyncPolling = true;
  try {
    await api.getWorkout(state.editingWorkoutId);
    // Intentionally do NOT merge. We only want the 404 side-effect below.
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      state.currentWorkout = null;
      state.editingWorkoutId = null;
      editingWorkoutUpdatedAt = null;
      baseServerWorkout = null;
      autoSaveConflictRetries = 0;
      isEditingFromHistory = false;
      expandedNotes.clear();
      showWorkoutScreen('workout-empty');
    }
    // Silently ignore network errors
  } finally {
    isSyncPolling = false;
  }
}

// ==================== EXERCISE SETTINGS ====================
function renderExerciseSettings(exerciseName: string): string {
  const customEx = state.customExercises.find(ce => ce.name === exerciseName);
  if (!customEx) return '';

  const settings = customEx.settings || {};
  const entries = Object.entries(settings);

  return `
    <div class="flex flex-wrap gap-1 mt-1 items-center">
      ${entries.map(([key, value]) => `
        <span class="inline-flex items-center gap-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-sm px-2 py-0.5 text-xs text-[#888888] cursor-pointer" data-exercise-id="${escapeHtml(customEx.id)}" data-setting-key="${escapeHtml(key)}" data-setting-value="${escapeHtml(value)}" onclick="app.editExerciseSetting(this.dataset.exerciseId, this.dataset.settingKey, this.dataset.settingValue)">
          <span>${escapeHtml(key)}:</span>
          <span class="text-white">${escapeHtml(value)}</span>
        </span>
      `).join('')}
      <button data-exercise-id="${escapeHtml(customEx.id)}" onclick="app.addExerciseSetting(this.dataset.exerciseId)" class="text-[#888888] hover:text-[#FF0000] text-xs px-1 transition-colors">+ setting</button>
    </div>
  `;
}

export function editExerciseSetting(exerciseId: string, key: string, currentValue: string): void {
  const newValue = prompt(`${key}:`, currentValue);
  if (newValue === null) return; // cancelled

  const customEx = state.customExercises.find(ce => ce.id === exerciseId);
  if (!customEx) return;

  const settings = { ...(customEx.settings || {}) };

  if (newValue === '') {
    // Empty value = delete this setting
    delete settings[key];
  } else {
    settings[key] = newValue;
  }

  // Update local state immediately for responsiveness
  customEx.settings = Object.keys(settings).length > 0 ? settings : undefined;
  renderWorkout();

  // Persist to server
  const settingsToSend = Object.keys(settings).length > 0 ? settings : null;
  api.updateExerciseSettings(exerciseId, settingsToSend).catch(err => {
    console.error('Failed to save exercise settings:', err);
    showToast('Failed to save setting');
  });
}

export function addExerciseSetting(exerciseId: string): void {
  const key = prompt('Setting name (e.g., seat, ankle, lever):');
  if (!key || !key.trim()) return;

  const value = prompt(`${key.trim()}:`);
  if (value === null || !value.trim()) return;

  const customEx = state.customExercises.find(ce => ce.id === exerciseId);
  if (!customEx) return;

  const settings = { ...(customEx.settings || {}) };
  settings[key.trim()] = value.trim();

  customEx.settings = settings;
  renderWorkout();

  api.updateExerciseSettings(exerciseId, settings).catch(err => {
    console.error('Failed to save exercise settings:', err);
    showToast('Failed to save setting');
  });
}

// ==================== RESET HELPERS ====================
export function resetWorkoutState(): void {
  editingWorkoutUpdatedAt = null;
  baseServerWorkout = null;
  autoSaveConflictRetries = 0;
}
