import type { Project } from '../types';

/** Issued revisions in the project file (file format version 4).
 *
 * In the app a revision holds a whole copy of the project as it was issued (`snapshot`), and that does not change
 * here. In the file, ten revisions used to be ten whole copies: a file eleven times the size of the design. Most of
 * each copy is the same panels, circuits and settings as the copy before it and as the design now, so the file keeps
 * every distinct piece once:
 *
 * - `revisionStore.items`: each distinct piece that is not in the design as it is now, once;
 * - each revision's snapshot, packed: for every section of the project, where its content is.
 *
 * A packed section is one of
 * - `['a', [n, …]]` a list of records (panels, circuits…): n ≥ 0 is `items[n]`, n < 0 is entry -n-1 of the same
 *   section of the design as it is now;
 * - `['s']` the same as that section of the design as it is now;
 * - `['r', n]` `items[n]`;
 * - `['v', value]` the value itself (short ones).
 *
 * Packing happens only where a project is written to a file or to storage, unpacking only where one is read
 * (projectStore, the headless project reader and writer). Unpacked, the pieces a revision shares with another or
 * with the design are the same objects, so the open project also takes less memory. Nothing in the app changes a
 * project in place (undo relies on that too), so sharing is safe. */

const FORMAT = 1;
/** Shorter values are written where they are: a reference would not be smaller. */
const INLINE_BELOW = 64;

type Rec = Record<string, unknown>;
type Packed = ['a', number[]] | ['s'] | ['r', number] | ['v', unknown];
interface PackedSnapshot { $packed: number; sections: Record<string, Packed> }
interface Store { format: number; items: unknown[] }

const isObj = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const isPacked = (s: unknown): s is PackedSnapshot => isObj(s) && typeof s.$packed === 'number' && isObj(s.sections);
const recordList = (v: unknown): v is Rec[] => Array.isArray(v) && v.length > 0 && v.every(isObj);

// A record's text. Records are never changed in place, so the same object always has the same text: saving again
// reads only what was edited since.
const texts = new WeakMap<object, string>();
function textOf(v: unknown): string {
  if (!v || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  let t = texts.get(v);
  if (t === undefined) { t = JSON.stringify(v); texts.set(v, t); }
  return t;
}

/** Whether the project (as read from a file) has packed revisions. */
export const hasPackedRevisions = (p: unknown): boolean => isObj(p) && (isObj(p.revisionStore) || (Array.isArray(p.revisions) && p.revisions.some((r) => isObj(r) && isPacked(r.snapshot))));

/** The project as it is written to a file: revisions packed. The same object when it has no revisions. */
export function packRevisions<T extends Project>(project: T): T {
  const revisions = project.revisions;
  if (!revisions?.length || hasPackedRevisions(project)) return project;
  const live = project as unknown as Rec;
  // Where each record of the design as it is now sits, by section.
  const liveAt = new Map<string, Map<string, number>>();
  const liveIndex = (key: string): Map<string, number> | undefined => {
    let m = liveAt.get(key);
    if (!m && recordList(live[key])) {
      m = new Map();
      (live[key] as Rec[]).forEach((x, i) => { const t = textOf(x); if (!m!.has(t)) m!.set(t, i); });
      liveAt.set(key, m);
    }
    return m;
  };
  const items: unknown[] = [];
  const itemAt = new Map<string, number>();
  const item = (v: unknown, t: string): number => {
    let n = itemAt.get(t);
    if (n === undefined) { n = items.length; items.push(v); itemAt.set(t, n); }
    return n;
  };
  const packed = revisions.map((rev) => {
    const snap = rev.snapshot as unknown as Rec;
    const sections: Record<string, Packed> = {};
    for (const key of Object.keys(snap)) {
      const v = snap[key];
      if (v === undefined) continue;
      if (recordList(v)) {
        const at = liveIndex(key);
        sections[key] = ['a', v.map((x) => { const t = textOf(x), i = at?.get(t); return i !== undefined ? -i - 1 : item(x, t); })];
        continue;
      }
      const t = textOf(v);
      if (t.length < INLINE_BELOW) sections[key] = ['v', v];
      else if (live[key] !== undefined && textOf(live[key]) === t) sections[key] = ['s'];
      else sections[key] = ['r', item(v, t)];
    }
    return { ...rev, snapshot: { $packed: FORMAT, sections } satisfies PackedSnapshot };
  });
  const store: Store = { format: FORMAT, items };
  return { ...project, revisions: packed, revisionStore: store } as unknown as T;
}

const damaged = (what: string) => new Error(`This project's revision history cannot be read (${what}). Open the backup copy of the file (.bak) or an earlier backup.`);

/** The project as the app uses it: every revision with its whole snapshot again. The same object when nothing in
 * it is packed. Call it on what was read from a file before anything else changes the project. */
export function unpackRevisions<T>(project: T): T {
  if (!hasPackedRevisions(project)) return project;
  const { revisionStore, ...rest } = project as unknown as Rec & { revisionStore?: unknown };
  const live = rest as Rec;
  const store = revisionStore as Partial<Store> | undefined;
  if (store !== undefined && (!isObj(store) || !Array.isArray(store.items))) throw damaged('its store is not a list');
  if (store && typeof store.format === 'number' && store.format > FORMAT) throw new Error('This project was saved by a newer version of LV Design Studio. Update the app to read it.');
  const items = store?.items ?? [];
  const itemOf = (n: unknown): unknown => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= items.length) throw damaged('a revision points outside its store');
    return items[n];
  };
  const revisions = (live.revisions as unknown[]).map((rev) => {
    if (!isObj(rev) || !isPacked(rev.snapshot)) return rev;
    if (rev.snapshot.$packed > FORMAT) throw new Error('This project was saved by a newer version of LV Design Studio. Update the app to read it.');
    const snapshot: Rec = {};
    for (const [key, p] of Object.entries(rev.snapshot.sections)) {
      if (!Array.isArray(p)) throw damaged(`section ${key}`);
      if (p[0] === 'v') snapshot[key] = p[1];
      else if (p[0] === 's') { if (live[key] === undefined) throw damaged(`section ${key} is missing`); snapshot[key] = live[key]; }
      else if (p[0] === 'r') snapshot[key] = itemOf(p[1]);
      else if (p[0] === 'a' && Array.isArray(p[1])) {
        const now = live[key];
        snapshot[key] = p[1].map((n) => {
          if (typeof n === 'number' && n < 0) {
            const x = Array.isArray(now) ? now[-n - 1] : undefined;
            if (x === undefined) throw damaged(`section ${key} points outside the design`);
            return x;
          }
          return itemOf(n);
        });
      } else throw damaged(`section ${key}`);
    }
    return { ...rev, snapshot };
  });
  return { ...live, revisions } as unknown as T;
}
