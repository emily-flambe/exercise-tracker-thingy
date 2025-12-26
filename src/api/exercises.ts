import { Hono } from 'hono';
import type { Env, CreateExerciseRequest } from '../types';
import * as queries from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

// GET /api/exercises - List all custom exercises
app.get('/', async (c) => {
  const exercises = await queries.getAllCustomExercises(c.env.DB);
  return c.json(exercises);
});

// GET /api/exercises/:id - Get single custom exercise
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const exercise = await queries.getCustomExercise(c.env.DB, id);

  if (!exercise) {
    return c.json({ error: 'Exercise not found' }, 404);
  }

  return c.json(exercise);
});

// POST /api/exercises - Create custom exercise
app.post('/', async (c) => {
  const body = await c.req.json<CreateExerciseRequest>();

  if (!body.name || !body.type || !body.category || !body.unit) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const exercise = await queries.createCustomExercise(c.env.DB, body);
  return c.json(exercise, 201);
});

// PUT /api/exercises/:id - Update custom exercise
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<CreateExerciseRequest>();

  if (!body.name || !body.type || !body.category || !body.unit) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const exercise = await queries.updateCustomExercise(c.env.DB, id, body);

  if (!exercise) {
    return c.json({ error: 'Exercise not found' }, 404);
  }

  return c.json(exercise);
});

// DELETE /api/exercises/:id - Delete custom exercise
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await queries.deleteCustomExercise(c.env.DB, id);

  if (!deleted) {
    return c.json({ error: 'Exercise not found' }, 404);
  }

  return c.json({ success: true });
});

export default app;
