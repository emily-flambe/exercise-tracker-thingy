import { z } from 'zod';

// Enums
export const WeightTypeSchema = z.enum(['total', '/side', '+bar', 'bodyweight']);
export const UnitSchema = z.enum(['lbs', 'kg']);
export const CategorySchema = z.enum([
  'Chest', 'Shoulders', 'Triceps', 'Back', 'Biceps', 'Legs', 'Core', 'Cardio', 'Other',
]);

// Set schema
export const SetSchema = z.object({
  weight: z.number(),
  reps: z.number().int(),
  note: z.string().optional(),
  isPR: z.boolean().optional(),
  completed: z.boolean().optional(),
  missed: z.boolean().optional(),
});

// Workout exercise schema
export const WorkoutExerciseSchema = z.object({
  name: z.string(),
  sets: z.array(SetSchema),
  completed: z.boolean().optional(),
});

// Full workout (API response)
export const WorkoutSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  start_time: z.number(),
  end_time: z.number().optional(),
  target_categories: z.array(CategorySchema).optional(),
  exercises: z.array(WorkoutExerciseSchema),
  created_at: z.number(),
});

// Create workout request
export const CreateWorkoutRequestSchema = z.object({
  start_time: z.number(),
  end_time: z.number().optional(),
  target_categories: z.array(CategorySchema).optional(),
  exercises: z.array(WorkoutExerciseSchema),
});

// Exercise (custom exercise response)
export const CustomExerciseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  type: WeightTypeSchema,
  category: CategorySchema,
  unit: UnitSchema,
  created_at: z.number(),
});

// Personal record
export const PersonalRecordSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  exercise_name: z.string(),
  weight: z.number(),
  reps: z.number().int(),
  workout_id: z.string(),
  set_index: z.number().int(),
  achieved_at: z.number(),
});

// Inferred types (for use in MCP server)
export type SetInput = z.infer<typeof SetSchema>;
export type WorkoutExerciseInput = z.infer<typeof WorkoutExerciseSchema>;
export type WorkoutOutput = z.infer<typeof WorkoutSchema>;
export type CreateWorkoutInput = z.infer<typeof CreateWorkoutRequestSchema>;
export type CustomExerciseOutput = z.infer<typeof CustomExerciseSchema>;
export type PersonalRecordOutput = z.infer<typeof PersonalRecordSchema>;
