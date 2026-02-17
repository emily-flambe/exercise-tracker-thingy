import type { Workout, WorkoutExercise, Set as WorkoutSet, CustomExercise, PersonalRecord, MuscleGroup } from './api';

export interface Exercise {
  name: string;
  type: 'total' | '/side' | '+bar' | 'bodyweight';
  category: string;
  muscle_group: string;
  unit: 'lbs' | 'kg';
}

export interface AppState {
  currentWorkout: {
    startTime: number;
    targetCategories?: MuscleGroup[];
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

export const state: AppState = {
  currentWorkout: null,
  editingWorkoutId: null,
  history: [],
  customExercises: [],
  editingExercise: null,
  allPRs: [],
};

export const ALL_MUSCLE_GROUPS: MuscleGroup[] = ['Upper', 'Lower', 'Core', 'Cardio', 'Other'];

export const mainCategories = [
  { name: 'Chest', subCategories: ['Chest'] },
  { name: 'Shoulders', subCategories: ['Shoulders'] },
  { name: 'Triceps', subCategories: ['Triceps'] },
  { name: 'Back', subCategories: ['Back'] },
  { name: 'Biceps', subCategories: ['Biceps'] },
  { name: 'Legs', subCategories: ['Legs'] },
  { name: 'Core', subCategories: ['Core'] },
  { name: 'Cardio', subCategories: ['Cardio'] },
  { name: 'Other', subCategories: ['Other'] },
];
