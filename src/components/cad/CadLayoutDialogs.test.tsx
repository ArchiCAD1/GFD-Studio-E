// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportLayoutsDialog, LayoutManagerDialog, LayoutPaperDialog, LayoutPlotDialog, LayoutTemplatesDialog, ScaleListDialog } from './CadLayoutDialogs';
import type { ManagerRow } from './cadLayoutManager';
import { loadLayoutTemplates, saveLayoutTemplates, templateFromPaper } from '../../model/layoutTemplates';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const files = vi.hoisted(() => ({ saveText: vi.fn(async () => 'Saved x'), saveBinary: vi.fn(async () => 'Saved Layout2.pdf'), savePdf: vi.fn(async () => 'Saved by the browser') }));
vi.mock('../../util/files', async (orig) => ({ ...(await orig<typeof import('../../util/files')>()), saveText: files.saveText, saveBinary: files.saveBinary, savePdf: files.savePdf }));
// The preview itself (PDF.js) is not run here: the dialog hands it its title and how to make the PDF.
const previews = vi.hoisted(() => [] as { title: string; load: (toBytes: (o: { html: string; cssPages?: boolean }) => Promise<Uint8Array>) => Promise<{ bytes: Uint8Array; name: string }>; onClose: () => void }[]);
vi.mock('../docs/SheetPdfPreview', async () => {
  const { createElement } = await import('react');
  return { canPreviewSheetPdf: () => !!window.lvds?.files?.pdfBytes, PdfPreview: (p: (typeof previews)[number]) => { previews.push(p); return createElement('div', { 'aria-label': 'PDF preview mock' }, p.title); } };
});
let root: Root, host: HTMLDivElement;
beforeEach(() => { localStorage.clear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; files.saveText.mockClear(); files.saveBinary.mockClear(); files.savePdf.mockClear(); previews.length = 0; vi.unstubAllGlobals(); });

