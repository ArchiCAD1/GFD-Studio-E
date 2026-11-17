import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { network } from '../../tests/fixtures/networks';
import type { Project } from '../types';
import { deleteProjectFile, listProjects, listTrash, loadProject, restoreProject, saveProjectFile } from './projectStore';
import { issueRevision } from './revisions';
import { resetWebStore, webGet, webRemove, webSet } from './webStore';

/** localStorage with the limit a browser gives a site (counted in characters, as browsers do). */
function limitedStorage(limit: number): Storage {
  const m = new Map<string, string>();
  const used = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { if (used() - (m.get(k)?.length ?? 0) + k.length + v.length > limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); m.set(k, v); },
    removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }
  } as Storage;
}

/** Just enough of IndexedDB for one store of texts: requests answer later, a write counts when its transaction completes. */
function fakeIndexedDb(): IDBFactory {
  const data = new Map<string, unknown>();
  let made = false;
  const later = (fn: () => void) => void Promise.resolve().then(fn);
  const database = {
    createObjectStore: () => { made = true; return {}; },
    transaction: () => {
      const tx: { oncomplete?: () => void; onabort?: () => void; error: null; objectStore: () => unknown } = {
        error: null,
        objectStore: () => {
          const request = (work: () => unknown) => {
            const req: { result?: unknown; onsuccess?: () => void; onerror?: () => void; error: null } = { error: null };
            later(() => { req.result = work(); req.onsuccess?.(); later(() => tx.oncomplete?.()); });
            return req;
          };
          return { get: (k: string) => request(() => data.get(k)), put: (v: unknown, k: string) => request(() => void data.set(k, v)), delete: (k: string) => request(() => void data.delete(k)) };
        }
      };
      return tx;
    }
  };
  return {
    open: () => {
      const req: { result: unknown; onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = { result: database };
      later(() => { if (!made) req.onupgradeneeded?.(); req.onsuccess?.(); });
      return req;
    }
  } as unknown as IDBFactory;
}

const g = globalThis as { localStorage?: Storage; indexedDB?: IDBFactory };
// A browser's limit is about 5 MB; a smaller one here keeps the test quick.
const LIMIT = 1_000_000;
/** A project with revisions that does not fit under the limit. */
const large = (): Project => {
  let p = network(300, 'deep');
  for (let r = 0; r < 4; r++) p = issueRevision({ ...p, feeders: p.feeders.map((f, i) => (i % 2 === r % 2 ? { ...f, loadKw: f.loadKw + r + 1 } : f)) }, { description: `Rev ${r}` });
  return p;
};

beforeEach(() => { g.localStorage = limitedStorage(LIMIT); resetWebStore(); });
afterEach(() => { delete g.indexedDB; resetWebStore(); });

describe('web version: where projects are kept', () => {
  it('without IndexedDB, in localStorage as before', async () => {
    await webSet('k', 'text');
    expect(localStorage.getItem('k')).toBe('text');
    expect(await webGet('k')).toBe('text');
    await webRemove('k');
    expect(await webGet('k')).toBeNull();
  });

  it('with IndexedDB, there; what localStorage held is still read and moves over when written', async () => {
    localStorage.setItem('old', 'from before');
    g.indexedDB = fakeIndexedDb();
    expect(await webGet('old')).toBe('from before');
    await webSet('old', 'saved again');
    expect(localStorage.getItem('old')).toBeNull(); // its space is free again
    expect(await webGet('old')).toBe('saved again');
    await webSet('new', 'x');
    expect(localStorage.getItem('new')).toBeNull();
    await webRemove('new');
    expect(await webGet('new')).toBeNull();
  });

  it('a project too large for localStorage: refused there, saved and opened with IndexedDB', async () => {
    const p = large();
    await expect(saveProjectFile('big.json', p)).rejects.toThrow(/quota/i); // as it was
    g.indexedDB = fakeIndexedDb();
    resetWebStore();
    const { file } = await saveProjectFile('big.json', p);
    expect(await loadProject(file)).toEqual(p);
    expect((await listProjects()).map((m) => m.file)).toContain('big.json');
  }, 30000);

  it('a project saved before (in localStorage) opens, and delete and restore keep working', async () => {
    const p = network(5, 'shallow');
    await saveProjectFile('job.json', p); // no IndexedDB yet: in localStorage
    expect(localStorage.getItem('lvds.project.job.json')).not.toBeNull();
    g.indexedDB = fakeIndexedDb();
    resetWebStore();
    expect(await loadProject('job.json')).toEqual(p);
    await saveProjectFile('job.json', { ...p, name: 'Renamed' });
    expect(localStorage.getItem('lvds.project.job.json')).toBeNull();
    expect((await loadProject('job.json')).name).toBe('Renamed');
    await deleteProjectFile('job.json');
    await expect(loadProject('job.json')).rejects.toThrow(/not in this browser/);
    const [t] = await listTrash();
    expect(t).toMatchObject({ file: 'job.json', name: 'Renamed' });
    expect(await restoreProject(t.trashFile)).toBe('job.json');
    expect((await loadProject('job.json')).name).toBe('Renamed');
    expect(await listTrash()).toEqual([]);
  });
});
