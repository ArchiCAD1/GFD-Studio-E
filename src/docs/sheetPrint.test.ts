import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { withProjectFormat } from '../model/scheduleFormats';
import { area, mergeArea, newSheet, withCells, withStyle, type Sheet } from '../model/sheets';
import { scheduleRowKeys } from './scheduleFields';
import { formatSheetOf, formatSheetsOf, sheetsHtml } from './sheetPrint';
import { linkToBoard, panelCategoryOf } from './sheetLink';

const at = (r: number, c: number) => ({ r, c });
const cell = (html: string, text: string) => new RegExp(`<td[^>]*>${text}</td>`).exec(html)?.[0] ?? '';

/** A DB layout as an office would draw it: a merged, bordered heading, a grey heading row, one pattern row and a total. */
function dbLayout(): Sheet {
  let s = withCells(newSheet(), { A1: 'Acme Electrical', A3: 'Circuit', B3: 'Description', C3: 'Load W', C5: 'Total', D5: '=SUM(C4:C4)' });
  s = mergeArea(s, area(at(1, 1), at(1, 4)));
  s = withStyle(s, area(at(1, 1), at(1, 4)), { bold: true, align: 'center', border: 'TRBL' });
  s = withStyle(s, area(at(3, 1), at(3, 4)), { bold: true, fill: true, border: 'trbl' });
  s = withStyle(s, area(at(4, 1), at(4, 4)), { border: 'trbl' });
  return { ...s, widths: { A: 64, B: 200, C: 96, D: 96 }, link: { category: 'db', cells: {}, firstRow: 4, rows: [], columns: { A: 'row.ref', B: 'row.room', C: 'row.watts' } } };
}

