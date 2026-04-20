import { Context, Next } from 'hono';
import { verifyToken } from '../auth';
import { getUserByApiKey } from '../db/queries';
import type { Env } from '../types';

export type AuthMethod = 'jwt' | 'api_key' | 'unauthenticated';

// Extend Hono's context
declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    authMethod: AuthMethod;
    apiKeyName: string | null;
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
    const result = await getUserByApiKey(c.env.DB, token);
    if (!result) {
      return c.json({ error: 'Invalid API key' }, 401);
    }
    c.set('userId', result.user_id);
    c.set('authMethod', 'api_key');
    c.set('apiKeyName', result.name);
    await next();
    return;
  }

  // Otherwise treat as JWT
  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('userId', payload.userId);
  c.set('authMethod', 'jwt');
  c.set('apiKeyName', null);
  await next();
}
