// Minimal tests for the sync engine. The IndexedDB layer is mocked so these
// can run in the Cloudflare Workers test pool (no real IDB available).
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Mutation = {
  id: string;
  seq: number;
  kind: 'workout.upsert';
  resourceId: string;
  isNew: boolean;
  body: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

// Mock the db module before importing sync so sync picks up the mock.
const state: { queue: Mutation[] } = { queue: [] };
vi.mock('./db', () => ({
  listQueue: async () => state.queue.slice(),
  queueLength: async () => state.queue.length,
  removeFromQueue: async (id: string) => {
    state.queue = state.queue.filter((m) => m.id !== id);
  },
  updateQueueEntry: async (m: Mutation) => {
    state.queue = state.queue.map((x) => (x.id === m.id ? m : x));
  },
}));

import { flushNow, __resetSyncForTests, startSync, stopSync } from './sync';

function makeMutation(id: string, seq: number): Mutation {
  return {
    id,
    seq,
    kind: 'workout.upsert',
    resourceId: id,
    isNew: true,
    body: { id },
    createdAt: 0,
    attempts: 0,
  };
}

describe('sync engine', () => {
  beforeEach(() => {
    state.queue = [];
    __resetSyncForTests();
  });

  it('happy path: drains the queue and calls send in FIFO order', async () => {
    state.queue = [makeMutation('a', 1), makeMutation('b', 2)];
    const sent: string[] = [];
    startSync(
      {
        send: async (m) => {
          sent.push(m.id);
        },
        isOnline: () => true,
      },
      60_000,
    );
    await flushNow();
    stopSync();
    expect(sent).toEqual(['a', 'b']);
    expect(state.queue).toEqual([]);
  });

  it('offline short-circuit: does not call send when isOnline() is false', async () => {
    state.queue = [makeMutation('a', 1)];
    const send = vi.fn(async () => {});
    startSync(
      {
        send,
        isOnline: () => false,
      },
      60_000,
    );
    await flushNow();
    stopSync();
    expect(send).not.toHaveBeenCalled();
    expect(state.queue.length).toBe(1);
  });
});
