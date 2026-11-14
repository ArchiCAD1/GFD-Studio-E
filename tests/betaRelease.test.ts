import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayVersion } from '../src/model/appVersion';
// @ts-expect-error — plain ESM release helper without type declarations
import { assetNames, deriveBetaVersion, parseChecksums, releaseMetadata, releaseNotes, selectLatestBeta } from '../scripts/beta-release.mjs';

const version = '2.144.0-beta.123';
const names = assetNames(version);
const checksum = (name: string, digit: string) => `${digit.repeat(64)}  ${name}`;
const release = () => ({
  tagName: `v${version}`,
  isPrerelease: true,
  publishedAt: '2026-11-14T08:30:00Z',
  targetCommitish: 'a'.repeat(40),
  assets: Object.values(names).map((name) => ({ name }))
});

describe('beta release metadata', () => {
  it('uses the next package minor and the monotonic workflow run number', () => {
    expect(deriveBetaVersion('2.143.0', '123')).toBe(version);
    expect(displayVersion(version)).toBe('2.144');
    expect(() => deriveBetaVersion('2.143.0-beta.1', '2')).toThrow();
    expect(() => deriveBetaVersion('2.143.0', '0')).toThrow();
  });

  it('uses deterministic installer names for the two supported beta platforms', () => {
    expect(names).toEqual({
      windows: `LV-Design-Studio-${version}-win-x64.exe`,
      macos: `LV-Design-Studio-${version}-mac-arm64.dmg`,
      checksums: 'SHA256SUMS.txt'
    });
  });

  it('selects the greatest SemVer beta prerelease, not a stable release', () => {
    expect(selectLatestBeta([
      { tagName: 'v2.144.0-beta.9', isPrerelease: true },
      { tagName: 'v2.144.0', isPrerelease: false },
      { tagName: 'v2.144.0-beta.10', isPrerelease: true },
      { tagName: 'untrusted', isPrerelease: true }
    ])?.tagName).toBe('v2.144.0-beta.10');
  });

  it('accepts only exact asset names, commit identity and two checksums', () => {
    const sums = `${checksum(names.windows, 'a')}\n${checksum(names.macos, 'b')}\n`;
    expect(releaseMetadata(release(), sums)).toMatchObject({ version, sourceCommit: 'a'.repeat(40), windows: { name: names.windows, sha256: 'a'.repeat(64) } });
    expect(() => releaseMetadata({ ...release(), targetCommitish: 'main' }, sums)).toThrow('commit');
    expect(() => releaseMetadata({ ...release(), assets: [{ name: names.windows }] }, sums)).toThrow('asset is missing');
    expect(() => parseChecksums(`${sums}${checksum('other.exe', 'c')}\n`)).not.toThrow();
    expect(() => releaseMetadata(release(), `${sums}${checksum('other.exe', 'c')}\n`)).toThrow('only the installers');
  });

  it('writes release notes with the unsigned and notification-only boundaries', () => {
    const notes = releaseNotes(version, 'a'.repeat(40));
    expect(notes).toContain('unsigned active-development build');
    expect(notes).toContain('Keep those operating-system protections enabled');
    expect(notes).toContain('never download, execute, replace, or install');
    expect(notes).not.toMatch(/xattr|spctl|--no-quarantine|disable Gatekeeper/i);
  });

  it('does not need secrets or mutate the repository to derive a version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lvds-beta-version-'));
    try {
      const file = join(dir, 'package.json');
      writeFileSync(file, JSON.stringify({ version: '2.143.0' }));
      expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe('2.143.0');
      expect(deriveBetaVersion(JSON.parse(readFileSync(file, 'utf8')).version, '42')).toBe('2.144.0-beta.42');
      expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe('2.143.0');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
