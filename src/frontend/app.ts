import * as api from './api';
import { state } from './state';
import { $, showToast } from './helpers';
import { loadData, hydrateFromCache } from './data';
import { startSync, stopSync, flushNow, type SyncStatus } from './offline/sync';
import { sendMutation } from './offline/client';
import { cacheClear } from './offline/db';
import { decodeJwtUnverified, isJwtExpired } from './offline/jwt';
import { switchTab, onTabSwitch, showWorkoutScreen } from './nav';
import { startRestTimer, pauseRestTimer, stopRestTimer } from './rest-timer';
import { showPRHistory, hidePRHistory, switchPRTab } from './pr-calc';
import { showLoginForm, showRegisterForm, showAuthScreen, showMainApp, createAuthSubmitHandler, logout, getCurrentUser, setCurrentUser } from './auth';
import {
  startWorkout,
  showDeleteCurrentWorkoutConfirm, cancelDeleteCurrentWorkout, confirmDeleteCurrentWorkout,
  showCategorySelection, showEditCategories, saveEditedCategories, cancelEditCategories,
  toggleTargetCategory, startWorkoutWithCategories, skipCategorySelection,
  removeExercise, moveExerciseUp, moveExerciseDown, toggleExerciseCompleted,
  toggleSetCompleted, toggleSetMissed, toggleNoteField,
  showAddSetForm, hideAddSetForm, saveSetInline, updateSet, deleteSet,
  showExerciseNotes, hideExerciseNotes, saveExerciseNotes,
  editWorkout, editWorkoutDate, resetWorkoutState, refreshCurrentWorkout,
  startSyncPolling, stopSyncPolling,
  editExerciseSetting, addExerciseSetting,
  handleWorkoutSynced, handleSyncConflict,
  resolveConflictKeepMine, resolveConflictLoadTheirs,
} from './workout';
import {
  showAddExercise, hideAddExercise, toggleAddExerciseSort, toggleAddExerciseCategory,
  filterAddExerciseSearch, addExerciseToWorkout,
  showCreateExerciseFromWorkout, cancelCreateExerciseFromWorkout,
  setWorkoutExerciseUnit, saveExerciseFromWorkout,
} from './add-exercise';
import {
  renderHistory, changeCalendarMonth, goToToday, showDayWorkouts,
  showDeleteWorkoutConfirm, cancelDeleteWorkout, confirmDeleteWorkout,
  toggleCalendarFilter,
  filterHistoryExercise, setHistoryDateFrom, setHistoryDateTo, clearHistoryFilters,
} from './history';
import {
  renderExerciseCategories, toggleExerciseTabSort, toggleCategory, filterExercises,
  showCreateExercise, showEditExercise, hideEditExercise,
  saveExercise, deleteExercise, setExerciseUnit,
  editExerciseSettingFromTab, addExerciseSettingFromTab, deleteExerciseSettingFromTab,
} from './exercises-tab';
import { renderPRsTab } from './prs-tab';

// Injected by Vite at build time
declare const __APP_VERSION__: string;

// ==================== SETTINGS ====================
async function clearAllData(): Promise<void> {
  if (confirm('This will delete all workout history. Are you sure?')) {
    try {
      await api.clearAllData();
      await loadData();
      state.currentWorkout = null;
      state.editingWorkoutId = null;
      resetWorkoutState();
      showWorkoutScreen('workout-empty');
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert('Failed to clear data');
    }
  }
}

// ==================== SYNC INDICATOR ====================
function updateSyncIndicator(status: SyncStatus): void {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  el.classList.remove('hidden', 'sync-pending', 'sync-syncing', 'sync-error', 'sync-offline');
  if (!online) {
    el.classList.add('sync-offline');
    el.setAttribute('title', `Offline${status.pending ? ` (${status.pending} pending)` : ''}`);
    return;
  }
  if (status.syncing) {
    el.classList.add('sync-syncing');
    el.setAttribute('title', 'Syncing...');
    return;
  }
  if (status.lastError) {
    el.classList.add('sync-error');
    el.setAttribute('title', `Sync error: ${status.lastError}`);
    return;
  }
  if (status.pending > 0) {
    el.classList.add('sync-pending');
    el.setAttribute('title', `${status.pending} pending`);
    return;
  }
  el.classList.add('hidden');
}

function startSyncEngine(): void {
  startSync({
    send: sendMutation,
    toast: showToast,
    onStatusChange: updateSyncIndicator,
    onWorkoutSynced: handleWorkoutSynced,
    onConflict: handleSyncConflict,
  });
}

