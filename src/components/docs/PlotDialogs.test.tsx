// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageSetupDialog, PenTableDialog } from './PlotDialogs';
import { sampleProject } from '../../data/sampleProject';
import { addPlanSheets } from '../../docs/planLayout';
import { setOf } from '../../model/drawingSet';
import { placeLvPoint } from '../../model/cadDevices';
import { pensFor, PEN_LABEL, tablesOf, withTable, DEFAULT_PENS } from '../../model/plotSetup';
import type { Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const preview = vi.hoisted(() => vi.fn());
vi.mock('./SheetPdfPreview', () => ({ canPreviewSheetPdf: () => true, SheetPdfPreview: (props: unknown) => { preview(props); return null; } }));
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; preview.mockClear(); vi.unstubAllGlobals(); });

const villa: Project = {
  ...sampleProject, drawingSet: undefined, plot: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }] }], rooms: [{ id: 'r1', buildingId: 'V', levelId: 'GF', name: 'Hall', type: 'lobby', areaM2: 120, outline: [[0, 0], [12, 0], [12, 10], [0, 10]] }] }
};
const choose = (label: string, value: string) => {
  const el = document.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement;
  act(() => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); });
};
const button = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t)!;

describe('Plot dialogs', () => {
  it('page setup: paper, scale, pens and plot stamp saved for the sheet, or as the set\'s default', () => {
    const lit = placeLvPoint(villa, { building: 'V', level: 'GF' }, 'ltg', 'DB-GF1-Y1', 6, 5).project;
    const { set, ids } = addPlanSheets(setOf(lit), lit, 'lighting');
    const p = withTable({ ...lit, drawingSet: set }, { ...DEFAULT_PENS, id: 'pt1', name: 'Heavy' });
    const sheet = set.sheets.find((s) => s.id === ids[0])!;
    const onSave = vi.fn();
    act(() => root.render(<PageSetupDialog project={p} sheet={sheet} onSave={onSave} onClose={() => {}} />));
    choose('Paper', 'A1');
    choose('Scale', '50');
    choose('Pen table', 'pt1');
    const tick = (text: RegExp) => ([...document.querySelectorAll('label')].find((l) => text.test(l.textContent ?? ''))!.querySelector('input') as HTMLInputElement);
    expect(tick(/Print drawn work/).checked).toBe(true);
    act(() => { tick(/Plot stamp/).click(); });
    act(() => { tick(/Print drawn work/).click(); });
    act(() => { button('Save for this sheet').click(); });
    const saved: Project = onSave.mock.calls[0][0];
    expect(saved.drawingSet!.sheets.find((s) => s.id === sheet.id)).toMatchObject({ size: 'A1', scale: '1:50', plot: { pens: 'pt1', stamp: true, drawn: false } });
    expect(onSave.mock.calls[0][1]).toBe(`Page setup of ${sheet.number} saved · ⌘Z to undo`);
    act(() => root.render(<PageSetupDialog key="again" project={p} sheet={sheet} onSave={onSave} onClose={() => {}} />));
    choose('Lineweights', 'thin');
    act(() => { button('Save as the set\'s default').click(); });
    expect(onSave.mock.calls[1][0].plot.defaults).toEqual({ weights: 'thin' });
  });

  it('page setup warns when the drawn text was made for another scale than the sheet\'s', () => {
    const lit = { ...placeLvPoint(villa, { building: 'V', level: 'GF' }, 'ltg', 'DB-GF1-Y1', 6, 5).project, cadPlans: [{ building: 'V', level: 'GF', file: 'GF.dwg', units: 4 }], cadSketch: [{ file: 'GF.dwg', items: [{ id: 'S1', kind: 'text' as const, layer: 'LV-ANNO', pts: [[2000, 2000]] as [number, number][], text: 'PLANT', h: 250 }] }] };
    const { set, ids } = addPlanSheets(setOf(lit), lit, 'lighting');
    const sheet = set.sheets.find((s) => s.id === ids[0])!;
    act(() => root.render(<PageSetupDialog project={{ ...lit, drawingSet: set }} sheet={sheet} onSave={() => {}} onClose={() => {}} />));
    expect(document.querySelector('.warn')).toBeNull(); // drawn for 1:100, the sheet is 1:100
    choose('Scale', '50');
    expect(document.querySelector('.warn')!.textContent).toBe('⚠ Text was drawn for 1:100; this sheet is 1:50, so 2.5 mm text prints 5 mm.');
  });

  it('previews draft page setup without saving it', () => {
    const lit = placeLvPoint(villa, { building: 'V', level: 'GF' }, 'ltg', 'DB-GF1-Y1', 6, 5).project;
    const { set, ids } = addPlanSheets(setOf(lit), lit, 'lighting');
    const sheet = set.sheets.find((s) => s.id === ids[0])!;
    const onSave = vi.fn();
    act(() => root.render(<PageSetupDialog project={{ ...lit, drawingSet: set }} sheet={sheet} onSave={onSave} onClose={() => {}} />));
    choose('Paper', 'A3 portrait');
    choose('Scale', '200');
    choose('Lineweights', 'thin');
    act(() => button('Preview').click());
    expect(preview.mock.lastCall![0].project.drawingSet.sheets.find((s: { id: string }) => s.id === sheet.id)).toMatchObject({
      size: 'A3 portrait', scale: '1:200', plot: { weights: 'thin' }
    });
    expect(sheet.size).not.toBe('A3 portrait');
    expect(onSave).not.toHaveBeenCalled();
    act(() => preview.mock.lastCall![0].onClose());
    expect((document.querySelector('[aria-label="Paper"]') as HTMLSelectElement).value).toBe('A3 portrait');
  });

  it('pen tables: a width and an ink changed and saved; saved as a new table', () => {
    const onSave = vi.fn();
    act(() => root.render(<PenTableDialog project={villa} onSave={onSave} onClose={() => {}} />));
    choose('Cable trays width', '0.7');
    choose('Devices and DBs ink', '60');
    act(() => { button('Save').click(); });
    const p: Project = onSave.mock.calls[0][0];
    expect(pensFor(p)).toMatchObject({ trays: { w: 0.7, grey: 100 }, devices: { w: 0.25, grey: 60 } });
    act(() => { button('Save as new').click(); });
    expect(onSave.mock.calls[1][0].plot.tables.map((t: { name: string }) => t.name)).toEqual(['LVDS Electrical (copy)']);
  });

  // Plot style table files as the model tests build them: a text header, then the styles as text compressed with zlib.
  const styleFile = (kind: 'CTB' | 'STB', text: string) => {
    const out = new Uint8Array(60), z = deflateSync(Buffer.from(text, 'latin1'));
    out.set(new TextEncoder().encode(`PIAFILEVERSION_2.0,${kind}VER1,compress\r\npmzlibcodec`));
    return new Uint8Array([...out, ...z]);
  };
  const WEIGHTS = 'custom_lineweight_table{\n 0=0.0\n 3=0.09\n 4=0.13\n 17=0.7\n}\n';
  const stb = (styles: { name: string; lw?: number; scr?: number }[]) => styleFile('STB', `description="Office\naci_table_available=FALSE\nplot_style{\n${styles.map((x, i) => ` ${i}{\n  name="${x.name}\n  localized_name="${x.name}\n  description="\n  color=-1\n  screen=${x.scr ?? 100}\n  lineweight=${x.lw ?? 0}\n }`).join('\n')}\n}\n${WEIGHTS}\0`);
  const ctb = () => styleFile('CTB', `description=\naci_table_available=TRUE\nplot_style{\n${Array.from({ length: 255 }, (_, i) => ` ${i}{\n  name="Color_${i + 1}\n  localized_name="Color_${i + 1}\n  color=-1\n  screen=${i === 2 ? 60 : 100}\n  lineweight=${i === 2 ? 17 : 0}\n }`).join('\n')}\n}\n${WEIGHTS}`);
  const OFFICE = [{ name: 'Normal' }, { name: 'Fine', lw: 4, scr: 50 }, { name: 'Heavy', lw: 17 }, { name: 'Hair', lw: 3 }];
  /** A file chosen in the hidden file field, as the dialog reads it. */
  const until = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); expect(ok()).toBe(true); };
  const chooseFile = async (name: string, bytes: Uint8Array, done: () => boolean) => {
    vi.stubGlobal('Blob', NodeBlob); // the model reads the file through Blob.stream(), which the DOM test environment lacks
    const input = document.querySelector('[aria-label="Plot style file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await until(done);
  };
  const sel = (label: string) => document.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement;
  const options = (label: string) => [...sel(label).querySelectorAll('option')].map((o) => o.textContent);

  it('pen tables: an STB file comes in as a table with a Plot style column; a style gives a kind of line its width and ink and is saved with the table', async () => {
    const onSave = vi.fn();
    act(() => root.render(<PenTableDialog project={villa} onSave={onSave} onClose={() => {}} />));
    expect(document.querySelector('[aria-label="Pens"] thead')!.textContent).not.toContain('Plot style');
    expect(button('Import CTB / STB…')).toBeDefined();
    expect(document.querySelector('[aria-label="Plot style file"]')!.getAttribute('accept')).toBe('.ctb,.stb');
    await chooseFile('Office.stb', stb(OFFICE), () => onSave.mock.calls.length === 1);
    const p: Project = onSave.mock.calls[0][0];
    expect(onSave.mock.calls[0][0].plot.tables[0]).toMatchObject({ name: 'Office', stb: { file: 'Office.stb', by: {} } });
    expect(onSave.mock.calls[0][1]).toBe('Office.stb imported as a pen table: give its styles to the kinds of line · ⌘Z to undo');
    expect(tablesOf(p).map((t) => t.name)).toEqual(['LVDS Electrical', 'Office']);
    act(() => root.render(<PenTableDialog project={p} onSave={onSave} onClose={() => {}} />)); // the page passes the saved project back
    expect(options('Table')).toEqual(['LVDS Electrical', 'Office (from Office.stb)']);
    expect(sel('Table').value).toBe('pt1');
    expect(document.querySelector('[aria-label="Pens"] thead')!.textContent).toBe('LinePlot styleWidth (mm)Ink');
    expect(options(`${PEN_LABEL.trays} plot style`)).toEqual(['—', 'Normal', 'Fine', 'Heavy', 'Hair']);
    expect(sel(`${PEN_LABEL.trays} plot style`).value).toBe('');
    choose(`${PEN_LABEL.trays} plot style`, 'Fine');
    expect([sel(`${PEN_LABEL.trays} width`).value, sel(`${PEN_LABEL.trays} ink`).value]).toEqual(['0.13', '50']);
    choose(`${PEN_LABEL.devices} plot style`, 'Heavy');
    act(() => { button('Save').click(); });
    const t = tablesOf(onSave.mock.calls[1][0]).find((x) => x.name === 'Office')!;
    expect(t.stb!.by).toEqual({ trays: 'Fine', devices: 'Heavy' });
    expect(t.pens).toMatchObject({ trays: { w: 0.13, grey: 50 }, devices: { w: 0.7, grey: 100 } });
    // Saved as new, it keeps its styles and drops nothing it came with but a CTB.
    act(() => { button('Save as new').click(); });
    expect(tablesOf(onSave.mock.calls[2][0]).find((x) => x.name === 'Office (copy)')).toMatchObject({ stb: { file: 'Office.stb', by: { trays: 'Fine', devices: 'Heavy' } } });
  });

  it('pen tables: a width or an ink changed by hand takes the style off that line only; a width the list lacks still shows', async () => {
    const onSave = vi.fn();
    act(() => root.render(<PenTableDialog project={villa} onSave={onSave} onClose={() => {}} />));
    await chooseFile('Office.stb', stb(OFFICE), () => onSave.mock.calls.length === 1);
    choose(`${PEN_LABEL.trays} plot style`, 'Hair');
    choose(`${PEN_LABEL.devices} plot style`, 'Fine');
    choose(`${PEN_LABEL.routes} plot style`, 'Fine');
    expect(options(`${PEN_LABEL.trays} width`)).toContain('0.09'); // an imported style gives a width the ISO list does not have
    expect(sel(`${PEN_LABEL.trays} width`).value).toBe('0.09');
    expect(options(`${PEN_LABEL.trays} width`).slice(0, 2)).toEqual(['0.09', '0.13']);
    expect(options(`${PEN_LABEL.trays} width`)).not.toContain('As drawn'); // offered for the SLD and busbars only
    choose(`${PEN_LABEL.trays} width`, '1');
    choose(`${PEN_LABEL.devices} ink`, '30');
    expect([sel(`${PEN_LABEL.trays} plot style`).value, sel(`${PEN_LABEL.devices} plot style`).value, sel(`${PEN_LABEL.routes} plot style`).value]).toEqual(['', '', 'Fine']);
    expect(sel(`${PEN_LABEL.trays} width`).value).toBe('1');
    act(() => { button('Save').click(); });
    const t = tablesOf(onSave.mock.calls[1][0]).find((x) => x.name === 'Office')!;
    expect(t.stb!.by).toEqual({ routes: 'Fine' });
    expect(t.pens).toMatchObject({ trays: { w: 1 }, devices: { w: 0.13, grey: 30 } });
  });

  it('pen tables: a file that is neither a CTB nor an STB says so; a CTB still comes in under the new button, without a Plot style column', async () => {
    const onSave = vi.fn();
    act(() => root.render(<PenTableDialog project={villa} onSave={onSave} onClose={() => {}} />));
    await chooseFile('notes.stb', new TextEncoder().encode('just some text'), () => !!document.querySelector('[role="alert"]'));
    expect(document.querySelector('[role="alert"]')!.textContent).toBe('⚠ Not a plot style table: choose a CTB (by colour) or an STB (named styles) file.');
    expect(onSave).not.toHaveBeenCalled();
    await chooseFile('Office.ctb', ctb(), () => onSave.mock.calls.length === 1);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(onSave.mock.calls[0][1]).toBe('Office.ctb imported as a pen table · ⌘Z to undo');
    expect(tablesOf(onSave.mock.calls[0][0]).find((x) => x.name === 'Office')).toMatchObject({ ctb: 'Office.ctb', pens: { devices: { w: 0.7, grey: 60 } } });
    expect(tablesOf(onSave.mock.calls[0][0]).find((x) => x.name === 'Office')!.stb).toBeUndefined();
    expect(document.querySelector('[aria-label="Pens"] thead')!.textContent).toBe('LineWidth (mm)Ink');
  });

  it('page setup: a table from an STB file is marked (STB) in the pen table list', () => {
    const lit = placeLvPoint(villa, { building: 'V', level: 'GF' }, 'ltg', 'DB-GF1-Y1', 6, 5).project;
    const { set, ids } = addPlanSheets(setOf(lit), lit, 'lighting');
    const p = withTable(withTable({ ...lit, drawingSet: set }, { ...DEFAULT_PENS, id: 'pt1', name: 'Heavy', ctb: 'Heavy.ctb' }), { ...DEFAULT_PENS, id: 'pt2', name: 'Office', stb: { file: 'Office.stb', styles: [], by: {} } });
    act(() => root.render(<PageSetupDialog project={p} sheet={set.sheets.find((s) => s.id === ids[0])!} onSave={vi.fn()} onClose={() => {}} />));
    expect(options('Pen table')).toEqual(['LVDS Electrical', 'Heavy (CTB)', 'Office (STB)']);
  });
});