describe('sheetsHtml', () => {
  const small = (() => {
    let s = withCells(newSheet(), { A1: 'Head', B2: '12.5', C2: '=B2*2', A3: 'a < b & "c"' });
    s = mergeArea(s, area(at(1, 1), at(2, 1)));
    s = withStyle(s, area(at(1, 1), at(1, 1)), { bold: true, border: 'TRBL' });
    s = withStyle(s, area(at(2, 3), at(2, 3)), { fill: true, align: 'center' });
    s = withStyle(s, area(at(3, 1), at(3, 1)), { italic: true, underline: true });
    return s;
  })();
  const html = sheetsHtml([small], 'Title & co');

  it('prints only the used part, fitted to the page width, black and white, with no header or footer', () => {
    expect(html).toContain('<title>Title &amp; co</title>');
    expect(html).toContain('@page { size: A4 landscape; margin: 10mm; }');
    expect(html).toMatch(/table-layout: fixed; width: 100%; border-collapse: collapse/);
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html.match(/<col /g)).toHaveLength(3);
    expect(html).not.toMatch(/<h1|<header|<footer|<th/);
    expect(html.match(/<col style="width:([\d.]+)%">/g)!.map((c) => +/([\d.]+)/.exec(c)![1]).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
  });
  it('merges a heading with colspan / rowspan and writes no covered cell', () => {
    expect(html).toContain('<td rowspan="2"');
    expect(html.match(/<td/g)).toHaveLength(8); // 3 × 3 cells less the covered A2
    expect(html).not.toContain('colspan');
  });
  it('gives thin and thick borders their own styles and an unbordered cell none', () => {
    const h = sheetsHtml([withStyle(withCells(newSheet(), { A1: 'x', C1: 'z' }), area(at(1, 1), at(1, 1)), { border: 'tB' })], 't');
    expect(cell(h, 'x')).toContain('border-top:0.5pt solid #000');
    expect(cell(h, 'x')).toContain('border-bottom:1.5pt solid #000');
    expect(cell(h, 'z')).not.toContain('border');
    expect(cell(h, 'z')).not.toContain('solid');
  });
  it('prints bold, italic, underline, alignment, a formula\'s value and a grey fill; texts are escaped', () => {
    expect(cell(html, 'Head')).toContain('font-weight:700');
    expect(html).toMatch(/<td style="text-align:right;border-left:1.5pt solid #000">12.5<\/td>/);
    expect(html).toMatch(/<td style="text-align:center;background:#e6e6e6">25<\/td>/);
    expect(cell(html, 'a &lt; b &amp; &quot;c&quot;')).toMatch(/text-align:left;font-style:italic;text-decoration:underline/);
    expect(html).not.toContain('=B2*2');
    expect(html.match(/#[0-9a-f]{3,6}/gi)!.every((c) => ['#000', '#fff', '#e6e6e6'].includes(c))).toBe(true);
  });
  it('puts one page break between two sheets and none after the last', () => {
    const two = sheetsHtml([small, small], 't');
    expect(two.match(/page-break-after:always/g)).toHaveLength(1);
    expect(sheetsHtml([small], 't')).not.toContain('page-break-after:always');
  });
});

describe('formatSheetOf and formatSheetsOf', () => {
  const format = { id: 'f', name: 'Acme DB', category: 'db' as const, sheet: dbLayout(), updatedAt: '2026-11-14' };
  const smdbFormat = { id: 'g', name: 'Acme SMDB', category: 'md' as const, sheet: { ...dbLayout(), link: { ...dbLayout().link!, category: 'md' as const, columns: { A: 'row.sl', B: 'row.name' } } }, updatedAt: '2026-11-14' };

  it('makes a sheet from the project format for the board\'s category, filled from the project, leaving the project unchanged', () => {
    const p = withProjectFormat(sampleProject, 'db', format), before = JSON.stringify(p);
    const s = formatSheetOf(p, 'DB-GF1')!;
    expect(s.link!.boardId).toBe('DB-GF1');
    expect(s.link!.rows).toHaveLength(scheduleRowKeys(p, 'DB-GF1').length);
    expect(s.cells.A4).toBeTruthy();
    expect(JSON.stringify(p)).toBe(before);
    expect(p.sheets).toBeUndefined();
  });
  it('uses the book\'s sheet linked to the board, without typed values that were not applied', () => {
    const linked = linkToBoard(dbLayout(), 'DB-GF1');
    const typed = { ...linked, link: { ...linked.link!, pending: { x: { B: 'TYPED' } }, added: [{ B: 'NEW ROW' }] } };
    const p = { ...sampleProject, sheets: { sheets: [typed] } };
    const s = formatSheetOf(p, 'DB-GF1')!;
    expect(s.link!.pending).toBeUndefined();
    expect(s.link!.added).toBeUndefined();
    expect(JSON.stringify(s.cells)).not.toMatch(/TYPED|NEW ROW/);
    expect(s.id).toBe(typed.id);
  });
  it('is undefined for a board with neither a sheet nor a format', () => {
    expect(formatSheetOf(sampleProject, 'DB-GF1')).toBeUndefined();
    expect(formatSheetOf(withProjectFormat(sampleProject, 'db', format), 'MDB-1')).toBeUndefined();
    expect(formatSheetOf(sampleProject, 'NO-SUCH')).toBeUndefined();
  });
  it('gives every board that has a format, in supply order', () => {
    const p = withProjectFormat(withProjectFormat(sampleProject, 'db', format), 'smdb', smdbFormat);
    const ids = formatSheetsOf(p).map((s) => s.link!.boardId);
    const expected = p.boards.filter((b) => ['db', 'smdb'].includes(panelCategoryOf(p, b) ?? '')).map((b) => b.id);
    expect(ids.length).toBeGreaterThan(2);
    expect([...ids].sort()).toEqual([...expected].sort());
    expect(ids.indexOf('SMDB-GF')).toBeLessThan(ids.indexOf('DB-GF1'));
    expect(formatSheetsOf(sampleProject)).toEqual([]);
    const html = sheetsHtml(formatSheetsOf(p), 'all');
    expect(html.match(/page-break-after:always/g)).toHaveLength(ids.length - 1);
  });
});
