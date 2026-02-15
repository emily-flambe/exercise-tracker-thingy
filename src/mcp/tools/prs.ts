import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkoutApiClient } from '../client.js';

interface PRData {
  exercise_name: string;
  weight: number;
  reps: number;
  achieved_at: number;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/Denver',
  });
}

export function registerPRTools(server: McpServer, client: WorkoutApiClient) {
  server.registerTool(
    'get_all_prs',
    {
      title: 'Get All PRs',
      description: 'Get all personal records grouped by exercise. Shows the current best reps at each weight for every exercise.',
      inputSchema: {},
    },
    async () => {
      const prs = await client.getAllPRs() as PRData[];

      // Group by exercise, then by weight — keep only the best (most recent, highest reps) at each weight
      const grouped = new Map<string, Map<number, PRData>>();
      for (const pr of prs) {
        if (!grouped.has(pr.exercise_name)) {
          grouped.set(pr.exercise_name, new Map());
        }
        const byWeight = grouped.get(pr.exercise_name)!;
        const existing = byWeight.get(pr.weight);
        if (!existing || pr.reps > existing.reps || (pr.reps === existing.reps && pr.achieved_at > existing.achieved_at)) {
          byWeight.set(pr.weight, pr);
        }
      }

      const summary = Array.from(grouped.entries()).map(([exercise, byWeight]) => ({
        exercise,
        records: Array.from(byWeight.values())
          .sort((a, b) => a.weight - b.weight)
          .map((pr) => ({
            weight: pr.weight,
            reps: pr.reps,
            date: formatDate(pr.achieved_at),
          })),
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_exercise_prs',
    {
      title: 'Get Exercise PRs',
      description: 'Get all personal records for a specific exercise, showing weight, reps, and date achieved.',
      inputSchema: {
        exercise_name: z.string().describe('The exercise name (e.g. "Bench Press")'),
      },
    },
    async ({ exercise_name }) => {
      const prs = await client.getExercisePRs(exercise_name) as PRData[];
      const formatted = prs.map((pr) => ({
        weight: pr.weight,
        reps: pr.reps,
        date: formatDate(pr.achieved_at),
      }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }],
      };
    },
  );
}
