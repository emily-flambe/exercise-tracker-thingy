import { state } from './state';
import type { Exercise } from './state';
import type { PersonalRecord } from './api';

// ==================== DOM HELPERS ====================
export function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export function $input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

export function $select(id: string): HTMLSelectElement {
  return document.getElementById(id) as unknown as HTMLSelectElement;
}

// ==================== FORMATTERS ====================
export function formatDate(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const y = String(d.getFullYear()).slice(-2);
  return `${m}/${day}/${y}`;
}

// ==================== TOAST ====================
let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string = 'Saved'): void {
  const toast = $('save-toast');

  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.style.opacity = '1';

  toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 300);
  }, 2000);
}

// ==================== EXERCISE LOOKUPS ====================
export function getAllExercises(): Exercise[] {
  return state.customExercises.map(c => ({
    name: c.name,
    type: c.type,
    category: c.category,
    muscle_group: c.muscle_group || 'Other',
    unit: c.unit,
  }));
}

export function getExerciseUnit(exerciseName: string): 'lbs' | 'kg' {
  const exercise = getAllExercises().find(e => e.name === exerciseName);
  return exercise?.unit || 'lbs';
}

export function isExerciseInWorkout(exerciseName: string): boolean {
  if (!state.currentWorkout) return false;
  return state.currentWorkout.exercises.some(e => e.name === exerciseName);
}

export function getTypeColor(type: string): string {
  if (type === '+bar') return 'text-yellow-500';
  if (type === '/side') return 'text-purple-400';
  if (type === 'bodyweight') return 'text-green-400';
  return 'text-cyan-400';
}

export function getTypeLabel(type: string): string {
  if (type === '+bar') return '+bar weight';
  if (type === '/side') return 'per side';
  if (type === 'bodyweight') return 'bodyweight';
  return 'total weight';
}

export function getLastLoggedDate(exerciseName: string): number | null {
  for (const workout of state.history) {
    const ex = workout.exercises.find(e => e.name === exerciseName);
    if (ex && ex.sets.length > 0) {
      return workout.start_time;
    }
  }
  return null;
}

export function getLatestPRForExercise(exerciseName: string): PersonalRecord | null {
  const prs = state.allPRs.filter(pr => pr.exercise_name === exerciseName);
  if (prs.length === 0) return null;

  prs.sort((a, b) => b.achieved_at - a.achieved_at);
  return prs[0];
}
