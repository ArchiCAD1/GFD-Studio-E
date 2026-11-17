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
import type { Project, SketchItem } from '../../types';
import { DRAFT_DEFAULTS, type DraftSettings } from '../../model/cadDraft';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// What the page last gave the canvas: the shadow before the click and the cursor's shape.
type Seen = { cutAway?: SketchItem[]; meets?: [number, number][]; preview?: SketchItem[]; cursorMode?: string };
const seen = vi.hoisted(() => ({ last: {} as Seen }));
vi.mock('./CadCanvas', async (importOriginal) => {
  const real = await importOriginal<typeof import('./CadCanvas')>();
  const Canvas = real.default;
  return { ...real, default: (p: Parameters<typeof Canvas>[0]) => { seen.last = { cutAway: p.cutAway, meets: p.meets, preview: p.preview, cursorMode: p.cursorMode }; return Canvas(p); } };
});
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
/** A click on the drawing at a point in drawing units, through the fitted 800 × 500 view. */
const clickAt = async (x: number, y: number, shiftKey = false) => {
  const [sx, sy] = screenOf(x, y);
  const c = document.querySelector('canvas.cad-over')!;
  await act(async () => {
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: sx, clientY: sy, bubbles: true }));
    c.dispatchEvent(new MouseEvent('mouseup', { clientX: sx, clientY: sy, button: 0, shiftKey, bubbles: true }));
  });
};


describe('Trim and Extend show the piece before the click (2026-11-17)', () => {
  const line = (id: string, a: [number, number], b: [number, number]) => ({ id, kind: 'line' as const, layer: 'LV-SKETCH', pts: [a, b] });
  const X = 200000;
  // A line crossed at 4 m by a second one, with a third 2 m past its end.
  const three: Project = { ...villa, cadSketch: [{ file: 'sample-villa-gf.dxf', items: [line('S1', [X, 0], [X + 8000, 0]), line('S2', [X + 4000, -2000], [X + 4000, 2000]), line('S3', [X + 10000, -2000], [X + 10000, 2000])] }] };
  const hist = () => document.querySelector('.cad-hist')?.textContent ?? '';
  const items = () => project.cadSketch![0].items;
  const r0 = (q: [number, number][]) => q.map((p) => p.map(Math.round));
  const hover = (x: number, y: number) => { const [sx, sy] = screenOf(x, y); return act(async () => { document.querySelector('canvas.cad-over')!.dispatchEvent(new MouseEvent('mousemove', { clientX: sx, clientY: sy, bubbles: true })); }); };
  const shift = (down: boolean) => act(() => { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: 'Shift' })); });
  const start = async () => { project = three; act(() => root.render(<Host start={three} />)); await flush(); act(() => state.toggle('osnap')); };

  it('Trim: the piece under the cursor shows faded, and the click cuts exactly that piece; the pick box stays', async () => {
    await start();
    await command('TRIM');
    await until(() => hist().includes('TRIM  Select the part to cut away (Shift-click extends):'));
    expect(seen.last.cursorMode).toBe('objects');
    await hover(X + 6000, 0);
    await until(() => !!seen.last.cutAway?.length);
    const piece = seen.last.cutAway![0];
    expect(piece.id).toBe('S1');
    expect(r0(piece.pts)).toEqual([[X + 4000, 0], [X + 8000, 0]]);
    expect(seen.last.meets).toBeUndefined();
    await clickAt(X + 6000, 0);
    await until(() => hist().includes('TRIM  4.00 m cut off'));
    expect(r0(items().find((x) => x.id === 'S1')!.pts)).toEqual([[X, 0], [X + 4000, 0]]);
    expect(seen.last.cursorMode).toBe('objects');
    // What is left ends at the 4 m line: nothing crosses it, so no shadow (a click says so, as before).
    await hover(X + 1000, 0);
    await until(() => seen.last.cutAway === undefined);
  });

  it("Shift held shows Extend's new length up to the line ahead, with a cross where it meets it; let go, the trim piece again", async () => {
    await start();
    await command('TRIM');
    await hover(X + 7500, 0);
    await until(() => !!seen.last.cutAway?.length);
    shift(true);
    await until(() => !!seen.last.meets?.length);
    expect(r0(seen.last.meets!)).toEqual([[X + 10000, 0]]);
    expect(seen.last.cutAway).toBeUndefined();
    expect(seen.last.preview!.map((it) => r0(it.pts))).toEqual([[[X + 8000, 0], [X + 10000, 0]]]);
    shift(false);
    await until(() => !!seen.last.cutAway?.length && !seen.last.meets);
  });

  it('Extend: the new length before the click is what the click adds; no line ahead, no shadow', async () => {
    await start();
    await command('EXTEND');
    await until(() => hist().includes('EXTEND  Select the end to lengthen (Shift-click trims):'));
    await hover(X + 7500, 0);
    await until(() => !!seen.last.meets?.length);
    expect(seen.last.preview!.map((it) => r0(it.pts))).toEqual([[[X + 8000, 0], [X + 10000, 0]]]);
    await clickAt(X + 7500, 0);
    await until(() => hist().includes('EXTEND  2.00 m longer'));
    expect(r0(items().find((x) => x.id === 'S1')!.pts)).toEqual([[X, 0], [X + 10000, 0]]);
    // The 4 m line's ends have nothing ahead of them.
    await hover(X + 4000, 1800);
    await until(() => seen.last.meets === undefined && seen.last.preview?.length === 0);
  });
});
