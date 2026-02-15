import * as api from './api';
import type { MuscleGroup } from './api';
import { state, mainCategories } from './state';
import type { Exercise } from './state';
import { $, $input, $select, formatDate, getAllExercises, isExerciseInWorkout, getLastLoggedDate, getLatestPRForExercise } from './helpers';
import { loadData } from './data';
import { showWorkoutScreen } from './nav';
import { renderWorkout, scheduleAutoSave } from './workout';

// ==================== ADD EXERCISE STATE ====================
let addExerciseSort = { field: 'recent', asc: true };
const expandedAddExerciseCategories = new Set<string>();
let workoutExerciseUnit: 'lbs' | 'kg' = 'lbs';

// ==================== SORTING ====================
function sortAddExercises(exercises: Exercise[]): Exercise[] {
  const sorted = [...exercises];
  if (addExerciseSort.field === 'alpha') {
    sorted.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return addExerciseSort.asc ? cmp : -cmp;
    });
  } else {
    sorted.sort((a, b) => {
      const aDate = getLastLoggedDate(a.name) || 0;
      const bDate = getLastLoggedDate(b.name) || 0;
      const cmp = bDate - aDate;
      return addExerciseSort.asc ? cmp : -cmp;
    });
  }
  return sorted;
}

export function toggleAddExerciseSort(field: string): void {
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

// ==================== RENDER ====================
function renderAddExerciseCategories(): void {
  const allExercises = getAllExercises();
  const container = $('add-exercise-categories');
  const targetCategories = state.currentWorkout?.targetCategories || [];

  const categoryToMuscleGroup: Record<string, MuscleGroup> = {
    'Chest': 'Upper', 'Shoulders': 'Upper', 'Triceps': 'Upper',
    'Back': 'Upper', 'Biceps': 'Upper',
    'Legs': 'Lower',
    'Core': 'Core',
    'Cardio': 'Cardio',
    'Other': 'Other',
  };

  container.innerHTML = mainCategories.map(main => {
    let exercises = allExercises.filter(e => main.subCategories.includes(e.category));
    if (exercises.length === 0) return '';

    exercises = sortAddExercises(exercises);
    const isTargetCategory = targetCategories.includes(categoryToMuscleGroup[main.name] || 'Other');
    const isExpanded = expandedAddExerciseCategories.has(main.name);

    const categoryLabelClass = isTargetCategory
      ? 'font-medium text-blue-400'
      : 'font-medium text-gray-300';
    const targetBadge = isTargetCategory
      ? '<span class="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded">Target</span>'
      : '';

    return `
      <div class="mb-4">
        <button onclick="app.toggleAddExerciseCategory('${main.name}')" class="flex justify-between items-center w-full py-2 text-left">
          <div class="flex items-center">
            <span class="${categoryLabelClass}">${main.name}</span>
            ${targetBadge}
          </div>
          <div class="flex items-center">
            <span class="text-gray-500 text-sm mr-2">${exercises.length}</span>
            <span id="add-${main.name}-arrow" class="text-gray-400">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          </div>
        </button>
        <div id="add-${main.name}-exercises" class="space-y-2 mt-2 ${isExpanded ? '' : 'hidden'}">
          ${exercises.map(e => {
            const lastLogged = getLastLoggedDate(e.name);
            const lastLoggedText = lastLogged ? formatDate(lastLogged) : '';
            const latestPR = getLatestPRForExercise(e.name);
            const prText = latestPR ? `★ ${latestPR.weight}${e.unit} x ${latestPR.reps}` : '';
            const inWorkout = isExerciseInWorkout(e.name);
            const buttonClass = inWorkout
              ? 'w-full bg-gray-800 rounded-lg p-3 text-left opacity-50 cursor-not-allowed'
              : 'w-full bg-gray-700 rounded-lg p-3 text-left hover:bg-gray-600';
            const inWorkoutBadge = inWorkout
              ? '<span class="text-xs bg-gray-600 text-gray-400 px-2 py-0.5 rounded ml-2">In workout</span>'
              : '';
            return `
              <button ${inWorkout ? 'disabled' : `onclick="app.addExerciseToWorkout('${e.name.replace(/'/g, "\\'")}')"`} class="${buttonClass}" data-exercise-in-workout="${inWorkout}">
                <div class="flex justify-between items-center">
                  <span class="font-medium">${e.name}${inWorkoutBadge}</span>
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

export function toggleAddExerciseCategory(category: string): void {
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

export function filterAddExerciseSearch(): void {
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
    const inWorkout = isExerciseInWorkout(e.name);
    const buttonClass = inWorkout
      ? 'w-full bg-gray-800 rounded-lg p-3 text-left opacity-50 cursor-not-allowed'
      : 'w-full bg-gray-700 rounded-lg p-3 text-left hover:bg-gray-600';
    const inWorkoutBadge = inWorkout
      ? '<span class="text-xs bg-gray-600 text-gray-400 px-2 py-0.5 rounded ml-2">In workout</span>'
      : '';

    return `
      <button ${inWorkout ? 'disabled' : `onclick="app.addExerciseToWorkout('${e.name.replace(/'/g, "\\'")}')"`} class="${buttonClass}" data-exercise-in-workout="${inWorkout}">
        <div class="flex justify-between items-center">
          <span class="font-medium">${e.name}${inWorkoutBadge}</span>
          ${lastLoggedText ? `<span class="text-xs text-gray-500">${lastLoggedText}</span>` : ''}
        </div>
      </button>
    `;
  }).join('');
}

// ==================== SHOW/HIDE ====================
export function showAddExercise(): void {
  ($('add-exercise-search') as HTMLInputElement).value = '';
  addExerciseSort = { field: 'recent', asc: true };
  updateAddExerciseSortButtons();
  expandedAddExerciseCategories.clear();
  $('add-exercise-categories').classList.remove('hidden');
  $('add-exercise-search-results').classList.add('hidden');
  renderAddExerciseCategories();
  showWorkoutScreen('workout-add-exercise');
}

export function hideAddExercise(): void {
  showWorkoutScreen('workout-active');
}

export function addExerciseToWorkout(name: string): void {
  state.currentWorkout!.exercises.push({ name, sets: [], completed: false });
  renderWorkout();
  hideAddExercise();
  scheduleAutoSave();
}

// ==================== CREATE FROM WORKOUT ====================
export function showCreateExerciseFromWorkout(): void {
  $input('workout-exercise-name-input').value = '';
  $select('workout-exercise-category-input').value = 'Other';
  $select('workout-exercise-muscle-group-input').value = 'Other';
  document.querySelectorAll('input[name="workout-weight-type"]').forEach(r => {
    (r as HTMLInputElement).checked = false;
  });
  (document.querySelector('input[name="workout-weight-type"][value="total"]') as HTMLInputElement).checked = true;
  setWorkoutExerciseUnit('lbs');
  showWorkoutScreen('workout-create-exercise');
}

export function cancelCreateExerciseFromWorkout(): void {
  showWorkoutScreen('workout-add-exercise');
}

export function setWorkoutExerciseUnit(unit: 'lbs' | 'kg'): void {
  workoutExerciseUnit = unit;
  $('workout-exercise-unit-lbs').className = unit === 'lbs' ? 'bg-blue-600 px-4 py-2 rounded-lg text-sm' : 'bg-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-500';
  $('workout-exercise-unit-kg').className = unit === 'kg' ? 'bg-blue-600 px-4 py-2 rounded-lg text-sm' : 'bg-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-500';
}

export async function saveExerciseFromWorkout(): Promise<void> {
  const name = $input('workout-exercise-name-input').value.trim();
  const category = $select('workout-exercise-category-input').value;
  const muscle_group = $select('workout-exercise-muscle-group-input').value;
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
    await api.createCustomExercise({ name, type, category, muscle_group, unit });
    await loadData();

    state.currentWorkout!.exercises.push({ name, sets: [], completed: false });
    renderWorkout();
    showWorkoutScreen('workout-active');
    scheduleAutoSave();
  } catch (error) {
    console.error('Failed to save exercise:', error);
    alert('Failed to save exercise');
  }
}
