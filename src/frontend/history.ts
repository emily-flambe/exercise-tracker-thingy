import * as api from './api';
import type { Workout, MuscleGroup } from './api';
import { state, ALL_MUSCLE_GROUPS } from './state';
import { $ } from './helpers';
import { loadData } from './data';
import { editWorkout } from './workout';

// ==================== HISTORY STATE ====================
let currentCalendarDate = new Date();
let selectedCalendarFilters = new Set<MuscleGroup>();
let pendingDeleteWorkoutId: string | null = null;

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

// ==================== RENDER HISTORY ====================
export function renderHistory(): void {
  const container = $('history-list');

  const today = new Date();
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const daysInMonth = getDaysInMonth(currentCalendarDate);
  const firstDay = getFirstDayOfMonth(currentCalendarDate);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  let html = `
    <div class="mb-4 flex items-center justify-between">
      <button onclick="app.changeCalendarMonth(-1)" class="text-[#8B5CF6] hover:text-[#A78BFA] p-2 transition-colors">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <div class="flex flex-col items-center">
        <h2 class="text-xl font-bold">${monthNames[month]} ${year}</h2>
        ${!isCurrentMonth ? '<button onclick="app.goToToday()" class="text-xs text-[#8B5CF6] hover:text-[#A78BFA] mt-1 transition-colors">Today</button>' : ''}
      </div>
      <button onclick="app.changeCalendarMonth(1)" class="text-[#8B5CF6] hover:text-[#A78BFA] p-2 transition-colors">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  `;

  html += '<div class="grid grid-cols-7 gap-1 mb-2">';
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
    html += `<div class="text-center text-xs text-[#64748B] py-1">${day}</div>`;
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

    let cellClass = 'aspect-square flex flex-col items-center justify-center rounded-xl text-sm relative transition-all';

    if (hasWorkouts) {
      if (hasActiveFilter && matchesFilter) {
        cellClass += ' bg-gradient-to-br from-amber-500 to-orange-500 hover:shadow-[0_0_10px_rgba(245,158,11,0.3)] cursor-pointer';
      } else {
        cellClass += ' bg-gradient-to-br from-[#8B5CF6] to-[#06B6D4] hover:shadow-[0_0_10px_rgba(139,92,246,0.3)] cursor-pointer';
      }
    } else {
      cellClass += ' bg-white/5';
    }

    if (isToday) {
      cellClass += ' ring-2 ring-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]';
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
      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.3)]'
      : 'bg-white/5 text-[#F1F5F9]/70 hover:bg-white/10 border border-white/10';
    html += `<button onclick="app.toggleCalendarFilter('${category}')" class="px-3 py-1 rounded-full text-xs font-medium transition-all ${pillClass}">${category}</button>`;
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
      <button onclick="app.renderHistory()" class="text-[#8B5CF6] hover:text-[#A78BFA] mb-4 flex items-center gap-2 transition-colors">
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
      <div class="glass-card rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-all" onclick="app.editWorkout('${w.id}')">
        <div class="font-medium">${time}</div>
        <div class="text-sm text-[#64748B]">${w.exercises.length} exercises</div>
        <div class="text-xs text-[#64748B]/70 mt-1">${exerciseNames}${more}</div>
        <div class="mt-3 pt-3 border-t border-white/5 flex justify-end">
          ${isDeleting ? `
            <div class="flex items-center gap-2" onclick="event.stopPropagation()">
              <span class="text-red-400 text-sm">Delete?</span>
              <button onclick="app.confirmDeleteWorkout('${w.id}')" class="bg-red-600 hover:bg-red-500 text-white text-sm px-2 py-1 rounded-lg transition-all">Yes</button>
              <button onclick="app.cancelDeleteWorkout()" class="text-[#64748B] text-sm hover:text-[#F1F5F9] transition-colors">No</button>
            </div>
          ` : `
            <button onclick="event.stopPropagation(); app.showDeleteWorkoutConfirm('${w.id}')" class="text-[#64748B] text-sm hover:text-red-400 transition-colors">Delete</button>
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
  showDayWorkouts(new Date(state.history.find(w => w.id === id)!.start_time).toISOString());
}

export function cancelDeleteWorkout(): void {
  const workoutId = pendingDeleteWorkoutId;
  pendingDeleteWorkoutId = null;
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
