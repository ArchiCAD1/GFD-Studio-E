// Import an existing desktop profile once, before Chromium opens it. Originals are never moved or
// overwritten; lock/cache files are not copied. Subsequent launches use only the GFD profile.
const fs = require('node:fs');
const path = require('node:path');
const safeFs = require('./safeFs.cjs');

const APP_NAME = 'GFD Studio E';
const LEGACY_APP_NAMES = ['LV Design Studio', 'lv-design-studio'];
const PROFILE_ITEMS = ['settings.json', 'folder-templates.json', 'projects-index.json', 'recovery.json', 'recovery', 'Local Storage', 'IndexedDB'];
const MARKER = 'gfd-profile-migration.json';
const BROWSER_STORES = new Set(['Local Storage', 'IndexedDB']);
const lockFile = (name) => name === 'LOCK' || name.endsWith('.lock');

function exists(file) {
  try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function realDirectory(dir) {
  try { const st = fs.lstatSync(dir); return st.isDirectory() && !st.isSymbolicLink(); } catch { return false; }
}

function copyMissing(source, target, copied, skipped) {
  const st = fs.lstatSync(source);
  if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) { skipped.push(path.basename(source)); return; }
  if (st.isDirectory()) {
    if (fs.existsSync(target) && !realDirectory(target)) { skipped.push(path.basename(target)); return; }
    safeFs.ensureRealDir(target);
    for (const name of fs.readdirSync(source)) {
      if (lockFile(name)) continue;
      copyMissing(path.join(source, name), path.join(target, name), copied, skipped);
    }
  } else {
    // An existing file (including a dangling link) belongs to the GFD profile and must never be replaced.
    try { fs.lstatSync(target); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const result = safeFs.readFileNoFollow(source, { max: 256 * 1024 * 1024 });
    if (result.tooLarge) { skipped.push(path.basename(source)); return; }
    safeFs.writeNewFile(target, result.buffer);
    copied.push(path.basename(source));
  }
}

/** File identities and modification metadata, including the complete directory listing. Reading can
 * update access times, so they are deliberately excluded. Links and special files cannot be a snapshot. */
function browserSnapshot(source) {
  const entries = [];
  const visit = (file, relative) => {
    const st = fs.lstatSync(file, { bigint: true });
    if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) throw new Error('Existing browser data contains an unsupported file; it has not been imported.');
    entries.push([relative, st.isDirectory() ? 'directory' : 'file', ...[st.dev, st.ino, st.size, st.mtimeNs, st.ctimeNs].map(String)]);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) if (!lockFile(name)) visit(path.join(file, name), path.join(relative, name));
    }
  };
  visit(source, '');
  return JSON.stringify(entries);
}

/** A browser database is published only as a complete, stable snapshot. A failed attempt leaves no
 * final directory, so another launch can retry; a database already used by GFD is never merged. */
function copyBrowserStore(source, target, copied) {
  if (exists(target)) return;
  if (!realDirectory(source)) throw new Error('Existing browser data is not a regular directory; it has not been imported.');
  const before = browserSnapshot(source);
  const staging = fs.mkdtempSync(path.join(path.dirname(target), '.gfde-profile-import-'));
  const staged = [], skipped = [];
  try {
    copyMissing(source, staging, staged, skipped);
    if (skipped.length) throw new Error('Some existing browser data could not be copied; the import will be retried.');
    if (browserSnapshot(source) !== before) throw new Error('Existing browser data changed during import. Close the previous application and try again.');
    if (exists(target)) throw new Error('The GFD browser profile changed during import. Close other GFD windows and try again.');
    fs.renameSync(staging, target);
    copied.push(...staged);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function defaultProjectsFolder(home) {
  const current = path.join(home, `${APP_NAME} Projects`);
  const legacy = path.join(home, 'LV Design Studio Projects');
  return !fs.existsSync(current) && realDirectory(legacy) ? legacy : current;
}

function migrateLegacyProfile(appData, target) {
  safeFs.ensureRealDir(target);
  const marker = path.join(target, MARKER);
  if (fs.existsSync(marker)) return { migrated: false, copied: [], skipped: [] };
  const source = LEGACY_APP_NAMES.map((name) => path.join(appData, name))
    .find((dir) => realDirectory(dir) && PROFILE_ITEMS.some((name) => fs.existsSync(path.join(dir, name))));
  if (!source || path.resolve(source) === path.resolve(target)) return { migrated: false, copied: [], skipped: [] };
  const copied = [], skipped = [];
  for (const name of PROFILE_ITEMS) {
    const item = path.join(source, name);
    try { fs.lstatSync(item); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (BROWSER_STORES.has(name)) copyBrowserStore(item, path.join(target, name), copied);
    else copyMissing(item, path.join(target, name), copied, skipped);
  }
  safeFs.writeNewFile(marker, JSON.stringify({ version: 1, migratedAt: new Date().toISOString(), copied, skipped }, null, 2));
  return { migrated: true, copied, skipped };
}

module.exports = { APP_NAME, LEGACY_APP_NAMES, PROFILE_ITEMS, defaultProjectsFolder, migrateLegacyProfile };
