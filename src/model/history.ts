import { useCallback, useState } from 'react';

/** Undo / redo for a value that is only ever replaced (never mutated), such
 * as the project. Changes within `mergeMs` of each other are one step, so a
 * burst of edits (typing, a paste) undoes together. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** When the last step was recorded (ms); edits closer than mergeMs join it. */
  at: number;
  /** The name of each step, beside `past` (the step that left past[i]) and `future` (the step that leaves present for
   * future[0] is futureLabels[0]); none where the step was not named. */
  pastLabels: (string | undefined)[];
  futureLabels: (string | undefined)[];
}

export const MAX_STEPS = 100;

/** A step's `label` names it for Undo / Redo ("Move"); a step merged into the one before keeps the newer label, or
 * the older one when the newer has none. */
export function record<T>(h: History<T>, next: T, now: number, mergeMs = 600, label?: string): History<T> {
  if (next === h.present) return h;
  const merge = h.past.length > 0 && now - h.at < mergeMs;
  const past = merge ? h.past : [...h.past, h.present].slice(-MAX_STEPS);
  const pastLabels = merge ? [...h.pastLabels.slice(0, -1), label ?? h.pastLabels[h.pastLabels.length - 1]] : [...h.pastLabels, label].slice(-MAX_STEPS);
  return { past, present: next, future: [], at: now, pastLabels, futureLabels: [] };
}

/** The name of a CAD step from its message: the command word ("MOVE  3 objects moved · ⌘Z to undo" is "Move"), else the
 * text before the first " · " ("Cable tray 300 mm · ⌘Z to undo"); at most 28 characters. */
export function stepLabel(message: string): string | undefined {
  const word = /^([A-Z][A-Z0-9_]*) {2}/.exec(message);
  const text = word ? word[1][0] + word[1].slice(1).toLowerCase() : message.split(' · ')[0].trim();
  if (!text) return undefined;
  return text.length > 28 ? `${text.slice(0, 27).trimEnd()}…` : text;
}

/** Replaces the value without an undo step (e.g. opening a project). */
export const reset = <T,>(value: T): History<T> => ({ past: [], present: value, future: [], at: 0, pastLabels: [], futureLabels: [] });

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], at: 0, pastLabels: h.pastLabels.slice(0, -1), futureLabels: [h.pastLabels[h.past.length - 1], ...h.futureLabels] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), at: 0, pastLabels: [...h.pastLabels, h.futureLabels[0]], futureLabels: h.futureLabels.slice(1) };
}

/** useState with undo / redo. set() takes a value or an updater, like
 * useState's setter; load() replaces the value and clears the history. */
export function useHistory<T>(initial: T) {
  const [h, setH] = useState<History<T>>(() => reset(initial));
  /** step: always a separate undo step (e.g. one drag-and-drop), never
   * merged with the change before it. label: the step's name, for Undo and Redo. */
  const set = useCallback((v: T | ((prev: T) => T), opts?: { step?: boolean; label?: string }) => {
    setH((cur) => record(cur, typeof v === 'function' ? (v as (p: T) => T)(cur.present) : v, Date.now(), opts?.step ? 0 : undefined, opts?.label));
  }, []);
  return {
    value: h.present,
    set,
    load: useCallback((v: T) => setH(reset(v)), []),
    /** Updates the current value in place (no undo step): bookkeeping the
     * app adds by itself, e.g. new cable reference numbers. */
    patch: useCallback((f: (prev: T) => T) => setH((cur) => { const v = f(cur.present); return v === cur.present ? cur : { ...cur, present: v }; }), []),
    undo: useCallback(() => setH(undo), []),
    redo: useCallback(() => setH(redo), []),
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    /** The name of the step Undo takes back, and of the one Redo does again (none when the step was not named). */
    undoLabel: h.past.length ? h.pastLabels[h.past.length - 1] : undefined,
    redoLabel: h.future.length ? h.futureLabels[0] : undefined
  };
}