// ==================== LOGOUT ====================
async function handleLogout(): Promise<void> {
  stopSyncPolling();
  stopSync();
  await logout();
}

// Re-render whichever data-driven tab is currently visible. Called after
// background loadData() resolves so the UI reflects freshly-fetched state —
// without this, History/Exercises/PRs that rendered with empty state.history
// during the load would stay stuck on an empty calendar forever.
function renderActiveTab(): void {
  const activeTab = document.querySelector('.tab-content.active');
  if (activeTab?.id === 'tab-history') renderHistory();
  else if (activeTab?.id === 'tab-exercises') renderExerciseCategories();
  else if (activeTab?.id === 'tab-prs') renderPRsTab();
  // The workout tab is driven by in-progress edit state, not state.history —
  // no re-render needed when background data lands.
}

// ==================== DATA LOAD ====================
// Load fresh data and re-render the active tab. On failure (e.g. a slow-network
// fetch aborted by its timeout) we DON'T nag with a sticky banner — we just
// re-render with whatever state we have so cached data stays on screen, and show
// a brief auto-dismissing toast only when there's genuinely nothing to show.
// This is auth-agnostic: a data-load failure must NOT log the user out — auth is
// validated separately via getCurrentUser().
async function loadDataAndRender(): Promise<void> {
  try {
    await loadData();
    renderActiveTab();
  } catch (error) {
    console.error('Failed to load data:', error);
    // Keep showing whatever we already have (cache / prior load).
    renderActiveTab();
    // Only surface a message if we have nothing at all — otherwise the cached
    // data on screen is fine and a toast would just be noise.
    if (state.history.length === 0) {
      showToast('Couldn\'t load — check connection');
    }
  }
}

// ==================== REFRESH HANDLER ====================
// Refresh pulls the server's truth — flush pending writes, clear the cache, and
// reload from the network — while keeping you on the current view. If you're
// editing a workout, that workout is re-fetched and re-rendered in place (so the
// coach agent's changes show up) instead of dumping you back to the empty screen.
async function handleRefresh(): Promise<void> {
  try {
    // Flush any pending offline writes first so they're not lost when we
    // clear the cache and re-read from server.
    try { await flushNow(); } catch (err) { console.warn('Flush before refresh failed:', err); }

    // Remember what we're looking at so we can restore it after reloading.
    const editingId = state.editingWorkoutId;

    try { await cacheClear(); } catch (err) { console.warn('cacheClear failed:', err); }

    await loadData();

    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab?.id === 'tab-workout') {
      if (editingId) {
        // Stay on the workout being edited; re-fetch it from the server.
        // refreshCurrentWorkout handles the deleted-server-side case itself
        // (cleans up and shows the empty screen).
        await refreshCurrentWorkout();
      }
      // Nothing being edited (e.g. an in-progress new workout or the empty
      // screen) — leave the current workout screen untouched.
    } else {
      renderActiveTab();
    }
    showToast('Refreshed');
  } catch (error) {
    console.error('Failed to refresh:', error);
    showToast('Refresh failed');
  }
}

async function refresh(): Promise<void> {
  const btns = document.querySelectorAll('.refresh-icon');
  if (btns[0]?.classList.contains('refreshing')) return;
  btns.forEach(btn => btn.classList.add('refreshing'));
  try {
    await handleRefresh();
  } finally {
    // try/finally so a thrown error inside handleRefresh can't leave the
    // spinner pinned and block further refresh attempts.
    btns.forEach(btn => btn.classList.remove('refreshing'));
  }
}

// ==================== TAB SWITCH WIRING ====================
onTabSwitch((tabName: string) => {
  if (tabName === 'history') renderHistory();
  if (tabName === 'exercises') renderExerciseCategories();
  if (tabName === 'prs') renderPRsTab();
});

