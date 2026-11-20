// The source checkout stores the exact CAD reader as small, checksummed gzip parts.
// Normal installs/builds need only Node; --pack is called after a real Rust rebuild.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

export const PART_SIZE = 384 * 1024;
export const WASM = 'gfde_cad_reader_bg.wasm';
export const MANIFEST = `${WASM}.gz.json`;
const defaultDirectory = fileURLToPath(new URL('../electron/cad/', import.meta.url));
const maxWasmSize = 64 * 1024 * 1024;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const partName = (index) => `${WASM}.gz.part${String(index + 1).padStart(2, '0')}`;
const check = (ok, message) => { if (!ok) throw new Error(`CAD asset: ${message}`); };

function writeAtomic(file, bytes) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o644 });
    renameSync(temporary, file);
  } finally { rmSync(temporary, { force: true }); }
}

/** Regenerate committed transport files from the freshly rebuilt WebAssembly. */
export function packCad(directory = defaultDirectory) {
  const wasm = readFileSync(join(directory, WASM));
  check(wasm.length >= 8 && wasm.length <= maxWasmSize && wasm.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])), 'input is not a supported WebAssembly file');
  const compressed = gzipSync(wasm, { level: 9 });
  // Omit timestamps and normalize the gzip OS header; filenames are never stored.
  compressed.writeUInt32LE(0, 4);
  compressed[9] = 255;
  const parts = [];
  for (let offset = 0; offset < compressed.length; offset += PART_SIZE) {
    const bytes = compressed.subarray(offset, offset + PART_SIZE);
    parts.push({ file: partName(parts.length), size: bytes.length, sha256: digest(bytes) });
  }
  check(parts.length <= 99, 'compressed reader exceeds the supported part count');
  const manifest = { version: 1, file: WASM, encoding: 'gzip', size: wasm.length, sha256: digest(wasm), compressedSize: compressed.length, compressedSha256: digest(compressed), partSize: PART_SIZE, parts };
  for (let index = 0; index < parts.length; index++) {
    writeAtomic(join(directory, parts[index].file), compressed.subarray(index * PART_SIZE, (index + 1) * PART_SIZE));
  }
  writeAtomic(join(directory, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of readdirSync(directory)) {
    if (/^gfde_cad_reader_bg\.wasm\.gz\.part\d+$/.test(file) && !parts.some((part) => part.file === file)) rmSync(join(directory, file));
  }
  return manifest;
}

/** Verify all source parts before atomically restoring the ignored runtime file. */
export function prepareCad(directory = defaultDirectory) {
  const manifest = JSON.parse(readFileSync(join(directory, MANIFEST), 'utf8'));
  check(manifest.version === 1 && manifest.file === WASM && manifest.encoding === 'gzip' && manifest.partSize === PART_SIZE, 'unsupported manifest');
  check(Number.isSafeInteger(manifest.size) && manifest.size >= 8 && manifest.size <= maxWasmSize && validHash(manifest.sha256), 'invalid WebAssembly size or checksum');
  check(Array.isArray(manifest.parts) && manifest.parts.length > 0 && manifest.parts.length <= 99, 'invalid part list');
  check(Number.isSafeInteger(manifest.compressedSize) && manifest.compressedSize > 0 && manifest.compressedSize <= PART_SIZE * manifest.parts.length && validHash(manifest.compressedSha256), 'invalid gzip size or checksum');
  const parts = manifest.parts.map((part, index) => {
    check(part.file === partName(index), `invalid filename for part ${index + 1}`);
    check(Number.isSafeInteger(part.size) && part.size > 0 && part.size <= PART_SIZE && (index === manifest.parts.length - 1 || part.size === PART_SIZE) && validHash(part.sha256), `invalid metadata for ${part.file}`);
    const bytes = readFileSync(join(directory, part.file));
    check(bytes.length === part.size && digest(bytes) === part.sha256, `checksum mismatch for ${part.file}`);
    return bytes;
  });
  const compressed = Buffer.concat(parts);
  check(compressed.length === manifest.compressedSize && digest(compressed) === manifest.compressedSha256, 'combined gzip checksum mismatch');
  const wasm = gunzipSync(compressed, { maxOutputLength: manifest.size });
  check(wasm.length === manifest.size && digest(wasm) === manifest.sha256, 'WebAssembly checksum mismatch');
  const output = join(directory, WASM);
  if (!existsSync(output) || !readFileSync(output).equals(wasm)) writeAtomic(output, wasm);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const packing = args[0] === '--pack';
    if (packing) args.shift();
    check(args.length <= 1 && !args[0]?.startsWith('--'), 'usage: node scripts/prepare-cad.mjs [--pack] [directory]');
    const manifest = (packing ? packCad : prepareCad)(args[0] ? resolve(args[0]) : defaultDirectory);
    console.log(`CAD reader ${packing ? 'packed' : 'verified'}: ${manifest.size} bytes, SHA-256 ${manifest.sha256}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
