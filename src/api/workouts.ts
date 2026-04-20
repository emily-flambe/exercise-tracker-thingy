import { Hono } from 'hono';
import type { Env, CreateWorkoutRequest } from '../types';
import * as queries from '../db/queries';
import { authMiddleware } from '../middleware/auth';
import { logAudit } from '../db/audit';

const app = new Hono<{ Bindings: Env }>();

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

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

// POST /api/workouts - Create workout (supports client-supplied id for idempotent retries)
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<CreateWorkoutRequest & { id?: string }>();

  if (!body.start_time || !Array.isArray(body.exercises)) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Validate optional client-supplied id: must be a canonical UUID.
  if (body.id !== undefined) {
    if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) {
      return c.json({ error: 'Invalid id' }, 400);
    }
  }

  try {
    const workout = await queries.createWorkout(c.env.DB, userId, body);
    await logAudit(c, { action: 'create', entity_type: 'workout', entity_id: workout.id });
    return c.json(workout, 201);
  } catch (err) {
    if (err instanceof queries.IdConflictError) {
      return c.json({ error: 'id conflict' }, 409);
    }
    throw err;
  }
});

// PUT /api/workouts/:id - Update workout
app.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json<CreateWorkoutRequest & { updated_at?: number }>();

  if (!body.start_time || !Array.isArray(body.exercises)) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const result = await queries.updateWorkout(c.env.DB, id, userId, body);

  if (result.status === 'not_found') {
    return c.json({ error: 'Workout not found' }, 404);
  }

  if (result.status === 'conflict') {
    return c.json({ error: 'Conflict', current: result.current }, 409);
  }

  await logAudit(c, { action: 'update', entity_type: 'workout', entity_id: result.workout.id });
  return c.json(result.workout);
});

// DELETE /api/workouts/:id - Delete workout
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const deleted = await queries.deleteWorkout(c.env.DB, id, userId);

  if (!deleted) {
    return c.json({ error: 'Workout not found' }, 404);
  }

  await logAudit(c, { action: 'delete', entity_type: 'workout', entity_id: id });
  return c.json({ success: true });
});

// GET /api/workouts/prs/all - Get all PRs for user
app.get('/prs/all', async (c) => {
  const userId = c.get('userId');
  const prs = await queries.getAllPRs(c.env.DB, userId);
  return c.json(prs);
});

// GET /api/workouts/prs/:exerciseName - Get PRs for specific exercise
app.get('/prs/:exerciseName', async (c) => {
  const userId = c.get('userId');
  const exerciseName = decodeURIComponent(c.req.param('exerciseName'));
  const prs = await queries.getPRsForExercise(c.env.DB, userId, exerciseName);
  return c.json(prs);
});

export default app;
