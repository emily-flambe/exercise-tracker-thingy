import * as api from './api';
import type { User } from './api';
import { state } from './state';
import { $, showToast } from './helpers';
import { loadData } from './data';
import { setupPullToRefresh } from './pull-to-refresh';
import { stopSync } from './sync';

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
  const mainApp = $('main-app');
  mainApp.classList.remove('hidden');
  mainApp.classList.add('auth-fade-in');
  if (currentUser) {
    $('settings-username').textContent = currentUser.username;
  }
  setupPullToRefresh(onRefresh);
}

export function showLoginForm(): void {
  isRegisterMode = false;
  $('auth-login-tab').classList.add('border-[#FF0000]', 'text-[#FF0000]');
  $('auth-login-tab').classList.remove('border-[#2A2A2A]', 'text-[#888888]');
  $('auth-register-tab').classList.remove('border-[#FF0000]', 'text-[#FF0000]');
  $('auth-register-tab').classList.add('border-[#2A2A2A]', 'text-[#888888]');
  $('auth-submit-btn').textContent = 'Login';
  ($('auth-password') as HTMLInputElement).autocomplete = 'current-password';
  hideAuthError();
}

export function showRegisterForm(): void {
  isRegisterMode = true;
  $('auth-register-tab').classList.add('border-[#FF0000]', 'text-[#FF0000]');
  $('auth-register-tab').classList.remove('border-[#2A2A2A]', 'text-[#888888]');
  $('auth-login-tab').classList.remove('border-[#FF0000]', 'text-[#FF0000]');
  $('auth-login-tab').classList.add('border-[#2A2A2A]', 'text-[#888888]');
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

const SPINNER_SVG = `<svg class="animate-spin h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.293l3-2.647z"></path></svg>`;

function setSubmitLoading(loading: boolean): void {
  const btn = $('auth-submit-btn') as HTMLButtonElement;
  if (loading) {
    btn.disabled = true;
    const label = isRegisterMode ? 'Creating Account...' : 'Logging in...';
    btn.innerHTML = `<span class="flex items-center justify-center gap-2">${SPINNER_SVG}${label}</span>`;
    btn.classList.add('opacity-60', 'cursor-not-allowed');
  } else {
    btn.disabled = false;
    btn.textContent = isRegisterMode ? 'Create Account' : 'Login';
    btn.classList.remove('opacity-60', 'cursor-not-allowed');
  }
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

    setSubmitLoading(true);
    hideAuthError();

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
      setSubmitLoading(false);
      if (error instanceof api.ApiError) {
        showAuthError(error.message);
      } else {
        showAuthError('An error occurred. Please try again.');
      }
    }
  };
}

export function logout(): void {
  stopSync();
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
