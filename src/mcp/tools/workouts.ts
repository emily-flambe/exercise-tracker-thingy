import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type WorkoutApiClient, WorkoutApiError } from '../client.js';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/Denver',
  });
}

interface WorkoutData {
  id: string;
  start_time: number;
  end_time?: number;
  target_categories?: string[];
  exercises: { name: string; sets: unknown[] }[];
}

export function registerWorkoutTools(server: McpServer, client: WorkoutApiClient) {
  server.registerTool(
    'list_workouts',
    {
      title: 'List Workouts',
      description: 'List workout history, newest first. Returns summary: id, date, exercise names, set counts. Use get_workout for full details.',
      inputSchema: {},
    },
    async () => {
      const workouts = await client.listWorkouts() as WorkoutData[];
      const summary = workouts.map((w) => ({
        id: w.id,
        date: formatDate(w.start_time),
        start_time: w.start_time,
        target_categories: w.target_categories,
        exercises: w.exercises.map((e) => ({
          name: e.name,
          sets: e.sets.length,
        })),
      }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_workout',
    {
      title: 'Get Workout',
      description: 'Get a specific workout by ID with full details including exercises, sets, weights, reps, and notes.',
      inputSchema: {
        id: z.string().describe('The workout ID'),
      },
    },
    async ({ id }) => {
      const workout = await client.getWorkout(id);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(workout, null, 2) }],
      };
    },
  );

  server.registerTool(
    'log_workout',
    {
      title: 'Log Workout',
      description: 'Log a new workout with exercises and sets. Each exercise needs a name and array of sets (weight + reps). Times are Unix timestamps in milliseconds.',
      inputSchema: {
        start_time: z.number().describe('Workout start time (Unix ms)'),
        end_time: z.number().optional().describe('Workout end time (Unix ms)'),
        target_categories: z.array(z.string()).optional().describe('Target muscle categories (e.g. "Chest", "Upper", "Legs")'),
        exercises: z.array(z.object({
          name: z.string().describe('Exercise name (must match an existing exercise)'),
          sets: z.array(z.object({
            weight: z.number().describe('Weight used'),
            reps: z.number().int().describe('Number of reps'),
            note: z.string().optional().describe('Optional note for this set'),
          })),
          completed: z.boolean().optional().describe('Whether the exercise was completed'),
        })).describe('Exercises performed'),
      },
    },
    async (args) => {
      const workout = await client.createWorkout(args);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(workout, null, 2) }],
      };
    },
  );

  server.registerTool(
    'update_workout',
    {
      title: 'Update Workout',
      description: 'Update an existing workout. Replaces exercises and sets entirely.',
      inputSchema: {
        id: z.string().describe('The workout ID to update'),
        start_time: z.number().describe('Workout start time (Unix ms)'),
        end_time: z.number().optional().describe('Workout end time (Unix ms)'),
        target_categories: z.array(z.string()).optional().describe('Target muscle categories'),
        exercises: z.array(z.object({
          name: z.string().describe('Exercise name'),
          sets: z.array(z.object({
            weight: z.number().describe('Weight used'),
            reps: z.number().int().describe('Number of reps'),
            note: z.string().optional().describe('Optional note'),
          })),
          completed: z.boolean().optional().describe('Whether completed'),
        })).describe('Exercises performed'),
      },
    },
    async ({ id, ...data }) => {
      // Read current state so we can send its updated_at and hit the backend's
      // compare-and-swap path. Without this the PUT takes the blind-overwrite
      // branch and silently clobbers an edit the user just made in the app.
      let updatedAt: number | undefined;
      try {
        const current = await client.getWorkout(id) as { updated_at?: number } | null;
        updatedAt = current?.updated_at;
      } catch {
        // If the read fails (e.g. 404), let the update surface the real error.
      }

      try {
        const workout = await client.updateWorkout(
          id,
          updatedAt !== undefined ? { ...data, updated_at: updatedAt } : data,
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(workout, null, 2) }],
        };
      } catch (err) {
        if (err instanceof WorkoutApiError && err.status === 409) {
          // Someone (almost certainly the user in the app) changed this workout
          // between our read and write. Do NOT retry blindly — surface the
          // current server state so the model can reconcile and re-apply.
          const serverCurrent = (err.body as { current?: unknown } | undefined)?.current;
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text:
                `Conflict: workout ${id} was modified since you read it (likely the user edited it in the app). ` +
                `Your update was NOT applied, to avoid clobbering their change.\n\n` +
                `Current server state:\n${JSON.stringify(serverCurrent ?? null, null, 2)}\n\n` +
                `Reconcile your intended change with this current state, then call update_workout again.`,
            }],
          };
        }
        throw err;
      }
    },
  );
}
