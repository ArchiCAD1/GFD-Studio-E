import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const database = createRequire(import.meta.url)('../../electron/database.cjs') as {
  setFolder: (folder: string | null) => void;
  writeLibrary: (projectsFolder: string, data: Record<string, unknown>) => boolean;
};

describe('legacy shared library preservation', () => {
  let root: string;
  const original = '{\n  "lvds.components": [{"id":"custom"}],\n  "lvds.sldNotes": ["Keep this"]\n}\n';
  const backupName = () => `Library.pre-gfde-${createHash('sha256').update(original).digest('hex').slice(0, 16)}.json.bak`;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gfde-library-migration-'));
    database.setFolder(root);
    writeFileSync(join(root, 'Library.json'), original);
  });
  afterEach(() => { database.setFolder(null); rmSync(root, { recursive: true, force: true }); });

  it('preserves the exact original before replacing legacy keys and does not overwrite its backup later', () => {
    expect(database.writeLibrary(root, { 'gfde.components': [{ id: 'custom' }] })).toBe(true);
    expect(readFileSync(join(root, backupName()), 'utf8')).toBe(original);
    expect(JSON.parse(readFileSync(join(root, 'Library.json'), 'utf8'))).toEqual({ 'gfde.components': [{ id: 'custom' }] });
    database.writeLibrary(root, { 'gfde.components': [{ id: 'edited' }] });
    expect(readFileSync(join(root, backupName()), 'utf8')).toBe(original);
    expect(readdirSync(root).filter((name) => name.endsWith('.bak'))).toEqual([backupName()]);
  });

  it('retains another exact revision if the legacy app later changes its library', () => {
    database.writeLibrary(root, { 'gfde.components': [] });
    const later = '{"lvds.components":[{"id":"second"}]}';
    writeFileSync(join(root, 'Library.json'), later);
    database.writeLibrary(root, { 'gfde.components': [{ id: 'second' }] });
    const saved = readdirSync(root).filter((name) => name.endsWith('.bak')).map((name) => readFileSync(join(root, name), 'utf8'));
    expect(saved).toEqual(expect.arrayContaining([original, later]));
  });

  it('refuses a conflicting backup and preserves the live original', () => {
    writeFileSync(join(root, backupName()), 'other content');
    expect(() => database.writeLibrary(root, { 'gfde.components': [] })).toThrow(/backup is different/);
    expect(readFileSync(join(root, 'Library.json'), 'utf8')).toBe(original);
  });

  it.skipIf(process.platform === 'win32')('refuses links at the backup or current library without touching their targets', () => {
    const victim = join(root, 'do-not-change'); writeFileSync(victim, 'private');
    symlinkSync(victim, join(root, backupName()));
    expect(() => database.writeLibrary(root, { 'gfde.components': [] })).toThrow(/is a link/);
    expect(readFileSync(join(root, 'Library.json'), 'utf8')).toBe(original);
    rmSync(join(root, 'Library.json')); symlinkSync(victim, join(root, 'Library.json'));
    expect(() => database.writeLibrary(root, { 'gfde.components': [] })).toThrow(/is a link/);
    expect(readFileSync(victim, 'utf8')).toBe('private');
  });

  it('refuses to replace a corrupt original with an empty library', () => {
    writeFileSync(join(root, 'Library.json'), '{broken');
    expect(() => database.writeLibrary(root, {})).toThrow(/has not been overwritten/);
    expect(readFileSync(join(root, 'Library.json'), 'utf8')).toBe('{broken');
  });
});
