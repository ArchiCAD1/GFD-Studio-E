import { cellAt, cellName, colName } from '../calc/sheetFormula';
import { boardsInSupplyOrder } from '../calc/summary';
import { projectFormat } from '../model/scheduleFormats';
import { DEFAULT_WIDTH, edgesOf, mergeAt, sheetValues, shown, type Sheet } from '../model/sheets';
import type { Project } from '../types';
import { discardPending, fillLinked, panelCategoryOf, sheetFromFormat } from './sheetLink';

/** A panel's sheet printed as a PDF: the template as the office laid it out, filled from the project. Black and white, no header or footer of the app. */

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The panel as a sheet in the project's own format, for output: the book's sheet linked to it, else a sheet made from the project's
 * format for its category (not added to the project); without typed values not yet applied, filled from the project. Undefined when it has neither. */
export function formatSheetOf(project: Project, boardId: string): Sheet | undefined {
  const book = project.sheets?.sheets ?? [];
  let sheet = book.find((s) => s.link?.boardId === boardId);
  if (!sheet) {
    const board = project.boards.find((b) => b.id === boardId), category = board && panelCategoryOf(project, board), format = category && projectFormat(project, category);
    if (!format) return undefined;
    sheet = sheetFromFormat(format.sheet, book, boardId);
  }
  return fillLinked(project, discardPending(sheet));
}

/** Every board that has a sheet in its format, in supply order. */
export function formatSheetsOf(project: Project): Sheet[] {
  return boardsInSupplyOrder(project).map((b) => formatSheetOf(project, b.id)).filter((s): s is Sheet => !!s);
}

/** The last row and column that hold a value, a border or a merged area (at least 1 × 1). */
function usedRange(sheet: Sheet): { rows: number; cols: number } {
  let rows = 1, cols = 1;
  const take = (r: number, c: number) => { rows = Math.max(rows, r); cols = Math.max(cols, c); };
  const at = (k: string) => { const m = /^([A-Z]+)(\d+)$/.exec(k); return m ? { c: [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0), r: +m[2] } : undefined; };
  for (const [k, v] of Object.entries(sheet.cells)) { const p = v !== '' && at(k); if (p) take(p.r, p.c); }
  for (const [k, s] of Object.entries(sheet.styles ?? {})) { const p = s.border && at(k); if (p) take(p.r, p.c); }
  for (const m of sheet.merges ?? []) take(m.r1, m.c1);
  return { rows: Math.min(rows, sheet.rows), cols: Math.min(cols, sheet.cols) };
}

const LINE = ['', '0.5pt solid #000', '1.5pt solid #000'];

/** The most rows that repeat: the printer repeats a head only while it is under a quarter of the page (9 rows of 14 pt on A4 landscape). */
const MAX_HEADING_ROWS = 8;

/** The heading rows of a linked sheet, printed again at the top of every page its rows run over: the rows directly above the first
 * circuit row, up to the first empty row or the first row that holds a value of the panel (a linked cell; a column's own heading and
 * its watts per unit are headings). Undefined without a link or such rows, or when a merged area runs from them into the rows. */
export function headingRows(sheet: Sheet): { top: number; bottom: number } | undefined {
  const link = sheet.link, { rows, cols } = usedRange(sheet);
  if (!link || link.firstRow < 2 || link.firstRow > rows) return undefined;
  const bottom = link.firstRow - 1, merges = sheet.merges ?? [];
  const panel = new Set(Object.entries(link.cells).filter(([, c]) => !/^(label|wattUnit)\./.test(c.field)).map(([k]) => cellAt(k)!.row));
  const filled = (r: number) => Array.from({ length: cols }, (_, i) => i + 1).some((c) => (sheet.cells[cellName(c, r)] ?? '') !== '' || !!mergeAt(sheet, r, c));
  let top = link.firstRow;
  while (top > 1 && link.firstRow - top < MAX_HEADING_ROWS && !panel.has(top - 1) && filled(top - 1)) top--;
  // A merged area that starts above the rows and runs into them: the headings start under it.
  for (let m = merges.find((x) => x.r0 < top && x.r1 >= top); m; m = merges.find((x) => x.r0 < top && x.r1 >= top)) top = m.r1 + 1;
  return top > bottom || merges.some((m) => m.r0 <= bottom && m.r1 > bottom) ? undefined : { top, bottom };
}

