// Shared flag used by workout.ts (writer) and sync.ts (reader)
// to prevent polling during an active auto-save.
export let autoSaveInProgress = false;

export function setAutoSaveInProgress(val: boolean): void {
  autoSaveInProgress = val;
}
