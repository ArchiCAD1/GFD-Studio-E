import { cellAt } from '../calc/sheetFormula';
import { shownRows, type Sheet } from './sheets';
import type { SpecImage, SpecTable } from './specDoc';

/**
 * Tables and pictures of the specification: reading a table from copied cells (Sheets, Excel) or from one of the
 * project's sheets, editing its rows and columns, and reading a picture's size from its own bytes.
 */

export const TABLE_MAX_ROWS = 200, TABLE_MAX_COLS = 30, IMAGE_MAX_BYTES = 1_000_000;

/** Rows of equal length, trailing empty rows and columns dropped, within the size a page can carry. */
function tidy(rows: string[][]): string[][] | undefined {
  let r = rows.map((x) => x.map((c) => c.replace(/\s+/g, ' ').trim()));
  while (r.length && r[r.length - 1].every((c) => !c)) r.pop();
  let cols = Math.max(0, ...r.map((x) => x.length));
  while (cols > 0 && r.every((x) => !(x[cols - 1] ?? ''))) cols--;
  if (!r.length || !cols) return undefined;
  r = r.slice(0, TABLE_MAX_ROWS);
  cols = Math.min(cols, TABLE_MAX_COLS);
  return r.map((x) => Array.from({ length: cols }, (_, i) => x[i] ?? ''));
}

/** Copied cells as a table: rows on lines, cells apart by tabs; a cell holding a line break or a tab comes in
 * quotes ("" for a quote inside), as Excel writes it. None: the text is not cells (no tab in it). */
export function tableFromText(text: string): string[][] | undefined {
  if (!text.includes('\t')) return undefined;
  const rows: string[][] = [[]];
  let cell = '', quoted = false, start = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && start) quoted = true;
    else if (ch === '\t') { rows[rows.length - 1].push(cell); cell = ''; start = true; continue; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; rows[rows.length - 1].push(cell); cell = ''; rows.push([]); start = true; continue; }
    else cell += ch;
    start = false;
  }
  rows[rows.length - 1].push(cell);
  return tidy(rows);
}

/** One of the project's sheets as a table: its filled cells as they show (a copy — it does not follow the sheet). */
export function tableFromSheet(sheet: Sheet): string[][] | undefined {
  let r1 = 0, c1 = 0;
  for (const [k, v] of Object.entries(sheet.cells)) { const at = v === '' ? undefined : cellAt(k); if (at) { r1 = Math.max(r1, at.row); c1 = Math.max(c1, at.col); } }
  if (!r1) return undefined;
  return tidy(shownRows(sheet, { r0: 1, c0: 1, r1: Math.min(r1, TABLE_MAX_ROWS), c1: Math.min(c1, TABLE_MAX_COLS) }));
}

export const tableSize = (t: SpecTable): [number, number] => [t.rows.length, t.rows[0]?.length ?? 0];
export const setCell = (t: SpecTable, r: number, c: number, v: string): SpecTable => ({ ...t, rows: t.rows.map((x, i) => (i === r ? x.map((y, j) => (j === c ? v : y)) : x)) });
/** Adds an empty row after row `r` (at the end when none). */
export function addRow(t: SpecTable, r = t.rows.length - 1): SpecTable {
  if (t.rows.length >= TABLE_MAX_ROWS) return t;
  const rows = [...t.rows];
  rows.splice(r + 1, 0, Array.from({ length: tableSize(t)[1] }, () => ''));
  return { ...t, rows };
}
/** Adds an empty column after column `c` (at the end when none). */
export const addCol = (t: SpecTable, c = tableSize(t)[1] - 1): SpecTable => (tableSize(t)[1] >= TABLE_MAX_COLS ? t : { ...t, rows: t.rows.map((x) => [...x.slice(0, c + 1), '', ...x.slice(c + 1)]) });
/** Deletes a row or a column; the last one stays. */
export const deleteRow = (t: SpecTable, r: number): SpecTable => (t.rows.length <= 1 ? t : { ...t, rows: t.rows.filter((_, i) => i !== r) });
export const deleteCol = (t: SpecTable, c: number): SpecTable => (tableSize(t)[1] <= 1 ? t : { ...t, rows: t.rows.map((x) => x.filter((_, j) => j !== c)) });

/** A picture from its data: URL — PNG or JPEG only, its size in pixels read from the file's own header. None: not
 * such a picture, or no size found in it. */
export function imageFromDataUrl(src: string): SpecImage | undefined {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(src);
  if (!m) return undefined;
  let bin: string;
  try { bin = atob(m[2]); } catch { return undefined; }
  const b = (i: number) => bin.charCodeAt(i), be16 = (i: number) => (b(i) << 8) | b(i + 1), be32 = (i: number) => be16(i) * 65536 + be16(i + 2);
  let w = 0, h = 0;
  if (m[1] === 'png') {
    if (bin.length < 24 || bin.slice(1, 4) !== 'PNG' || bin.slice(12, 16) !== 'IHDR') return undefined;
    w = be32(16); h = be32(20);
  } else {
    if (b(0) !== 0xff || b(1) !== 0xd8) return undefined;
    // Walk the segments to the frame header (SOF0–SOF15, less the three that are tables), which holds the size.
    for (let i = 2; i + 9 < bin.length;) {
      if (b(i) !== 0xff) return undefined;
      const marker = b(i + 1);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) { h = be16(i + 5); w = be16(i + 7); break; }
      i += 2 + be16(i + 2);
    }
  }
  return w > 0 && h > 0 ? { src, w, h } : undefined;
}
