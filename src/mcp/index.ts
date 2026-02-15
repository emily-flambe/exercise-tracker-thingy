import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WorkoutApiClient } from './client.js';
import { registerWorkoutTools } from './tools/workouts.js';
import { registerExerciseTools } from './tools/exercises.js';
import { registerPRTools } from './tools/prs.js';

const apiUrl = process.env.WORKOUT_API_URL;
const apiKey = process.env.WORKOUT_API_KEY;

if (!apiUrl || !apiKey) {
  console.error('Missing required env vars: WORKOUT_API_URL and WORKOUT_API_KEY');
  process.exit(1);
}

const client = new WorkoutApiClient(apiUrl, apiKey);

const server = new McpServer({
  name: 'workout-tracker',
  version: '1.0.0',
});

registerWorkoutTools(server, client);
registerExerciseTools(server, client);
registerPRTools(server, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Workout tracker MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
