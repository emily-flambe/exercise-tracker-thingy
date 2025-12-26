import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import workoutsApi from './api/workouts';
import exercisesApi from './api/exercises';
import * as queries from './db/queries';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use('*', cors());

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// Mount API routes
app.route('/api/workouts', workoutsApi);
app.route('/api/exercises', exercisesApi);

// Clear all data endpoint
app.post('/api/data/clear', async (c) => {
  await queries.clearAllData(c.env.DB);
  return c.json({ success: true });
});

export default app;
