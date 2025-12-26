import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import authApi from './api/auth';
import workoutsApi from './api/workouts';
import exercisesApi from './api/exercises';
import * as queries from './db/queries';
import { authMiddleware } from './middleware/auth';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use('*', cors());

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// Auth routes (public)
app.route('/api/auth', authApi);

// Protected routes
app.route('/api/workouts', workoutsApi);
app.route('/api/exercises', exercisesApi);

// Clear all data endpoint (protected)
app.post('/api/data/clear', authMiddleware, async (c) => {
  const userId = c.get('userId');
  await queries.clearAllData(c.env.DB, userId);
  return c.json({ success: true });
});

export default app;
