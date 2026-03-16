/**
 * Tests for the polling-based sync implementation.
 *
 * Because the frontend modules depend on browser globals (window, document,
 * localStorage), we cannot import them directly in the Cloudflare Workers
 * test pool. Instead, we extract and test the pure logic here, mocking all
 * dependencies that touch the DOM or network.
 *
 * Each test group targets a specific bug vector identified during review.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Inline replicas of the pure logic under test ────────────────────────────
// These replicate the exact logic from sync.ts / workout.ts without the
// browser-dependent imports, so we can prove correctness (or bugs) in isolation.

// ── sync-state logic ─────────────────────────────────────────────────────────
function makeSyncState() {
  let autoSaveInProgress = false;
  return {
    get() { return autoSaveInProgress; },
    set(val: boolean) { autoSaveInProgress = val; },
  };
}

// ── mergeServerWorkout logic (extracted from workout.ts lines 250–275) ───────
interface WorkoutExercise {
  name: string;
  sets: { weight: number; reps: number; completed?: boolean }[];
  notes?: string;
  completed?: boolean;
}

interface Workout {
  id: string;
  user_id: string;
  start_time: number;
  end_time?: number;
  exercises: WorkoutExercise[];
  created_at: number;
  updated_at: number;
}

function mergeServerWorkout(
  currentWorkout: { exercises: WorkoutExercise[] },
  serverWorkout: Workout,
  setUpdatedAt: (v: number) => void,
): void {
  setUpdatedAt(serverWorkout.updated_at);

  const localExercises = currentWorkout.exercises;
  const serverExercises = serverWorkout.exercises;

  // Copy notes from server → local (server wins for notes)
  for (const localEx of localExercises) {
    const serverEx = serverExercises.find(se => se.name === localEx.name);
    if (!serverEx) continue;
    if (serverEx.notes && !localEx.notes) {
      localEx.notes = serverEx.notes;
    }
  }

  // Add exercises that exist on server but not locally
  for (const serverEx of serverExercises) {
    const localEx = localExercises.find(le => le.name === serverEx.name);
    if (!localEx) {
      localExercises.push(JSON.parse(JSON.stringify(serverEx)));
    }
  }
}

// ── startSync / stopSync logic (extracted from sync.ts lines 11–23) ──────────
function makeSyncController() {
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function startSync(pollFn: () => void, intervalMs: number): void {
    if (pollTimer) return; // guard against double-start
    pollTimer = setInterval(pollFn, intervalMs);
  }

  function stopSync(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function isRunning(): boolean {
    return pollTimer !== null;
  }

  return { startSync, stopSync, isRunning };
}

// ── pollForChanges logic (extracted from sync.ts lines 25–51) ────────────────
async function pollForChanges(opts: {
  getAutoSaveInProgress: () => boolean;
  getEditingWorkoutId: () => string | null;
  getWorkout: (id: string) => Promise<Workout>;
  getEditingWorkoutUpdatedAt: () => number | null;
  mergeServerWorkoutFn: (w: Workout) => void;
  setEditingWorkoutUpdatedAt: (v: number) => void;
  loadData: () => Promise<void>;
  renderHistory: () => void;
  getActiveTabId: () => string | null;
}): Promise<void> {
  if (opts.getAutoSaveInProgress()) return;

  if (opts.getEditingWorkoutId()) {
    try {
      const serverWorkout = await opts.getWorkout(opts.getEditingWorkoutId()!);
      const currentUpdatedAt = opts.getEditingWorkoutUpdatedAt();
      if (currentUpdatedAt !== null && serverWorkout.updated_at > currentUpdatedAt) {
        opts.mergeServerWorkoutFn(serverWorkout);
        opts.setEditingWorkoutUpdatedAt(serverWorkout.updated_at);
      }
    } catch (error) {
      // swallow — polling must continue
    }
  } else {
    try {
      await opts.loadData();
      if (opts.getActiveTabId() === 'tab-history') {
        opts.renderHistory();
      }
    } catch (error) {
      // swallow — polling must continue
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('mergeServerWorkout — core merge logic', () => {
  it('adds exercises that exist on server but not locally', () => {
    const local = { exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 10 }] }] };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 2000,
      exercises: [
        { name: 'Bench Press', sets: [{ weight: 100, reps: 10 }] },
        { name: 'Squat',       sets: [{ weight: 200, reps: 5  }] }, // server-only exercise
      ],
    };

    mergeServerWorkout(local, server, () => {});

    expect(local.exercises).toHaveLength(2);
    expect(local.exercises[1].name).toBe('Squat');
  });

  it('copies notes from server to local when local has no notes', () => {
    const local = { exercises: [{ name: 'Deadlift', sets: [], notes: undefined }] };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 2000,
      exercises: [{ name: 'Deadlift', sets: [], notes: 'Keep back straight' }],
    };

    mergeServerWorkout(local, server, () => {});

    expect(local.exercises[0].notes).toBe('Keep back straight');
  });

  it('does NOT overwrite local notes with server notes when local already has notes', () => {
    const local = { exercises: [{ name: 'Deadlift', sets: [], notes: 'My local note' }] };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 2000,
      exercises: [{ name: 'Deadlift', sets: [], notes: 'Server note' }],
    };

    mergeServerWorkout(local, server, () => {});

    expect(local.exercises[0].notes).toBe('My local note');
  });

  // BUG: merge does not remove local exercises deleted on server
  it('BUG: does NOT remove exercises deleted on server — local exercise survives', () => {
    const local = {
      exercises: [
        { name: 'Bench Press', sets: [{ weight: 100, reps: 10 }] },
        { name: 'Curls',       sets: [{ weight: 30,  reps: 12 }] }, // user deleted this on another device
      ],
    };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 2000,
      exercises: [
        { name: 'Bench Press', sets: [{ weight: 100, reps: 10 }] },
        // Curls was removed server-side
      ],
    };

    mergeServerWorkout(local, server, () => {});

    // This assertion exposes the bug: the deletion is invisible to the merge.
    // After merging, local still has Curls even though server removed it.
    // The test PASSES only because the bug exists — if the bug were fixed,
    // the array would have length 1 and this assertion would need updating.
    expect(local.exercises).toHaveLength(2); // BUG: should be 1 after fix
    const names = local.exercises.map(e => e.name);
    expect(names).toContain('Curls'); // BUG: Curls should have been removed
  });

  it('updates editingWorkoutUpdatedAt to server timestamp on merge', () => {
    const local = { exercises: [{ name: 'Press', sets: [] }] };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 9999,
      exercises: [{ name: 'Press', sets: [] }],
    };

    let capturedUpdatedAt: number | null = null;
    mergeServerWorkout(local, server, (v) => { capturedUpdatedAt = v; });

    expect(capturedUpdatedAt).toBe(9999);
  });

  it('makes a deep copy of server exercise (no shared reference)', () => {
    const local = { exercises: [] as WorkoutExercise[] };
    const serverEx = { name: 'Row', sets: [{ weight: 80, reps: 8 }] };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 2000,
      exercises: [serverEx],
    };

    mergeServerWorkout(local, server, () => {});

    // Mutating the server object after merge must not affect local
    serverEx.sets[0].weight = 999;
    expect(local.exercises[0].sets[0].weight).toBe(80);
  });
});

describe('pollForChanges — flag check race condition', () => {
  it('skips polling when autoSaveInProgress is true', async () => {
    const getWorkout = vi.fn();
    const loadData = vi.fn();

    await pollForChanges({
      getAutoSaveInProgress: () => true,
      getEditingWorkoutId: () => 'workout-123',
      getWorkout,
      getEditingWorkoutUpdatedAt: () => 1000,
      mergeServerWorkoutFn: vi.fn(),
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData,
      renderHistory: vi.fn(),
      getActiveTabId: () => null,
    });

    expect(getWorkout).not.toHaveBeenCalled();
    expect(loadData).not.toHaveBeenCalled();
  });

  // BUG: flag is checked at entry, but the request is not re-checked after await.
  // If autoSave starts WHILE getWorkout is in flight, the merge still runs.
  it('BUG: merge runs even when autoSave starts during in-flight request', async () => {
    let autoSaveStarted = false;
    const mergeServerWorkoutFn = vi.fn();

    // Simulate: getWorkout takes time; auto-save starts while it is in flight
    const getWorkout = vi.fn().mockImplementation(async () => {
      // Auto-save starts mid-flight — flag goes true
      autoSaveStarted = true;
      return {
        id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 9999,
        exercises: [],
      } as Workout;
    });

    await pollForChanges({
      getAutoSaveInProgress: () => autoSaveStarted, // true once getWorkout resolves
      getEditingWorkoutId: () => 'workout-123',
      getWorkout,
      getEditingWorkoutUpdatedAt: () => 1000, // server (9999) > local (1000) → triggers merge
      mergeServerWorkoutFn,
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData: vi.fn(),
      renderHistory: vi.fn(),
      getActiveTabId: () => null,
    });

    // The flag is only checked at line 1 of pollForChanges.
    // After the await, there is no re-check — merge fires despite auto-save in progress.
    // This test proves the race: mergeServerWorkoutFn was called even though
    // autoSaveInProgress became true during the request.
    expect(mergeServerWorkoutFn).toHaveBeenCalled(); // BUG: should NOT have been called
  });
});

describe('pollForChanges — server response handling', () => {
  it('merges when server updated_at is strictly greater than local', async () => {
    const mergeServerWorkoutFn = vi.fn();
    const serverWorkout: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 5000,
      exercises: [],
    };

    await pollForChanges({
      getAutoSaveInProgress: () => false,
      getEditingWorkoutId: () => 'workout-123',
      getWorkout: async () => serverWorkout,
      getEditingWorkoutUpdatedAt: () => 4999, // server is newer
      mergeServerWorkoutFn,
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData: vi.fn(),
      renderHistory: vi.fn(),
      getActiveTabId: () => null,
    });

    expect(mergeServerWorkoutFn).toHaveBeenCalledWith(serverWorkout);
  });

  it('does NOT merge when server updated_at equals local', async () => {
    const mergeServerWorkoutFn = vi.fn();
    const serverWorkout: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 5000,
      exercises: [],
    };

    await pollForChanges({
      getAutoSaveInProgress: () => false,
      getEditingWorkoutId: () => 'workout-123',
      getWorkout: async () => serverWorkout,
      getEditingWorkoutUpdatedAt: () => 5000, // same → no merge
      mergeServerWorkoutFn,
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData: vi.fn(),
      renderHistory: vi.fn(),
      getActiveTabId: () => null,
    });

    expect(mergeServerWorkoutFn).not.toHaveBeenCalled();
  });

  it('does NOT merge when local editingWorkoutUpdatedAt is null', async () => {
    const mergeServerWorkoutFn = vi.fn();
    const serverWorkout: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 5000,
      exercises: [],
    };

    await pollForChanges({
      getAutoSaveInProgress: () => false,
      getEditingWorkoutId: () => 'workout-123',
      getWorkout: async () => serverWorkout,
      getEditingWorkoutUpdatedAt: () => null, // null → guard prevents merge
      mergeServerWorkoutFn,
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData: vi.fn(),
      renderHistory: vi.fn(),
      getActiveTabId: () => null,
    });

    expect(mergeServerWorkoutFn).not.toHaveBeenCalled();
  });

  // BUG: double-set of editingWorkoutUpdatedAt
  // mergeServerWorkout already sets it internally, then pollForChanges sets it again.
  it('BUG: setEditingWorkoutUpdatedAt is called twice per successful merge (double-set)', async () => {
    const setEditingWorkoutUpdatedAt = vi.fn();
    const serverWorkout: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 5000,
      exercises: [],
    };

    // mergeServerWorkoutFn that also calls setEditingWorkoutUpdatedAt (as real impl does)
    const mergeServerWorkoutFn = vi.fn().mockImplementation(() => {
      setEditingWorkoutUpdatedAt(serverWorkout.updated_at); // internal call in real mergeServerWorkout
    });

    await pollForChanges({
      getAutoSaveInProgress: () => false,
      getEditingWorkoutId: () => 'workout-123',
      getWorkout: async () => serverWorkout,
      getEditingWorkoutUpdatedAt: () => 1000,
      mergeServerWorkoutFn,
      setEditingWorkoutUpdatedAt, // also called by pollForChanges itself on line 35
      loadData: vi.fn(),
      renderHistory: vi.fn(),
      getActiveTabId: () => null,
    });

    // The setter is called twice: once inside mergeServerWorkout, once in sync.ts line 35.
    // This is redundant. Both calls pass the same value (serverWorkout.updated_at)
    // so it doesn't corrupt state in this version, but it is a code smell and
    // a latent TOCTOU if another poll ever fires between the two calls.
    expect(setEditingWorkoutUpdatedAt).toHaveBeenCalledTimes(2);
    expect(setEditingWorkoutUpdatedAt).toHaveBeenCalledWith(5000);
  });

  it('continues polling after network error (does not rethrow)', async () => {
    const loadData = vi.fn();

    // Should not throw
    await expect(pollForChanges({
      getAutoSaveInProgress: () => false,
      getEditingWorkoutId: () => 'workout-123',
      getWorkout: async () => { throw new Error('Network error'); },
      getEditingWorkoutUpdatedAt: () => 1000,
      mergeServerWorkoutFn: vi.fn(),
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData,
      renderHistory: vi.fn(),
      getActiveTabId: () => null,
    })).resolves.toBeUndefined();
  });

  it('continues polling after 401 error (expired token)', async () => {
    class ApiError extends Error {
      constructor(public status: number, message: string) { super(message); }
    }

    await expect(pollForChanges({
      getAutoSaveInProgress: () => false,
      getEditingWorkoutId: () => 'workout-123',
      getWorkout: async () => { throw new ApiError(401, 'Unauthorized'); },
      getEditingWorkoutUpdatedAt: () => 1000,
      mergeServerWorkoutFn: vi.fn(),
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData: vi.fn(),
      renderHistory: vi.fn(),
      getActiveTabId: () => null,
    })).resolves.toBeUndefined();
    // BUG: a 401 should stop polling or trigger re-auth,
    // but instead the error is silently swallowed and polling hammers the server every 10s.
  });
});

describe('pollForChanges — no active workout (history refresh path)', () => {
  it('calls loadData when editingWorkoutId is null', async () => {
    const loadData = vi.fn().mockResolvedValue(undefined);
    const renderHistory = vi.fn();

    await pollForChanges({
      getAutoSaveInProgress: () => false,
      getEditingWorkoutId: () => null,
      getWorkout: vi.fn(),
      getEditingWorkoutUpdatedAt: () => null,
      mergeServerWorkoutFn: vi.fn(),
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData,
      renderHistory,
      getActiveTabId: () => 'tab-workout', // not history tab
    });

    expect(loadData).toHaveBeenCalledOnce();
    expect(renderHistory).not.toHaveBeenCalled();
  });

  it('calls renderHistory only when history tab is active', async () => {
    const renderHistory = vi.fn();

    await pollForChanges({
      getAutoSaveInProgress: () => false,
      getEditingWorkoutId: () => null,
      getWorkout: vi.fn(),
      getEditingWorkoutUpdatedAt: () => null,
      mergeServerWorkoutFn: vi.fn(),
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData: vi.fn().mockResolvedValue(undefined),
      renderHistory,
      getActiveTabId: () => 'tab-history',
    });

    expect(renderHistory).toHaveBeenCalledOnce();
  });

  it('does NOT call renderHistory when on exercises tab', async () => {
    const renderHistory = vi.fn();

    await pollForChanges({
      getAutoSaveInProgress: () => false,
      getEditingWorkoutId: () => null,
      getWorkout: vi.fn(),
      getEditingWorkoutUpdatedAt: () => null,
      mergeServerWorkoutFn: vi.fn(),
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData: vi.fn().mockResolvedValue(undefined),
      renderHistory,
      getActiveTabId: () => 'tab-exercises',
    });

    expect(renderHistory).not.toHaveBeenCalled();
  });

  it('continues polling if loadData throws', async () => {
    const renderHistory = vi.fn();

    await expect(pollForChanges({
      getAutoSaveInProgress: () => false,
      getEditingWorkoutId: () => null,
      getWorkout: vi.fn(),
      getEditingWorkoutUpdatedAt: () => null,
      mergeServerWorkoutFn: vi.fn(),
      setEditingWorkoutUpdatedAt: vi.fn(),
      loadData: vi.fn().mockRejectedValue(new Error('Server down')),
      renderHistory,
      getActiveTabId: () => 'tab-history',
    })).resolves.toBeUndefined();

    // renderHistory should NOT be called when loadData throws
    expect(renderHistory).not.toHaveBeenCalled();
  });
});

describe('startSync / stopSync — interval management', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts polling on first call', () => {
    const { startSync, isRunning } = makeSyncController();
    const pollFn = vi.fn();

    startSync(pollFn, 10_000);

    expect(isRunning()).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(pollFn).toHaveBeenCalledOnce();
  });

  it('does NOT create a second interval on double startSync call', () => {
    const { startSync } = makeSyncController();
    const pollFn = vi.fn();

    startSync(pollFn, 10_000);
    startSync(pollFn, 10_000); // second call — guard should prevent second interval

    vi.advanceTimersByTime(10_000);
    expect(pollFn).toHaveBeenCalledOnce(); // NOT twice
  });

  it('stopSync clears the interval so polling stops', () => {
    const { startSync, stopSync, isRunning } = makeSyncController();
    const pollFn = vi.fn();

    startSync(pollFn, 10_000);
    stopSync();

    expect(isRunning()).toBe(false);
    vi.advanceTimersByTime(30_000);
    expect(pollFn).not.toHaveBeenCalled();
  });

  it('stopSync is idempotent (safe to call multiple times)', () => {
    const { startSync, stopSync, isRunning } = makeSyncController();
    const pollFn = vi.fn();

    startSync(pollFn, 10_000);
    stopSync();
    stopSync(); // second call — must not throw

    expect(isRunning()).toBe(false);
  });

  // BUG: stopSync is never called on logout, so the old polling interval
  // persists across logout/login cycles with stale auth state.
  it('BUG: after stopSync + restart, polling resumes correctly (verifies stopSync works)', () => {
    const { startSync, stopSync, isRunning } = makeSyncController();
    const pollFn = vi.fn();

    startSync(pollFn, 10_000);
    stopSync(); // simulate logout

    // After stop, isRunning is false; a new startSync should work
    expect(isRunning()).toBe(false);
    startSync(pollFn, 10_000); // simulate re-login

    vi.advanceTimersByTime(10_000);
    expect(pollFn).toHaveBeenCalledOnce();
  });

  // This test demonstrates the actual logout bug: if stopSync is never called
  // before the second startSync (the guard fires), the old stale interval is
  // still running and can't be stopped because pollTimer holds the old handle.
  it('BUG: without stopSync between sessions, old stale interval cannot be cleared', () => {
    // First "session" — fresh controller (simulates page-level module singleton)
    const ctrl = makeSyncController();
    const stalePollFn = vi.fn();
    const freshPollFn = vi.fn();

    ctrl.startSync(stalePollFn, 10_000); // first login: start polling

    // User logs out — but stopSync is NEVER called (the bug)
    // User logs back in — startSync is called again
    ctrl.startSync(freshPollFn, 10_000); // guard fires: "if (pollTimer) return" → no-op

    vi.advanceTimersByTime(10_000);

    // stalePollFn still fires (the old interval from first login)
    expect(stalePollFn).toHaveBeenCalledOnce();
    // freshPollFn never fires because the second startSync was rejected
    expect(freshPollFn).not.toHaveBeenCalled();
    // The old stale interval remains active, potentially with a logged-out auth state.
    // This is the bug: there is no way to replace the polling function after startSync.
  });
});

describe('sync-state — autoSaveInProgress flag', () => {
  it('flag starts false', () => {
    const s = makeSyncState();
    expect(s.get()).toBe(false);
  });

  it('flag can be set to true and back to false', () => {
    const s = makeSyncState();
    s.set(true);
    expect(s.get()).toBe(true);
    s.set(false);
    expect(s.get()).toBe(false);
  });
});

describe('mergeServerWorkout — edge cases', () => {
  it('handles server with empty exercises array', () => {
    const local = { exercises: [{ name: 'Bench Press', sets: [] }] };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 2000,
      exercises: [],
    };

    // Should not throw
    expect(() => mergeServerWorkout(local, server, () => {})).not.toThrow();
    // Local exercise is NOT removed (known bug: removals are ignored)
    expect(local.exercises).toHaveLength(1);
  });

  it('handles local with empty exercises array', () => {
    const local = { exercises: [] as WorkoutExercise[] };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 2000,
      exercises: [{ name: 'Row', sets: [{ weight: 60, reps: 12 }] }],
    };

    mergeServerWorkout(local, server, () => {});

    expect(local.exercises).toHaveLength(1);
    expect(local.exercises[0].name).toBe('Row');
  });

  it('handles exercises with matching names case-sensitively', () => {
    // "bench press" (lowercase) should NOT match "Bench Press" (title case)
    const local = { exercises: [{ name: 'bench press', sets: [], notes: undefined }] };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 2000,
      exercises: [{ name: 'Bench Press', sets: [], notes: 'Server note' }],
    };

    mergeServerWorkout(local, server, () => {});

    // 'bench press' !== 'Bench Press' → server exercise is added as new, not merged
    expect(local.exercises).toHaveLength(2);
    // local 'bench press' does NOT get server note (no name match)
    expect(local.exercises[0].notes).toBeUndefined();
  });

  it('does not apply server notes when server notes is empty string', () => {
    // server notes = '' is falsy; the merge condition is `if (serverEx.notes && !localEx.notes)`
    // '' is falsy, so this guard correctly skips it. Verify the guard is right.
    const local = { exercises: [{ name: 'Press', sets: [], notes: undefined }] };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 2000,
      exercises: [{ name: 'Press', sets: [], notes: '' }],
    };

    mergeServerWorkout(local, server, () => {});

    // Server notes = '' is falsy → merge guard skips it → local notes stays undefined
    expect(local.exercises[0].notes).toBeUndefined();
  });

  it('does NOT overwrite local notes even when server notes is a longer/richer note', () => {
    const local = { exercises: [{ name: 'Press', sets: [], notes: 'Short local note' }] };
    const server: Workout = {
      id: '1', user_id: 'u1', start_time: 1000, created_at: 1000, updated_at: 2000,
      exercises: [{ name: 'Press', sets: [], notes: 'Much longer and more detailed server note that should win' }],
    };

    mergeServerWorkout(local, server, () => {});

    // Local always wins if it has any notes — server changes are lost
    expect(local.exercises[0].notes).toBe('Short local note');
    // This is a design choice but worth noting: if the server has newer notes
    // and local has any notes, the server's notes are silently dropped.
  });
});
