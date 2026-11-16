// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CadFilePaper } from './CadFilePaper';
import type { CadText, FileLayout } from '../../engines/cad/cadEngine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type P = [number, number];
/** A 2D context that notes each text drawn with its font, and each fill with its points and opacity (kept with save
 * and restore). */
function recorder() {
  let pts: P[] = [];
  const texts: { s: string; font: string }[] = [], fills: { pts: P[]; alpha: number }[] = [], alphas: unknown[] = [];
  const clips: { pts: P[]; rule?: string }[] = [], strokes: P[][] = [];
  const state: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const own: Record<string, unknown> = {
    save: () => { alphas.push(state.globalAlpha); },
    restore: () => { state.globalAlpha = alphas.pop() ?? state.globalAlpha; },
    fillText: (s: string) => { texts.push({ s, font: state.font as string }); },
    measureText: () => ({ width: 10 }),
    beginPath: () => { pts = []; },
    moveTo: (x: number, y: number) => { pts.push([x, y]); },
    lineTo: (x: number, y: number) => { pts.push([x, y]); },
    fill: () => { fills.push({ pts, alpha: state.globalAlpha as number }); },
    clip: (rule?: string) => { clips.push({ pts, rule }); },
    stroke: () => { strokes.push(pts); }
  };
  const ctx = new Proxy({}, {
    get: (_, k) => (typeof k === 'string' && k in own ? own[k] : k in state ? state[k] : () => {}),
    set: (_, k, v) => { state[k] = v; return true; }
  });
  return { ctx, texts, fills, clips, strokes };
}

const text = (s: string, h: number, w?: number): CadText => ({ x: 20, y: 20, h, rot: 0, s, layer: 0, rgb: 0, align: 0, ...(w ? { w } : {}) });
/** An A3 layout (mm) with texts on its paper and no viewports. */
const layout = (texts: CadText[]) => ({
  name: 'Layout1', tab: 1, paper: [420, 297], margins: [0, 0, 0, 0], at: [0, 0], mm_per_unit: 1, viewports: [],
  origin: [0, 0], segs: new Float32Array(), segColors: new Uint32Array(), segLayers: new Uint16Array(), texts, layers: []
}) as unknown as FileLayout;
const model = { segs: new Float32Array(), segLayers: new Uint16Array(), info: { origin: [0, 0], layers: [], texts: [] } } as never;

let root: Root, host: HTMLDivElement, rec: ReturnType<typeof recorder>;
const box = { clientWidth: 900, clientHeight: 600 };
beforeEach(() => {
  rec = recorder();
  HTMLCanvasElement.prototype.getContext = (() => rec.ctx) as unknown as HTMLCanvasElement['getContext'];
  for (const [k, v] of Object.entries(box)) Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => v });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove();
  for (const k of Object.keys(box)) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
});

describe('file layout paper view: texts', () => {
  // Fitted to 900 × 600 px less 28 px round: the 420 × 297 mm paper at (600 − 56) / 297 px a mm.
  const k = (600 - 56) / 297;

  it('sizes a text so its capitals are its height, as CAD measures text', () => {
    act(() => root.render(<CadFilePaper layout={layout([text('TITLE', 5)])} model={model} />));
    const drawn = rec.texts.filter((t) => t.s === 'TITLE');
    expect(drawn.length).toBeGreaterThan(0);
    // The stand-in canvas measures no ink: an em of 1 / 0.7 times the capitals.
    for (const t of drawn) expect(Number(/^([\d.]+)px sans-serif$/.exec(t.font)?.[1])).toBeCloseTo((5 * k) / 0.7);
  });

  it('shows a text too small to read as a faint bar where its words are, not as nothing', () => {
    act(() => root.render(<CadFilePaper layout={layout([text('SMALL', 0.5), text('FITTED', 0.5, 40)])} model={model} />));
    expect(rec.texts).toEqual([]);
    const bars = rec.fills.filter((f) => f.alpha === 0.5);
    expect(bars.length).toBeGreaterThan(0);
    const [small, fitted] = bars.slice(-2).map((b) => { const xs = b.pts.map((q) => q[0]), ys = b.pts.map((q) => q[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; });
    // A pixel tall (its capitals are less); its words' natural width (0.1 px a px of font), or the width it is fitted to.
    expect(small[1]).toBeCloseTo(1);
    expect(small[0]).toBeCloseTo((0.1 * 0.5 * k) / 0.7);
    expect(fitted[0]).toBeCloseTo(40 * k);
  });
});

describe('file layout paper view: a clipped viewport (VPCLIP)', () => {
  const k = (600 - 56) / 297, ox = (900 - 420 * k) / 2, oy = (600 + 297 * k) / 2;
  const px = ([x, y]: P): P => [ox + x * k, oy - y * k];
  it('cuts the model at the viewport\'s outline and draws the outline as its frame', () => {
    // A viewport 200 × 100 mm from 10, 10 (mm from the paper's lower left) whose top right quarter is cut away.
    const clip: P[] = [[0, 0], [0.5, 0], [0.5, 0.5], [1, 0.5], [1, 1], [0, 1]];
    const l = { ...layout([]), viewports: [{ x: 10, y: 10, w: 200, h: 100, cx: 0, cy: 0, vh: 10000, locked: false, on: true, clip }] } as FileLayout;
    act(() => root.render(<CadFilePaper layout={l} model={model} />));
    const want = ([[10, 110], [110, 110], [110, 60], [210, 60], [210, 10], [10, 10]] as P[]).map(px);
    const cut = rec.clips.find((c) => c.rule === 'evenodd')!;
    expect(cut.pts).toHaveLength(6);
    cut.pts.forEach((q, i) => { expect(q[0]).toBeCloseTo(want[i][0]); expect(q[1]).toBeCloseTo(want[i][1]); });
    expect(rec.strokes.some((s) => s.length === 6 && s.every((q, i) => Math.abs(q[0] - want[i][0]) < 1e-6 && Math.abs(q[1] - want[i][1]) < 1e-6))).toBe(true);
    // Without an outline the viewport is cut at its frame, a rectangle (no corners noted).
    rec.clips.length = 0;
    act(() => root.render(<CadFilePaper layout={{ ...l, viewports: l.viewports.map(({ clip: _c, ...v }) => v) }} model={model} />));
    expect(rec.clips.filter((c) => c.rule === 'evenodd').every((c) => c.pts.length === 0)).toBe(true);
  });
});

