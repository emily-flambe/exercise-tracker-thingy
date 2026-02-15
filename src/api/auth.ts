import { Hono } from 'hono';
import type { Env, RegisterRequest, LoginRequest, AuthResponse } from '../types';
import { hashPassword, verifyPassword, createToken } from '../auth';
import { getUserByUsername, createUser, getUserById, createApiKey } from '../db/queries';
import { authMiddleware } from '../middleware/auth';

const auth = new Hono<{ Bindings: Env }>();

// Register new user
auth.post('/register', async (c) => {
  const body = await c.req.json<RegisterRequest>();

  if (!body.username || !body.password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  if (body.username.length < 3) {
    return c.json({ error: 'Username must be at least 3 characters' }, 400);
  }

  if (body.password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  // Check if username already exists
  const existing = await getUserByUsername(c.env.DB, body.username);
  if (existing) {
    return c.json({ error: 'Username already taken' }, 400);
  }

  // Create user
  const passwordHash = await hashPassword(body.password);
  const user = await createUser(c.env.DB, body.username, passwordHash);

  // Generate token
  const token = await createToken(user.id, c.env.JWT_SECRET);

  const response: AuthResponse = { token, user };
  return c.json(response, 201);
});

// Login
auth.post('/login', async (c) => {
  const body = await c.req.json<LoginRequest>();

  if (!body.username || !body.password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const userRow = await getUserByUsername(c.env.DB, body.username);
  if (!userRow) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  const validPassword = await verifyPassword(body.password, userRow.password_hash);
  if (!validPassword) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  // Generate token
  const token = await createToken(userRow.id, c.env.JWT_SECRET);

  const response: AuthResponse = {
    token,
    user: {
      id: userRow.id,
      username: userRow.username,
      created_at: userRow.created_at,
    },
  };
  return c.json(response);
});

// Get current user (protected)
auth.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const user = await getUserById(c.env.DB, userId);

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(user);
});

// Create API key (protected)
auth.post('/api-keys', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ name: string }>();

  if (!body.name) {
    return c.json({ error: 'Name is required' }, 400);
  }

  const { id, key } = await createApiKey(c.env.DB, userId, body.name);
  return c.json({ id, key, name: body.name }, 201);
});

export default auth;
