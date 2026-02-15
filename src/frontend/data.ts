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
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}