// ==================== INIT ====================
async function init(): Promise<void> {
  $('app-version').textContent = `v${__APP_VERSION__}`;

  $('auth-form').addEventListener('submit', createAuthSubmitHandler(() => {
    showMainApp(handleRefresh);
    startSyncPolling();
    startSyncEngine();
    // Background data load: must re-render the active tab when it resolves,
    // otherwise a user who clicks History/Exercises/PRs before loadData
    // finishes sees an empty view that never updates (auth.ts can't do this
    // itself without an import cycle into the render modules). A failed load
    // surfaces a retry banner rather than leaving an empty view forever.
    void loadDataAndRender();
  }));

  if (api.isAuthenticated()) {
    // Cache-first startup: hydrate from IndexedDB before any network call so the
    // UI is usable offline or on slow connections.
    const hydrated = await hydrateFromCache();
    const token = api.getToken();
    const payload = token ? decodeJwtUnverified(token) : null;
    const expired = isJwtExpired(payload);
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;

    if (expired) {
      api.logout();
      showAuthScreen();
      return;
    }

    if (hydrated && payload) {
      // Optimistically show the app from cache; validate with /me in the background.
      setCurrentUser({
        id: (payload.sub || payload.userId || '') as string,
        username: (payload.username || '') as string,
        created_at: 0,
      });
      showMainApp(handleRefresh);
      startSyncPolling();
      startSyncEngine();
      if (online) {
        // Background auth validation + data refresh. These are handled
        // SEPARATELY: only an auth failure (invalid/expired token) should kick
        // the user back to the login screen. A data-load failure (e.g. a slow
        // network aborting the big /workouts fetch) must keep the user in the
        // app on cached data and surface a retry banner — logging them out over
        // a transient network blip would be a far worse experience.
        void (async () => {
          try {
            const user = await api.getCurrentUser();
            setCurrentUser(user);
          } catch {
            api.logout();
            stopSync();
            showAuthScreen();
            return;
          }
          // Auth is valid — refresh data, surfacing failures without logout.
          await loadDataAndRender();
        })();
      }
      return;
    }

    // No cache — must contact the server.
    if (!online) {
      // Offline with no cache: can't validate. Show auth screen.
      showAuthScreen();
      return;
    }
    try {
      const user = await api.getCurrentUser();
      setCurrentUser(user);
    } catch {
      // Auth validation failed — token is bad. Back to login.
      api.logout();
      showAuthScreen();
      return;
    }
    // Auth is valid: enter the app, then load data. A data-load failure here
    // shows the app (empty) with a retry banner rather than bouncing a
    // legitimately-logged-in user back to the auth screen.
    showMainApp(handleRefresh);
    startSyncPolling();
    startSyncEngine();
    await loadDataAndRender();
  } else {
    showAuthScreen();
  }
}

// Export app object to window for onclick handlers
(window as unknown as Record<string, unknown>).app = {
  startWorkout,
  editWorkoutDate,
  showDeleteCurrentWorkoutConfirm,
  cancelDeleteCurrentWorkout,
  confirmDeleteCurrentWorkout,
  showCategorySelection,
  showEditCategories,
  saveEditedCategories,
  cancelEditCategories,
  toggleTargetCategory,
  startWorkoutWithCategories,
  skipCategorySelection,
  showAddExercise,
  hideAddExercise,
  toggleAddExerciseSort,
  toggleAddExerciseCategory,
  filterAddExerciseSearch,
  addExerciseToWorkout,
  showCreateExerciseFromWorkout,
  cancelCreateExerciseFromWorkout,
  setWorkoutExerciseUnit,
  saveExerciseFromWorkout,
  showAddSetForm,
  hideAddSetForm,
  saveSetInline,
  updateSet,
  deleteSet,
  removeExercise,
  moveExerciseUp,
  moveExerciseDown,
  toggleExerciseCompleted,
  showPRHistory,
  hidePRHistory,
  switchPRTab,
  showExerciseNotes,
  hideExerciseNotes,
  saveExerciseNotes,
  toggleSetCompleted,
  toggleSetMissed,
  toggleNoteField,
  switchTab,
  editWorkout,
  showDeleteWorkoutConfirm,
  cancelDeleteWorkout,
  confirmDeleteWorkout,
  changeCalendarMonth,
  goToToday,
  showDayWorkouts,
  renderHistory,
  toggleCalendarFilter,
  filterHistoryExercise,
  setHistoryDateFrom,
  setHistoryDateTo,
  clearHistoryFilters,
  toggleExerciseTabSort,
  toggleCategory,
  filterExercises,
  showCreateExercise,
  showEditExercise,
  hideEditExercise,
  saveExercise,
  deleteExercise,
  setExerciseUnit,
  editExerciseSetting,
  addExerciseSetting,
  editExerciseSettingFromTab,
  addExerciseSettingFromTab,
  deleteExerciseSettingFromTab,
  clearAllData,
  showLoginForm,
  showRegisterForm,
  logout: handleLogout,
  // Rest Timer
  startRestTimer,
  pauseRestTimer,
  stopRestTimer,
  // Refresh
  refresh,
  // Conflict prompt
  resolveConflictKeepMine,
  resolveConflictLoadTheirs,
};

init();