function sheetTable(sheet: Sheet): string {
  const { rows, cols } = usedRange(sheet), values = sheetValues(sheet), head = headingRows(sheet);
  const px = Array.from({ length: cols }, (_, i) => sheet.widths?.[colName(i + 1)] ?? DEFAULT_WIDTH), total = px.reduce((a, b) => a + b, 0);
  const group = px.map((w) => `<col style="width:${(w / total * 100).toFixed(3)}%">`).join('');
  /** Rows `from` to `to`. `open`: the last row's bottom lines are left to the table under it, which draws them as its top lines. */
  const trs = (from: number, to: number, open = false) => {
    let body = '';
    for (let r = from; r <= to; r++) {
      let tds = '';
      for (let c = 1; c <= cols; c++) {
        const m = mergeAt(sheet, r, c);
        if (m && (m.r0 !== r || m.c0 !== c)) continue;
        const k = cellName(c, r), st = sheet.styles?.[k] ?? {}, res = values[k], e = edgesOf(sheet, r, c);
        const css = [`text-align:${st.align ?? (typeof res?.value === 'number' && !res.error ? 'right' : 'left')}`];
        if (st.bold) css.push('font-weight:700');
        if (st.italic) css.push('font-style:italic');
        if (st.underline) css.push('text-decoration:underline');
        if (st.fill) css.push('background:#e6e6e6');
        if (st.wrap) css.push('white-space:normal;overflow-wrap:anywhere');
        for (const [side, name] of [['t', 'top'], ['r', 'right'], ['b', 'bottom'], ['l', 'left']] as const) if (e[side] && !(open && side === 'b' && (m?.r1 ?? r) === to)) css.push(`border-${name}:${LINE[e[side]]}`);
        const span = m ? `${m.c1 > m.c0 ? ` colspan="${m.c1 - m.c0 + 1}"` : ''}${m.r1 > m.r0 ? ` rowspan="${m.r1 - m.r0 + 1}"` : ''}` : '';
        tds += `<td${span} style="${css.join(';')}">${esc(shown(res, st.fmt))}</td>`;
      }
      body += `<tr>${tds}</tr>`;
    }
    return body;
  };
  const table = (inner: string) => `<table><colgroup>${group}</colgroup>${inner}</table>`;
  if (!head) return table(`<tbody>${trs(1, rows)}</tbody>`);
  // The rows above the headings are a table of their own, so that the headings are the head of the table that runs over the pages.
  return (head.top > 1 ? table(`<tbody>${trs(1, head.top - 1, true)}</tbody>`) : '') + table(`<thead>${trs(head.top, head.bottom)}</thead><tbody>${trs(head.bottom + 1, rows)}</tbody>`);
}

/** A print-ready black-and-white document: one page section per sheet, only its used part, fitted to the page width; a sheet that
 * runs over a page has its heading rows again on each page. `title` is only the document's title. */
export function sheetsHtml(sheets: Sheet[], title: string): string {
  const sections = sheets.map((s, i) => `<section${i < sheets.length - 1 ? ' style="page-break-after:always;break-after:page"' : ''}>${sheetTable(s)}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font: 8pt Arial, Helvetica, sans-serif; color: #000; background: #fff; margin: 0; }
    table { table-layout: fixed; width: 100%; border-collapse: collapse; }
    td { height: 14pt; padding: 0 2pt; vertical-align: middle; white-space: nowrap; overflow: hidden; border: 0; }
    tr { break-inside: avoid; }
    thead { display: table-header-group; break-inside: avoid; }
  </style></head><body>${sections}</body></html>`;
}
