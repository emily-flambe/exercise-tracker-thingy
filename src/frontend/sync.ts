import * as api from './api';
import { state } from './state';
import { loadData } from './data';
import { mergeServerWorkout, getEditingWorkoutUpdatedAt } from './workout';
import { autoSaveInProgress } from './sync-state';
import { renderHistory } from './history';

// ==================== SYNC / POLLING ====================
const POLL_INTERVAL_MS = 10_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startSync(): void {
  if (pollTimer) return;
  pollTimer = setInterval(pollForChanges, POLL_INTERVAL_MS);
  // Pause polling when the tab/app is hidden to avoid unnecessary requests
  document.addEventListener('visibilitychange', onVisibilityChange);
}

export function stopSync(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

function onVisibilityChange(): void {
  if (document.hidden) {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      // Keep listener registered so we can restart on visibility restore
    }
  } else {
    // Tab became visible again — resume polling
    if (!pollTimer) {
      pollTimer = setInterval(pollForChanges, POLL_INTERVAL_MS);
      // Fire immediately on resume so user sees fresh data without waiting 10s
      pollForChanges();
    }
  }
}

async function pollForChanges(): Promise<void> {
  if (autoSaveInProgress) return;

  if (state.editingWorkoutId) {
    try {
      const editingId = state.editingWorkoutId;
      const serverWorkout = await api.getWorkout(editingId);
      // Re-check flag after await: auto-save may have started while request was in flight
      if (autoSaveInProgress) return;
      // Re-check that we're still editing the same workout
      if (state.editingWorkoutId !== editingId) return;
      const currentUpdatedAt = getEditingWorkoutUpdatedAt();
      if (currentUpdatedAt !== null && serverWorkout.updated_at > currentUpdatedAt) {
        console.log('Sync: external change detected, merging server workout');
        mergeServerWorkout(serverWorkout);
      }
    } catch (error) {
      console.error('Sync: failed to poll active workout:', error);
    }
  } else {
    try {
      await loadData();
      const activeTab = document.querySelector('.tab-content.active');
      if (activeTab?.id === 'tab-history') {
        renderHistory();
      }
    } catch (error) {
      console.error('Sync: failed to refresh history:', error);
    }
  }
}
