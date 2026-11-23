import { describe, expect, it } from 'vitest';
import {
  acceptAll, chooseRole, insideLeftOut, isIssueFolder, learnedTemplate, learnRows, rootPattern, rowRole, scanHandle, scanNumbering, startChoices, templateName,
  type DirHandle, type FolderScan, type ScannedFolder
} from './folderLearn';
import { webFolderScan } from './folderTemplatesClient';
import { assignedRoles, countFolders, validateTemplate, type NamingRule } from './folderTemplates';

/** "Name:files" lines, two spaces of indent a level. */
function tree(text: string): ScannedFolder[] {
  const root: ScannedFolder[] = [];
  const stack: { depth: number; kids: ScannedFolder[] }[] = [{ depth: -1, kids: root }];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    const depth = (raw.length - raw.trimStart().length) / 2;
    const [name, files] = raw.trim().split(':');
    while (stack[stack.length - 1].depth >= depth) stack.pop();
    const f: ScannedFolder = { name, files: Number(files ?? 0), children: [] };
    stack[stack.length - 1].kids.push(f);
    stack.push({ depth, kids: f.children });
  }
  return root;
}
const scanOf = (name: string, folders: ScannedFolder[]): FolderScan => {
  let count = 0, depth = 0, totalFiles = 0;
  const walk = (fs: ScannedFolder[], d: number) => fs.forEach((f) => { count++; depth = Math.max(depth, d); totalFiles += f.files; walk(f.children, d + 1); });
  walk(folders, 1);
  return { name, files: 0, folders, count, depth, totalFiles, truncated: false, deeper: false, skipped: 0, unreadable: 0 };
};

// The office tree of the approved mockup (C5).
const VILLAS = scanOf('2309_Jumeirah Park Villas', tree(`
A-Admin:3
  Minutes:14
B-Received
  Arch
    2024-05-01:22
    Rev A 12-03:18
C-Calc
  VD:9
  SC:4
  Lux:6
D-Drawings
  IFC:31
  Old:40
E-DEWA:7
F-BOQ:5
G-Transmittals:12
H-Site
  Snags:3`));
const NAMING: NamingRule = { preset: 'office', pattern: '{ProjectNo}-{Discipline}-{Type}-{Seq:3}-{Rev}', separator: '-', discipline: 'E' };
const role = (rows: ReturnType<typeof learnRows>, path: string) => rows.find((r) => r.path === path)?.suggestion?.role;

describe('revision and date folders', () => {
  it('are recognised and suggested as left out', () => {
    for (const n of ['Rev A 12-03', 'Rev-B', 'Rev01', 'Revision C', '2024-05-01', '2024_05_01 issue', '12-03-2024', '20240501', 'P01', 'C02.1', '03_Rev A'])
      expect([n, isIssueFolder(n)]).toEqual([n, true]);
  });
  it('are not confused with ordinary folders', () => {
    for (const n of ['Review', 'Internal Review', 'Revisions', 'Arch', 'IFC', '2309_Villas', 'Calcs 2', 'Phase 2', 'Old', 'C-Calc'])
      expect([n, isIssueFolder(n)]).toEqual([n, false]);
  });
});

describe('the project number and name in the folder name', () => {
  it('becomes {ProjectNo}_{ProjectShort}, keeping the separator', () => {
    expect(rootPattern('2309_Jumeirah Park Villas')).toEqual({ number: '2309', short: 'Jumeirah Park Villas', pattern: '{ProjectNo}_{ProjectShort}' });
    expect(rootPattern('P-2417 Al Barsha')?.pattern).toBe('{ProjectNo}_{ProjectShort}');
    expect(rootPattern('P-2417-Al Barsha')).toMatchObject({ number: 'P-2417', pattern: '{ProjectNo}-{ProjectShort}' });
    expect(rootPattern('Jumeirah Park Villas')).toBeUndefined();
    expect(rootPattern('12_Admin')).toBeUndefined();
  });
});

