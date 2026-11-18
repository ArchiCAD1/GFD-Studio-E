// "Learn from folder" (spec C5): the folder names under a job folder the user chose. Plain Node, unit
// tested in a temporary folder (src/model/folderScan.test.ts).
//
// Read-only. Only folder names are read; files are counted, never opened, and their names are not kept.
// No link is followed (a link is skipped, and a chosen folder that is a link is refused). Hidden and
// system folders are skipped. At most 6 levels and 500 folders, the top levels first.

const fs = require('node:fs/promises');
const path = require('node:path');
const check = require('./ipcValidate.cjs');

const LIMITS = Object.freeze({ maxDepth: 6, maxFolders: 500 });
// The same rule as SKIP_FOLDER in src/model/folderLearn.ts.
const SKIP = /^(?:\.|\$|~\$)|^(?:@eaDir|__MACOSX|System Volume Information|#recycle|#snapshot)$/i;
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** The FolderScan of src/model/folderLearn.ts for the folder at `root`. */
async function scanNames(root, limits = LIMITS) {
  const full = check.scanRoot(root);
  const st = await fs.lstat(full);
  if (st.isSymbolicLink()) throw new Error('The chosen folder is a link; choose the folder itself.');
  if (!st.isDirectory()) throw new Error('The chosen item is not a folder.');
  const top = { name: path.basename(full), files: 0, children: [] };
  const out = { count: 0, depth: 0, totalFiles: 0, truncated: false, deeper: false, skipped: 0, unreadable: 0 };
  const queue = [{ abs: full, node: top, depth: 0 }];
  while (queue.length) {
    const { abs, node, depth } = queue.shift();
    let entries;
    try { entries = await fs.readdir(abs, { withFileTypes: true }); } catch { out.unreadable++; continue; }
    const subs = [];
    for (const d of entries) {
      if (d.isSymbolicLink()) { out.skipped++; continue; }
      if (d.isFile()) { node.files++; if (depth > 0) out.totalFiles++; continue; }
      if (!d.isDirectory()) continue;
      if (SKIP.test(d.name)) { out.skipped++; continue; }
      subs.push(d.name);
    }
    subs.sort(byName);
    for (const name of subs) {
      if (depth + 1 > limits.maxDepth) { out.deeper = true; continue; }
      if (out.count >= limits.maxFolders) { out.truncated = true; continue; }
      const child = { name, files: 0, children: [] };
      node.children.push(child);
      out.count++;
      out.depth = Math.max(out.depth, depth + 1);
      queue.push({ abs: path.join(abs, name), node: child, depth: depth + 1 });
    }
  }
  return { name: top.name, files: top.files, folders: top.children, ...out };
}

module.exports = { LIMITS, SKIP, scanNames };
