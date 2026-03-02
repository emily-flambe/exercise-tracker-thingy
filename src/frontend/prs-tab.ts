import { state, mainCategories } from './state';
import { $, formatDate, getExerciseUnit } from './helpers';

interface BestPR {
  name: string;
  weight: number;
  reps: number;
  achieved_at: number;
  unit: string;
}

function computeBestPRs(): BestPR[] {
  const exerciseNames = [...new Set(state.allPRs.map(pr => pr.exercise_name))];
  return exerciseNames.map(name => {
    const prs = state.allPRs.filter(pr => pr.exercise_name === name);
    // Best = highest weight; tie-break by most reps, then most recent
    const best = prs.reduce((best, pr) => {
      if (pr.weight > best.weight) return pr;
      if (pr.weight === best.weight && pr.reps > best.reps) return pr;
      if (pr.weight === best.weight && pr.reps === best.reps && pr.achieved_at > best.achieved_at) return pr;
      return best;
    });
    return { name, weight: best.weight, reps: best.reps, achieved_at: best.achieved_at, unit: getExerciseUnit(name) };
  });
}

function groupByCategory(bestPRs: BestPR[]): Array<{ category: string; prs: BestPR[] }> {
  const exerciseCategory = new Map<string, string>();
  for (const ex of state.customExercises) {
    exerciseCategory.set(ex.name, ex.category);
  }

  const groups: Array<{ category: string; prs: BestPR[] }> = [];
  const placed = new Set<string>();

  for (const main of mainCategories) {
    const inGroup = bestPRs.filter(pr => {
      const cat = exerciseCategory.get(pr.name);
      return cat && main.subCategories.includes(cat);
    });
    if (inGroup.length > 0) {
      inGroup.sort((a, b) => a.name.localeCompare(b.name));
      groups.push({ category: main.name, prs: inGroup });
      inGroup.forEach(pr => placed.add(pr.name));
    }
  }

  // Exercises not matched to any category (built-in or unknown)
  const unplaced = bestPRs.filter(pr => !placed.has(pr.name));
  if (unplaced.length > 0) {
    unplaced.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ category: 'Other', prs: unplaced });
  }

  return groups;
}

function renderPRCard(pr: BestPR): string {
  const safeExerciseName = pr.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const date = formatDate(pr.achieved_at);
  return `
    <button
      onclick="app.showPRHistory('${safeExerciseName}')"
      class="w-full bg-swiss-card border border-swiss-border rounded-sm p-3 text-left hover:border-swiss-text-secondary transition-colors"
    >
      <div class="flex justify-between items-center">
        <span class="font-medium text-sm">${pr.name}</span>
        <span class="text-swiss-text-secondary text-xs">&#9654;</span>
      </div>
      <div class="flex items-baseline gap-3 mt-1">
        <span class="text-white font-bold font-mono">${pr.weight} ${pr.unit} &times; ${pr.reps}</span>
        <span class="text-swiss-text-secondary text-xs">${date}</span>
      </div>
    </button>
  `;
}

export function renderPRsTab(): void {
  const container = $('prs-content');
  if (!container) return;

  const bestPRs = computeBestPRs();

  if (bestPRs.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 text-center px-4">
        <div class="text-4xl mb-4 text-swiss-text-secondary">&#9733;</div>
        <p class="text-swiss-text-secondary">No personal records yet.</p>
        <p class="text-sm text-swiss-text-secondary mt-2">Complete sets during workouts to start tracking PRs.</p>
      </div>
    `;
    return;
  }

  const groups = groupByCategory(bestPRs);

  container.innerHTML = groups.map(group => `
    <div class="mb-6">
      <div class="text-xs font-bold uppercase tracking-wider text-swiss-text-secondary mb-2">${group.category}</div>
      <div class="space-y-2">
        ${group.prs.map(renderPRCard).join('')}
      </div>
    </div>
  `).join('');
}
