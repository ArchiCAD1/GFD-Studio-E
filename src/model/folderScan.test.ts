import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SKIP_FOLDER, type FolderScan } from './folderLearn';

const req = createRequire(import.meta.url);
const scan = req('../../electron/folderScan.cjs') as { SKIP: RegExp; scanNames: (root: unknown, limits?: { maxDepth: number; maxFolders: number }) => Promise<FolderScan> };
const check = req('../../electron/ipcValidate.cjs') as { scanRoot: (v: unknown) => string };

let dir: string, job: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lvds-scan-'));
  job = join(dir, '2309_Jumeirah Park Villas');
  for (const p of ['A-Admin/Minutes', 'B-Received/Arch/Rev A 12-03', 'C-Calc/VD', 'C-Calc/SC', '.git/objects', '$RECYCLE.BIN', '@eaDir']) mkdirSync(join(job, p), { recursive: true });
  writeFileSync(join(job, 'C-Calc/VD/DB-01 VD.pdf'), 'secret');
  writeFileSync(join(job, 'C-Calc/VD/DB-02 VD.pdf'), 'secret');
  writeFileSync(join(job, 'notes.txt'), 'x');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('Learn from folder: reading folder names (electron/folderScan.cjs)', () => {
  it('returns the folder names and file counts only, skipping hidden and system folders', async () => {
    const s = await scan.scanNames(job);
    expect(s).toMatchObject({ name: '2309_Jumeirah Park Villas', files: 1, count: 8, depth: 3, totalFiles: 2, skipped: 3, truncated: false, deeper: false, unreadable: 0 });
    expect(s.folders.map((f) => f.name)).toEqual(['A-Admin', 'B-Received', 'C-Calc']);
    expect(s.folders[2].children).toEqual([{ name: 'SC', files: 0, children: [] }, { name: 'VD', files: 2, children: [] }]);
    expect(JSON.stringify(s)).not.toContain('.pdf');
  });

  it('changes nothing in the folder', async () => {
    const before = statSync(join(job, 'C-Calc/VD')).mtimeMs;
    const list = readdirSync(job, { recursive: true }).sort();
    await scan.scanNames(job);
    expect(statSync(join(job, 'C-Calc/VD')).mtimeMs).toBe(before);
    expect(readdirSync(job, { recursive: true }).sort()).toEqual(list);
  });

  it('does not follow links, and refuses a chosen folder that is a link', async () => {
    if (process.platform === 'win32') return;
    const outside = join(dir, 'Elsewhere');
    mkdirSync(join(outside, 'Private'), { recursive: true });
    symlinkSync(outside, join(job, 'Linked'));
    symlinkSync(join(job, 'notes.txt'), join(job, 'notes-link.txt'));
    const s = await scan.scanNames(job);
    expect(s.folders.map((f) => f.name)).not.toContain('Linked');
    expect(s.skipped).toBe(5);
    expect(s.files).toBe(1);
    symlinkSync(job, join(dir, 'job-link'));
    await expect(scan.scanNames(join(dir, 'job-link'))).rejects.toThrow('is a link');
  });

  it('stops at 6 levels and 500 folders, top levels first', async () => {
    mkdirSync(join(job, 'D/1/2/3/4/5/6/7'), { recursive: true });
    const s = await scan.scanNames(job);
    expect(s.depth).toBe(6);
    expect(s.deeper).toBe(true);
    for (let i = 0; i < 6; i++) mkdirSync(join(job, `W${i}`, 'Sub'), { recursive: true });
    const w = await scan.scanNames(job, { maxDepth: 6, maxFolders: 10 });
    expect([w.count, w.truncated]).toEqual([10, true]);
    expect(w.folders.map((f) => f.name)).toEqual(['A-Admin', 'B-Received', 'C-Calc', 'D', 'W0', 'W1', 'W2', 'W3', 'W4', 'W5']);
  });

  it('refuses what is not a folder to read', async () => {
    await expect(scan.scanNames(join(job, 'notes.txt'))).rejects.toThrow('not a folder');
    await expect(scan.scanNames('relative/path')).rejects.toThrow('folder to read');
    await expect(scan.scanNames(5)).rejects.toThrow('folder to read');
    expect(() => check.scanRoot('/')).toThrow('top of the disk');
    expect(() => check.scanRoot(`/a\0b`)).toThrow('folder to read');
    expect(check.scanRoot(join(job, 'C-Calc', '..'))).toBe(job);
  });

  it('skips the same folders as the browser version', () => {
    for (const n of ['.git', '.DS_Store', '$RECYCLE.BIN', '~$tmp', '@eaDir', '__MACOSX', 'System Volume Information', '#recycle', 'Arch', 'C-Calc', 'Rev $A'])
      expect([n, scan.SKIP.test(n)]).toEqual([n, SKIP_FOLDER.test(n)]);
    expect(scan.SKIP.source).toBe(SKIP_FOLDER.source);
  });
});
