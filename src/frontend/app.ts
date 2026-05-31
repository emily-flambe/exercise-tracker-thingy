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
  editWorkout, editWorkoutDate, resetWorkoutState,
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

// ==================== REFRESH HANDLER ====================
// Refresh is "show me the server's truth" — it nukes local UI state and the
// offline cache, then reloads from the network. This is the same recovery as
// logout/login but without dropping auth, so users don't have to re-enter
// credentials to escape a stale in-memory editing session (e.g. an SPA left
// open across days that's still pointing at yesterday's editingWorkoutId).
async function handleRefresh(): Promise<void> {
  try {
    // Flush any pending offline writes first so they're not lost when we
    // clear the cache and re-read from server.
    try { await flushNow(); } catch (err) { console.warn('Flush before refresh failed:', err); }

    state.currentWorkout = null;
    state.editingWorkoutId = null;
    resetWorkoutState();
    try { await cacheClear(); } catch (err) { console.warn('cacheClear failed:', err); }

    await loadData();

    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab?.id === 'tab-workout') {
      showWorkoutScreen('workout-empty');
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
    // itself without an import cycle into the render modules).
    void loadData().then(renderActiveTab);
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
        // Background refresh + auth validation. Failure kicks user back to auth.
        // Re-render the active tab after loadData so a user viewing History
        // sees freshly-fetched workouts replace the cached snapshot, not the
        // other way around.
        void (async () => {
          try {
            const user = await api.getCurrentUser();
            setCurrentUser(user);
            await loadData();
            renderActiveTab();
          } catch {
            api.logout();
            stopSync();
            showAuthScreen();
          }
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
      await loadData();
      showMainApp(handleRefresh);
      startSyncPolling();
      startSyncEngine();
    } catch {
      api.logout();
      showAuthScreen();
    }
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
