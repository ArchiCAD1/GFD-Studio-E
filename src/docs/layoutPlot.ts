import type { CadText, CadView, FileLayout } from '../engines/cad/cadEngine';
import { paperOf, viewportMap } from '../model/fileLayouts';

/** A layout of the drawing (the file's own, or one made in Design CAD with +) as it plots: its paper with what is drawn
 * on it and the model through each viewport that is on, clipped to its frame, black on white — what the paper view
 * shows (src/components/cad/CadFilePaper.tsx), as one SVG the size of the paper. A viewport's frame prints only when
 * asked (`frames`, by its place in layout.viewports). */

type Pt = [number, number];
/** Line widths on the paper (mm): the model through a viewport, and what is drawn on the paper itself. */
export const MODEL_LINE_MM = 0.18, PAPER_LINE_MM = 0.25;
/** Text lower than this on the paper (mm) is left out: it cannot be read and only makes the file larger. */
const MIN_TEXT_MM = 0.3;
/** A drawing gives a text's height as the height of its capitals; a font's size is its em. Arial's capitals are 0.716 em. */
const EM_PER_CAP = 1 / 0.716;
const PATH_SEGMENTS = 4000; // segments per <path>, to keep each attribute a size a browser prints quickly

/** Text for the page: without the control characters XML does not take, its markup characters escaped. */
const esc = (t: string) => Array.from(t).filter((c) => c >= ' ' || c === '\t' || c === '\n').join('').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const n2 = (x: number) => String(Math.round(x * 100) / 100);

/** Segments as SVG paths (mm, to 0.01): one that starts where the last ended carries on from it. */
function pathsOf() {
  const done: string[] = [];
  let d = '', n = 0, lx = '', ly = '';
  const flush = () => { if (d) done.push(`<path d="${d}"/>`); d = ''; n = 0; lx = ''; ly = ''; };
  return {
    add([ax, ay]: Pt, [bx, by]: Pt) {
      const a = n2(ax), b = n2(ay), c = n2(bx), e = n2(by);
      if (a === c && b === e) return;
      d += a === lx && b === ly ? `L${c} ${e}` : `M${a} ${b}L${c} ${e}`;
      lx = c; ly = e;
      if (++n >= PATH_SEGMENTS) flush();
    },
    svg() { flush(); return done.join(''); }
  };
}

/** A text at its insertion point (mm on the page, y down), the height of its capitals and its fitted width in mm. */
function textSvg(t: CadText, [x, y]: Pt, hMm: number, wMm: number): string {
  if (!(hMm >= MIN_TEXT_MM) || hMm > 500 || !t.s.trim()) return '';
  const anchor = t.align === 1 ? 'middle' : t.align === 2 ? 'end' : 'start';
  const rot = t.rot ? ` transform="rotate(${n2((-t.rot * 180) / Math.PI)} ${n2(x)} ${n2(y)})"` : '';
  const fit = wMm > 0 ? ` textLength="${n2(wMm)}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${n2(x)}" y="${n2(y)}" font-size="${n2(hMm * EM_PER_CAP)}" text-anchor="${anchor}"${fit}${rot}>${esc(t.s)}</text>`;
}

export interface LayoutPlotOptions {
  /** The viewports whose frame prints, by their place in layout.viewports (default: none). */
  frames?: boolean[];
  /** The model's layers that show, in the drawing's order, as turned on, off or frozen in the app (default: as the drawing has them). */
  layersOn?: ArrayLike<number | boolean>;
}

