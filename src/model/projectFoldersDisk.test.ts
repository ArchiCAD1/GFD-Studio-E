import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Created = { root: string; rootMade: boolean; created: number; existed: number; failed: { path: string; reason: string }[] };
type Status = { root: string; exists: boolean; present: string[]; missing: string[]; looseFiles: string[]; looseCount: number };
const disk = createRequire(import.meta.url)('../../electron/projectFolders.cjs') as {
  create: (a: unknown) => Created; status: (a: unknown) => Status; openable: (root: unknown) => string; args: (a: unknown) => { root: string; paths: string[] };
};

let base: string;
beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'lvds-folders-')); });
afterEach(() => { rmSync(base, { recursive: true, force: true }); });
const root = () => join(base, '2417_Villas');
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

describe('creating a project\'s folders', () => {
  it('makes the project folder and the folders in it, parents included', () => {
    const r = disk.create({ root: root(), paths: ['03_Calcs/02_Volt_Drop', '01_Admin', '03_Calcs'] });
    expect(r).toMatchObject({ rootMade: true, created: 3, existed: 0, failed: [] });
    expect(isDir(join(root(), '03_Calcs', '02_Volt_Drop'))).toBe(true);
    expect(isDir(join(root(), '01_Admin'))).toBe(true);
  });
  it('leaves existing folders and their files alone, and only adds what is missing', () => {
    mkdirSync(join(root(), '01_Admin'), { recursive: true });
    writeFileSync(join(root(), '01_Admin', 'contract.txt'), 'keep me');
    writeFileSync(join(root(), 'notes.txt'), 'loose');
    const r = disk.create({ root: root(), paths: ['01_Admin', '02_Inputs'] });
    expect(r).toMatchObject({ rootMade: false, created: 1, existed: 1 });
    expect(readFileSync(join(root(), '01_Admin', 'contract.txt'), 'utf-8')).toBe('keep me');
    expect(readFileSync(join(root(), 'notes.txt'), 'utf-8')).toBe('loose');
    expect(disk.create({ root: root(), paths: ['01_Admin', '02_Inputs'] })).toMatchObject({ created: 0, existed: 2 });
  });
  it('does not make the folder that should hold the project folder', () => {
    expect(() => disk.create({ root: join(base, 'nowhere', '2417_Villas'), paths: ['A'] })).toThrow(/not a folder on this computer/);
    expect(existsSync(join(base, 'nowhere'))).toBe(false);
  });
  it('reports a file or a link where a folder should be, and goes on with the rest', () => {
    if (process.platform === 'win32') return;
    mkdirSync(root());
    writeFileSync(join(root(), '01_Admin'), 'a file');
    const outside = mkdtempSync(join(tmpdir(), 'lvds-outside-'));
    try {
      symlinkSync(outside, join(root(), '02_Inputs'), 'dir');
      const r = disk.create({ root: root(), paths: ['01_Admin/Minutes', '02_Inputs/Arch', '03_Calcs'] });
      expect(r.created).toBe(1);
      expect(r.failed.map((f) => f.path)).toEqual(['01_Admin/Minutes', '02_Inputs/Arch']);
      expect(r.failed[0].reason).toMatch(/a file, not a folder/);
      expect(r.failed[1].reason).toMatch(/a link, not a folder/);
      expect(readdirSync(outside)).toEqual([]);
      expect(readFileSync(join(root(), '01_Admin'), 'utf-8')).toBe('a file');
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
  it('refuses a project folder that is itself a link', () => {
    if (process.platform === 'win32') return;
    const outside = mkdtempSync(join(tmpdir(), 'lvds-outside-'));
    try {
      symlinkSync(outside, root(), 'dir');
      expect(() => disk.create({ root: root(), paths: ['A'] })).toThrow(/a link, not a folder/);
      expect(readdirSync(outside)).toEqual([]);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
});

describe('what is refused', () => {
  const bad = (paths: unknown, r: unknown = root()) => () => disk.args({ root: r, paths });
  it('paths that leave the project folder or are not folder names', () => {
    for (const p of ['../x', 'a/../../x', '/etc', 'a//b', 'a\\b', 'C:x', 'a/..', '.', 'CON', 'a/nul.txt', 'name.', 'name ', 'a?b', 'a\u0001b', '']) expect(bad([p]), p).toThrow(/Refused/);
    expect(bad(['ok', 5])).toThrow(/Refused/);
    expect(bad('a')).toThrow(/Refused/);
  });
  it('a project folder that is relative, a drive, or badly named', () => {
    expect(bad([], 'relative/folder')).toThrow(/Refused/);
    expect(bad([], '/')).toThrow(/Refused/);
    expect(bad([], join(base, 'bad?name'))).toThrow(/Refused/);
    expect(bad([], 7)).toThrow(/Refused/);
  });
  it('too many folders, too deep, or too long', () => {
    expect(bad(Array.from({ length: 2001 }, (_, i) => `f${i}`))).toThrow(/Refused/);
    expect(bad([Array.from({ length: 13 }, () => 'a').join('/')])).toThrow(/too deep/);
    expect(bad([`${'x'.repeat(110)}/${'y'.repeat(110)}/${'z'.repeat(110)}`])).toThrow(/longer than/);
  });
  it('keeps one of two paths that differ only by case', () => {
    expect(disk.args({ root: root(), paths: ['Admin', 'admin', 'Admin/A'] }).paths).toEqual(['Admin', 'Admin/A']);
  });
});

describe('the status of a project\'s folders', () => {
  it('says the project folder is not there', () => {
    expect(disk.status({ root: root(), paths: ['A', 'B'] })).toMatchObject({ exists: false, present: [], missing: ['A', 'B'] });
  });
  it('lists present and missing folders and the files lying loose, without touching anything', () => {
    disk.create({ root: root(), paths: ['A/A1', 'B'] });
    writeFileSync(join(root(), 'plan.dwg'), 'x');
    writeFileSync(join(root(), '.hidden'), 'x');
    writeFileSync(join(root(), 'C'), 'a file named like a folder');
    const s = disk.status({ root: root(), paths: ['A', 'A/A1', 'A/A2', 'B', 'C'] });
    expect(s).toMatchObject({ exists: true, present: ['A', 'A/A1', 'B'], missing: ['A/A2', 'C'], looseFiles: ['C', 'plan.dwg'], looseCount: 2 });
    expect(existsSync(join(root(), 'A', 'A2'))).toBe(false);
  });
  it('opens only a real folder', () => {
    expect(() => disk.openable(root())).toThrow(/not on this computer/);
    mkdirSync(root());
    expect(disk.openable(root())).toBe(root());
    expect(() => disk.openable('relative')).toThrow(/Refused/);
  });
});
