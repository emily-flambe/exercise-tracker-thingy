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
    btn.classList.remove('text-[#E63B57]');
    btn.classList.add('text-[#8A7B72]');
  });
  $('nav-' + tabName).classList.remove('text-[#8A7B72]');
  $('nav-' + tabName).classList.add('text-[#E63B57]');

  if (onTabSwitchCallback) {
    onTabSwitchCallback(tabName);
  }
}

export function showWorkoutScreen(screenId: string): void {
  document.querySelectorAll('#tab-workout .screen').forEach(s => s.classList.remove('active'));
  $(screenId).classList.add('active');
}