/** The layout as an SVG of its paper (width and height in mm). */
export function layoutPlotSvg(layout: FileLayout, model: Pick<CadView, 'segs' | 'segLayers' | 'info'>, { frames = [], layersOn }: LayoutPlotOptions = {}): { svg: string; w: number; h: number } {
  const paper = paperOf(layout), W = paper.w, H = paper.h, k = layout.mm_per_unit > 0 ? layout.mm_per_unit : 1;
  // Paper space → mm on the page from its top left corner.
  const at = (x: number, y: number): Pt => { const [mx, my] = paper.mm(x, y); return [mx, H - my]; };
  const out: string[] = [];
  const [mox, moy] = model.info.origin, s = model.segs;
  const on = model.info.layers.map((l, i) => (layersOn && layersOn[i] !== undefined ? !!layersOn[i] : l.on));
  layout.viewports.forEach((v, i) => {
    if (!v.on || !(v.w > 0) || !(v.h > 0)) return;
    const map = viewportMap(v);
    const [ax, ay] = at(v.x, v.y + v.h), [bx, by] = at(v.x + v.w, v.y);
    const rect = `x="${n2(ax)}" y="${n2(ay)}" width="${n2(bx - ax)}" height="${n2(by - ay)}"`;
    // The part of the model in the frame (drawing units, relative to the model's origin), to skip the rest.
    const hw = v.w / 2 / map.scale, hh = v.h / 2 / map.scale;
    const x0 = v.cx - hw - mox, x1 = v.cx + hw - mox, y0 = v.cy - hh - moy, y1 = v.cy + hh - moy;
    const lines = pathsOf();
    for (let j = 0, n = model.segLayers.length; j < n; j++) {
      if (on[model.segLayers[j]] === false) continue;
      const a = s[j * 4], b = s[j * 4 + 1], c = s[j * 4 + 2], d = s[j * 4 + 3];
      if (Math.max(a, c) < x0 || Math.min(a, c) > x1 || Math.max(b, d) < y0 || Math.min(b, d) > y1) continue;
      const p = map.ps(a + mox, b + moy), q = map.ps(c + mox, d + moy);
      lines.add(at(p[0], p[1]), at(q[0], q[1]));
    }
    let texts = '';
    for (const t of model.info.texts) {
      if (on[t.layer] === false || t.x < x0 + mox || t.x > x1 + mox || t.y < y0 + moy || t.y > y1 + moy) continue;
      const p = map.ps(t.x, t.y);
      texts += textSvg(t, at(p[0], p[1]), t.h * map.scale * k, (t.w ?? 0) * map.scale * k);
    }
    out.push(`<clipPath id="vp${i}"><rect ${rect}/></clipPath><g clip-path="url(#vp${i})"><g fill="none" stroke="#000" stroke-width="${MODEL_LINE_MM}" stroke-linecap="round" stroke-linejoin="round">${lines.svg()}</g>${texts}</g>`);
    if (frames[i]) out.push(`<rect ${rect} fill="none" stroke="#000" stroke-width="${PAPER_LINE_MM}"/>`);
  });
  // What is drawn on the paper itself.
  const [pox, poy] = layout.origin, ps = layout.segs, lines = pathsOf();
  for (let j = 0, n = layout.segLayers.length; j < n; j++) lines.add(at(ps[j * 4] + pox, ps[j * 4 + 1] + poy), at(ps[j * 4 + 2] + pox, ps[j * 4 + 3] + poy));
  const drawn = lines.svg();
  if (drawn) out.push(`<g fill="none" stroke="#000" stroke-width="${PAPER_LINE_MM}" stroke-linecap="round" stroke-linejoin="round">${drawn}</g>`);
  for (const t of layout.texts) out.push(textSvg(t, at(t.x, t.y), t.h * k, (t.w ?? 0) * k));
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(W)}mm" height="${n2(H)}mm" viewBox="0 0 ${n2(W)} ${n2(H)}" font-family="Arial, sans-serif" fill="#000">${out.join('')}</svg>`, w: W, h: H };
}

/** The layout as a page to print: one page the size of its paper, no margins (the PDF is made with the page's own size). */
export function layoutPlotHtml(title: string, layout: FileLayout, model: Pick<CadView, 'segs' | 'segLayers' | 'info'>, options: LayoutPlotOptions = {}): { html: string; w: number; h: number } {
  const { svg, w, h } = layoutPlotSvg(layout, model, options);
  const size = `${n2(w)}mm ${n2(h)}mm`;
  return {
    w, h,
    html: `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page { size: ${size}; margin: 0; } html, body { margin: 0; width: ${n2(w)}mm; height: ${n2(h)}mm; background: #fff; overflow: hidden; } svg { display: block; }</style></head><body>${svg}</body></html>`
  };
}

/** The paper a printer is given for a layout's paper (mm), when it is one a printer takes here: A4 and A3 either way up,
 * A2 and A1 landscape. Other papers plot to PDF only. */
export function printerPaper(w: number, h: number): { pageSize: 'A4' | 'A3' | 'A3 portrait' | 'A2' | 'A1'; landscape: boolean } | undefined {
  const is = (a: number, b: number) => Math.abs(w - a) <= 1 && Math.abs(h - b) <= 1;
  if (is(297, 210)) return { pageSize: 'A4', landscape: true };
  if (is(210, 297)) return { pageSize: 'A4', landscape: false };
  if (is(420, 297)) return { pageSize: 'A3', landscape: true };
  if (is(297, 420)) return { pageSize: 'A3 portrait', landscape: false };
  if (is(594, 420)) return { pageSize: 'A2', landscape: true };
  if (is(841, 594)) return { pageSize: 'A1', landscape: true };
  return undefined;
}
