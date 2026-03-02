import * as api from './api';
import type { Workout, MuscleGroup } from './api';
import { state, ALL_MUSCLE_GROUPS } from './state';
import { $, escapeHtml } from './helpers';
import { loadData } from './data';
import { editWorkout } from './workout';

// ==================== HISTORY STATE ====================
let currentCalendarDate = new Date();
let selectedCalendarFilters = new Set<MuscleGroup>();
let pendingDeleteWorkoutId: string | null = null;
let historyExerciseSearch = '';
let historyDateFrom = '';
let historyDateTo = '';

// ==================== CALENDAR HELPERS ====================
function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getFirstDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}

function getWorkoutsForDate(date: Date): Workout[] {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const endOfDay = startOfDay + 86400000 - 1;
  return state.history.filter(w => w.start_time >= startOfDay && w.start_time <= endOfDay);
}

function getMuscleGroupsForWorkouts(workouts: Workout[]): Set<MuscleGroup> {
  const groups = new Set<MuscleGroup>();
  const exercises = state.customExercises;

  for (const workout of workouts) {
    for (const workoutExercise of workout.exercises) {
      const exercise = exercises.find(e => e.name === workoutExercise.name);
      if (exercise) {
        groups.add(exercise.muscle_group);
      }
    }
  }

  return groups;
}

// ==================== CALENDAR NAVIGATION ====================
export function toggleCalendarFilter(category: MuscleGroup): void {
  if (selectedCalendarFilters.has(category)) {
    selectedCalendarFilters.delete(category);
  } else {
    selectedCalendarFilters.add(category);
  }
  renderHistory();
}

export function changeCalendarMonth(offset: number): void {
  currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + offset, 1);
  renderHistory();
}

export function goToToday(): void {
  currentCalendarDate = new Date();
  renderHistory();
}

// ==================== HISTORY FILTERS ====================
function hasActiveSearchFilter(): boolean {
  return historyExerciseSearch.trim() !== '' || historyDateFrom !== '' || historyDateTo !== '';
}

function updateFilterClearButton(): void {
  const clearBtn = document.getElementById('history-clear-btn');
  if (!clearBtn) return;
  clearBtn.classList.toggle('hidden', !hasActiveSearchFilter());
}

export function filterHistoryExercise(value: string): void {
  historyExerciseSearch = value;
  updateFilterClearButton();
  renderHistory();
}

export function setHistoryDateFrom(value: string): void {
  historyDateFrom = value;
  updateFilterClearButton();
  renderHistory();
}

export function setHistoryDateTo(value: string): void {
  historyDateTo = value;
  updateFilterClearButton();
  renderHistory();
}

export function clearHistoryFilters(): void {
  historyExerciseSearch = '';
  historyDateFrom = '';
  historyDateTo = '';
  const searchInput = document.getElementById('history-exercise-search') as HTMLInputElement | null;
  const fromInput = document.getElementById('history-date-from') as HTMLInputElement | null;
  const toInput = document.getElementById('history-date-to') as HTMLInputElement | null;
  if (searchInput) searchInput.value = '';
  if (fromInput) fromInput.value = '';
  if (toInput) toInput.value = '';
  updateFilterClearButton();
  renderHistory();
}

