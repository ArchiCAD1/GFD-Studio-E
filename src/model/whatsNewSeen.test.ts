import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { pendingReleases, RELEASES, markSeen as markSeenFromList } from './whatsNew';
import { markSeen, mayHaveUnseen, SEEN_KEY } from './whatsNewSeen';

describe('What\'s new: asked at start without reading the release list', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }
    } as Storage;
  });

  it('nothing to read once this version was seen; the list is read for a new install or after an update', () => {
    const current = RELEASES[0].version;
    expect(mayHaveUnseen(current)).toBe(true); // nothing seen yet: the list decides (and marks a new install as seen)
    expect(pendingReleases(current)).toEqual([]);
    expect(mayHaveUnseen(current)).toBe(false);
    localStorage.setItem(SEEN_KEY, RELEASES[1].version); // an update
    expect(mayHaveUnseen(current)).toBe(true);
    expect(pendingReleases(current).map((r) => r.version)).toEqual([current]);
    markSeen(current);
    expect(mayHaveUnseen(current)).toBe(false);
    expect(pendingReleases(current)).toEqual([]); // whenever the quick answer is no, the list agrees
  });

  it('storage refused: nothing is shown, as before', () => {
    (globalThis as { localStorage?: Storage }).localStorage = { getItem: () => { throw new Error('refused'); }, setItem: () => { throw new Error('refused'); } } as unknown as Storage;
    expect(mayHaveUnseen('9.9')).toBe(false);
    expect(pendingReleases('9.9')).toEqual([]);
    expect(() => markSeen('9.9')).not.toThrow();
  });

  it('the list still offers markSeen, and the app loads the list only when asked', () => {
    expect(markSeenFromList).toBe(markSeen);
    const app = readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf-8');
    expect(app).toMatch(/import type \{[^}]*\} from '\.\/model\/whatsNew';/);
    expect(app).not.toMatch(/^import \{[^}]*\} from '\.\/model\/whatsNew';/m); // only its types, and import('./model/whatsNew')
    expect(app.match(/import\('\.\/model\/whatsNew'\)/g)?.length).toBe(2);
  });
});
