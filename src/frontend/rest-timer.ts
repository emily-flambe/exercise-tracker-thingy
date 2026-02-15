import { $ } from './helpers';

// ==================== REST TIMER STATE ====================
let restTimerStartTime: number | null = null;
let restTimerAccumulated = 0;
let restTimerRunning = false;
let restTimerIntervalId: ReturnType<typeof setInterval> | null = null;

function formatTimerDisplay(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getRestTimerSeconds(): number {
  if (restTimerRunning && restTimerStartTime !== null) {
    return restTimerAccumulated + Math.floor((Date.now() - restTimerStartTime) / 1000);
  }
  return restTimerAccumulated;
}

function updateTimerDisplay(): void {
  const display = $('rest-timer-display');
  if (display) {
    display.textContent = formatTimerDisplay(getRestTimerSeconds());
  }
}

function updateTimerButtons(): void {
  const playBtn = $('rest-timer-play-btn');
  const pauseBtn = $('rest-timer-pause-btn');
  const stopBtn = $('rest-timer-stop-btn');

  if (!playBtn || !pauseBtn || !stopBtn) return;

  if (restTimerRunning) {
    playBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
  } else if (getRestTimerSeconds() > 0) {
    playBtn.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
  } else {
    playBtn.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
    stopBtn.classList.add('hidden');
  }
}

export function startRestTimer(): void {
  if (restTimerRunning) return;

  restTimerRunning = true;
  restTimerStartTime = Date.now();
  restTimerIntervalId = setInterval(() => {
    updateTimerDisplay();
  }, 1000);
  updateTimerDisplay();
  updateTimerButtons();
}

export function pauseRestTimer(): void {
  if (!restTimerRunning) return;

  restTimerAccumulated = getRestTimerSeconds();
  restTimerStartTime = null;
  restTimerRunning = false;
  if (restTimerIntervalId) {
    clearInterval(restTimerIntervalId);
    restTimerIntervalId = null;
  }
  updateTimerButtons();
}

export function stopRestTimer(): void {
  if (restTimerRunning) {
    restTimerRunning = false;
    if (restTimerIntervalId) {
      clearInterval(restTimerIntervalId);
      restTimerIntervalId = null;
    }
  }
  restTimerStartTime = null;
  restTimerAccumulated = 0;
  updateTimerDisplay();
  updateTimerButtons();
}