// ==================== RENDER HISTORY ====================
export function renderHistory(): void {
  const container = $('history-list');

  if (hasActiveSearchFilter()) {
    // Filtered list view
    const searchLower = historyExerciseSearch.trim().toLowerCase();

    let fromTs = 0;
    let toTs = Infinity;
    if (historyDateFrom) {
      const [fy, fm, fd] = historyDateFrom.split('-').map(Number);
      fromTs = new Date(fy, fm - 1, fd).getTime();
    }
    if (historyDateTo) {
      const [ty, tm, td] = historyDateTo.split('-').map(Number);
      toTs = new Date(ty, tm - 1, td).getTime() + 86400000 - 1;
    }

    const filtered = state.history
      .filter(w => {
        if (searchLower && !w.exercises.some(e => e.name.toLowerCase().includes(searchLower))) return false;
        if (w.start_time < fromTs || w.start_time > toTs) return false;
        return true;
      })
      .sort((a, b) => b.start_time - a.start_time);

    if (filtered.length === 0) {
      container.innerHTML = `<div class="text-[#888888] text-sm text-center py-8">No workouts found</div>`;
      return;
    }

    let listHtml = '<div class="space-y-3">';
    filtered.forEach(w => {
      const date = new Date(w.start_time);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const exerciseNames = w.exercises.map(e => escapeHtml(e.name)).slice(0, 3).join(', ');
      const more = w.exercises.length > 3 ? ` +${w.exercises.length - 3} more` : '';
      const isDeleting = pendingDeleteWorkoutId === w.id;

      listHtml += `
        <div class="bg-[#141414] border border-[#2A2A2A] rounded-sm p-4 cursor-pointer hover:border-[#888888]" onclick="app.editWorkout('${w.id}')">
          <div class="font-bold text-sm">${dateStr} &middot; ${timeStr}</div>
          <div class="text-xs text-[#888888] mt-1">${exerciseNames}${more}</div>
          <div class="mt-3 pt-3 border-t border-[#2A2A2A] flex justify-end">
            ${isDeleting ? `
              <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                <span class="text-[#FF0000] text-sm">Delete?</span>
                <button onclick="app.confirmDeleteWorkout('${w.id}')" class="bg-[#FF0000] hover:bg-red-700 text-white text-sm px-2 py-1 rounded-sm">Yes</button>
                <button onclick="app.cancelDeleteWorkout()" class="text-[#888888] text-sm hover:text-white">No</button>
              </div>
            ` : `
              <button onclick="event.stopPropagation(); app.showDeleteWorkoutConfirm('${w.id}')" class="text-[#888888] text-sm hover:text-[#FF0000]">Delete</button>
            `}
          </div>
        </div>
      `;
    });
    listHtml += '</div>';

    container.innerHTML = listHtml;
    return;
  }

  // Default: calendar view
  const today = new Date();
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const daysInMonth = getDaysInMonth(currentCalendarDate);
  const firstDay = getFirstDayOfMonth(currentCalendarDate);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  let html = `
    <div class="mb-4 flex items-center justify-between">
      <button onclick="app.changeCalendarMonth(-1)" class="text-white hover:text-[#888888] p-2">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <div class="flex flex-col items-center">
        <h2 class="text-lg font-bold uppercase tracking-[0.15em]">${monthNames[month]} ${year}</h2>
        ${!isCurrentMonth ? '<button onclick="app.goToToday()" class="text-xs text-[#FF0000] hover:text-red-400 mt-1 uppercase tracking-wider font-bold">Today</button>' : ''}
      </div>
      <button onclick="app.changeCalendarMonth(1)" class="text-white hover:text-[#888888] p-2">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  `;

  html += '<div class="grid grid-cols-7 gap-1 mb-2">';
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
    html += `<div class="text-center text-[10px] text-[#888888] py-1 uppercase tracking-wider font-bold">${day}</div>`;
  });
  html += '</div>';

  html += '<div class="grid grid-cols-7 gap-1">';

  for (let i = 0; i < firstDay; i++) {
    html += '<div class="aspect-square"></div>';
  }

  const hasActiveFilter = selectedCalendarFilters.size > 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const workouts = getWorkoutsForDate(date);
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    const hasWorkouts = workouts.length > 0;

    const dayCategories = hasWorkouts ? getMuscleGroupsForWorkouts(workouts) : new Set<MuscleGroup>();
    const matchesFilter = hasActiveFilter && Array.from(selectedCalendarFilters).some(cat => dayCategories.has(cat));

    let cellClass = 'aspect-square flex flex-col items-center justify-center rounded-sm text-sm relative';

    if (hasWorkouts) {
      if (hasActiveFilter && matchesFilter) {
        cellClass += ' bg-[#FF0000] hover:bg-red-700 cursor-pointer';
      } else {
        cellClass += ' bg-[#FF0000] hover:bg-red-700 cursor-pointer';
      }
    } else {
      cellClass += ' bg-[#141414] border border-[#2A2A2A]';
    }

    if (isToday) {
      cellClass += ' ring-2 ring-white';
    }

    const onclick = hasWorkouts ? `onclick="app.showDayWorkouts('${date.toISOString()}')"` : '';

    html += `
      <div class="${cellClass}" ${onclick}>
        <div class="${isToday ? 'font-bold' : ''}">${day}</div>
      </div>
    `;
  }

  html += '</div>';

  html += '<div class="mt-4 flex flex-wrap gap-2">';
  ALL_MUSCLE_GROUPS.forEach(category => {
    const isSelected = selectedCalendarFilters.has(category);
    const pillClass = isSelected
      ? 'bg-white text-black'
      : 'bg-[#141414] border border-[#2A2A2A] text-[#888888] hover:border-[#888888]';
    html += `<button onclick="app.toggleCalendarFilter('${category}')" class="px-3 py-1 rounded-sm text-xs font-bold transition-colors uppercase tracking-wider ${pillClass}">${category}</button>`;
  });
  html += '</div>';

  container.innerHTML = html;
}