describe('suggested roles (C5 step 2)', () => {
  const rows = learnRows(VILLAS);
  it('match an office tree like the mockup', () => {
    expect(role(rows, 'A-Admin/Minutes')).toBe('minutes');
    expect(role(rows, 'B-Received/Arch')).toBe('receivedArch');
    expect(role(rows, 'C-Calc/VD')).toBe('calcVd');
    expect(role(rows, 'C-Calc/SC')).toBe('calcFault');
    expect(role(rows, 'C-Calc/Lux')).toBe('calcLighting');
    expect(role(rows, 'D-Drawings/IFC')).toBe('drawingsIssued');
    expect(role(rows, 'D-Drawings/Old')).toBe('drawingsSuperseded');
    expect(role(rows, 'E-DEWA')).toBe('authDewa');
    expect(role(rows, 'F-BOQ')).toBe('boq');
    expect(role(rows, 'G-Transmittals')).toBe('transmittals');
    expect(role(rows, 'H-Site/Snags')).toBe('snags');
    expect(role(rows, 'A-Admin')).toBeUndefined();
  });
  it('give each role once, to the best match, and one role a folder', () => {
    const two = learnRows(scanOf('x', tree('Calcs\n  VD\nOld VD notes\nVD 2')));
    expect(two.filter((r) => r.suggestion?.role === 'calcVd').map((r) => r.path)).toEqual(['Calcs/VD']);
    const roles = rows.flatMap((r) => (r.suggestion ? [r.suggestion.role] : []));
    expect(new Set(roles).size).toBe(roles.length);
    expect(rows.every((r) => !r.suggestion || r.suggestion.score >= 0.6)).toBe(true);
  });
  it('leave revision and date folders out and suggest nothing inside them', () => {
    const c = startChoices(VILLAS, rows);
    expect([...c.leaveOut]).toEqual(['B-Received/Arch/2024-05-01', 'B-Received/Arch/Rev A 12-03']);
    expect(c.replaceRoot).toBe(true);
    const nested = learnRows(scanOf('x', tree('Rev A\n  VD')));
    expect(nested.find((r) => r.path === 'Rev A/VD')?.suggestion).toBeUndefined();
    expect([...startChoices(scanOf('x', tree('Rev A\n  Rev B')), learnRows(scanOf('x', tree('Rev A\n  Rev B')))).leaveOut]).toEqual(['Rev A']);
    expect(insideLeftOut('Rev A/VD', new Set(['Rev A']))).toBe(true);
    expect(insideLeftOut('Rev A', new Set(['Rev A']))).toBe(false);
  });
  it('a role chosen by hand moves off the folder that had it; Accept all brings the suggestions back', () => {
    let c = startChoices(VILLAS, rows);
    c = chooseRole(rows, c, 'A-Admin', 'boq');
    expect(rowRole(rows.find((r) => r.path === 'A-Admin')!, c)).toBe('boq');
    expect(rowRole(rows.find((r) => r.path === 'F-BOQ')!, c)).toBe('');
    c = acceptAll(VILLAS, rows, { ...c, leaveOut: new Set() });
    expect(rowRole(rows.find((r) => r.path === 'F-BOQ')!, c)).toBe('boq');
    expect(rowRole(rows.find((r) => r.path === 'A-Admin')!, c)).toBe('');
    expect(c.leaveOut.size).toBe(2);
  });
});

