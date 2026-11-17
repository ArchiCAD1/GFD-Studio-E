import { describe, expect, it } from 'vitest';
import { addCol, addRow, deleteCol, deleteRow, imageFromDataUrl, setCell, tableFromSheet, tableFromText, tableSize, TABLE_MAX_COLS, TABLE_MAX_ROWS } from './specBlocks';
import type { Sheet } from './sheets';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAoCAIAAAC6iKlyAAAAc0lEQVR4Xu3QQQ0AIBDAMMC/5yOIYK/WwJLtmVn8d/4neIyOGB0xOmJ0xOiI0RGjI0ZHjI4YHTE6YnTE6IjREaMjRkeMjhgdMTpidMToiNERoyNGR4yOGB0xOmJ0xOiI0RGjI0ZHjI4YHTE6YnTE6IjRkQub1QNNNLL5wAAAAABJRU5ErkJggg==';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCACWAMgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==';

describe('specification blocks — a table from copied cells', () => {
  it('reads rows and cells, drops the empty tail and squares the rows', () => {
    expect(tableFromText('Board\tRating\tIP\r\nMDB-1\t1600 A\r\nSMDB-1\t400 A\tIP54\t\r\n\t\t\r\n')).toEqual([['Board', 'Rating', 'IP'], ['MDB-1', '1600 A', ''], ['SMDB-1', '400 A', 'IP54']]);
  });
  it('reads a quoted cell with a line break, a tab and a quote inside, as Excel writes it', () => {
    expect(tableFromText('Item\t"Cable\n4c × 95 mm²"\n"say ""ok"""\t"a\tb"')).toEqual([['Item', 'Cable 4c × 95 mm²'], ['say "ok"', 'a b']]);
  });
  it('is not a table without a tab, or when every cell is empty', () => {
    expect(tableFromText('Just a sentence.\nAnd another.')).toBeUndefined();
    expect(tableFromText('\t\n\t')).toBeUndefined();
  });
  it('keeps within the size a page can carry', () => {
    const big = Array.from({ length: TABLE_MAX_ROWS + 5 }, (_, r) => Array.from({ length: TABLE_MAX_COLS + 3 }, (_, c) => `${r}:${c}`).join('\t')).join('\n');
    expect(tableSize({ rows: tableFromText(big)! })).toEqual([TABLE_MAX_ROWS, TABLE_MAX_COLS]);
  });
});

describe('specification blocks — a table from a sheet', () => {
  const sheet = (cells: Record<string, string>): Sheet => ({ id: 'S1', name: 'Loads', cells, styles: {}, widths: {}, rows: 40, cols: 12 }) as Sheet;
  it('copies the filled cells as they show, formulas as their results', () => {
    expect(tableFromSheet(sheet({ A1: 'Load', B1: 'kW', A2: 'Lighting', B2: '12', A3: 'Power', B3: '30', A4: 'Total', B4: '=SUM(B2:B3)' }))).toEqual([['Load', 'kW'], ['Lighting', '12'], ['Power', '30'], ['Total', '42']]);
  });
  it('an empty sheet gives no table', () => {
    expect(tableFromSheet(sheet({}))).toBeUndefined();
    expect(tableFromSheet(sheet({ C3: '' }))).toBeUndefined();
  });
});

describe('specification blocks — editing a table', () => {
  const t = { rows: [['a', 'b'], ['c', 'd']] };
  it('sets a cell, adds a row or column after a place, deletes one, and keeps the last', () => {
    expect(setCell(t, 1, 0, 'x').rows).toEqual([['a', 'b'], ['x', 'd']]);
    expect(addRow(t, 0).rows).toEqual([['a', 'b'], ['', ''], ['c', 'd']]);
    expect(addRow(t).rows).toEqual([['a', 'b'], ['c', 'd'], ['', '']]);
    expect(addCol(t, 0).rows).toEqual([['a', '', 'b'], ['c', '', 'd']]);
    expect(addCol(t).rows).toEqual([['a', 'b', ''], ['c', 'd', '']]);
    expect(deleteRow(t, 0).rows).toEqual([['c', 'd']]);
    expect(deleteCol(t, 1).rows).toEqual([['a'], ['c']]);
    expect(deleteRow({ rows: [['a']] }, 0).rows).toEqual([['a']]);
    expect(deleteCol({ rows: [['a']] }, 0).rows).toEqual([['a']]);
    expect(t.rows).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('specification blocks — a picture', () => {
  it('reads the size of a PNG and of a JPEG from the file itself', () => {
    expect(imageFromDataUrl(PNG)).toEqual({ src: PNG, w: 120, h: 40 });
    expect(imageFromDataUrl(JPEG)).toEqual({ src: JPEG, w: 200, h: 150 });
  });
  it('takes nothing that is not a PNG or JPEG picture', () => {
    expect(imageFromDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeUndefined();
    expect(imageFromDataUrl('javascript:alert(1)')).toBeUndefined();
    expect(imageFromDataUrl('data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeUndefined();
    expect(imageFromDataUrl(PNG.replace('image/png', 'image/jpeg'))).toBeUndefined();
  });
});
