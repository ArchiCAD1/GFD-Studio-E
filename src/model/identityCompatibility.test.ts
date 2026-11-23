// @vitest-environment node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { appDataDir, listProjects, openProject, projectsFolder, resolveProject, unsavedCopyInApp } from '../headless/project';
import { buildBackup, readBackup } from './projectBackup';
import { hashedText } from '../exchange/contracts';
import { readPackage } from '../exchange/inbox';

const disk = createRequire(import.meta.url)('../../electron/projectFiles.cjs') as {
  nativeFileName(folder: string, file: string): string;
  uniqueFileName(folder: string, base: string): string;
  projectText(project: unknown): string;
  writeFileSafe(file: string, text: string, options: { verifyJson: boolean }): unknown;
  retireOldFile(folder: string, file: string, native: string): void;
  conflictSiblings(files: string[]): Record<string, string>;
};
const hash = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
let folder: string;
beforeEach(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gfde-identity-')); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); fs.rmSync(folder, { recursive: true, force: true }); });

describe('GFD Studio E file identity and legacy imports', () => {
  it('opens a legacy project and saves a native file with the original preserved', () => {
    const original = JSON.stringify({ ...sampleProject, format: 'lvds.project', name: 'Legacy project' });
    fs.writeFileSync(path.join(folder, 'Legacy.lvds'), original);
    expect(listProjects(folder).map((p) => p.file)).toContain('Legacy.lvds');
    const opened = openProject({ ref: 'Legacy', folder, anywhere: false });
    expect(opened.project.name).toBe('Legacy project');
    const native = disk.nativeFileName(folder, 'Legacy.lvds');
    expect(native).toBe('Legacy.gfde');
    disk.writeFileSafe(path.join(folder, native), disk.projectText(opened.project), { verifyJson: true });
    disk.retireOldFile(folder, 'Legacy.lvds', native);
    expect(fs.readFileSync(path.join(folder, `${native}.bak`), 'utf8')).toBe(original);
    expect(JSON.parse(fs.readFileSync(path.join(folder, native), 'utf8')).format).toBe('gfde.project');
    expect(resolveProject({ ref: 'Legacy', folder, anywhere: false })).toBe(path.join(folder, native));
  });

  it('never overwrites a same-named native project or an earlier backup while migrating', () => {
    fs.writeFileSync(path.join(folder, 'Tower.lvds'), 'legacy');
    fs.writeFileSync(path.join(folder, 'Tower.gfde'), 'native');
    fs.writeFileSync(path.join(folder, 'Tower-2.json'), 'older');
    expect(disk.uniqueFileName(folder, 'Tower')).toBe('Tower-3.gfde');
    expect(disk.nativeFileName(folder, 'Tower.lvds')).toBe('Tower-3.gfde');
    fs.writeFileSync(path.join(folder, 'Tower-3.gfde.bak'), 'prior backup');
    disk.retireOldFile(folder, 'Tower.lvds', 'Tower-3.gfde');
    expect(fs.readFileSync(path.join(folder, 'Tower.gfde'), 'utf8')).toBe('native');
    expect(fs.readFileSync(path.join(folder, 'Tower-3.gfde.bak'), 'utf8')).toBe('prior backup');
    expect(fs.readFileSync(path.join(folder, 'Tower-3.gfde.legacy-2.bak'), 'utf8')).toBe('legacy');
  });

  it('recognizes conflicts across native and legacy project extensions', () => {
    expect(disk.conflictSiblings(['Job.gfde', 'Job (1).lvds', 'Tower.lvds', 'Tower (1).json'])).toEqual({ 'Job (1).lvds': 'Job.gfde', 'Tower (1).json': 'Tower.lvds' });
  });

  it('writes GFD backups and still verifies an unchanged legacy backup payload', async () => {
    const native = await buildBackup(sampleProject, [], '2.212');
    expect((await readBackup(native)).manifest.format).toBe('gfde-backup');
    const zip = await JSZip.loadAsync(native);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    zip.file('manifest.json', JSON.stringify({ ...manifest, format: 'lvds-backup' }));
    const legacy = await zip.generateAsync({ type: 'uint8array' });
    expect((await readBackup(legacy)).project).toEqual({ ...sampleProject, format: 'gfde.project' });
    zip.file('project.json', JSON.stringify({ ...sampleProject, name: 'Tampered' }));
    await expect(readBackup(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/check does not match/);
  });

  it('checks legacy exchange hashes before any identity normalization', () => {
    const pkg = {
      schema: 'lvds.exchange', version: 1, kind: 'rooms', source: { app: 'lvds', file: 'Old.lvds' },
      exportedAt: '2026-11-20T12:00:00Z', items: [{ sourceId: 'R1', building: 'Main', level: 'GF', name: 'Room', netAreaM2: 20 }]
    };
    const sha256 = hash(hashedText(pkg));
    const result = readPackage({ ...pkg, sha256 }, hash);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.hash).toBe(sha256); expect(result.pkg.schema).toBe('lvds.exchange'); expect(result.pkg.source.app).toBe('lvds'); }
    expect(readPackage({ ...pkg, schema: 'gfde.exchange', sha256 }, hash)).toMatchObject({ ok: false, errors: [{ field: 'sha256' }] });
  });
});

describe('headless profile compatibility', () => {
  it('prefers GFD environment settings and still accepts explicit legacy automation paths', () => {
    vi.stubEnv('GFDE_APP_DATA', ''); vi.stubEnv('LVDS_APP_DATA', path.join(folder, 'legacy-profile'));
    vi.stubEnv('GFDE_PROJECTS', ''); vi.stubEnv('LVDS_PROJECTS', path.join(folder, 'legacy-projects'));
    expect(appDataDir()).toBe(path.join(folder, 'legacy-profile'));
    expect(projectsFolder()).toBe(path.join(folder, 'legacy-projects'));
    vi.stubEnv('GFDE_APP_DATA', path.join(folder, 'gfd-profile')); vi.stubEnv('GFDE_PROJECTS', path.join(folder, 'gfd-projects'));
    expect(appDataDir()).toBe(path.join(folder, 'gfd-profile'));
    expect(projectsFolder()).toBe(path.join(folder, 'gfd-projects'));
  });

  it('keeps selected folders and recovery protection before the desktop imports a legacy profile', () => {
    for (const key of ['GFDE_APP_DATA', 'LVDS_APP_DATA', 'GFDE_PROJECTS', 'LVDS_PROJECTS']) vi.stubEnv(key, '');
    vi.spyOn(os, 'homedir').mockReturnValue(folder);
    vi.stubEnv('XDG_CONFIG_HOME', path.join(folder, 'config')); vi.stubEnv('APPDATA', path.join(folder, 'roaming'));
    const parent = path.dirname(appDataDir()), old = path.join(parent, 'LV Design Studio');
    fs.mkdirSync(path.join(old, 'recovery'), { recursive: true });
    fs.writeFileSync(path.join(old, 'settings.json'), JSON.stringify({ projectsFolder: path.join(folder, 'My jobs') }));
    fs.writeFileSync(path.join(old, 'recovery', 'job-1.json'), '{}');
    expect(projectsFolder()).toBe(path.join(folder, 'My jobs'));
    expect(unsavedCopyInApp('job-1')).toBe(path.join(old, 'recovery', 'job-1.json'));
    fs.mkdirSync(appDataDir(), { recursive: true });
    fs.writeFileSync(path.join(appDataDir(), 'settings.json'), JSON.stringify({ projectsFolder: path.join(folder, 'New jobs') }));
    expect(projectsFolder()).toBe(path.join(folder, 'New jobs'));
  });
});
