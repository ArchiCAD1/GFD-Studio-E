/** What's new: which version this computer has seen (localStorage). Kept apart from the release list itself
 * (model/whatsNew, a long text that grows with every release) so the app can ask at start whether there is
 * anything to show without loading that list. */
export const SEEN_KEY = 'gfde.whatsNewSeen';

/** Whether the release list has to be read at start: not when this version was already seen (nothing is newer). */
export function mayHaveUnseen(current: string): boolean {
  try { return localStorage.getItem(SEEN_KEY) !== current; } catch { return false; }
}

export function markSeen(current: string): void {
  try { localStorage.setItem(SEEN_KEY, current); } catch { /* storage refused: shown again next time */ }
}
