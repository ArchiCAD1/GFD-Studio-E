import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeFs = createRequire(import.meta.url)('../../electron/safeFs.cjs') as {
  readFileNoFollow: (file: string, options?: { max?: number }) => { buffer: Buffer; size: number; tooLarge?: boolean };
  writeNewFile: (file: string, data: Buffer | string) => void;
};

const identity = createRequire(import.meta.url)('../../electron/appIdentity.cjs') as {
  defaultProjectsFolder: (home: string) => string;
  migrateLegacyProfile: (appData: string, target: string) => { migrated: boolean; copied: string[]; skipped: string[] };
};

describe('GFD Studio E desktop profile migration', () => {
  let root: string, legacy: string, current: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gfde-profile-'));
    legacy = join(root, 'LV Design Studio'); current = join(root, 'GFD Studio E');
    mkdirSync(legacy);
  });
  afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

  it('imports settings, unsaved recovery and browser storage while retaining the original profile', () => {
    const settings = JSON.stringify({ projectsFolder: join(root, 'Existing projects') });
    writeFileSync(join(legacy, 'settings.json'), settings);
    mkdirSync(join(legacy, 'recovery'));
    writeFileSync(join(legacy, 'recovery', 'p1.json'), '{"name":"Unsaved"}');
    mkdirSync(join(legacy, 'Local Storage', 'leveldb'), { recursive: true });
    writeFileSync(join(legacy, 'Local Storage', 'leveldb', '000001.log'), 'saved preferences');
    writeFileSync(join(legacy, 'Local Storage', 'leveldb', 'LOCK'), 'old lock');
    writeFileSync(join(legacy, 'api-token'), 'must not be imported');
    expect(identity.migrateLegacyProfile(root, current).migrated).toBe(true);
    expect(readFileSync(join(current, 'settings.json'), 'utf8')).toBe(settings);
    expect(readFileSync(join(current, 'recovery', 'p1.json'), 'utf8')).toContain('Unsaved');
    expect(readFileSync(join(current, 'Local Storage', 'leveldb', '000001.log'), 'utf8')).toBe('saved preferences');
    expect(existsSync(join(current, 'Local Storage', 'leveldb', 'LOCK'))).toBe(false);
    expect(existsSync(join(current, 'api-token'))).toBe(false);
    expect(readFileSync(join(legacy, 'settings.json'), 'utf8')).toBe(settings);
    writeFileSync(join(legacy, 'settings.json'), 'changed later');
    expect(identity.migrateLegacyProfile(root, current).migrated).toBe(false);
    expect(readFileSync(join(current, 'settings.json'), 'utf8')).toBe(settings);
  });

  it('does not replace GFD settings or merge an existing browser database', () => {
    mkdirSync(join(current, 'IndexedDB'), { recursive: true });
    mkdirSync(join(legacy, 'IndexedDB'));
    writeFileSync(join(current, 'settings.json'), '{"new":true}');
    writeFileSync(join(legacy, 'settings.json'), '{"old":true}');
    writeFileSync(join(current, 'IndexedDB', 'current'), 'keep');
    writeFileSync(join(legacy, 'IndexedDB', 'old'), 'do not merge');
    identity.migrateLegacyProfile(root, current);
    expect(readFileSync(join(current, 'settings.json'), 'utf8')).toBe('{"new":true}');
    expect(existsSync(join(current, 'IndexedDB', 'old'))).toBe(false);
  });

  it('cleans up a partial browser copy after an I/O failure and retries the complete database', () => {
    const store = join(legacy, 'IndexedDB'); mkdirSync(store);
    writeFileSync(join(store, 'a.ldb'), 'first table');
    writeFileSync(join(store, 'b.ldb'), 'second table');
    const write = safeFs.writeNewFile;
    const fail = vi.spyOn(safeFs, 'writeNewFile').mockImplementation((file, data) => {
      if (file.endsWith('b.ldb')) throw new Error('Simulated interrupted write');
      write(file, data);
    });
    expect(() => identity.migrateLegacyProfile(root, current)).toThrow(/interrupted write/);
    expect(existsSync(join(current, 'IndexedDB'))).toBe(false);
    expect(existsSync(join(current, 'gfd-profile-migration.json'))).toBe(false);
    expect(readdirSync(current).some((name) => name.startsWith('.gfde-profile-import-'))).toBe(false);
    expect(readFileSync(join(store, 'a.ldb'), 'utf8')).toBe('first table');
    fail.mockRestore();
    expect(identity.migrateLegacyProfile(root, current).migrated).toBe(true);
    expect(readFileSync(join(current, 'IndexedDB', 'a.ldb'), 'utf8')).toBe('first table');
    expect(readFileSync(join(current, 'IndexedDB', 'b.ldb'), 'utf8')).toBe('second table');
  });

  it('refuses a database that changes during copying, then imports its stable revision on retry', () => {
    const store = join(legacy, 'Local Storage'); mkdirSync(store);
    const table = join(store, 'table.ldb'); writeFileSync(table, 'original');
    const read = safeFs.readFileNoFollow;
    const change = vi.spyOn(safeFs, 'readFileNoFollow').mockImplementation((file, options) => {
      const result = read(file, options);
      if (file === table) writeFileSync(table, 'a changed source table');
      return result;
    });
    expect(() => identity.migrateLegacyProfile(root, current)).toThrow(/changed during import/);
    expect(existsSync(join(current, 'Local Storage'))).toBe(false);
    expect(existsSync(join(current, 'gfd-profile-migration.json'))).toBe(false);
    expect(readdirSync(current).some((name) => name.startsWith('.gfde-profile-import-'))).toBe(false);
    change.mockRestore();
    identity.migrateLegacyProfile(root, current);
    expect(readFileSync(join(current, 'Local Storage', 'table.ldb'), 'utf8')).toBe('a changed source table');
  });

  it('does not publish or mark complete a browser database with a skipped data file', () => {
    const store = join(legacy, 'IndexedDB'); mkdirSync(store);
    const table = join(store, 'table.ldb'); writeFileSync(table, 'data');
    const read = safeFs.readFileNoFollow;
    const oversized = vi.spyOn(safeFs, 'readFileNoFollow').mockImplementation((file, options) => file === table
      ? { buffer: Buffer.alloc(0), tooLarge: true, size: 300 * 1024 * 1024 }
      : read(file, options));
    expect(() => identity.migrateLegacyProfile(root, current)).toThrow(/could not be copied/);
    expect(existsSync(join(current, 'IndexedDB'))).toBe(false);
    expect(existsSync(join(current, 'gfd-profile-migration.json'))).toBe(false);
    expect(readdirSync(current).some((name) => name.startsWith('.gfde-profile-import-'))).toBe(false);
    oversized.mockRestore();
    identity.migrateLegacyProfile(root, current);
    expect(readFileSync(join(current, 'IndexedDB', 'table.ldb'), 'utf8')).toBe('data');
  });

  it.skipIf(process.platform === 'win32')('refuses browser database links without publishing a partial store', () => {
    const store = join(legacy, 'IndexedDB'); mkdirSync(store);
    const privateFile = join(root, 'private'); writeFileSync(privateFile, 'secret');
    symlinkSync(privateFile, join(store, 'linked.ldb'));
    expect(() => identity.migrateLegacyProfile(root, current)).toThrow(/unsupported file/);
    expect(existsSync(join(current, 'IndexedDB'))).toBe(false);
    expect(existsSync(join(current, 'gfd-profile-migration.json'))).toBe(false);
    expect(readFileSync(privateFile, 'utf8')).toBe('secret');
  });

  it.skipIf(process.platform === 'win32')('never imports a symbolic link to another file or folder', () => {
    const privateFile = join(root, 'private'); writeFileSync(privateFile, 'secret');
    symlinkSync(privateFile, join(legacy, 'settings.json'));
    symlinkSync(root, join(legacy, 'recovery'), 'dir');
    expect(identity.migrateLegacyProfile(root, current).skipped.sort()).toEqual(['recovery', 'settings.json']);
    expect(existsSync(join(current, 'settings.json'))).toBe(false);
    expect(existsSync(join(current, 'recovery'))).toBe(false);
    expect(readFileSync(privateFile, 'utf8')).toBe('secret');
  });

  it('finds the package-name legacy profile when the display-name profile is absent', () => {
    rmSync(legacy, { recursive: true });
    const packageProfile = join(root, 'lv-design-studio'); mkdirSync(packageProfile);
    writeFileSync(join(packageProfile, 'settings.json'), '{}');
    identity.migrateLegacyProfile(root, current);
    expect(readFileSync(join(current, 'settings.json'), 'utf8')).toBe('{}');
  });

  it('uses branded new projects while retaining discoverability of an existing legacy folder', () => {
    const next = join(root, 'GFD Studio E Projects'), old = join(root, 'LV Design Studio Projects');
    expect(identity.defaultProjectsFolder(root)).toBe(next);
    mkdirSync(old);
    expect(identity.defaultProjectsFolder(root)).toBe(old);
    mkdirSync(next);
    expect(identity.defaultProjectsFolder(root)).toBe(next);
  });

  it('uses the existing component database until a branded database is explicitly available', () => {
    const database = createRequire(import.meta.url)('../../electron/database.cjs') as { folderFor: (dir: string) => string; setFolder: (dir: string | null) => void };
    database.setFolder(null);
    const next = join(root, 'GFD Studio E Database'), old = join(root, 'LV Database');
    expect(database.folderFor(root)).toBe(next);
    mkdirSync(old);
    expect(database.folderFor(root)).toBe(old);
    mkdirSync(next);
    expect(database.folderFor(root)).toBe(next);
  });
});
