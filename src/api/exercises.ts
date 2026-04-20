import { Hono } from 'hono';
import type { Env, CreateExerciseRequest } from '../types';
import * as queries from '../db/queries';
import { authMiddleware } from '../middleware/auth';
import { logAudit } from '../db/audit';

const app = new Hono<{ Bindings: Env }>();

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Apply auth middleware to all routes
app.use('*', authMiddleware);

// GET /api/exercises - List all custom exercises
app.get('/', async (c) => {
  const userId = c.get('userId');
  const exercises = await queries.getAllCustomExercises(c.env.DB, userId);
  return c.json(exercises);
});

// GET /api/exercises/deleted - List soft-deleted exercises (MUST be before /:id)
app.get('/deleted', async (c) => {
  const userId = c.get('userId');
  const exercises = await queries.getDeletedCustomExercises(c.env.DB, userId);
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

// POST /api/exercises - Create custom exercise (supports client-supplied id for idempotent retries)
app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<CreateExerciseRequest & { id?: string }>();

  if (!body.name || !body.type || !body.category || !body.muscle_group || !body.unit) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Validate optional client-supplied id: must be a canonical UUID.
  if (body.id !== undefined) {
    if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) {
      return c.json({ error: 'Invalid id' }, 400);
    }
  }

  try {
    const exercise = await queries.createCustomExercise(c.env.DB, userId, body);
    await logAudit(c, { action: 'create', entity_type: 'custom_exercise', entity_id: exercise.id });
    return c.json(exercise, 201);
  } catch (err) {
    if (err instanceof queries.IdConflictError) {
      return c.json({ error: 'id conflict' }, 409);
    }
    throw err;
  }
});

// POST /api/exercises/:id/restore - Restore a soft-deleted exercise
app.post('/:id/restore', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const restored = await queries.restoreCustomExercise(c.env.DB, id, userId);

  if (!restored) {
    return c.json({ error: 'Deleted exercise not found' }, 404);
  }

  await logAudit(c, { action: 'update', entity_type: 'custom_exercise', entity_id: id });
  return c.json({ success: true });
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

  await logAudit(c, { action: 'update', entity_type: 'custom_exercise', entity_id: exercise.id });
  return c.json(exercise);
});

// PATCH /api/exercises/:id/settings - Update exercise settings
app.patch('/:id/settings', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json<{ settings: Record<string, string> | null }>();

  // Validate settings: must be null or a plain object with string keys and string values
  if (body.settings !== null && body.settings !== undefined) {
    if (typeof body.settings !== 'object' || Array.isArray(body.settings)) {
      return c.json({ error: 'Settings must be an object or null' }, 400);
    }
    const entries = Object.entries(body.settings);
    if (entries.length > 20) {
      return c.json({ error: 'Too many settings (max 20)' }, 400);
    }
    for (const [key, value] of entries) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        return c.json({ error: 'Setting keys and values must be strings' }, 400);
      }
      if (key.length > 50) {
        return c.json({ error: 'Setting key too long (max 50 chars)' }, 400);
      }
      if (value.length > 100) {
        return c.json({ error: 'Setting value too long (max 100 chars)' }, 400);
      }
    }
  }

  const result = await queries.updateExerciseSettings(c.env.DB, id, userId, body.settings);
  if (!result) {
    return c.json({ error: 'Exercise not found' }, 404);
  }
  await logAudit(c, { action: 'update', entity_type: 'custom_exercise', entity_id: result.id });
  return c.json(result);
});

// DELETE /api/exercises/:id - Soft delete custom exercise
app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const deleted = await queries.deleteCustomExercise(c.env.DB, id, userId);

  if (!deleted) {
    return c.json({ error: 'Exercise not found' }, 404);
  }

  await logAudit(c, { action: 'delete', entity_type: 'custom_exercise', entity_id: id });
  return c.json({ success: true });
});

export default app;
