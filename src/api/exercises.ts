import { Hono } from 'hono';
import type { Env, CreateExerciseRequest } from '../types';
import * as queries from '../db/queries';
import { authMiddleware } from '../middleware/auth';

const app = new Hono<{ Bindings: Env }>();

// Apply auth middleware to all routes
app.use('*', authMiddleware);

// GET /api/exercises - List all custom exercises
app.get('/', async (c) => {
  const userId = c.get('userId');
  const exercises = await queries.getAllCustomExercises(c.env.DB, userId);
  return c.json(exercises);
});

// GET /api/exercises/:id - Get single custom exercise
app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const exercise = await queries.getCustomExercise(c.env.DB, id, userId);

  if (!exercise) {
    return c.json({ error: 'Exercise not found' }, 404);
  }

  return c.json(exercise);
});

// POST /api/exercises - Create custom exercise
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<CreateExerciseRequest>();

  if (!body.name || !body.type || !body.category || !body.muscle_group || !body.unit) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const exercise = await queries.createCustomExercise(c.env.DB, userId, body);
  return c.json(exercise, 201);
});

// PUT /api/exercises/:id - Update custom exercise
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json<CreateExerciseRequest>();

  if (!body.name || !body.type || !body.category || !body.muscle_group || !body.unit) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const exercise = await queries.updateCustomExercise(c.env.DB, id, userId, body);

  if (!exercise) {
    return c.json({ error: 'Exercise not found' }, 404);
  }

  return c.json(exercise);
});

// DELETE /api/exercises/:id - Delete custom exercise
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const deleted = await queries.deleteCustomExercise(c.env.DB, id, userId);

  if (!deleted) {
    return c.json({ error: 'Exercise not found' }, 404);
  }

  return c.json({ success: true });
});

export default app;