const button = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t) as HTMLButtonElement;
const click = (b: Element) => act(() => { (b as HTMLElement).click(); });
const type = (label: string, value: string) => {
  const el = document.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement | HTMLInputElement;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
};
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const rows = () => [...document.querySelectorAll('[aria-label="Layout templates"] tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));
const std = (name: string, scale?: number) => templateFromPaper(name, [420, 297], [{ x: 10, y: 10, w: 400, h: 277, scale }]);
const setFile = (text: string) => {
  const input = document.querySelector('[aria-label="Layout template file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [{ text: async () => text }] });
  act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
};

describe('Layout templates dialog', () => {
  const props = () => ({ canSheet: true, onNew: vi.fn(), onStatus: vi.fn(), onClose: vi.fn() });

  it('says so when the library is empty; without a layout showing it cannot save', () => {
    act(() => root.render(<LayoutTemplatesDialog {...props()} />));
    expect(document.body.textContent).toContain('No layout templates yet: open a layout and save it as one.');
    expect(document.body.textContent).toContain('Open a layout tab to save it as a template.');
    expect(button('Save as template')).toBeUndefined();
    expect(button('New layout').disabled).toBe(true);
  });

  it('saves the layout showing under a name (the same name replaces it), lists it, and keeps it in the library', () => {
    const p = props(), make = vi.fn((n: string) => std(n, 100));
    act(() => root.render(<LayoutTemplatesDialog {...p} current={{ name: 'Layout2', make }} />));
    expect((document.querySelector('[aria-label="Template name"]') as HTMLInputElement).value).toBe('Layout2');
    type('Template name', 'Standard A3');
    click(button('Save as template'));
    expect(p.onStatus).toHaveBeenLastCalledWith('Layout template Standard A3 saved to your library');
    expect(rows()).toEqual([['Standard A3', 'A3 landscape', '1 · 1:100', '—']]);
    expect(loadLayoutTemplates().map((t) => t.name)).toEqual(['Standard A3']);
    const id = loadLayoutTemplates()[0].id;
    type('Template name', 'standard a3');
    click(button('Save as template'));
    expect(loadLayoutTemplates().map((t) => [t.name, t.id])).toEqual([['standard a3', id]]);
    type('Template name', ' ');
    expect(button('Save as template').disabled).toBe(true);
  });

  it('makes a layout of the drawing or a plan sheet from the one picked, then closes', () => {
    saveLayoutTemplates([std('Alpha', 50), std('Beta')]);
    const p = props();
    act(() => root.render(<LayoutTemplatesDialog {...p} />));
    expect(rows().map((r) => [r[0], r[2]])).toEqual([['Alpha', '1 · 1:50'], ['Beta', '1 · fit']]);
    click(document.querySelectorAll('[aria-label="Layout templates"] tbody tr')[1]);
    click(button('New layout'));
    expect(p.onNew).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Beta' }), 'drawing');
    expect(p.onClose).toHaveBeenCalledTimes(1);
    type('New layout as', 'power');
    click(button('New layout'));
    expect(p.onNew).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Beta' }), 'power');
  });

  it('plan sheets are not offered when the drawing has no level', () => {
    saveLayoutTemplates([std('Alpha')]);
    act(() => root.render(<LayoutTemplatesDialog {...props()} canSheet={false} />));
    expect([...document.querySelectorAll('[aria-label="New layout as"] option')].map((o) => [o.textContent, (o as HTMLOptionElement).disabled])).toEqual([['Layout of this drawing', false], ['Lighting layout', true], ['Power layout', true], ['ELV layout', true], ['Containment layout', true]]);
  });

  it('imports a good file, refuses a bad one, exports the one picked and deletes it', async () => {
    const p = props();
    act(() => root.render(<LayoutTemplatesDialog {...p} />));
    setFile('{"nope":1}');
    await flush();
    expect(p.onStatus).toHaveBeenLastCalledWith('That file is not a layout template');
    setFile('not json at all');
    await flush();
    expect(p.onStatus).toHaveBeenLastCalledWith('That file is not a layout template');
    setFile(JSON.stringify(std('From a colleague', 200)));
    await flush();
    expect(p.onStatus).toHaveBeenLastCalledWith('Layout template From a colleague imported');
    expect(rows()).toEqual([['From a colleague', 'A3 landscape', '1 · 1:200', '—']]);
    expect(loadLayoutTemplates()).toHaveLength(1);
    await act(async () => { button('Export…').click(); });
    const [name, text, filter, ext] = files.saveText.mock.calls[0] as unknown as [string, string, string, string];
    expect([name, filter, ext, JSON.parse(text).name]).toEqual(['From-a-colleague.layout.json', 'Layout template', 'json', 'From a colleague']);
    expect(p.onStatus).toHaveBeenLastCalledWith('Saved x');
    click(button('Delete'));
    expect(p.onStatus).toHaveBeenLastCalledWith('Layout template From a colleague deleted');
    expect(loadLayoutTemplates()).toEqual([]);
    expect(button('Delete').disabled).toBe(true);
  });
});

describe('Layout page setup dialog', () => {
  const layout = { name: 'Layout2', paper: [420, 297] as [number, number], viewports: [{ x: 10, y: 10, w: 400, h: 277, cx: 0, cy: 0, vh: 20000 }] };
  it('picks a paper and an orientation; the current paper is preselected', () => {
    const onSave = vi.fn(), onClose = vi.fn();
    act(() => root.render(<LayoutPaperDialog layout={layout} onSave={onSave} onClose={onClose} />));
    expect((document.querySelector('[aria-label="Paper"]') as HTMLSelectElement).value).toBe('A3');
    expect(document.querySelector('[aria-label="Orientation"] .on')!.textContent).toBe('Landscape');
    expect(document.body.textContent).toContain('Its viewport keeps its place and scale.');
    type('Paper', 'A1');
    click(button('Portrait'));
    click(button('Save'));
    expect(onSave).toHaveBeenCalledWith([594, 841]);
    expect(onClose).toHaveBeenCalled();
  });
  it('reads a portrait paper, and offers one that is not in the list as it is', () => {
    const onSave = vi.fn();
    act(() => root.render(<LayoutPaperDialog layout={{ ...layout, paper: [297, 420] }} onSave={onSave} onClose={() => {}} />));
    expect(document.querySelector('[aria-label="Orientation"] .on')!.textContent).toBe('Portrait');
    click(button('Save'));
    expect(onSave).toHaveBeenCalledWith([297, 420]);
    act(() => root.unmount()); root = createRoot(host);
    act(() => root.render(<LayoutPaperDialog layout={{ ...layout, paper: [500, 300] }} onSave={onSave} onClose={() => {}} />));
    expect([...document.querySelectorAll('[aria-label="Paper"] option')].map((o) => o.textContent)[0]).toBe('500 × 300 mm');
    click(button('Save'));
    expect(onSave).toHaveBeenLastCalledWith([500, 300]);
    click(button('Portrait')); // a paper of its own turns too
    click(button('Save'));
    expect(onSave).toHaveBeenLastCalledWith([300, 500]);
  });
});

describe('Scale list dialog', () => {
  const ticked = () => [...document.querySelectorAll('[aria-label="Scales"] label')].filter((l) => l.querySelector('input')!.checked).map((l) => l.textContent!.trim());
  it('ticks more standard scales, adds your own, and goes back to the standard list', () => {
    const onSave = vi.fn(), onClose = vi.fn();
    act(() => root.render(<ScaleListDialog scales={[20, 50, 100, 200, 500, 1000]} onSave={onSave} onClose={onClose} />));
    expect(ticked()).toEqual(['1:20', '1:50', '1:100', '1:200', '1:500', '1:1000']);
    const all = [...document.querySelectorAll('[aria-label="Scales"] label')].map((l) => l.textContent!.trim());
    expect(all).toContain('1:75');
    click([...document.querySelectorAll('[aria-label="Scales"] label')].find((l) => l.textContent!.trim() === '1:75')!.querySelector('input')!);
    type('New scale', '33');
    click(button('Add'));
    expect((document.querySelector('[aria-label="New scale"]') as HTMLInputElement).value).toBe('');
    type('New scale', '100'); // already there: nothing is added twice
    click(button('Add'));
    expect(ticked()).toEqual(['1:20', '1:33', '1:50', '1:75', '1:100', '1:200', '1:500', '1:1000']);
    click(button('Save'));
    expect(onSave).toHaveBeenCalledWith([20, 33, 50, 75, 100, 200, 500, 1000]);
    expect(onClose).toHaveBeenCalled();
    click(button('Standard list'));
    expect(ticked()).toEqual(['1:20', '1:50', '1:100', '1:200', '1:500', '1:1000']);
  });
  it('cannot save with none ticked', () => {
    act(() => root.render(<ScaleListDialog scales={[100]} onSave={vi.fn()} onClose={() => {}} />));
    click(document.querySelector('[aria-label="Scales"] input:checked')!);
    expect(button('Save').disabled).toBe(true);
  });
});

describe('Layouts from another drawing dialog', () => {
  const list = [templateFromPaper('Layout1', [420, 297], [{ x: 10, y: 10, w: 400, h: 277, scale: 100 }]), templateFromPaper('A1 Lighting', [841, 594], [])];
  const box = (name: string) => document.querySelector(`[aria-label="Import ${name}"]`) as HTMLInputElement;
  it('lists the layouts with all ticked; the button counts the ticked; none ticked cannot import', () => {
    act(() => root.render(<ImportLayoutsDialog file="other.dxf" list={list} onImport={vi.fn()} onClose={vi.fn()} />));
    expect(document.querySelector('[aria-label="Layouts from another drawing"] h3')!.textContent).toBe('Layouts from another drawing other.dxf');
    expect([...document.querySelectorAll('[aria-label="Layouts of that drawing"] tbody tr')].map((r) => [...r.querySelectorAll('td')].slice(1).map((c) => c.textContent))).toEqual([['Layout1', 'A3 landscape', '1 · 1:100'], ['A1 Lighting', 'A1 landscape', '0']]);
    expect(box('Layout1').checked && box('A1 Lighting').checked).toBe(true);
    expect(document.body.textContent).toContain('Each comes with its paper and its viewport frames at their scales. The viewports show this drawing.');
    expect(button('Import 2 layouts')).toBeDefined();
    click(box('A1 Lighting'));
    expect(button('Import 1 layout')).toBeDefined();
    click(box('Layout1'));
    expect(button('Import 0 layouts').disabled).toBe(true);
  });
  it('imports the ticked ones, with the choice to keep them as templates (off at first), then closes', () => {
    const onImport = vi.fn(), onClose = vi.fn();
    act(() => root.render(<ImportLayoutsDialog file="other.dxf" list={list} onImport={onImport} onClose={onClose} />));
    const keep = document.querySelector('.cad-devform input[type="checkbox"]') as HTMLInputElement;
    expect(keep.checked).toBe(false);
    expect(document.querySelector('.cad-devform')!.textContent).toContain('Also keep them as layout templates (your library)');
    click(box('Layout1'));
    click(button('Import 1 layout'));
    expect(onImport).toHaveBeenCalledWith([list[1]], false);
    expect(onClose).toHaveBeenCalled();
    act(() => root.unmount()); root = createRoot(host);
    act(() => root.render(<ImportLayoutsDialog file="other.dxf" list={list} onImport={onImport} onClose={onClose} />));
    click(document.querySelector('.cad-devform input[type="checkbox"]')!);
    click(button('Import 2 layouts'));
    expect(onImport).toHaveBeenLastCalledWith(list, true);
  });
});

describe('Layout plot dialog', () => {
  const props = (over: Partial<Parameters<typeof LayoutPlotDialog>[0]> = {}) => ({ name: 'Layout2', about: '420 × 297 mm · 1 viewport at 1:100', paper: [420, 297] as [number, number], html: vi.fn(() => '<html>page</html>'), fileName: 'plan Layout2.pdf', onStatus: vi.fn(), onClose: vi.fn(), ...over });
  const desktop = (extra: Record<string, unknown> = {}) => { const pdfBytes = vi.fn(async () => new Uint8Array([1, 2, 3])); vi.stubGlobal('lvds', { files: { pdfBytes, ...extra } }); return pdfBytes; };
  it('plots a PDF: the page and its own size (css pages) go to the PDF maker, the saved-file message goes on, the dialog closes; the page is made only then', async () => {
    const pdfBytes = desktop(), p = props();
    act(() => root.render(<LayoutPlotDialog {...p} />));
    expect(document.querySelector('[aria-label="Plot"] h3')!.textContent).toBe('Plot Layout2');
    expect(document.querySelector('.cad-devform')!.textContent).toContain('420 × 297 mm · 1 viewport at 1:100');
    expect(document.querySelector('.cad-devform')!.textContent).toContain('Printing is always black-and-white.');
    expect(document.querySelector('[aria-label="Copies"]')).toBeNull(); // PDF: no copies
    expect(p.html).not.toHaveBeenCalled();
    await act(async () => { button('Plot PDF').click(); });
    expect(pdfBytes).toHaveBeenCalledWith({ html: '<html>page</html>', cssPages: true });
    expect(files.saveBinary).toHaveBeenCalledWith('plan Layout2.pdf', new Uint8Array([1, 2, 3]), 'PDF', 'pdf', 'application/pdf');
    expect(p.onStatus).toHaveBeenCalledWith('Saved Layout2.pdf');
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
  it('in a browser (no desktop app) the PDF goes through the print dialog path', async () => {
    const p = props();
    act(() => root.render(<LayoutPlotDialog {...p} />));
    expect(button('Preview')).toBeUndefined(); // needs the desktop app
    await act(async () => { button('Plot PDF').click(); });
    expect(files.savePdf).toHaveBeenCalledWith('plan Layout2.pdf', '<html>page</html>', { cssPages: true });
    expect(p.onStatus).toHaveBeenCalledWith('Saved by the browser');
    expect(p.onClose).toHaveBeenCalled();
  });
  it('says when a plot fails, and stays open', async () => {
    const pdfBytes = desktop(), p = props();
    pdfBytes.mockRejectedValueOnce(new Error('boom'));
    act(() => root.render(<LayoutPlotDialog {...p} />));
    await act(async () => { button('Plot PDF').click(); });
    expect(p.onStatus).toHaveBeenCalledWith('Plot failed: boom');
    expect(p.onClose).not.toHaveBeenCalled();
    expect(button('Plot PDF').disabled).toBe(false);
  });
  it('prints on a printer the paper suits: copies, the paper and its direction go with the page', async () => {
    const printHtml = vi.fn(async () => true);
    desktop({ printHtml, printers: async () => [{ name: 'P1', displayName: 'Plotter one', isDefault: false }] });
    const p = props();
    act(() => root.render(<LayoutPlotDialog {...p} />));
    await flush();
    type('Printer', 'P1');
    type('Copies', '2');
    expect(button('Print').disabled).toBe(false);
    expect(document.querySelector('.cad-devform')!.textContent).not.toContain('A printer takes A4 to A1');
    await act(async () => { button('Print').click(); });
    expect(printHtml).toHaveBeenCalledWith({ html: '<html>page</html>', deviceName: 'P1', copies: 2, pageSize: 'A3', landscape: true });
    expect(p.onStatus).toHaveBeenCalledWith('Sent Layout2 to P1, 2 copies');
    expect(p.onClose).toHaveBeenCalled();
  });
  it('a paper a printer does not take here plots to PDF only: the note shows and Print is off', async () => {
    const printHtml = vi.fn(async () => true);
    desktop({ printHtml, printers: async () => [{ name: 'P1', displayName: 'Plotter one', isDefault: false }] });
    const p = props({ paper: [500, 300] });
    act(() => root.render(<LayoutPlotDialog {...p} />));
    await flush();
    type('Printer', 'P1');
    expect(document.querySelector('.cad-devform')!.textContent).toContain('A printer takes A4 to A1 here: this paper plots to PDF.');
    expect(button('Print').disabled).toBe(true);
    expect(printHtml).not.toHaveBeenCalled();
    expect(p.html).not.toHaveBeenCalled();
  });
  it('a printer kept from the desktop app is not usable in a browser: the note shows and the button is off', () => {
    localStorage.setItem('lvds.plotPrinter', 'P1');
    desktop(); // PDF bytes only: no printing
    act(() => root.render(<LayoutPlotDialog {...props()} />));
    expect(document.querySelector('.cad-devform')!.textContent).toContain('Printers need the desktop app.');
    expect(button('Print').disabled).toBe(true);
  });
  it('Preview hands the preview the layout\'s name and how to make its PDF; the page is made only then', async () => {
    const pdfBytes = desktop(), p = props();
    act(() => root.render(<LayoutPlotDialog {...p} />));
    click(button('Preview'));
    expect(document.querySelector('[aria-label="PDF preview mock"]')!.textContent).toBe('Layout2');
    expect(p.html).not.toHaveBeenCalled();
    const made = await previews[0].load(pdfBytes);
    expect(pdfBytes).toHaveBeenCalledWith({ html: '<html>page</html>', cssPages: true });
    expect(made).toEqual({ bytes: new Uint8Array([1, 2, 3]), name: 'plan Layout2.pdf' });
    act(() => previews[0].onClose());
    expect(document.querySelector('[aria-label="PDF preview mock"]')).toBeNull();
  });
});

describe('Layout manager dialog', () => {
  const ROWS: ManagerRow[] = [
    { id: 'file:A1 Lighting', kind: 'file', name: 'A1 Lighting', paper: 'A1 landscape', shows: '2 viewports at 1:100, 1:500', setup: 'Paper only' },
    { id: 'dwg:Layout2', kind: 'drawing', name: 'Layout2', paper: 'A3 landscape', shows: '1 viewport at 1:100', setup: 'Paper only' },
    { id: 'dwg:Layout3', kind: 'drawing', name: 'Layout3', paper: 'A3 landscape', shows: 'no viewports', setup: 'Paper only' },
    { id: 's1', kind: 'sheet', name: 'E-LTG-001 — Ground floor', paper: 'A3', shows: 'Lighting layout · 1:100', setup: "Set's default" },
    { id: 's2', kind: 'sheet', name: 'E-PWR-001 — Ground power', paper: 'A3', shows: 'Power layout · 1:100', setup: 'A1 office' }
  ];
  const props = (over: Partial<Parameters<typeof LayoutManagerDialog>[0]> = {}) => ({
    file: 'Villa.dwg', rows: ROWS, active: 'dwg:Layout3' as string | null, setups: [{ id: 'n1', name: 'A1 office' }, { id: 'n2', name: 'A3 draft' }],
    onOpen: vi.fn(), onRename: vi.fn((): string | undefined => undefined), onCopy: vi.fn(), onMove: vi.fn(), onDelete: vi.fn(), onApplySetup: vi.fn(), onNew: vi.fn(), onClose: vi.fn(), ...over
  });
  const table = () => [...document.querySelectorAll('[aria-label="Layouts of this drawing"] tbody tr')].map((r) => [...r.querySelectorAll('td')].slice(1).map((c) => c.textContent));
  const tick = (name: string) => click(document.querySelector(`[aria-label="Pick ${name}"]`)!);
  const on = (...b: string[]) => b.map((t) => !button(t).disabled);
  const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });

  it('lists every layout with its kind, paper, what it shows and page setup, marks the one showing, and ticks all but the file\'s own', () => {
    act(() => root.render(<LayoutManagerDialog {...props()} />));
    expect(document.querySelector('h3')!.textContent).toBe('Layout manager Villa.dwg');
    expect(table()).toEqual([
      ['A1 Lighting', 'Drawing file', 'A1 landscape', '2 viewports at 1:100, 1:500', 'Paper only'],
      ['Layout2', 'Layout', 'A3 landscape', '1 viewport at 1:100', 'Paper only'],
      ['Layout3 · current', 'Layout', 'A3 landscape', 'no viewports', 'Paper only'],
      ['E-LTG-001 — Ground floor', 'Plan sheet', 'A3', 'Lighting layout · 1:100', "Set's default"],
      ['E-PWR-001 — Ground power', 'Plan sheet', 'A3', 'Power layout · 1:100', 'A1 office']
    ]);
    expect([...document.querySelectorAll('[aria-current="true"]')].map((r) => r.querySelector('td:nth-child(2)')!.textContent)).toEqual(['Layout3 · current']);
    const file = document.querySelector('[aria-label="Pick A1 Lighting"]') as HTMLInputElement;
    expect(file.disabled).toBe(true);
    expect(file.title).toBe('As saved in the drawing file: open it, plot it or save it as a template from its tab');
  });

  it('enables the buttons by what is ticked: one for Open, Rename and Move, any for Copy and Delete; Move stops at the ends of its kind', () => {
    const p = props();
    act(() => root.render(<LayoutManagerDialog {...p} />));
    expect(on('Open', 'Rename…', 'Copy', 'Move up', 'Move down', 'Delete')).toEqual([false, false, false, false, false, false]);
    tick('Layout2');
    expect(on('Open', 'Rename…', 'Copy', 'Move up', 'Move down', 'Delete')).toEqual([true, true, true, false, true, true]); // first of its kind
    tick('Layout3');
    expect(on('Open', 'Rename…', 'Copy', 'Move up', 'Move down', 'Delete')).toEqual([false, false, true, false, false, true]);
    tick('Layout2'); // Layout3 alone: the last of the layouts made here
    expect(on('Move up', 'Move down')).toEqual([true, false]);
    click(button('Move up'));
    expect(p.onMove).toHaveBeenCalledWith('dwg:Layout3', -1);
    click(button('Move down')); // disabled: the last of its kind
    expect(p.onMove).toHaveBeenCalledTimes(1);
  });

  it('opens, copies, moves and deletes what is ticked; a delete clears the ticks', () => {
    const p = props();
    act(() => root.render(<LayoutManagerDialog {...p} />));
    tick('Layout2'); tick('E-PWR-001 — Ground power');
    click(button('Copy'));
    expect(p.onCopy).toHaveBeenCalledWith(['dwg:Layout2', 's2']);
    click(button('Delete'));
    expect(p.onDelete).toHaveBeenCalledWith(['dwg:Layout2', 's2']);
    expect(on('Copy', 'Delete')).toEqual([false, false]);
    tick('E-PWR-001 — Ground power');
    click(button('Move up'));
    expect(p.onMove).toHaveBeenCalledWith('s2', -1);
    expect(button('Move down').disabled).toBe(true);
    click(button('Open'));
    expect(p.onOpen).toHaveBeenCalledWith('s2');
    expect(p.onClose).toHaveBeenCalledTimes(1);
    click(button('New layout'));
    expect(p.onNew).toHaveBeenCalled();
    click(button('Close'));
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });

  it('a double-click on a row opens that layout, the file\'s own too, and closes the dialog; on a tick it only ticks', () => {
    const p = props();
    act(() => root.render(<LayoutManagerDialog {...p} />));
    act(() => { document.querySelector('[aria-label="Pick Layout2"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(p.onOpen).not.toHaveBeenCalled();
    act(() => { document.querySelector('[aria-label="Layouts of this drawing"] tbody tr')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(p.onOpen).toHaveBeenCalledWith('file:A1 Lighting');
    expect(p.onClose).toHaveBeenCalled();
  });

  it('renames in the row: Enter applies, an error stays with the input, Escape leaves it without closing the dialog; a layout\'s tick follows its new name', () => {
    const onRename = vi.fn((_id: string, n: string) => (n === 'Layout3' ? 'There is a layout "Layout3" already.' : undefined));
    const p = props({ onRename });
    act(() => root.render(<LayoutManagerDialog {...p} />));
    tick('Layout2');
    click(button('Rename…'));
    const input = () => document.querySelector('[aria-label="New name"]') as HTMLInputElement;
    expect(input().value).toBe('Layout2');
    expect(document.activeElement).toBe(input());
    type('New name', 'Layout3');
    key(input(), 'Enter');
    expect(onRename).toHaveBeenCalledWith('dwg:Layout2', 'Layout3');
    expect(document.querySelector('[role="alert"]')!.textContent).toBe('⚠ There is a layout "Layout3" already.');
    expect(input()).not.toBeNull();
    type('New name', 'Ground');
    key(input(), 'Enter');
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(input()).toBeNull();
    act(() => root.render(<LayoutManagerDialog {...p} rows={ROWS.map((r) => (r.id === 'dwg:Layout2' ? { ...r, id: 'dwg:Ground', name: 'Ground' } : r))} />));
    expect((document.querySelector('[aria-label="Pick Ground"]') as HTMLInputElement).checked).toBe(true);
    click(button('Rename…'));
    key(input(), 'Escape');
    expect(input()).toBeNull();
    expect(p.onClose).not.toHaveBeenCalled();
    expect(onRename).toHaveBeenCalledTimes(2);
  });

  it('renames a plan sheet by its title', () => {
    const p = props();
    act(() => root.render(<LayoutManagerDialog {...p} />));
    tick('E-LTG-001 — Ground floor');
    click(button('Rename…'));
    expect((document.querySelector('[aria-label="New name"]') as HTMLInputElement).value).toBe('Ground floor');
    type('New name', 'Lights');
    key(document.querySelector('[aria-label="New name"]')!, 'Enter');
    expect(p.onRename).toHaveBeenCalledWith('s1', 'Lights');
  });

  it('gives the page setup picked to the plan sheets ticked; layouts made here have their paper only', () => {
    const p = props();
    act(() => root.render(<LayoutManagerDialog {...p} />));
    expect([...document.querySelectorAll('[aria-label="Page setup to apply"] option')].map((o) => o.textContent)).toEqual(['A1 office', 'A3 draft']);
    expect(button('Apply to ticked').disabled).toBe(true);
    expect(button('Apply to ticked').title).toContain('Page setups are for plan sheets');
    tick('Layout2');
    expect(button('Apply to ticked').disabled).toBe(true);
    tick('E-LTG-001 — Ground floor'); tick('E-PWR-001 — Ground power');
    type('Page setup to apply', 'n2');
    click(button('Apply to ticked'));
    expect(p.onApplySetup).toHaveBeenCalledWith('n2', ['dwg:Layout2', 's1', 's2']);
  });

  it('says so when there are no named page setups', () => {
    act(() => root.render(<LayoutManagerDialog {...props({ setups: [] })} />));
    tick('E-LTG-001 — Ground floor');
    expect(document.body.textContent).toContain('No named page setups yet: Output → Page setups');
    expect(button('Apply to ticked').disabled).toBe(true);
    expect((document.querySelector('[aria-label="Page setup to apply"]') as HTMLSelectElement).disabled).toBe(true);
  });

  it('drops the ticks of rows that are gone', () => {
    const p = props();
    act(() => root.render(<LayoutManagerDialog {...p} />));
    tick('Layout2'); tick('Layout3');
    act(() => root.render(<LayoutManagerDialog {...p} rows={ROWS.filter((r) => r.id !== 'dwg:Layout2')} />));
    click(button('Copy'));
    expect(p.onCopy).toHaveBeenCalledWith(['dwg:Layout3']);
  });
});
