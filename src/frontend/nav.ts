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
    btn.classList.remove('text-warm-primary');
    btn.classList.add('text-warm-text-secondary');
  });
  $('nav-' + tabName).classList.remove('text-warm-text-secondary');
  $('nav-' + tabName).classList.add('text-warm-primary');

  if (onTabSwitchCallback) {
    onTabSwitchCallback(tabName);
  }
}

export function showWorkoutScreen(screenId: string): void {
  document.querySelectorAll('#tab-workout .screen').forEach(s => s.classList.remove('active'));
  $(screenId).classList.add('active');
}
