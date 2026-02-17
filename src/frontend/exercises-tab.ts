import * as api from './api';
import { state, mainCategories } from './state';
import type { Exercise } from './state';
import { $, $input, $select, formatDate, getAllExercises, getTypeColor, getTypeLabel, getLastLoggedDate } from './helpers';
import { loadData } from './data';
import { renderWorkout } from './workout';

// ==================== EXERCISES TAB STATE ====================
let exerciseTabSort = { field: 'recent', asc: true };
const expandedCategories = new Set<string>();
let currentExerciseUnit: 'lbs' | 'kg' = 'lbs';

// ==================== SORTING ====================
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

export function toggleExerciseTabSort(field: string): void {
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

// ==================== RENDER ====================
export function renderExerciseCategories(): void {
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

export function toggleCategory(category: string): void {
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

export function filterExercises(): void {
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

export function showCreateExercise(): void {
  state.editingExercise = null;
  $('edit-exercise-title').textContent = 'New Exercise';
  $input('exercise-name-input').value = '';
  $input('exercise-name-input').disabled = false;
  $select('exercise-category-input').value = 'Other';
  $select('exercise-category-input').disabled = false;
  $select('exercise-muscle-group-input').value = 'Other';
  $select('exercise-muscle-group-input').disabled = false;
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

export function showEditExercise(exerciseName: string): void {
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
  $select('exercise-muscle-group-input').value = exercise.muscle_group || 'Other';
  $select('exercise-muscle-group-input').disabled = !isCustom;

  document.querySelectorAll('input[name="weight-type"]').forEach(r => {
    (r as HTMLInputElement).checked = (r as HTMLInputElement).value === exercise.type;
    (r as HTMLInputElement).disabled = false;
  });

  setExerciseUnit(exercise.unit);

  const recentSets = getRecentSetsForExercise(exerciseName, 10);
  const exercisePRs = state.allPRs.filter(pr => pr.exercise_name === exerciseName);
  const historyList = $('exercise-history-list');
  $('exercise-history-section').classList.remove('hidden');

  const chartData = getMaxWeightPerWorkout(exerciseName);
  renderWeightChart(chartData, exercise.unit, 'exercise-weight-chart');

  let historyHTML = '';

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
        // Skip sets explicitly marked as missed
        if (set.missed === true) continue;
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

function getMaxWeightPerWorkout(exerciseName: string): Array<{ date: number; maxWeight: number }> {
  const workoutMaxes: Array<{ date: number; maxWeight: number }> = [];
  for (const workout of state.history) {
    const ex = workout.exercises.find(e => e.name === exerciseName);
    if (ex) {
      // Only consider confirmed (non-missed) sets
      const confirmedSets = ex.sets.filter(s => s.missed !== true);
      if (confirmedSets.length > 0) {
        const maxWeight = Math.max(...confirmedSets.map(s => s.weight));
        workoutMaxes.push({ date: workout.start_time, maxWeight });
      }
    }
  }
  return workoutMaxes.sort((a, b) => a.date - b.date);
}

function renderWeightChart(data: Array<{ date: number; maxWeight: number }>, unit: string, containerId: string): void {
  const container = $(containerId);
  if (!container) return;
  if (data.length < 2) {
    container.innerHTML = '';
    return;
  }

  const width = 280;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 25, left: 35 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const weights = data.map(d => d.maxWeight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const weightRange = maxWeight - minWeight || 1;
  const weightPadding = weightRange * 0.1;

  const yMin = minWeight - weightPadding;
  const yMax = maxWeight + weightPadding;
  const yRange = yMax - yMin;

  const xScale = (i: number) => padding.left + (i / (data.length - 1)) * chartWidth;
  const yScale = (w: number) => padding.top + chartHeight - ((w - yMin) / yRange) * chartHeight;

  const pathPoints = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(d.maxWeight).toFixed(1)}`).join(' ');

  const yLabels = [yMin, (yMin + yMax) / 2, yMax].map(v => Math.round(v));

  const formatShortDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const svg = `
    <svg width="${width}" height="${height}" class="w-full">
      <!-- Grid lines -->
      ${yLabels.map(v => `<line x1="${padding.left}" y1="${yScale(v)}" x2="${width - padding.right}" y2="${yScale(v)}" stroke="#374151" stroke-width="1"/>`).join('')}

      <!-- Y-axis labels -->
      ${yLabels.map(v => `<text x="${padding.left - 5}" y="${yScale(v) + 4}" text-anchor="end" fill="#9CA3AF" font-size="10">${v}</text>`).join('')}

      <!-- X-axis labels -->
      <text x="${padding.left}" y="${height - 5}" text-anchor="start" fill="#9CA3AF" font-size="10">${formatShortDate(data[0].date)}</text>
      <text x="${width - padding.right}" y="${height - 5}" text-anchor="end" fill="#9CA3AF" font-size="10">${formatShortDate(data[data.length - 1].date)}</text>

      <!-- Line -->
      <path d="${pathPoints}" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- Points -->
      ${data.map((d, i) => `<circle cx="${xScale(i)}" cy="${yScale(d.maxWeight)}" r="3" fill="#3B82F6"/>`).join('')}
    </svg>
    <div class="text-center text-xs text-gray-500 mt-1">Max weight (${unit}) over time</div>
  `;

  container.innerHTML = svg;
}

export function hideEditExercise(): void {
  $input('exercise-name-input').disabled = false;
  $select('exercise-category-input').disabled = false;
  $select('exercise-muscle-group-input').disabled = false;
  document.querySelectorAll('input[name="weight-type"]').forEach(r => (r as HTMLInputElement).disabled = false);

  state.editingExercise = null;
  showExercisesListView();
  renderExerciseCategories();
}

export function setExerciseUnit(unit: 'lbs' | 'kg'): void {
  currentExerciseUnit = unit;
  $('exercise-unit-lbs').className = unit === 'lbs' ? 'bg-blue-600 px-4 py-2 rounded-lg text-sm' : 'bg-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-500';
  $('exercise-unit-kg').className = unit === 'kg' ? 'bg-blue-600 px-4 py-2 rounded-lg text-sm' : 'bg-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-500';
}

export async function saveExercise(): Promise<void> {
  const name = $input('exercise-name-input').value.trim();
  const category = $select('exercise-category-input').value;
  const muscle_group = $select('exercise-muscle-group-input').value;
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
    const oldName = state.editingExercise?.name;
    if (state.editingExercise?.id) {
      await api.updateCustomExercise(state.editingExercise.id, { name, type, category, muscle_group, unit });
    } else {
      await api.createCustomExercise({ name, type, category, muscle_group, unit });
    }
    await loadData();

    if (oldName && oldName !== name && state.currentWorkout) {
      for (const exercise of state.currentWorkout.exercises) {
        if (exercise.name === oldName) {
          exercise.name = name;
        }
      }
      renderWorkout();
    }

    hideEditExercise();
  } catch (error) {
    console.error('Failed to save exercise:', error);
    alert('Failed to save exercise');
  }
}

export async function deleteExercise(): Promise<void> {
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
