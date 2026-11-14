// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadCanvas, { type CadToggles } from './CadCanvas';
import type { CadView } from '../../engines/cad/cadEngine';
import type { SketchItem } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type P = [number, number];
class Stub { pts: P[] = []; moveTo(x: number, y: number) { this.pts.push([x, y]); } lineTo(x: number, y: number) { this.pts.push([x, y]); } closePath() {} arc() {} observe() {} disconnect() {} }
Object.assign(globalThis, { Path2D: Stub, ResizeObserver: Stub });

type M = [number, number, number, number, number, number];
/** A 2D context that keeps the transform and opacity (with save / restore) and notes the transform each stroke is made with; each
 * text drawn with its font and the scale it was drawn at, and each fill with its points and opacity, both with the
 * view's scale (pixels a drawing unit) of the draw they belong to. */
function recorder() {
  let m: M = [1, 0, 0, 1, 0, 0], view = 0, sc: number[] | null = null, pts: P[] = [];
  const stack: M[] = [], scStack: (number[] | null)[] = [], alphas: unknown[] = [], strokes: { m: M; lineWidth: number }[] = [], scales: number[][] = [], words: string[] = [];
  const texts: { s: string; font: string; scale: number[] | null; view: number }[] = [], fills: { pts: P[]; alpha: number; view: number }[] = [];
  const state: Record<string | symbol, unknown> = { lineWidth: 1, globalAlpha: 1 };
  const own: Record<string, unknown> = {
    setTransform: (...a: number[]) => { m = a as M; if (a[3] < 0) view = a[0]; },
    save: () => { stack.push(m); scStack.push(sc); alphas.push(state.globalAlpha); },
    restore: () => { m = stack.pop() ?? m; sc = scStack.pop() ?? null; state.globalAlpha = alphas.pop() ?? state.globalAlpha; },
    stroke: () => { strokes.push({ m, lineWidth: state.lineWidth as number }); },
    scale: (...a: number[]) => { scales.push(a); sc = a; },
    fillText: (t: string) => { words.push(t); texts.push({ s: t, font: state.font as string, scale: sc, view }); },
    measureText: () => ({ width: 10 }),
    beginPath: () => { pts = []; },
    moveTo: (x: number, y: number) => { pts.push([x, y]); },
    lineTo: (x: number, y: number) => { pts.push([x, y]); },
    fill: (p?: unknown) => { fills.push({ pts: p instanceof Stub ? p.pts : pts, alpha: state.globalAlpha as number, view }); }
  };
  const ctx = new Proxy({}, {
    get: (_, k) => (typeof k === 'string' && k in own ? own[k] : k in state ? state[k] : () => {}),
    set: (_, k, v) => { state[k] = v; return true; }
  });
  return { ctx, strokes, scales, words, texts, fills, depth: () => stack.length };
}
/** A font's size in px. */
const fontPx = (font: string) => Number(/([\d.]+)px/.exec(font)?.[1]);
/** The extent of points: its width and height. */
const extent = (pts: P[]) => { const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };

function drawing(texts: unknown[] = []) {
  return {
    file: 'plan.dxf', bytes: new Uint8Array(), engine: 'worker', segs: new Float32Array(), segLayers: new Uint16Array(), segColors: new Uint32Array(), segLinetypes: new Uint16Array(),
    info: { format: 'DXF', units: 4, origin: [0, 0], extents: [0, 0, 8000, 5000], layers: [], texts: texts as never[], segments: 0, snaps: 0, truncated: false, linetypes: [[]], fills: [] },
    snap: vi.fn(async () => new Float64Array()), pick: vi.fn(async () => null), outlines: () => [], blocks: () => [], close: vi.fn()
  } as unknown as CadView;
}

const OFF: CadToggles = { snap: false, osnap: false, ortho: false, grid: false };
let root: Root, host: HTMLDivElement, rec: ReturnType<typeof recorder>;

