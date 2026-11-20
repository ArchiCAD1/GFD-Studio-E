// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { idbStore, type Checkpoint } from './checkpoints';
import { migrateLegacyLocalStorage, openExistingDatabase } from './legacyStorage';
import { resetWebStore, webGet, webRemove, webSet } from './webStore';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  };
}

/** Named databases with asynchronous requests, transaction completion, key paths
 * and an index. Enough of IndexedDB to exercise cross-database migration, including
 * its deletion behavior; values in a legacy database remain directly inspectable. */
function databases() {
  type Store = { values: Map<string, unknown>; keyPath?: string };
  const data = new Map<string, Map<string, Store>>();
  const seed = (name: string, store: string, values: [string, unknown][], keyPath?: string) => data.set(name, new Map([[store, { values: new Map(values), keyPath }]]));
  const later = (fn: () => void) => void Promise.resolve().then(fn);
  const factory = {
    open(name: string) {
      const isNew = !data.has(name);
      if (isNew) data.set(name, new Map());
      const stores = data.get(name)!;
      let aborted = false;
      const db = {
        objectStoreNames: { contains: (store: string) => stores.has(store) }, close() {},
        createObjectStore(store: string, options?: { keyPath?: string }) {
          stores.set(store, { values: new Map(), keyPath: options?.keyPath });
          return { createIndex() {} };
        },
        transaction(store: string) {
          let pending = 0;
          const tx: { oncomplete?: () => void; onabort?: () => void; onerror?: () => void; error?: Error; objectStore: () => unknown } = {
            objectStore: () => {
              const s = stores.get(store)!;
              const request = (work: () => unknown) => {
                const r: { result?: unknown; onsuccess?: () => void; onerror?: () => void; error?: Error } = {};
                pending++;
                later(() => {
                  try { r.result = work(); r.onsuccess?.(); } catch (error) { r.error = error as Error; r.onerror?.(); tx.error = error as Error; tx.onerror?.(); }
                  pending--; later(() => { if (!pending) tx.oncomplete?.(); });
                });
                return r;
              };
              return {
                get: (key: string) => request(() => s.values.get(key)), getAll: () => request(() => [...s.values.values()]),
                put: (value: unknown, key?: string) => request(() => { const id = key ?? (value as Record<string, string>)[s.keyPath!]; s.values.set(id, value); return id; }),
                delete: (key: string) => request(() => s.values.delete(key)),
                index: (field: string) => ({ getAll: (key: string) => request(() => [...s.values.values()].filter((v) => (v as Record<string, unknown>)[field] === key)) })
              };
            }
          };
          return tx;
        }
      };
      const request: { result: unknown; transaction: { abort(): void }; onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void } = {
        result: db, transaction: { abort() { aborted = true; if (isNew) data.delete(name); } }
      };
      later(() => { if (isNew) request.onupgradeneeded?.(); if (aborted) request.onerror?.(); else request.onsuccess?.(); });
      return request;
    }
  } as unknown as IDBFactory;
  return { data, seed, factory };
}

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('indexedDB', undefined); resetWebStore(); });
afterEach(() => { vi.unstubAllGlobals(); resetWebStore(); });

describe('GFD browser storage migration', () => {
  it('copies preferences, recovery and indexes once, preserves originals and existing GFD values', () => {
    localStorage.setItem('lvds.preferences', '{"theme":"light"}');
    localStorage.setItem('gfde.preferences', '{"theme":"dark"}');
    localStorage.setItem('lvds.projects', '[{"file":"Old.lvds"}]');
    localStorage.setItem('lvds.recovery.job', '{"unsaved":true}');
    localStorage.setItem('lvds.project.Old.lvds', '{"name":"Old"}');
    expect(migrateLegacyLocalStorage()).toBe(2);
    expect(localStorage.getItem('gfde.preferences')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('gfde.projects')).toBe('[{"file":"Old.lvds"}]');
    expect(localStorage.getItem('gfde.recovery.job')).toBe('{"unsaved":true}');
    expect(localStorage.getItem('gfde.project.Old.lvds')).toBeNull();
    expect(localStorage.getItem('lvds.projects')).toBe('[{"file":"Old.lvds"}]');
    localStorage.removeItem('gfde.recovery.job');
    expect(migrateLegacyLocalStorage()).toBe(0);
    expect(localStorage.getItem('gfde.recovery.job')).toBeNull();
  });

  it('reads old local projects without duplicating quota, then does not resurrect a deleted project', async () => {
    localStorage.setItem('lvds.project.Old.lvds', 'legacy project');
    expect(await webGet('gfde.project.Old.lvds')).toBe('legacy project');
    await webRemove('gfde.project.Old.lvds');
    expect(await webGet('gfde.project.Old.lvds')).toBeNull();
    expect(localStorage.getItem('lvds.project.Old.lvds')).toBe('legacy project');
    await webSet('gfde.project.Old.lvds', 'restored');
    expect(await webGet('gfde.project.Old.lvds')).toBe('restored');
  });

  it('migrates IndexedDB projects and trash with GFD writes isolated from the originals', async () => {
    const dbs = databases();
    dbs.seed('lvds-web', 'kv', [['lvds.project.Old.lvds', 'old project'], ['lvds.trash', 'old trash']]);
    vi.stubGlobal('indexedDB', dbs.factory);
    expect(await webGet('gfde.project.Old.lvds')).toBe('old project');
    expect(await webGet('gfde.trash')).toBe('old trash');
    expect(dbs.data.get('gfde-web')!.get('kv')!.values.get('gfde.project.Old.lvds')).toBe('old project');
    await webSet('gfde.project.Old.lvds', 'new project');
    expect(await webGet('gfde.project.Old.lvds')).toBe('new project');
    expect(dbs.data.get('lvds-web')!.get('kv')!.values.get('lvds.project.Old.lvds')).toBe('old project');
    await webRemove('gfde.project.Old.lvds'); resetWebStore();
    expect(await webGet('gfde.project.Old.lvds')).toBeNull();
  });

  it('does not create persistent empty legacy databases on a new installation', async () => {
    const dbs = databases(); vi.stubGlobal('indexedDB', dbs.factory);
    expect(await openExistingDatabase('lvds-web', 'kv')).toBeUndefined();
    expect(dbs.data.has('lvds-web')).toBe(false);
  });

  it('imports checkpoint history once and never overwrites or restores deleted GFD checkpoints', async () => {
    const cp = (id: string, label: string): Checkpoint => ({ id, label, projectId: 'p1', at: '2026-11-20T12:00:00Z', project: { ...sampleProject, id: 'p1' } });
    const dbs = databases();
    dbs.seed('lvds-checkpoints', 'cp', [['one', cp('one', 'Legacy one')], ['two', cp('two', 'Legacy two')]], 'id');
    dbs.seed('gfde-checkpoints', 'cp', [['one', cp('one', 'GFD one')]], 'id');
    vi.stubGlobal('indexedDB', dbs.factory);
    const store = idbStore()!;
    expect((await store.list('p1')).map((c) => c.label).sort()).toEqual(['GFD one', 'Legacy two']);
    await store.remove('two');
    expect((await idbStore()!.list('p1')).map((c) => c.label)).toEqual(['GFD one']);
    expect(dbs.data.get('lvds-checkpoints')!.get('cp')!.values.has('two')).toBe(true);
  });
});
