// Helpers that build Mutation objects from domain values.
// Kept as pure builders so they can be unit-tested without touching IndexedDB.

import type { Mutation } from './db';
import type { CreateWorkoutRequest, CreateExerciseRequest } from '../../types';

export function newClientId(): string {
  // Use crypto.randomUUID when available, fall back to a 64-bit-ish hex id.
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  // Fallback: 16-char hex.
  const buf = new Uint8Array(16);
  (globalThis.crypto as Crypto).getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildWorkoutUpsert(
  resourceId: string,
  isNew: boolean,
  body: CreateWorkoutRequest & { id?: string; updated_at?: number }
): Omit<Mutation, 'seq' | 'createdAt' | 'attempts'> {
  return {
    id: `workout.upsert:${resourceId}`,
    kind: 'workout.upsert',
    resourceId,
    isNew,
    body: isNew ? { ...body, id: resourceId } : body,
  };
}

export function buildWorkoutDelete(
  resourceId: string
): Omit<Mutation, 'seq' | 'createdAt' | 'attempts'> {
  return {
    id: `workout.delete:${resourceId}`,
    kind: 'workout.delete',
    resourceId,
    isNew: false,
    body: null,
  };
}

export function buildExerciseUpsert(
  resourceId: string,
  isNew: boolean,
  body: CreateExerciseRequest & { id?: string }
): Omit<Mutation, 'seq' | 'createdAt' | 'attempts'> {
  return {
    id: `exercise.upsert:${resourceId}`,
    kind: 'exercise.upsert',
    resourceId,
    isNew,
    body: isNew ? { ...body, id: resourceId } : body,
  };
}

export function buildExerciseDelete(
  resourceId: string
): Omit<Mutation, 'seq' | 'createdAt' | 'attempts'> {
  return {
    id: `exercise.delete:${resourceId}`,
    kind: 'exercise.delete',
    resourceId,
    isNew: false,
    body: null,
  };
}
