import * as api from './api';
import { state } from './state';
import { $, showToast } from './helpers';
import { loadData } from './data';
import { switchTab, onTabSwitch, showWorkoutScreen } from './nav';
import { startRestTimer, pauseRestTimer, stopRestTimer } from './rest-timer';
import { showPRHistory, hidePRHistory } from './pr-calc';
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
  renderWorkout, scheduleAutoSave, editWorkout, resetWorkoutState,
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
} from './history';
import {
  renderExerciseCategories, toggleExerciseTabSort, toggleCategory, filterExercises,
  showCreateExercise, showEditExercise, hideEditExercise,
  saveExercise, deleteExercise, setExerciseUnit,
} from './exercises-tab';

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

// ==================== REFRESH HANDLER ====================
async function handleRefresh(): Promise<void> {
  try {
    await loadData();
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab?.id === 'tab-history') {
      renderHistory();
    } else if (activeTab?.id === 'tab-exercises') {
      renderExerciseCategories();
    } else if (activeTab?.id === 'tab-workout' && state.currentWorkout) {
      renderWorkout();
    }
    showToast('Refreshed');
  } catch (error) {
    console.error('Failed to refresh:', error);
    showToast('Refresh failed');
  }
}

// ==================== TAB SWITCH WIRING ====================
onTabSwitch((tabName: string) => {
  if (tabName === 'history') renderHistory();
  if (tabName === 'exercises') renderExerciseCategories();
});

// ==================== INIT ====================
async function init(): Promise<void> {
  $('app-version').textContent = `v${__APP_VERSION__}`;

  $('auth-form').addEventListener('submit', createAuthSubmitHandler(() => {
    showMainApp(handleRefresh);
  }));

  if (api.isAuthenticated()) {
    try {
      const user = await api.getCurrentUser();
      setCurrentUser(user);
      await loadData();
      showMainApp(handleRefresh);
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
  toggleExerciseTabSort,
  toggleCategory,
  filterExercises,
  showCreateExercise,
  showEditExercise,
  hideEditExercise,
  saveExercise,
  deleteExercise,
  setExerciseUnit,
  clearAllData,
  showLoginForm,
  showRegisterForm,
  logout,
  // Rest Timer
  startRestTimer,
  pauseRestTimer,
  stopRestTimer,
};

init();
