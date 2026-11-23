import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — Node-only build script without TypeScript declarations
import { MANIFEST, PART_SIZE, WASM, packCad, prepareCad } from '../scripts/prepare-cad.mjs';

const root = resolve(__dirname, '..');
const source = join(root, 'electron/cad');
const original = readFileSync(join(source, WASM));
const folders: string[] = [];
const temporary = () => {
  const directory = mkdtempSync(join(tmpdir(), 'gfde-cad-transport-'));
  folders.push(directory);
  return directory;
};
const fixture = () => {
  const directory = temporary();
  for (const name of readdirSync(source).filter((name) => name.startsWith(`${WASM}.gz.`))) copyFileSync(join(source, name), join(directory, name));
  return directory;
};
afterEach(() => { for (const directory of folders.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('CAD reader source transport', () => {
  it('packs reproducibly into bounded parts and restores identical bytes using Node alone', () => {
    const first = temporary(), second = temporary();
    for (const directory of [first, second]) {
      writeFileSync(join(directory, WASM), original);
      packCad(directory);
    }
    expect(readFileSync(join(first, MANIFEST)).equals(readFileSync(join(second, MANIFEST)))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(first, MANIFEST), 'utf8'));
    expect(manifest.parts.length).toBeGreaterThan(1);
    for (const part of manifest.parts) {
      const bytes = readFileSync(join(first, part.file));
      expect(bytes.length).toBeLessThanOrEqual(PART_SIZE);
      expect(bytes.equals(readFileSync(join(second, part.file)))).toBe(true);
    }
    rmSync(join(first, WASM));
    // An empty PATH proves preparation does not invoke Rust, gzip, or download tools.
    execFileSync(process.execPath, [join(root, 'scripts/prepare-cad.mjs'), first], { env: { ...process.env, PATH: join(first, 'no-tools') } });
    expect(readFileSync(join(first, WASM)).equals(original)).toBe(true);
  });
  it('detects a missing part even with a valid cached reader, preserving that reader', () => {
    const directory = fixture();
    writeFileSync(join(directory, WASM), original);
    rmSync(join(directory, `${WASM}.gz.part02`));
    expect(() => prepareCad(directory)).toThrow(/ENOENT/);
    expect(readFileSync(join(directory, WASM)).equals(original)).toBe(true);
  });
  it('rejects corrupt source bytes before creating any runtime file', () => {
    const directory = fixture();
    const file = join(directory, `${WASM}.gz.part01`);
    const bytes = readFileSync(file);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(file, bytes);
    expect(() => prepareCad(directory)).toThrow(/checksum mismatch/);
    expect(existsSync(join(directory, WASM))).toBe(false);
    expect(readdirSync(directory).some((name) => name.endsWith('.tmp'))).toBe(false);
  });
  it('verifies the final uncompressed checksum before replacing a local reader', () => {
    const directory = fixture();
    const manifest = JSON.parse(readFileSync(join(directory, MANIFEST), 'utf8'));
    manifest.sha256 = '0'.repeat(64);
    writeFileSync(join(directory, MANIFEST), JSON.stringify(manifest));
    writeFileSync(join(directory, WASM), 'keep existing output');
    expect(() => prepareCad(directory)).toThrow(/WebAssembly checksum mismatch/);
    expect(readFileSync(join(directory, WASM), 'utf8')).toBe('keep existing output');
  });
  it('rejects filenames outside the ordered part set', () => {
    const directory = fixture();
    const manifest = JSON.parse(readFileSync(join(directory, MANIFEST), 'utf8'));
    manifest.parts[0].file = '../outside-file';
    writeFileSync(join(directory, MANIFEST), JSON.stringify(manifest));
    expect(() => prepareCad(directory)).toThrow(/invalid filename/);
  });
  it('removes obsolete surplus parts when a rebuilt reader becomes smaller', () => {
    const directory = fixture();
    writeFileSync(join(directory, WASM), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    const manifest = packCad(directory);
    expect(manifest.parts).toHaveLength(1);
    expect(readdirSync(directory).filter((name) => name.includes('.part'))).toEqual([`${WASM}.gz.part01`]);
    rmSync(join(directory, WASM));
    prepareCad(directory);
    expect(readFileSync(join(directory, WASM))).toEqual(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
  });
});
