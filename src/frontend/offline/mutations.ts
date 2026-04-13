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
  // Fallback: proper UUID v4 with dashes and version/variant bits.
  const buf = new Uint8Array(16);
  (globalThis.crypto as Crypto).getRandomValues(buf);
  // Set version (byte 6, high nibble = 4) and variant (byte 8, high bits = 10)
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
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