beforeEach(() => {
  rec = recorder();
  HTMLCanvasElement.prototype.getContext = (() => rec.ctx) as unknown as HTMLCanvasElement['getContext'];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('drawn objects on the canvas', () => {
  it('draws every object in drawing units, also those after an object with no words', () => {
    const sketch: SketchItem[] = [
      { id: 'a', kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [1000, 0]] },
      { id: 'b', kind: 'circle', layer: 'LV-SKETCH', pts: [[2000, 2000]], r: 510 },
      { id: 'c', kind: 'text', layer: 'LV-SKETCH', pts: [[0, 3000]], text: 'DB-1', h: 250 },
      { id: 'd', kind: 'circle', layer: 'LV-SKETCH', pts: [[4000, 2000]], r: 510 }
    ];
    act(() => root.render(<CadCanvas view={drawing()} layersOn={new Uint8Array()} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} sketch={sketch} />));
    // The view is zoomed out (under 0.1 pixel a unit), so a line drawn in screen pixels would be some 16 pixels wide.
    const drawn = rec.strokes.filter((s) => s.m[3] < 0); // drawing units: y up, so a negative y scale
    expect(drawn.length % 3).toBe(0); // the line and both circles, each time the view is drawn
    expect(drawn.length).toBeGreaterThan(0);
    for (const s of drawn) expect(s.lineWidth * -s.m[3]).toBeCloseTo(1.5);
    // Nothing on the screen stroked wider than 3 pixels (a picked object).
    expect(rec.strokes.filter((s) => s.lineWidth * Math.abs(s.m[3]) > 3)).toEqual([]);
    expect(rec.depth()).toBe(0);
  });

  it('squeezes or stretches a text fitted to a width, and leaves the others alone', () => {
    const texts = [
      { x: 100, y: 100, h: 100, rot: 0, s: 'FIT', layer: 0, rgb: 0, align: 0, w: 5000 },
      { x: 100, y: 3000, h: 100, rot: 0, s: 'PLAIN', layer: 0, rgb: 0, align: 0 }
    ];
    act(() => root.render(<CadCanvas view={drawing(texts)} layersOn={new Uint8Array([1])} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} />));
    expect(rec.words).toContain('FIT');
    expect(rec.words).toContain('PLAIN');
    // Natural width 10 (measureText), the width asked 5000 drawing units: x is scaled by 5000 × the view scale / 10, y by 1.
    const fitted = rec.scales.filter((a) => a[1] === 1 && a[0] !== 1);
    expect(fitted.length).toBeGreaterThan(0);
    // Per draw: one text is scaled, the other is not.
    expect(fitted.length).toBe(rec.words.filter((w) => w === 'FIT').length);
  });

  it('sizes a text so its capitals are its height, as CAD measures text', () => {
    // A canvas font is sized by its em: here 1 / 0.7 times its capitals (the stand-in canvas measures no ink).
    const texts = [{ x: 100, y: 300, h: 100, rot: 0, s: 'PLAIN', layer: 0, rgb: 0, align: 0 }];
    act(() => root.render(<CadCanvas view={drawing(texts)} layersOn={new Uint8Array([1])} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} />));
    const drawn = rec.texts.filter((t) => t.s === 'PLAIN');
    expect(drawn.length).toBeGreaterThan(1); // as first drawn, then fitted to the window
    for (const t of drawn) {
      expect(t.font.endsWith('px system-ui, sans-serif')).toBe(true);
      expect(fontPx(t.font)).toBeCloseTo((100 * t.view) / 0.7);
    }
  });

  it('keeps a large text in shape: past a 200 px font it is scaled up evenly, a fitted one also to its width', () => {
    const texts = [
      { x: 100, y: 100, h: 2000, rot: 0, s: 'FIT', layer: 0, rgb: 0, align: 0, w: 5000 },
      { x: 100, y: 3000, h: 2000, rot: 0, s: 'PLAIN', layer: 0, rgb: 0, align: 0 }
    ];
    act(() => root.render(<CadCanvas view={drawing(texts)} layersOn={new Uint8Array([1])} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} />));
    const drawn = rec.texts.filter((t) => t.s === 'FIT' || t.s === 'PLAIN');
    expect(drawn.length).toBeGreaterThan(2);
    for (const t of drawn) {
      const up = (2000 * t.view) / 0.7 / 200;
      expect(up).toBeGreaterThan(1);
      expect(fontPx(t.font)).toBe(200);
      // Natural width 10 at that font: the fitted one goes to 5000 units across, the other as tall as it is wide.
      expect(t.scale?.[0]).toBeCloseTo(t.s === 'FIT' ? (5000 * t.view) / 10 : up);
      expect(t.scale?.[1]).toBeCloseTo(up);
    }
  });

  it('shows a text too small to read as a faint bar where its words are, not as nothing', () => {
    // 10 units tall: words as first drawn (a pixel a unit), a bar once fitted to the window (under 0.2 px a unit).
    const texts = [
      { x: 100, y: 300, h: 10, rot: 0, s: 'FITTED', layer: 0, rgb: 0, align: 0, w: 400 },
      { x: 100, y: 200, h: 10, rot: 0, s: 'NATURAL', layer: 0, rgb: 0, align: 0 }
    ];
    act(() => root.render(<CadCanvas view={drawing(texts)} layersOn={new Uint8Array([1])} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} />));
    expect(rec.texts.filter((t) => t.view === 1).map((t) => t.s)).toEqual(['FITTED', 'NATURAL']);
    const out = Math.min(...rec.fills.map((f) => f.view));
    expect(out).toBeLessThan(0.2);
    expect(rec.texts.filter((t) => t.view === out)).toEqual([]);
    const bars = rec.fills.filter((f) => f.view === out && f.alpha === 0.5);
    expect(bars.length).toBe(1); // both in one batch: one colour
    expect(bars[0].pts.length).toBe(8);
    // A pixel tall (its capitals are less), as long as the width fitted to, or its words' natural width (0.1 px a px of font).
    const [fitW, fitH] = extent(bars[0].pts.slice(0, 4)), [natW, natH] = extent(bars[0].pts.slice(4));
    expect(fitH).toBeCloseTo(1);
    expect(natH).toBeCloseTo(1);
    expect(fitW).toBeCloseTo(400 * out);
    expect(natW).toBeCloseTo((0.1 * 10 * out) / 0.7);
  });

  it('draws the words of the first 6000 texts a draw, and bars for the rest rather than leaving them out', () => {
    const texts = Array.from({ length: 6003 }, (_, i) => ({ x: 100 + (i % 50) * 150, y: 100 + Math.floor(i / 50) * 40, h: 100, rot: 0, s: `T${i}`, layer: 0, rgb: 0, align: 0 }));
    act(() => root.render(<CadCanvas view={drawing(texts)} layersOn={new Uint8Array([1])} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} />));
    const out = Math.min(...rec.texts.map((t) => t.view));
    expect(rec.texts.filter((t) => t.view === out).length).toBe(6000);
    const bars = rec.fills.filter((f) => f.view === out && f.alpha === 0.5);
    expect(bars.map((b) => b.pts.length)).toEqual([12]);
  });

  it('shows a drawn text or note too small to read as a faint bar too', () => {
    const sketch: SketchItem[] = [
      { id: 't', kind: 'text', layer: 'LV-SKETCH', pts: [[100, 3000]], text: 'DB-1', h: 10 },
      { id: 'n', kind: 'mtext', layer: 'LV-SKETCH', pts: [[100, 4000]], h: 10, w: 1500, note: [{ runs: [{ s: 'GENERAL NOTES' }] }] }
    ];
    act(() => root.render(<CadCanvas view={drawing()} layersOn={new Uint8Array()} toggles={OFF} fitKey={1} onCursor={() => {}} onClick={() => {}} sketch={sketch} />));
    expect(rec.texts.filter((t) => t.view === 1).map((t) => t.s)).toEqual(['DB-1', 'GENERAL NOTES']);
    const out = Math.min(...rec.fills.map((f) => f.view));
    expect(rec.texts.filter((t) => t.view === out)).toEqual([]);
    const bars = rec.fills.filter((f) => f.view === out && f.alpha === 0.5);
    expect(bars.length).toBe(2);
    for (const b of bars) { expect(b.pts.length).toBe(4); expect(extent(b.pts)[1]).toBeCloseTo(1); }
    expect(rec.depth()).toBe(0);
  });
});
