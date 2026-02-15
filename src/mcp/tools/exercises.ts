import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkoutApiClient } from '../client.js';

export function registerExerciseTools(server: McpServer, client: WorkoutApiClient) {
  server.registerTool(
    'list_exercises',
    {
      title: 'List Exercises',
      description: 'List all available exercises with their type (total, /side, +bar, bodyweight), category, and unit.',
      inputSchema: {},
    },
    async () => {
      const exercises = (await client.listExercises() as Record<string, unknown>[]).map((e) => ({
        name: e.name,
        type: e.type,
        category: e.category,
        unit: e.unit,
      }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(exercises, null, 2) }],
      };
    },
  );
}
