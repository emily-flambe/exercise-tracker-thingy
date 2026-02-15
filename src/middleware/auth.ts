import { Context, Next } from 'hono';
import { verifyToken } from '../auth';
import { getUserByApiKey } from '../db/queries';
import type { Env } from '../types';

// Extend Hono's context to include userId
declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
  }
}

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);

  // Check if this is an API key (starts with wt_)
  if (token.startsWith('wt_')) {
    const userId = await getUserByApiKey(c.env.DB, token);
    if (!userId) {
      return c.json({ error: 'Invalid API key' }, 401);
    }
    c.set('userId', userId);
    await next();
    return;
  }

  // Otherwise treat as JWT
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('userId', payload.userId);
  await next();
}
