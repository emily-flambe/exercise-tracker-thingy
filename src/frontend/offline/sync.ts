// Offline mutation sync loop.
//
// Responsibilities:
// - Drain the IndexedDB mutation queue in FIFO order.
// - Single-flight: only one flush runs at a time.
// - On 409 (conflict), hold the mutation (marked `conflicted`) and surface it to
//   the UI via onConflict so the user can pick a side. No silent last-write-wins.
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
  // Returns the parsed response body on success.
  send: (m: Mutation) => Promise<unknown>;
  // User-visible notification (optional).
  toast?: (message: string) => void;
  // Callback invoked whenever queue length or status changes (for UI indicator).
  onStatusChange?: (status: SyncStatus) => void;
  // Whether the browser thinks we are online. Defaults to navigator.onLine.
  isOnline?: () => boolean;
  // Callback after a successful workout upsert sync. Receives the mutation and
  // the parsed server response so the caller can update local state (e.g.
  // editingWorkoutUpdatedAt).
  onWorkoutSynced?: (mutation: Mutation, response: unknown) => void;
  // Callback when a mutation hits a 409 conflict (the resource changed under us,
  // e.g. the coach agent edited the workout). The mutation is held in the queue
  // marked `conflicted`; the UI must prompt the user and then call
  // resolveConflictKeepMine() or resolveConflictTakeTheirs() to unblock it.
  // `current` is the server's current version of the resource (from the 409 body).
  onConflict?: (mutation: Mutation, current: Record<string, unknown> | undefined) => void;
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
      // Conflicted mutations are held until the user resolves them — they are
      // invisible to the drain so they neither retry nor block other resources.
      const queue = (await listQueue()).filter((m) => !m.conflicted);
      if (queue.length === 0) break;

      for (const m of queue) {
        try {
          const response = await deps.send(m);
          await removeFromQueue(m.id);
          emitStatus({ pending: await queueLength(), lastError: null });
          // Notify workout module of successful sync so it can update local state
          // (e.g. editingWorkoutUpdatedAt to prevent stale 409 loops).
          if (m.kind === 'workout.upsert' && deps.onWorkoutSynced) {
            try { deps.onWorkoutSynced(m, response); } catch { /* non-fatal */ }
          }
        } catch (err) {
          if (err instanceof SyncHttpError) {
            if (err.status === 401 || err.status === 403) {
              // Auth transient (token rotation, brief denial). Keep the mutation,
              // pause flush, retry on the next online/interval trigger.
              emitStatus({
                pending: await queueLength(),
                lastError: `HTTP ${err.status}`,
              });
              return;
            }
            if (err.status === 409) {
              // The resource changed under us (another device, or the coach
              // agent). Do NOT silently overwrite either side. Hold the mutation
              // (marked conflicted so the drain skips it) and surface it to the
              // UI, which prompts the user to keep theirs or take the server's.
              const current = (err.body as { current?: Record<string, unknown> } | undefined)?.current;
              const conflicted: Mutation = { ...m, conflicted: true };
              await updateQueueEntry(conflicted);
              emitStatus({ pending: await queueLength() });
              try { deps.onConflict?.(conflicted, current); } catch { /* non-fatal */ }
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

// Resolve a conflicted mutation by keeping the local (user's) version: rebase it
// onto the server's current updated_at so the next send wins the compare-and-swap,
// clear the conflicted flag, and kick a flush. No-op if the entry is gone.
export async function resolveConflictKeepMine(id: string, serverUpdatedAt: number): Promise<void> {
  const entry = (await listQueue()).find((m) => m.id === id);
  if (!entry) return;
  const bodyObj = (entry.body && typeof entry.body === 'object')
    ? (entry.body as Record<string, unknown>)
    : null;
  if (bodyObj) bodyObj.updated_at = serverUpdatedAt;
  await updateQueueEntry({ ...entry, body: bodyObj ?? entry.body, conflicted: false });
  emitStatus({ pending: await queueLength(), lastError: null });
  void flushNow();
}

// Resolve a conflicted mutation by taking the server's (their) version: drop the
// local mutation entirely. The caller is responsible for loading server state
// into the UI. No-op if the entry is gone.
export async function resolveConflictTakeTheirs(id: string): Promise<void> {
  await removeFromQueue(id);
  emitStatus({ pending: await queueLength(), lastError: null });
}

// Test-only: reset module state between tests.
export function __resetSyncForTests(): void {
  inFlight = null;
  intervalId = null;
  onlineHandler = null;
  deps = null;
  lastStatus = { pending: 0, syncing: false, lastError: null, lastSyncAt: null };
}
