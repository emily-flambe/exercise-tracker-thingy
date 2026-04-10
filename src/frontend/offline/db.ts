// IndexedDB wrapper for offline cache + mutation queue.
// Keeps it deliberately small: one object store for cache blobs and one for the FIFO queue.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface Mutation {
  // Client-generated unique id for the queue entry (also used as idempotency key for POSTs that assign an id).
  id: string;
  // Monotonic sequence number for FIFO ordering and dedup.
  seq: number;
  // Kind of mutation.
  kind:
    | 'workout.upsert'
    | 'workout.delete'
    | 'exercise.upsert'
    | 'exercise.delete';
  // Target resource id (for workouts/exercises — used to POST with a client-supplied id or PUT/DELETE an existing one).
  resourceId: string;
  // Whether the resource was created offline (i.e. should be POSTed with client id) vs updated (PUT by id).
  isNew: boolean;
  // Full request body for the mutation. Opaque to the queue.
  body: unknown;
  // Bookkeeping.
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export type CacheKey = 'user' | 'workouts' | 'exercises' | 'prs';

interface OfflineDB extends DBSchema {
  cache: {
    key: CacheKey;
    value: { key: CacheKey; value: unknown; updatedAt: number };
  };
  queue: {
    key: string;
    value: Mutation;
    indexes: { 'by-seq': number };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = 'workout-tracker-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('queue')) {
          const store = db.createObjectStore('queue', { keyPath: 'id' });
          store.createIndex('by-seq', 'seq');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// Test-only: reset module state.
export function __resetDbForTests(): void {
  dbPromise = null;
}

// ========== Cache ==========

export async function cacheSet(key: CacheKey, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('cache', { key, value, updatedAt: Date.now() });
}

export async function cacheGet<T = unknown>(key: CacheKey): Promise<T | null> {
  const db = await getDb();
  const row = await db.get('cache', key);
  return row ? (row.value as T) : null;
}

export async function cacheClear(): Promise<void> {
  const db = await getDb();
  await db.clear('cache');
}

// ========== Queue ==========

async function nextSeq(): Promise<number> {
  const db = await getDb();
  const row = await db.get('meta', 'nextSeq');
  const next = (row?.value as number | undefined) ?? 1;
  await db.put('meta', { key: 'nextSeq', value: next + 1 });
  return next;
}

export async function enqueue(
  m: Omit<Mutation, 'seq' | 'createdAt' | 'attempts'>
): Promise<Mutation> {
  const db = await getDb();
  // If a mutation with this id already exists, replace it (latest-write-wins for same resource op).
  // Callers that want a different semantic should pass a unique id per enqueue.
  const existing = await db.get('queue', m.id);
  const seq = existing ? existing.seq : await nextSeq();
  const mutation: Mutation = {
    ...m,
    seq,
    createdAt: existing?.createdAt ?? Date.now(),
    attempts: existing?.attempts ?? 0,
  };
  await db.put('queue', mutation);
  return mutation;
}

export async function listQueue(): Promise<Mutation[]> {
  const db = await getDb();
  return db.getAllFromIndex('queue', 'by-seq');
}

export async function queueLength(): Promise<number> {
  const db = await getDb();
  return db.count('queue');
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('queue', id);
}

export async function updateQueueEntry(m: Mutation): Promise<void> {
  const db = await getDb();
  await db.put('queue', m);
}

export async function clearQueue(): Promise<void> {
  const db = await getDb();
  await db.clear('queue');
}
