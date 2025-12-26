import { Hono } from 'hono';
import type { Env, CreateWorkoutRequest } from '../types';
import * as queries from '../db/queries';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env }>();

// Apply auth middleware to all routes
app.use('*', authMiddleware);

// GET /api/workouts - List all workouts
app.get('/', async (c) => {
  const userId = c.get('userId');
  const workouts = await queries.getAllWorkouts(c.env.DB, userId);
  return c.json(workouts);
});

// GET /api/workouts/:id - Get single workout
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const workout = await queries.getWorkout(c.env.DB, id, userId);

  if (!workout) {
    return c.json({ error: 'Workout not found' }, 404);
  }

  return c.json(workout);
});

// POST /api/workouts - Create workout
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<CreateWorkoutRequest>();

  if (!body.start_time || !Array.isArray(body.exercises)) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const workout = await queries.createWorkout(c.env.DB, userId, body);
  return c.json(workout, 201);
});

// PUT /api/workouts/:id - Update workout
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json<CreateWorkoutRequest>();

  if (!body.start_time || !Array.isArray(body.exercises)) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const workout = await queries.updateWorkout(c.env.DB, id, userId, body);

  if (!workout) {
    return c.json({ error: 'Workout not found' }, 404);
  }

  return c.json(workout);
});

// DELETE /api/workouts/:id - Delete workout
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const deleted = await queries.deleteWorkout(c.env.DB, id, userId);

  if (!deleted) {
    return c.json({ error: 'Workout not found' }, 404);
  }

  return c.json({ success: true });
});

export default app;
