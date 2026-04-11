// Glue between the abstract sync loop and the real API module.
// Translates a Mutation into an HTTP request via fetch.

import type { Mutation } from './db';
import { SyncHttpError } from './sync';

const isCapacitor = typeof window !== 'undefined' && (window as unknown as { Capacitor?: unknown }).Capacitor !== undefined;
const API_BASE = isCapacitor ? 'https://workout.emilycogsdill.com/api' : '/api';
const TOKEN_KEY = 'workout_auth_token';

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request(method: string, path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}));
    throw new SyncHttpError(res.status, parsed);
  }
}

export async function sendMutation(m: Mutation): Promise<void> {
  switch (m.kind) {
    case 'workout.upsert': {
      if (m.isNew) {
        // POST with client-supplied id — idempotent per backend.
        await request('POST', '/workouts', m.body);
      } else {
        await request('PUT', `/workouts/${m.resourceId}`, m.body);
      }
      return;
    }
    case 'workout.delete': {
      await request('DELETE', `/workouts/${m.resourceId}`, null);
      return;
    }
    case 'exercise.upsert': {
      if (m.isNew) {
        await request('POST', '/exercises', m.body);
      } else {
        await request('PUT', `/exercises/${m.resourceId}`, m.body);
      }
      return;
    }
    case 'exercise.delete': {
      await request('DELETE', `/exercises/${m.resourceId}`, null);
      return;
    }
  }
}
