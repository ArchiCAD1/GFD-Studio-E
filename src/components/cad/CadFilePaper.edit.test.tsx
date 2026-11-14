// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CadFilePaper, type PaperEdit } from './CadFilePaper';
import { asFileLayout, type DrawingLayout } from '../../model/drawingLayouts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom gives the pane no size, so the paper is drawn at the smallest zoom; the frames' places on screen are read back
// from the frames themselves (px per mm, and where the paper's lower left corner is).
const model = { segs: new Float32Array(0), segLayers: new Uint16Array(0), info: { origin: [0, 0], layers: [], texts: [] } } as unknown as Parameters<typeof CadFilePaper>[0]['model'];
const vp = (x: number, w: number) => ({ x, y: 10, w, h: 277, cx: 0, cy: 0, vh: 27700 });
const layoutOf = (locked = false): DrawingLayout => ({ name: 'Layout2', paper: [420, 297], viewports: [{ ...vp(10, 200), ...(locked ? { locked: true } : {}) }, vp(220, 190)] });
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

function edit(over: Partial<Pick<PaperEdit, 'sel' | 'ms' | 'mv'>> = {}) {
  return { sel: null as number | null, ms: null as number | null, mv: false, onSelect: vi.fn(), onMs: vi.fn(), onBox: vi.fn(), onNew: vi.fn(), onPan: vi.fn(), onZoom: vi.fn(), ...over };
}
const show = (e: PaperEdit | undefined, l = layoutOf()) => act(() => root.render(<CadFilePaper layout={asFileLayout(l, 1)} model={model} edit={e} />));
const frame = (n: number) => document.querySelector<HTMLElement>(`.cad-vp[aria-label="Viewport ${n}"]`)!;
const pane = () => document.querySelector<HTMLElement>('.cad-filepaper')!;
/** Where a point of the paper (mm from its lower left corner) is on screen, from Viewport 1's frame (x 10, y 10 to 287 mm). */
const at = (mx: number, my: number) => {
  const f = frame(1), k = parseFloat(f.style.width) / 200, left = parseFloat(f.style.left) - 10 * k, bottom = parseFloat(f.style.top) + 277 * k + 10 * k;
  return { clientX: left + mx * k, clientY: bottom - my * k, k };
};
const mouse = (type: string, p: { clientX: number; clientY: number }, init: MouseEventInit = {}) => new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: p.clientX, clientY: p.clientY, ...init });
const fire = (el: Element, type: string, p: { clientX: number; clientY: number }, init?: MouseEventInit) => act(() => { el.dispatchEvent(mouse(type, p, init)); });
const close = (got: number[], want: number[]) => { expect(got).toHaveLength(want.length); want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 1)); };

