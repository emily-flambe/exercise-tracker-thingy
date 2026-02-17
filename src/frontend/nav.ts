import { $ } from './helpers';

type TabSwitchCallback = (tabName: string) => void;

let onTabSwitchCallback: TabSwitchCallback | null = null;

export function onTabSwitch(callback: TabSwitchCallback): void {
  onTabSwitchCallback = callback;
}

export function switchTab(tabName: string): void {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  $('tab-' + tabName).classList.add('active');
  document.querySelectorAll('nav button').forEach(btn => {
    btn.classList.remove('text-blue-400');
    btn.classList.add('text-gray-400');
  });
  $('nav-' + tabName).classList.remove('text-gray-400');
  $('nav-' + tabName).classList.add('text-blue-400');

  if (onTabSwitchCallback) {
    onTabSwitchCallback(tabName);
  }
}

export function showWorkoutScreen(screenId: string): void {
  document.querySelectorAll('#tab-workout .screen').forEach(s => s.classList.remove('active'));
  $(screenId).classList.add('active');
}
