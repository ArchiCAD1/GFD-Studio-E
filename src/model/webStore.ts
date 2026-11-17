/** Web version: where the large things are kept — project files and the trash.
 *
 * A browser gives a site about 5 MB of localStorage, which a larger project with a few revisions does not fit in.
 * IndexedDB has no such limit (the browser allows a share of the free disk), so these are kept there, each as text
 * under its key. Where IndexedDB cannot be used (a browser that blocks it, the tests) localStorage is used as before.
 *
 * What was already in localStorage is still read, and moves over the next time it is written. The desktop app does
 * not come here: it keeps project files on disk. */

const DB = 'lvds-web', STORE = 'kv';

let opening: Promise<IDBDatabase | undefined> | undefined;
function db(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined);
  opening ??= new Promise<IDBDatabase | undefined>((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(undefined); // blocked (private window, policy): localStorage as before
      r.onblocked = () => res(undefined);
    } catch { res(undefined); }
  });
  return opening;
}
const run = <T,>(d: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  new Promise<T>((res, rej) => {
    const tx = d.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
    // A write counts once the transaction is complete, not when the request is accepted.
    if (mode === 'readonly') req.onsuccess = () => res(req.result); else tx.oncomplete = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error('This browser could not store the project'));
    tx.onabort = () => rej(tx.error ?? new Error('This browser could not store the project'));
  });

/** The text kept under a key, or null. */
export async function webGet(key: string): Promise<string | null> {
  const d = await db();
  if (d) {
    const v = await run<unknown>(d, 'readonly', (s) => s.get(key));
    if (typeof v === 'string') return v;
  }
  return localStorage.getItem(key); // kept here before, or no IndexedDB
}

/** Keeps a text under a key. Throws when the browser cannot store it (out of space). */
export async function webSet(key: string, text: string): Promise<void> {
  const d = await db();
  if (!d) { localStorage.setItem(key, text); return; }
  await run(d, 'readwrite', (s) => s.put(text, key));
  localStorage.removeItem(key); // the copy from before, if any: its space is free again
}

export async function webRemove(key: string): Promise<void> {
  const d = await db();
  if (d) await run(d, 'readwrite', (s) => s.delete(key));
  localStorage.removeItem(key);
}

/** Tests: forget the open database. */
export function resetWebStore(): void { opening = undefined; }
