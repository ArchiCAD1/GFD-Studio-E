/** Read-only migration of storage created before GFD Studio E. Originals stay intact;
 * a GFD value always wins, and deleted GFD data must not be imported again. */
const LEGACY_PREFIX = 'lvds.';
const PREFIX = 'gfde.';
const MIGRATED = 'gfde.migrations.localStorage.v1';

export const legacyStorageKey = (key: string): string | undefined => key.startsWith(PREFIX) ? LEGACY_PREFIX + key.slice(PREFIX.length) : undefined;
export const deletedStorageKey = (key: string): string => `gfde.migrations.deleted.${key}`;

/** Small settings and indexes migrate before the first render. Large projects/trash
 * are read through webStore instead of doubling their localStorage quota usage. */
export function migrateLegacyLocalStorage(storage?: Storage): number {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    if (!s || s.getItem(MIGRATED)) return 0;
    const keys = Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k): k is string => !!k && k.startsWith(LEGACY_PREFIX));
    let copied = 0, failed = false;
    for (const old of keys) {
      if (old.startsWith('lvds.project.') || old === 'lvds.trash') continue;
      const key = PREFIX + old.slice(LEGACY_PREFIX.length);
      if (s.getItem(key) !== null || s.getItem(deletedStorageKey(key))) continue;
      const value = s.getItem(old);
      if (value === null) continue;
      try { s.setItem(key, value); copied++; } catch { failed = true; }
    }
    if (!failed) s.setItem(MIGRATED, '1');
    return copied;
  } catch { return 0; }
}

/** Opens an existing database without creating an empty legacy database on a new
 * installation. A missing or unavailable legacy database does not block startup. */
export function openExistingDatabase(name: string, store: string): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { request.transaction?.abort(); resolve(undefined); };
      request.onsuccess = () => {
        const db = request.result;
        if (db.objectStoreNames && !db.objectStoreNames.contains(store)) { db.close(); resolve(undefined); }
        else resolve(db);
      };
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}
