import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { network } from '../../tests/fixtures/networks';
import type { Project } from '../types';
import { deleteProjectFile, listProjects, listTrash, loadProject, metaOf, recentFiles, restoreProject, saveProjectFile } from './projectStore';
import { migrateLegacyLocalStorage } from './legacyStorage';
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
    expect(await loadProject(file)).toEqual({ ...p, format: 'gfde.project' });
    expect(file).toBe('big.gfde');
    expect((await listProjects()).map((m) => m.file)).toContain('big.gfde');
  }, 30000);

  it('a project saved before (in localStorage) opens, and delete and restore keep working', async () => {
    const p = network(5, 'shallow');
    await webSet('gfde.project.job.json', JSON.stringify(p)); // an existing legacy file in localStorage
    localStorage.setItem('gfde.projects', JSON.stringify([metaOf('job.json', p)]));
    expect(localStorage.getItem('gfde.project.job.json')).not.toBeNull();
    g.indexedDB = fakeIndexedDb();
    resetWebStore();
    expect(await loadProject('job.json')).toEqual(p);
    const { file } = await saveProjectFile('job.json', { ...p, name: 'Renamed' });
    expect(file).toBe('job.gfde');
    expect(localStorage.getItem('gfde.project.job.json')).toBe(JSON.stringify(p)); // original kept
    expect((await loadProject(file)).name).toBe('Renamed');
    await deleteProjectFile(file);
    await expect(loadProject(file)).rejects.toThrow(/not in this browser/);
    const [t] = await listTrash();
    expect(t).toMatchObject({ file, name: 'Renamed' });
    expect(await restoreProject(t.trashFile)).toBe(file);
    expect((await loadProject(file)).name).toBe('Renamed');
    expect(await listTrash()).toEqual([]);
  });

  it.each(['lvds', 'json'])('migrates an indexed .%s browser project to a native filename without changing its source or revisions', async (ext) => {
    const legacy = { ...network(5, 'shallow'), format: 'lvds.project' };
    const original = JSON.stringify(issueRevision(legacy, { description: 'Issued before migration' }));
    const oldFile = `Legacy.${ext}`;
    const oldIndex = JSON.stringify([metaOf(oldFile, legacy)]);
    const oldRecent = JSON.stringify(['Recent.gfde', oldFile, 'Earlier.gfde']);
    localStorage.setItem(`lvds.project.${oldFile}`, original);
    localStorage.setItem('lvds.projects', oldIndex);
    localStorage.setItem('lvds.recent', oldRecent);
    migrateLegacyLocalStorage();
    const imported = await loadProject(oldFile);
    const before = JSON.stringify(imported);
    const { file } = await saveProjectFile(oldFile, imported);
    expect(file).toBe('Legacy.gfde');
    expect((await listProjects()).map((m) => m.file)).toEqual([file]);
    expect(recentFiles()).toEqual(['Recent.gfde', file, 'Earlier.gfde']);
    const saved = await loadProject(file);
    expect(saved).toMatchObject({ format: 'gfde.project' });
    expect(saved.revisions).toEqual(imported.revisions);
    expect(saved.revisions![0].snapshot).toMatchObject({ format: 'lvds.project' });
    expect(JSON.stringify(imported)).toBe(before);
    expect(localStorage.getItem(`lvds.project.${oldFile}`)).toBe(original);
    expect(localStorage.getItem('lvds.projects')).toBe(oldIndex);
    expect(localStorage.getItem('lvds.recent')).toBe(oldRecent);
    expect(await loadProject(oldFile)).toEqual(imported);
    expect((await saveProjectFile(file, { ...saved, name: 'Saved again' })).file).toBe(file);
    expect((await listProjects()).map((m) => m.file)).toEqual([file]);
    expect((await loadProject(file)).name).toBe('Saved again');
  });

  it.each([false, true])('avoids indexed and unindexed migration collisions with IndexedDB %s', async (indexed) => {
    if (indexed) g.indexedDB = fakeIndexedDb();
    const p = network(5, 'shallow');
    const original = JSON.stringify({ ...p, format: 'lvds.project' });
    await webSet('gfde.project.Tower.lvds', original);
    const occupied = ['Tower.gfde', 'Tower-2.json', 'Tower-3.lvds', 'Tower-4.gfde'];
    for (const file of occupied) await webSet(`gfde.project.${file}`, JSON.stringify({ ...p, name: file }));
    localStorage.setItem('gfde.projects', JSON.stringify(['Tower.lvds', ...occupied.slice(0, 2)].map((file) => metaOf(file, p))));
    localStorage.setItem('gfde.recent', JSON.stringify(['Tower.lvds', 'Tower.gfde']));
    const { file } = await saveProjectFile('Tower.lvds', { ...p, name: 'Migrated' });
    expect(file).toBe('Tower-5.gfde');
    expect(await webGet('gfde.project.Tower.lvds')).toBe(original);
    for (const other of occupied) expect((await loadProject(other)).name).toBe(other);
    expect((await listProjects()).map((m) => m.file).sort()).toEqual(['Tower-2.json', 'Tower-5.gfde', 'Tower.gfde']);
    expect(recentFiles()).toEqual(['Tower-5.gfde', 'Tower.gfde']);
  });

  it.each(['payload', 'index'])('keeps the old browser project and references when the native %s write fails', async (failure) => {
    const p = network(5, 'shallow');
    const original = JSON.stringify(p);
    const index = JSON.stringify([metaOf('Legacy.lvds', p)]);
    const recent = JSON.stringify(['Legacy.lvds']);
    localStorage.setItem('gfde.project.Legacy.lvds', original);
    localStorage.setItem('gfde.projects', index);
    localStorage.setItem('gfde.recent', recent);
    const set = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key, value) => {
      if (key === (failure === 'payload' ? 'gfde.project.Legacy.gfde' : 'gfde.projects')) throw new Error('storage full');
      set(key, value);
    };
    await expect(saveProjectFile('Legacy.lvds', { ...p, name: 'Edited' })).rejects.toThrow('storage full');
    expect(localStorage.getItem('gfde.project.Legacy.lvds')).toBe(original);
    expect(localStorage.getItem('gfde.projects')).toBe(index);
    expect(localStorage.getItem('gfde.recent')).toBe(recent);
  });

  it('restoring an older trash item cannot overwrite the original retained after migration', async () => {
    const p = network(5, 'shallow');
    const original = JSON.stringify({ ...p, name: 'Original before migration' });
    localStorage.setItem('gfde.project.Legacy.lvds', original);
    localStorage.setItem('gfde.projects', JSON.stringify([metaOf('Legacy.lvds', p)]));
    await saveProjectFile('Legacy.lvds', { ...p, name: 'Current native project' });
    localStorage.setItem('gfde.trash', JSON.stringify([{
      trashFile: 'older-copy', file: 'Legacy.lvds', name: 'Older copy', deletedAt: Date.now(),
      text: JSON.stringify({ ...p, name: 'Older copy' })
    }]));
    const restored = await restoreProject('older-copy');
    expect(restored).toBe('Legacy-2.lvds');
    expect((await loadProject(restored)).name).toBe('Older copy');
    expect(await webGet('gfde.project.Legacy.lvds')).toBe(original);
    expect((await loadProject('Legacy.gfde')).name).toBe('Current native project');
  });
});
