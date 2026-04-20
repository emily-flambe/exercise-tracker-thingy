import type { Context } from 'hono';
import type { Env } from '../types';
import type { AuthMethod } from '../middleware/auth';

export interface LogAuditArgs {
  action: string; // 'create' | 'update' | 'delete'
  entity_type: string; // 'workout' | 'custom_exercise' | 'user' | 'api_key'
  entity_id?: string | null;
}

/**
 * Write a single row to audit_log describing a DB-altering event.
 *
 * Pulls actor info (user_id, auth_method, api_key_name) from the Hono context
 * and captures the route from the request. Throws on failure — audit writes
 * are intentionally not swallowed so a broken pipeline is visible.
 */
export async function logAudit(
  c: Context<{ Bindings: Env }>,
  { action, entity_type, entity_id }: LogAuditArgs
): Promise<void> {
  const userId = (c.get('userId') as string | undefined) ?? null;
  const authMethod = (c.get('authMethod') as AuthMethod | undefined) ?? 'unauthenticated';
  const apiKeyName = (c.get('apiKeyName') as string | null | undefined) ?? null;

  const route = `${c.req.method} ${c.req.routePath}`;

  await c.env.DB
    .prepare(
      'INSERT INTO audit_log (id, created_at, user_id, auth_method, api_key_name, action, entity_type, entity_id, route) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      crypto.randomUUID(),
      Date.now(),
      userId,
      authMethod,
      apiKeyName,
      action,
      entity_type,
      entity_id ?? null,
      route
    )
    .run();
}
