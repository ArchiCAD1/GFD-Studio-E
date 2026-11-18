/** "Learn from folder" (spec C5): an existing job folder's folder names turned into a folder template.
 * Only folder names are read (electron/folderScan.cjs on the desktop, the browser's folder picker on the
 * web); files are counted, never opened or listed. Everything else here is pure. */

import { matchScore } from './folderMatch';
import { ROLE_CATALOGUE, roleById } from './folderRoles';
import { detectNumbering, type FolderNode, type FolderNumbering, type FolderTemplate } from './folderTemplates';

export const SCAN_LIMITS = Object.freeze({ maxDepth: 6, maxFolders: 500 });

/** One folder found on disk: its name, how many files it holds (not their names) and its subfolders. */
export interface ScannedFolder { name: string; files: number; children: ScannedFolder[] }

export interface FolderScan {
  /** The chosen folder's own name (its path stays on this computer). */
  name: string;
  /** Files lying in the chosen folder itself. */
  files: number;
  folders: ScannedFolder[];
  /** Folders read, levels reached and files counted, below the chosen folder. */
  count: number;
  depth: number;
  totalFiles: number;
  /** More folders than SCAN_LIMITS.maxFolders, or folders deeper than maxDepth, were not read. */
  truncated: boolean;
  deeper: boolean;
  /** Hidden and system folders and links that were skipped; folders that could not be read. */
  skipped: number;
  unreadable: number;
}