// ==================== DAY WORKOUTS ====================
export function showDayWorkouts(dateStr: string): void {
  const date = new Date(dateStr);
  const workouts = getWorkoutsForDate(date);

  if (workouts.length === 0) return;

  if (workouts.length === 1) {
    editWorkout(workouts[0].id);
    return;
  }

  const container = $('history-list');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  let html = `
    <div>
      <button onclick="app.renderHistory()" class="text-[#FF0000] hover:text-red-400 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider font-bold">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to calendar
      </button>
      <h2 class="text-lg font-bold mb-4 uppercase tracking-[0.15em]">${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}</h2>
      <div class="space-y-3">
  `;

  workouts.forEach(w => {
    const exerciseNames = w.exercises.map(e => e.name).slice(0, 3).join(', ');
    const more = w.exercises.length > 3 ? ` +${w.exercises.length - 3} more` : '';
    const isDeleting = pendingDeleteWorkoutId === w.id;
    const time = new Date(w.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    html += `
      <div class="bg-[#141414] border border-[#2A2A2A] rounded-sm p-4 cursor-pointer hover:border-[#888888]" onclick="app.editWorkout('${w.id}')">
        <div class="font-bold">${time}</div>
        <div class="text-sm text-[#888888]">${w.exercises.length} exercises</div>
        <div class="text-xs text-[#888888] mt-1">${exerciseNames}${more}</div>
        <div class="mt-3 pt-3 border-t border-[#2A2A2A] flex justify-end">
          ${isDeleting ? `
            <div class="flex items-center gap-2" onclick="event.stopPropagation()">
              <span class="text-[#FF0000] text-sm">Delete?</span>
              <button onclick="app.confirmDeleteWorkout('${w.id}')" class="bg-[#FF0000] hover:bg-red-700 text-white text-sm px-2 py-1 rounded-sm">Yes</button>
              <button onclick="app.cancelDeleteWorkout()" class="text-[#888888] text-sm hover:text-white">No</button>
            </div>
          ` : `
            <button onclick="event.stopPropagation(); app.showDeleteWorkoutConfirm('${w.id}')" class="text-[#888888] text-sm hover:text-[#FF0000]">Delete</button>
          `}
        </div>
      </div>
    `;
  });

  html += '</div></div>';
  container.innerHTML = html;
}

// ==================== DELETE WORKOUT ====================
export function showDeleteWorkoutConfirm(id: string): void {
  pendingDeleteWorkoutId = id;
  if (hasActiveSearchFilter()) {
    renderHistory();
    return;
  }
  showDayWorkouts(new Date(state.history.find(w => w.id === id)!.start_time).toISOString());
}

export function cancelDeleteWorkout(): void {
  const workoutId = pendingDeleteWorkoutId;
  pendingDeleteWorkoutId = null;
  if (hasActiveSearchFilter()) {
    renderHistory();
    return;
  }
  const workout = state.history.find(w => w.id === workoutId);
  if (workout) {
    showDayWorkouts(new Date(workout.start_time).toISOString());
  } else {
    renderHistory();
  }
}

export async function confirmDeleteWorkout(id: string): Promise<void> {
  try {
    const workout = state.history.find(w => w.id === id);
    await api.deleteWorkout(id);
    pendingDeleteWorkoutId = null;
    await loadData();

    if (hasActiveSearchFilter()) {
      renderHistory();
      return;
    }

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
