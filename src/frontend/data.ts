import * as api from './api';
import { state } from './state';

export async function loadData(): Promise<void> {
  try {
    const [workouts, exercises, prs] = await Promise.all([
      api.getWorkouts(),
      api.getCustomExercises(),
      api.getAllPRs(),
    ]);
    state.history = workouts;
    state.customExercises = exercises;
    state.allPRs = prs;
    // Notify UI that data is ready
    window.dispatchEvent(new CustomEvent('data-loaded'));
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}