describe('the learned template (C5 step 3)', () => {
  it('keeps the names and numbering, drops left-out folders and passes the checks', () => {
    const rows = learnRows(VILLAS);
    const t = learnedTemplate(VILLAS, rows, startChoices(VILLAS, rows), { id: 'user-learn', name: 'Villas layout', naming: NAMING });
    expect(t.root).toBe('{ProjectNo}_{ProjectShort}');
    expect(t.numbering).toBe('A-');
    expect(scanNumbering(VILLAS)).toBe('A-');
    expect(t.folders.map((f) => f.name)).toEqual(['A-Admin', 'B-Received', 'C-Calc', 'D-Drawings', 'E-DEWA', 'F-BOQ', 'G-Transmittals', 'H-Site']);
    expect(countFolders(t.folders)).toBe(16);
    expect(assignedRoles(t.folders).size).toBe(12);
    expect(validateTemplate(t).filter((i) => i.level === 'error')).toEqual([]);
    const off = learnedTemplate(VILLAS, rows, { ...startChoices(VILLAS, rows), replaceRoot: false }, { id: 'user-learn', name: 'x', naming: NAMING });
    expect(off.root).toBe('2309_Jumeirah Park Villas');
  });
  it('makes names from disk safe, with unique ids and names', () => {
    expect(templateName('Calcs {old}')).toBe('Calcs (old)');
    expect(templateName('A&B: notes.')).toBe('A-B- notes');
    expect(templateName('CON')).toBe('CON_');
    const odd = scanOf('Job', tree('Fire & Life\nfire - life\nX#1\n  {Stage}'));
    const t = learnedTemplate(odd, learnRows(odd), startChoices(odd, learnRows(odd)), { id: 'user-x', name: 'x', naming: NAMING });
    expect(t.folders.map((f) => f.name)).toEqual(['Fire - Life', 'fire - life (2)', 'X-1']);
    expect(t.folders[2].children?.[0].name).toBe('(Stage)');
    expect(new Set(t.folders.map((f) => f.id)).size).toBe(3);
    expect(validateTemplate(t).filter((i) => i.level === 'error')).toEqual([]);
  });
});

/** A browser folder handle: its subfolders, then `files` files. */
function withFiles(name: string, files: number, kids: DirHandle[]): DirHandle {
  return { kind: 'directory', name, values: async function* () { yield* kids; for (let i = 0; i < files; i++) yield { kind: 'file' as const, name: `f${i}.pdf` }; } };
}

describe('reading a folder in the browser (File System Access API)', () => {
  it('reads folder names breadth first, counts files and skips hidden and system folders', async () => {
    const dir = withFiles('2309_Job', 2, [withFiles('B', 3, []), withFiles('A', 0, [withFiles('VD', 4, [])]), withFiles('.git', 9, []), withFiles('$RECYCLE.BIN', 0, []), withFiles('__MACOSX', 0, [])]);
    const s = await scanHandle(dir);
    expect(s).toMatchObject({ name: '2309_Job', files: 2, count: 3, depth: 2, totalFiles: 7, skipped: 3, truncated: false, deeper: false });
    expect(s.folders.map((f) => f.name)).toEqual(['A', 'B']);
    expect(s.folders[0].children).toEqual([{ name: 'VD', files: 4, children: [] }]);
  });
  it('stops at 6 levels and at the folder limit, keeping the top levels', async () => {
    let deep = withFiles('L7', 0, []);
    for (let i = 6; i >= 1; i--) deep = withFiles(`L${i}`, 0, [deep]);
    const s = await scanHandle(withFiles('root', 0, [deep]));
    expect([s.depth, s.count, s.deeper]).toEqual([6, 6, true]);
    const wide = withFiles('root', 0, Array.from({ length: 4 }, (_, i) => withFiles(`T${i}`, 0, [withFiles(`S${i}`, 0, [])])));
    const w = await scanHandle(wide, { maxDepth: 6, maxFolders: 5 });
    expect([w.count, w.truncated, w.folders.length]).toEqual([5, true, 4]);
  });
  it('a folder that cannot be listed is counted and passed over', async () => {
    const bad: DirHandle = { kind: 'directory', name: 'Locked', values: () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error('denied')) }) }) };
    const s = await scanHandle(withFiles('root', 0, [bad, withFiles('Open', 1, [])]));
    expect([s.count, s.unreadable, s.totalFiles]).toEqual([2, 1, 1]);
  });
  it('has no Learn from folder where the browser has no folder picker; a cancelled picker is null', async () => {
    expect(webFolderScan({})).toBeUndefined();
    expect(webFolderScan(undefined)).toBeUndefined();
    const cancel = webFolderScan({ showDirectoryPicker: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })) })!;
    expect(await cancel()).toBeNull();
    const opts: unknown[] = [];
    const ok = webFolderScan({ showDirectoryPicker: (o) => { opts.push(o); return Promise.resolve(withFiles('Job', 0, [withFiles('VD', 0, [])])); } })!;
    expect((await ok())?.count).toBe(1);
    expect(opts).toEqual([{ mode: 'read', id: 'gfde-learn-folder' }]);
  });
});