describe('CadFilePaper: editing the viewports of a layout made here', () => {
  it('draws no frames over the paper without edit, and a frame named Viewport N for each viewport with it', () => {
    show(undefined);
    expect(document.querySelector('.cad-vps')).toBeNull();
    show(edit());
    expect(document.querySelector('.cad-vps')).not.toBeNull();
    expect([...document.querySelectorAll('.cad-vp')].map((x) => x.getAttribute('aria-label'))).toEqual(['Viewport 1', 'Viewport 2']);
  });

  it('a frame dragged by its edge is picked and moved; its corners (on the one picked only) resize it', () => {
    const e = edit();
    show(e);
    const p0 = at(100, 10), edge = frame(1).querySelector('.cad-vp-edge.b')!;
    fire(edge, 'pointerdown', p0);
    expect(e.onSelect).toHaveBeenCalledWith(0);
    const k = p0.k;
    fire(edge, 'pointermove', { clientX: p0.clientX + 40 * k, clientY: p0.clientY - 20 * k });
    fire(edge, 'pointerup', { clientX: p0.clientX + 40 * k, clientY: p0.clientY - 20 * k });
    expect(e.onBox).toHaveBeenCalledTimes(1);
    expect(e.onBox.mock.calls[0][0]).toBe(0);
    close(e.onBox.mock.calls[0][1], [50, 30, 200, 277]);
    expect(e.onBox.mock.calls[0][2]).toBe('move');
    // Corners: only on the viewport picked.
    expect(document.querySelectorAll('.cad-vp-grip')).toHaveLength(0);
    show(edit({ sel: 0 }));
    expect(frame(1).querySelectorAll('.cad-vp-grip')).toHaveLength(4);
    expect(frame(2).querySelectorAll('.cad-vp-grip')).toHaveLength(0);
    const r = edit({ sel: 0 });
    show(r);
    const grip = frame(1).querySelector('.cad-vp-grip.se')!, g0 = at(210, 10);
    fire(grip, 'pointerdown', g0);
    fire(grip, 'pointermove', { clientX: g0.clientX + 10 * k, clientY: g0.clientY + 10 * k });
    fire(grip, 'pointerup', { clientX: g0.clientX + 10 * k, clientY: g0.clientY + 10 * k });
    close(r.onBox.mock.calls[0][1], [10, 0, 210, 287]);
    expect(r.onBox.mock.calls[0][2]).toBe('resize');
  });

  it('MV: two presses on the paper make a viewport from the two corners', () => {
    const e = edit({ mv: true });
    show(e);
    const overlay = document.querySelector('.cad-vps')!;
    fire(overlay, 'pointerdown', at(30, 30));
    expect(e.onNew).not.toHaveBeenCalled();
    fire(overlay, 'pointerdown', at(130, 100));
    expect(e.onNew).toHaveBeenCalledTimes(1);
    close(e.onNew.mock.calls[0][0], [30, 30, 100, 70]);
    expect(e.onSelect).not.toHaveBeenCalled(); // a press while MV is on does not pick or move a frame
  });

  it('a double-click inside a viewport works in it, outside goes back to the paper (not when none is worked in)', () => {
    const e = edit();
    show(e);
    fire(pane(), 'dblclick', at(100, 100));
    expect(e.onMs).toHaveBeenCalledWith(0);
    fire(pane(), 'dblclick', at(215, 150));
    expect(e.onMs).toHaveBeenCalledTimes(1); // outside, with none worked in: nothing to leave
    const w = edit({ ms: 0 });
    show(w);
    fire(pane(), 'dblclick', at(100, 100));
    expect(w.onMs).not.toHaveBeenCalled(); // inside the one already worked in
    fire(pane(), 'dblclick', at(300, 100));
    expect(w.onMs).toHaveBeenLastCalledWith(1);
    fire(pane(), 'dblclick', at(215, 150));
    expect(w.onMs).toHaveBeenLastCalledWith(null);
  });

  it('in the viewport worked in the wheel zooms its view and a drag moves it; locked, neither; elsewhere the wheel zooms the paper', () => {
    const e = edit({ ms: 0 });
    show(e);
    const p = at(100, 100);
    act(() => { pane().dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100, clientX: p.clientX, clientY: p.clientY })); });
    expect(e.onZoom).toHaveBeenCalledTimes(1);
    expect(e.onZoom.mock.calls[0][0]).toBe(0);
    expect(e.onZoom.mock.calls[0][1]).toBeCloseTo(1.2, 6);
    close(e.onZoom.mock.calls[0][2], [100, 100]);
    fire(pane(), 'pointerdown', p);
    fire(pane(), 'pointermove', { clientX: p.clientX + 4, clientY: p.clientY - 2 });
    fire(pane(), 'pointerup', { clientX: p.clientX + 4, clientY: p.clientY - 2 });
    expect(e.onPan).toHaveBeenCalledTimes(1);
    expect(e.onPan.mock.calls[0][0]).toBe(0);
    expect(e.onPan.mock.calls[0][1]).toBeCloseTo(4 / p.k, 4);
    expect(e.onPan.mock.calls[0][2]).toBeCloseTo(2 / p.k, 4);
    // Locked: the wheel and a drag leave its view alone.
    const l = edit({ ms: 0 });
    show(l, layoutOf(true));
    act(() => { pane().dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100, clientX: p.clientX, clientY: p.clientY })); });
    fire(pane(), 'pointerdown', p);
    fire(pane(), 'pointermove', { clientX: p.clientX + 4, clientY: p.clientY });
    fire(pane(), 'pointerup', { clientX: p.clientX + 4, clientY: p.clientY });
    expect(l.onZoom).not.toHaveBeenCalled();
    expect(l.onPan).not.toHaveBeenCalled();
    // Outside it the wheel zooms the paper: the frames get bigger.
    const o = edit({ ms: 0 }), before = parseFloat(frame(1).style.width), out = at(215, 150);
    show(o);
    act(() => { pane().dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100, clientX: out.clientX, clientY: out.clientY })); });
    expect(o.onZoom).not.toHaveBeenCalled();
    expect(parseFloat(frame(1).style.width)).toBeGreaterThan(before);
  });

  it('a click on the paper picks nothing; a click that drags moves the paper, not the pick', () => {
    const e = edit({ sel: 0 });
    show(e);
    const p = at(215, 150);
    fire(pane(), 'pointerdown', p);
    fire(pane(), 'pointerup', p);
    expect(e.onSelect).toHaveBeenCalledWith(null);
    const d = edit({ sel: 0 });
    show(d);
    fire(pane(), 'pointerdown', p);
    fire(pane(), 'pointermove', { clientX: p.clientX + 20, clientY: p.clientY });
    fire(pane(), 'pointerup', { clientX: p.clientX + 20, clientY: p.clientY });
    expect(d.onSelect).not.toHaveBeenCalled();
    expect(d.onPan).not.toHaveBeenCalled();
  });
});
