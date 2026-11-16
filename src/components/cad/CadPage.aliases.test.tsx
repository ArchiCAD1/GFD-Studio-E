// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadPage from './CadPage';
import { useCad, type CadState } from './cadState';
import { useSheetUi } from '../sld/sheetUi';
import type { CadShow } from './cadObjectMenus';
import '../../engines/cad/cadOps'; // loaded ahead: the engine loads it on demand, which a busy test run can make slow
import { sampleProject } from '../../data/sampleProject';
import type { Project } from '../../types';
import { DRAFT_DEFAULTS, type DraftSettings } from '../../model/cadDraft';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no canvas drawing or resize observer: drawing is skipped, the page still works (the view is 800 × 500).
class Stub { moveTo() {} lineTo() {} closePath() {} observe() {} disconnect() {} }
Object.assign(globalThis, { Path2D: Stub, ResizeObserver: Stub });
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];

const root0 = path.resolve(__dirname, '../../..');
const bytes = (rel: string) => new Uint8Array(readFileSync(path.join(root0, rel)));
const villa: Project = {
  ...sampleProject, id: 'p1', cadPlanLinks: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }] }], rooms: [] }
};
let root: Root, host: HTMLDivElement, state: CadState, project: Project;
const onChange = vi.fn((p: Project, _message: string) => { project = p; });
const onPrefs = vi.fn((_p: { draft: DraftSettings; autosaveMin: number }) => {});
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); localStorage.clear(); project = villa; onChange.mockClear();
  (window as { lvds?: unknown }).lvds = { cadFile: {
    engine: async () => bytes('electron/cad/lvds_cad_reader_bg.wasm'),
    sampleBytes: vi.fn(async (name: string) => ({ file: name, bytes: bytes(`electron/samples/${name}`) })),
    openBytes: vi.fn(async () => ({ file: 'plan.dwg', path: '/plans/plan.dwg', bytes: bytes('tests/fixtures/cad/plan-2018.dwg') }))
  } };
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; delete (window as { lvds?: unknown }).lvds; });

function Host({ start = villa, show }: { start?: Project; show?: (s: CadShow) => void }) {
  const cad = useCad('p1');
  const [p, setP] = useState(start);
  const sheetUi = useSheetUi();
  const [draft, setDraft] = useState(DRAFT_DEFAULTS);
  state = cad;
  return <CadPage cad={cad} project={p} onChange={(next, msg) => { setP(next); onChange(next, msg); }} onStatus={() => {}} sheetUi={sheetUi}
    draft={draft} onPrefs={(x) => { setDraft(x.draft); onPrefs(x); }} onShow={show} />;
}
/** Waits for something on screen (a slower machine takes longer), up to 10 s. */
const until = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); expect(ok()).toBe(true); };
const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const command = async (text: string) => {
  const input = document.querySelector('input[aria-label="Command"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { input.form!.requestSubmit(); });
};
/** Drawing units → canvas pixels, through the fitted 800 × 500 view. */
const screenOf = (x: number, y: number) => {
  const { extents: [x0, y0, x1, y1] } = state.view!.info;
  const scale = Math.min(800 / (x1 - x0), 500 / (y1 - y0)) * 0.92;
  return [(x - (x0 + x1) / 2) * scale + 400, 250 - (y - (y0 + y1) / 2) * scale];
};
/** A selection window dragged from one point to another (drawing units). */
const dragWindow = async (a: [number, number], b: [number, number]) => {
  const [[ax, ay], [bx, by]] = [screenOf(...a), screenOf(...b)];
  const c = document.querySelector('canvas.cad-over')!;
  await act(async () => {
    c.dispatchEvent(new MouseEvent('mousedown', { clientX: ax, clientY: ay, button: 0, bubbles: true }));
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: (ax + bx) / 2, clientY: (ay + by) / 2, bubbles: true }));
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: bx, clientY: by, bubbles: true }));
    c.dispatchEvent(new MouseEvent('mouseup', { clientX: bx, clientY: by, button: 0, bubbles: true }));
  });
};
/** A click on the drawing at a point in drawing units, through the fitted 800 × 500 view. */
const clickAt = async (x: number, y: number, shiftKey = false) => {
  const [sx, sy] = screenOf(x, y);
  const c = document.querySelector('canvas.cad-over')!;
  await act(async () => {
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: sx, clientY: sy, bubbles: true }));
    c.dispatchEvent(new MouseEvent('mouseup', { clientX: sx, clientY: sy, button: 0, shiftKey, bubbles: true }));
  });
};


