import { $ } from './helpers';

let pullStartY = 0;
let isPulling = false;
let isRefreshing = false;
const PULL_THRESHOLD = 80;

export function setupPullToRefresh(refreshCallback: () => Promise<void>): void {
  const mainApp = $('main-app');

  async function handleRefresh(): Promise<void> {
    if (isRefreshing) return;

    isRefreshing = true;
    const pullIndicator = $('pull-to-refresh');
    pullIndicator.classList.add('refreshing');
    pullIndicator.classList.remove('pulling');

    try {
      await refreshCallback();
    } finally {
      isRefreshing = false;
      pullIndicator.classList.remove('refreshing');
    }
  }

  mainApp.addEventListener('touchstart', (e: TouchEvent) => {
    if (window.scrollY <= 0 && !isRefreshing) {
      pullStartY = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });

  mainApp.addEventListener('touchmove', (e: TouchEvent) => {
    if (!isPulling || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const pullDistance = currentY - pullStartY;
    const pullIndicator = $('pull-to-refresh');

    if (pullDistance > 0 && window.scrollY <= 0) {
      const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
      const translateY = Math.min(pullDistance * 0.5, 50) - 60;

      pullIndicator.style.transform = `translateX(-50%) translateY(${translateY}px)`;
      pullIndicator.style.opacity = String(progress);
      pullIndicator.classList.add('pulling');

      const spinner = pullIndicator.querySelector('.pull-spinner') as HTMLElement;
      if (spinner) {
        spinner.style.transform = `rotate(${pullDistance * 2}deg)`;
      }
    }
  }, { passive: true });

  mainApp.addEventListener('touchend', () => {
    if (!isPulling || isRefreshing) return;

    const pullIndicator = $('pull-to-refresh');
    const currentTransform = pullIndicator.style.transform;
    const match = currentTransform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
    const currentY = match ? parseFloat(match[1]) : -60;

    if (currentY > -10) {
      handleRefresh();
    } else {
      pullIndicator.classList.remove('pulling');
      pullIndicator.style.transform = '';
      pullIndicator.style.opacity = '';
      const spinner = pullIndicator.querySelector('.pull-spinner') as HTMLElement;
      if (spinner) {
        spinner.style.transform = '';
      }
    }

    isPulling = false;
  }, { passive: true });
}