/** Hidden and system folders never read: dot folders, "$RECYCLE.BIN", "~$…", NAS and archive leftovers. */
export const SKIP_FOLDER = /^(?:\.|\$|~\$)|^(?:@eaDir|__MACOSX|System Volume Information|#recycle|#snapshot)$/i;

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** The browser's folder handle, as far as names go (File System Access API). */
export interface DirHandle { kind: 'directory'; name: string; values: () => AsyncIterable<DirHandle | { kind: 'file'; name: string }> }

/** Reads a folder's names through the browser's folder picker handle: breadth first, so the top levels are
 * all read before the limit is reached. Files are only counted. */
export async function scanHandle(dir: DirHandle, limits: { maxDepth: number; maxFolders: number } = SCAN_LIMITS): Promise<FolderScan> {
  const top: ScannedFolder = { name: dir.name, files: 0, children: [] };
  const out = { count: 0, depth: 0, totalFiles: 0, truncated: false, deeper: false, skipped: 0, unreadable: 0 };
  const queue: { h: DirHandle; node: ScannedFolder; depth: number }[] = [{ h: dir, node: top, depth: 0 }];
  while (queue.length) {
    const { h, node, depth } = queue.shift()!;
    const subs: DirHandle[] = [];
    try {
      for await (const e of h.values()) {
        if (e.kind === 'file') { node.files++; if (depth > 0) out.totalFiles++; continue; }
        if (SKIP_FOLDER.test(e.name)) { out.skipped++; continue; }
        subs.push(e);
      }
    } catch { out.unreadable++; continue; }
    subs.sort((a, b) => byName(a.name, b.name));
    for (const s of subs) {
      if (depth + 1 > limits.maxDepth) { out.deeper = true; continue; }
      if (out.count >= limits.maxFolders) { out.truncated = true; continue; }
      const child: ScannedFolder = { name: s.name, files: 0, children: [] };
      node.children.push(child);
      out.count++;
      out.depth = Math.max(out.depth, depth + 1);
      queue.push({ h: s, node: child, depth: depth + 1 });
    }
  }
  return { name: top.name, files: top.files, folders: top.children, ...out };
}

/** Names that look like a revision or a date ("Rev A 12-03", "2024-05-01", "20240501", "P01"): one issue's
 * folder, not a folder every project needs. Suggested as left out. */
export function isIssueFolder(name: string): boolean {
  const s = name.trim();
  return /^(?:\d{1,3}[_.\- ]\s*)?rev(?:ision)?(?:[\s_.-]+[A-Z0-9]{1,3}|\d{1,3})(?:\b|_)/i.test(s)
    || /^\d{4}[-_. ]\d{1,2}[-_. ]\d{1,2}\b/.test(s)
    || /^\d{1,2}[-_. ]\d{1,2}[-_. ]\d{2,4}$/.test(s)
    || /^(?:19|20)\d{6}\b/.test(s)
    || /^[PC]\d{2}(?:\.\d{1,2})?$/.test(s);
}

/** A project number and name at the start of the chosen folder's name ("2309_Jumeirah Park Villas",
 * "P-2417 Villas"): the template uses {ProjectNo}_{ProjectShort} instead, with the separator found. */
export function rootPattern(name: string): { number: string; short: string; pattern: string } | undefined {
  const m = name.trim().match(/^((?:[A-Z]{1,4}-?)?\d{3,6}(?:-\d{1,4})?)([_\- ]+)(\S.*)$/);
  if (!m) return undefined;
  const sep = m[2].trim() ? m[2].trim()[0] : '_';
  return { number: m[1], short: m[3], pattern: `{ProjectNo}${sep}{ProjectShort}` };
}

/** A name from disk made safe as a template folder name: characters templates refuse become "-", braces
 * (which mark fields) become brackets, and a trailing dot or space goes. */
export function templateName(name: string): string {
  const s = [...name].map((c) => (c < ' ' ? ' ' : c)).join('')
    .replace(/[<>:"/\\|?*&#%]/g, '-').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return !s || s === '.' || s === '..' ? 'Folder' : /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(s) ? `${s}_` : s;
}

/** One folder of the scan, in tree order. `path` joins the names with "/" and is the row's key. */
export interface LearnRow {
  path: string;
  name: string;
  depth: number;
  files: number;
  /** The best role for this folder at 0.6 or more, when that role is not better used elsewhere. */
  suggestion?: { role: string; score: number };
  /** The best score this folder reached for any role, shown as "below 0.6" when it got no suggestion. */
  best: number;
  /** Looks like a revision or date folder. */
  issue: boolean;
}

/** Every scanned folder in tree order, with its suggestion. A role is suggested once: the folder with the
 * highest score gets it (shallower first on a tie), and a folder gets one role. Folders inside an issue
 * folder get no suggestion. */
export function learnRows(scan: FolderScan, minScore = 0.6): LearnRow[] {
  const rows: LearnRow[] = [];
  const scores: { row: LearnRow; role: string; score: number }[] = [];
  const walk = (fs: readonly ScannedFolder[], parent: string, depth: number, inIssue: boolean) => {
    for (const f of fs) {
      const path = parent ? `${parent}/${f.name}` : f.name;
      const issue = isIssueFolder(f.name);
      const row: LearnRow = { path, name: f.name, depth, files: f.files, best: 0, issue };
      rows.push(row);
      if (!issue && !inIssue) {
        for (const { id } of ROLE_CATALOGUE) {
          const score = matchScore(f.name, id);
          if (score > row.best) row.best = score;
          if (score >= minScore) scores.push({ row, role: id, score });
        }
      }
      walk(f.children, path, depth + 1, inIssue || issue);
    }
  };
  walk(scan.folders, '', 1, false);
  const order = new Map(rows.map((r, i) => [r, i]));
  scores.sort((a, b) => b.score - a.score || a.row.depth - b.row.depth || order.get(a.row)! - order.get(b.row)!);
  const used = new Set<string>();
  for (const s of scores) {
    if (used.has(s.role) || s.row.suggestion) continue;
    s.row.suggestion = { role: s.role, score: s.score };
    used.add(s.role);
  }
  return rows;
}

/** What the user decided on the Review step. */
export interface LearnChoices {
  /** path → role ("" for none). Missing paths use the row's suggestion. */
  roles: Record<string, string>;
  /** Paths left out of the template, with their subfolders. */
  leaveOut: ReadonlySet<string>;
  /** Use {ProjectNo}_{ProjectShort} for the project folder's name. */
  replaceRoot: boolean;
}

/** The choices the wizard starts with: the suggestions, and every revision / date folder left out. */
export const startChoices = (scan: FolderScan, rows: readonly LearnRow[]): LearnChoices => ({
  roles: {},
  leaveOut: new Set(rows.filter((r) => r.issue && !rows.some((p) => p.issue && r.path.startsWith(`${p.path}/`))).map((r) => r.path)),
  replaceRoot: !!rootPattern(scan.name)
});

/** The role a row ends up with. */
export const rowRole = (row: LearnRow, c: LearnChoices): string => c.roles[row.path] ?? row.suggestion?.role ?? '';

/** Whether the row is inside a folder that is left out (its own leave-out does not count). */
export const insideLeftOut = (path: string, leaveOut: ReadonlySet<string>): boolean =>
  [...leaveOut].some((p) => path.startsWith(`${p}/`));

/** Gives `role` to the row at `path` and takes it off any other row, so a role stays on one folder. */
export function chooseRole(rows: readonly LearnRow[], c: LearnChoices, path: string, role: string): LearnChoices {
  const roles = { ...c.roles, [path]: role };
  if (role) for (const r of rows) if (r.path !== path && rowRole(r, { ...c, roles }) === role) roles[r.path] = '';
  return { ...c, roles };
}

/** Every suggestion taken, and every revision / date folder left out ("Accept all"). */
export function acceptAll(scan: FolderScan, rows: readonly LearnRow[], c: LearnChoices): LearnChoices {
  const start = startChoices(scan, rows);
  const roles: Record<string, string> = {};
  for (const r of rows) if (r.suggestion) roles[r.path] = r.suggestion.role;
  return { ...c, roles, leaveOut: new Set([...c.leaveOut, ...start.leaveOut]) };
}

/** The numbering style of the chosen folder's first level ("A-Admin, B-Received…" → "A-"), kept as it is. */
export const scanNumbering = (scan: FolderScan): FolderNumbering => detectNumbering(scan.folders.map((f) => f.name));

/** The template the scan and the choices make. Names are kept as found (made safe), ids come from the
 * names, folders left out are dropped with their subfolders, and the roles go on their folders. */
export function learnedTemplate(scan: FolderScan, rows: readonly LearnRow[], c: LearnChoices, base: Pick<FolderTemplate, 'id' | 'name' | 'naming'>): FolderTemplate {
  const byPath = new Map(rows.map((r) => [r.path, r]));
  const used = new Set<string>();
  const build = (fs: readonly ScannedFolder[], parent: string, parentId: string): FolderNode[] => {
    const taken = new Set<string>();
    const out: FolderNode[] = [];
    for (const f of fs) {
      const path = parent ? `${parent}/${f.name}` : f.name;
      if (c.leaveOut.has(path)) continue;
      let name = templateName(f.name);
      for (let k = 2; taken.has(name.toLowerCase()); k++) name = `${templateName(f.name)} (${k})`;
      taken.add(name.toLowerCase());
      const slug = name.replace(/^[0-9A-Z]{1,2}[_.-]/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'f';
      let id = `${parentId}.${slug}`;
      while (used.has(id)) id += 'x';
      used.add(id);
      const row = byPath.get(path);
      const role = row ? rowRole(row, c) : '';
      const node: FolderNode = { id, name };
      if (role && roleById(role)) node.role = role;
      const children = build(f.children, path, id);
      if (children.length) node.children = children;
      out.push(node);
    }
    return out;
  };
  const root = rootPattern(scan.name);
  return {
    id: base.id, name: base.name, version: 0, layout: 'blank',
    root: c.replaceRoot && root ? root.pattern : templateName(scan.name),
    numbering: scanNumbering(scan),
    naming: base.naming,
    folders: build(scan.folders, '', 'l')
  };
}