describe('CAD command aliases (2026-11-14)', () => {
  const line = (id: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer: 'LV-SKETCH', pts: [a, b] });
  const X = 200000;
  const two: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', [X, 0], [X + 4000, 0]), line('S2', [X + 6000, 1000], [X + 6000, 5000])] }] };
  const hist = () => document.querySelector('.cad-hist')?.textContent ?? '';
  const items = () => project.cadSketch![0].items;
  const start = async () => { project = two; act(() => root.render(<Host start={two} />)); await flush(); act(() => state.toggle('osnap')); };
  /** S1 picked, then ALIGN: the first source point is asked. */
  const alignS1 = async () => {
    await dragWindow([X - 500, -500], [X + 4500, 500]);
    await command('ALIGN');
    await until(() => hist().includes('ALIGN  Specify first source point:'));
  };

  it('TR is Trim and TRACE traces a room', async () => {
    await start();
    await command('TR');
    await until(() => hist().includes('TRIM  Click the part to cut away'));
    expect(state.tool).toBe('trim');
    await command('TRACE');
    await until(() => state.tool === 'trace');
  });

  it('XL draws XLINE construction lines and RAY draws rays, retaining the base until Enter', async () => {
    await start();
    await command('XL');
    await until(() => state.tool === 'xline');
    await command(`${X},7000`);
    await command(`${X + 1000},7000`);
    await command(`${X},8000`);
    await until(() => items().filter((x) => x.infinite === 'xline').length === 2);
    const xlines = items().filter((x) => x.infinite === 'xline');
    expect(xlines.map((x) => x.pts)).toEqual([[[X, 7000], [X + 1000, 7000]], [[X, 7000], [X, 8000]]]);
    await command('');
    await until(() => state.tool === 'none');

    await command('RAY');
    await until(() => state.tool === 'ray');
    await command(`${X},9000`);
    await command(`@1000<90`);
    await until(() => items().some((x) => x.infinite === 'ray'));
    const ray = items().find((x) => x.infinite === 'ray')!;
    expect(ray.pts[0]).toEqual([X, 9000]);
    expect(ray.pts[1][0]).toBeCloseTo(X, 9);
    expect(ray.pts[1][1]).toBeCloseTo(10000, 9);
  });

  it('LA opens the layer palette, LAYERS shows the Layers panel', async () => {
    await start();
    const side = state.showLayers;
    await command('LA');
    await until(() => !!document.querySelector('[aria-label="Layer palette"]'));
    expect(state.showLayers).toBe(side);
    await command('LA');
    await until(() => !document.querySelector('[aria-label="Layer palette"]'));
    await command('LAYERS');
    await until(() => state.showLayers === !side);
  });

  it('MA then a click on a drawn line hands over to the properties match, asking for the destination', async () => {
    await start();
    await command('MA');
    await until(() => hist().includes('MA  Match: click the device (or drawn object) to copy from:'));
    await clickAt(X + 2000, 0);
    await until(() => state.tool === 'matchprop');
    await until(() => hist().includes('MATCHPROP  Select destination object(s):'));
    expect(hist()).not.toContain('Select the source object');
  });

  it('ALIGN with one pair moves, with two pairs turns (and N does not scale), Y scales', async () => {
    await start();
    await alignS1();
    await command(`${X},0`);
    await until(() => hist().includes('ALIGN  Specify first destination point:'));
    await command(`${X + 1000},1000`);
    await until(() => hist().includes('ALIGN  Specify second source point or <continue>:'));
    await command(`${X},0`);
    await until(() => hist().includes('ALIGN  The source points are the same: specify the second source point again:'));
    await command(`${X + 4000},0`);
    await until(() => hist().includes('ALIGN  Specify second destination point:'));
    await command(`${X + 1000},1000`);
    await until(() => hist().includes('ALIGN  The destination points are the same: specify the second destination point again:'));
    await command(`${X + 1000},3000`);
    await until(() => hist().includes('ALIGN  Scale objects to the alignment points? [Yes/No] <No>:'));
    await command('N'); // answers the question; it is not the NEW command
    await until(() => onChange.mock.calls.some((c) => String(c[1]).startsWith('ALIGN')));
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('ALIGN  1 object aligned, turned 90° · ⌘Z to undo');
    const [a, b] = items().find((x) => x.id === 'S1')!.pts;
    expect([a[0], a[1], b[0], b[1]].map(Math.round)).toEqual([X + 1000, 1000, X + 1000, 5000]);
    expect(state.tool).toBe('none');
  });

  it('ALIGN with Enter at the second source point only moves', async () => {
    await start();
    await alignS1();
    await command(`${X},0`);
    await command(`${X},2000`);
    await until(() => hist().includes('ALIGN  Specify second source point or <continue>:'));
    await command('');
    await until(() => onChange.mock.calls.some((c) => c[1] === 'ALIGN  1 object aligned (moved) · ⌘Z to undo'));
    expect(items().find((x) => x.id === 'S1')!.pts).toEqual([[X, 2000], [X + 4000, 2000]]);
  });

  it('ALIGN: Yes at the scale question scales to the destination length', async () => {
    await start();
    await alignS1();
    await command(`${X},0`);
    await command(`${X},0`);
    await command(`${X + 4000},0`);
    await command(`${X},2000`);
    await until(() => hist().includes('Scale objects to the alignment points?'));
    await command('Y');
    await until(() => onChange.mock.calls.some((c) => String(c[1]).includes('scaled')));
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe('ALIGN  1 object aligned, turned 90°, scaled 0.5 · ⌘Z to undo');
    const [a, b] = items().find((x) => x.id === 'S1')!.pts;
    expect([a[0], a[1], b[0], b[1]].map(Math.round)).toEqual([X, 0, X, 2000]);
  });

  it('PP and PRINT run PLOT, which on the Model tab is the PDF of the view, as EXPORTPDF', async () => {
    await start();
    const exported = () => state.history.filter((h) => h.startsWith('EXPORT')).length;
    await command('EXPORTPDF');
    await until(() => exported() === 1);
    await command('PP');
    await until(() => exported() === 2);
    await command('PRINT');
    await until(() => exported() === 3);
    expect(state.history.filter((h) => h === 'Command: PLOT')).toHaveLength(2);
  });
});
