import * as api from './api';
import type { User } from './api';
import { state } from './state';
import { $, showToast } from './helpers';
import { loadData } from './data';
import { setupPullToRefresh } from './pull-to-refresh';

let currentUser: User | null = null;
let isRegisterMode = false;

export function getCurrentUser(): User | null {
  return currentUser;
}

export function setCurrentUser(user: User | null): void {
  currentUser = user;
}

export function showAuthScreen(): void {
  $('loading-screen').classList.add('hidden');
  $('auth-screen').classList.remove('hidden');
  $('main-app').classList.add('hidden');
}

export function showMainApp(onRefresh: () => Promise<void>): void {
  $('loading-screen').classList.add('hidden');
  $('auth-screen').classList.add('hidden');
  $('main-app').classList.remove('hidden');
  if (currentUser) {
    $('settings-username').textContent = currentUser.username;
  }
  setupPullToRefresh(onRefresh);
}

export function showLoginForm(): void {
  isRegisterMode = false;
  $('auth-login-tab').classList.add('border-blue-500', 'text-blue-400');
  $('auth-login-tab').classList.remove('border-gray-700', 'text-gray-400');
  $('auth-register-tab').classList.remove('border-blue-500', 'text-blue-400');
  $('auth-register-tab').classList.add('border-gray-700', 'text-gray-400');
  $('auth-submit-btn').textContent = 'Login';
  ($('auth-password') as HTMLInputElement).autocomplete = 'current-password';
  hideAuthError();
}

export function showRegisterForm(): void {
  isRegisterMode = true;
  $('auth-register-tab').classList.add('border-blue-500', 'text-blue-400');
  $('auth-register-tab').classList.remove('border-gray-700', 'text-gray-400');
  $('auth-login-tab').classList.remove('border-blue-500', 'text-blue-400');
  $('auth-login-tab').classList.add('border-gray-700', 'text-gray-400');
  $('auth-submit-btn').textContent = 'Create Account';
  ($('auth-password') as HTMLInputElement).autocomplete = 'new-password';
  hideAuthError();
}

function showAuthError(message: string): void {
  const errorEl = $('auth-error');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideAuthError(): void {
  $('auth-error').classList.add('hidden');
}

export function createAuthSubmitHandler(onLoginSuccess: () => void): (e: Event) => Promise<void> {
  return async (e: Event): Promise<void> => {
    e.preventDefault();
    const username = ($('auth-username') as HTMLInputElement).value.trim();
    const password = ($('auth-password') as HTMLInputElement).value;

    if (!username || !password) {
      showAuthError('Please enter username and password');
      return;
    }

    try {
      if (isRegisterMode) {
        const response = await api.register(username, password);
        currentUser = response.user;
      } else {
        const response = await api.login(username, password);
        currentUser = response.user;
      }
      await loadData();
      onLoginSuccess();
    } catch (error) {
      if (error instanceof api.ApiError) {
        showAuthError(error.message);
      } else {
        showAuthError('An error occurred. Please try again.');
      }
    }
  };
}

export function logout(): void {
  api.logout();
  currentUser = null;
  state.history = [];
  state.customExercises = [];
  state.currentWorkout = null;
  state.editingWorkoutId = null;
  ($('auth-username') as HTMLInputElement).value = '';
  ($('auth-password') as HTMLInputElement).value = '';
  showLoginForm();
  showAuthScreen();
}
