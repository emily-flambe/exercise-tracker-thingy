// Offline mutation sync loop.
//
// Responsibilities:
// - Drain the IndexedDB mutation queue in FIFO order.
// - Single-flight: only one flush runs at a time.
// - On 409 (conflict), replay with last-write-wins semantics and surface a toast.
// - Listen to `online` events and a 60s interval for periodic retry.
// - Expose a small API that workout.ts / app.ts can call without caring about the queue internals.

import {
  listQueue,
  removeFromQueue,
  updateQueueEntry,
  queueLength,
  type Mutation,
} from './db';

// Injected dependencies — kept as function refs so tests can stub them without
// touching the real fetch / toast / network.
export interface SyncDeps {
  // Perform the actual HTTP request for a single mutation.
  // Should throw on non-2xx with { status, body }.
  send: (m: Mutation) => Promise<void>;
  // User-visible notification (optional — used on 409 LWW replay).
  toast?: (message: string) => void;
  // Callback invoked whenever queue length or status changes (for UI indicator).
  onStatusChange?: (status: SyncStatus) => void;
  // Whether the browser thinks we are online. Defaults to navigator.onLine.
  isOnline?: () => boolean;
}

export interface SyncStatus {
  pending: number;
  syncing: boolean;
  lastError: string | null;
  lastSyncAt: number | null;
}

export class SyncHttpError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = 'SyncHttpError';
  }
}

let inFlight: Promise<void> | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let onlineHandler: (() => void) | null = null;
let deps: SyncDeps | null = null;
let lastStatus: SyncStatus = {
  pending: 0,
  syncing: false,
  lastError: null,
  lastSyncAt: null,
};

function emitStatus(patch: Partial<SyncStatus>): void {
  lastStatus = { ...lastStatus, ...patch };
  deps?.onStatusChange?.(lastStatus);
}

export function getStatus(): SyncStatus {
  return lastStatus;
}

function isOnlineDefault(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

// Flush once. Single-flight: concurrent callers await the same promise.
export function flushNow(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await doFlush();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function doFlush(): Promise<void> {
  if (!deps) return;
  const isOnline = deps.isOnline ?? isOnlineDefault;
  if (!isOnline()) {
    emitStatus({ pending: await queueLength(), syncing: false });
    return;
  }

  emitStatus({ syncing: true });
  try {
    // Loop: fetch a snapshot, send each in order, re-snapshot if new ones arrive.
    // Bounded to avoid infinite loops under adversarial enqueue-during-flush.
    for (let pass = 0; pass < 5; pass++) {
      const queue = await listQueue();
      if (queue.length === 0) break;

      for (const m of queue) {
        try {
          await deps.send(m);
          await removeFromQueue(m.id);
          emitStatus({ pending: await queueLength(), lastError: null });
        } catch (err) {
          if (err instanceof SyncHttpError) {
            if (err.status === 409) {
              // Last-write-wins: our mutation superseded by a concurrent change.
              // Drop this mutation, surface a one-time toast.
              deps.toast?.('Sync conflict resolved (your latest change kept).');
              await removeFromQueue(m.id);
              emitStatus({ pending: await queueLength() });
              continue;
            }
            if (err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
              // Client error that won't be fixed by retry (bad request, auth, not found).
              // Record the error, drop the mutation so the queue doesn't wedge.
              const next: Mutation = {
                ...m,
                attempts: m.attempts + 1,
                lastError: `HTTP ${err.status}`,
              };
              await updateQueueEntry(next);
              // Drop so a poison pill cannot block the rest of the queue indefinitely.
              await removeFromQueue(m.id);
              emitStatus({ pending: await queueLength(), lastError: `HTTP ${err.status}` });
              continue;
            }
          }
          // Network / 5xx / unknown: increment attempts and bail out of this pass.
          // Next tick (online event or interval) will retry.
          const next: Mutation = {
            ...m,
            attempts: m.attempts + 1,
            lastError: err instanceof Error ? err.message : String(err),
          };
          await updateQueueEntry(next);
          emitStatus({
            pending: await queueLength(),
            lastError: next.lastError ?? null,
          });
          return;
        }
      }
    }
    emitStatus({ lastSyncAt: Date.now() });
  } finally {
    emitStatus({ syncing: false, pending: await queueLength() });
  }
}

export function startSync(depsArg: SyncDeps, intervalMs = 60_000): void {
  deps = depsArg;
  stopSync();
  onlineHandler = () => {
    void flushNow();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onlineHandler);
  }
  intervalId = setInterval(() => {
    void flushNow();
  }, intervalMs);
  // Initial kick.
  void (async () => {
    emitStatus({ pending: await queueLength() });
    void flushNow();
  })();
}

export function stopSync(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (onlineHandler && typeof window !== 'undefined') {
    window.removeEventListener('online', onlineHandler);
    onlineHandler = null;
  }
}

// Test-only: reset module state between tests.
export function __resetSyncForTests(): void {
  inFlight = null;
  intervalId = null;
  onlineHandler = null;
  deps = null;
  lastStatus = { pending: 0, syncing: false, lastError: null, lastSyncAt: null };
}
