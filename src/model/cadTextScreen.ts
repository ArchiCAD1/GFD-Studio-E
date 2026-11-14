/** How Design CAD draws text on screen (screen px). CAD gives a text's height as the height of its capitals, while a
 * canvas font is sized by its em, about 1.4 times that: the font is sized from the capitals, so a text keeps the height
 * (and, fitted to a width, the shape) other CAD programs show. Text too small to read shows as a faint bar where its
 * words are, as CAD shows text zoomed out, rather than not at all. */

type PathLike = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'closePath'>;
type Measurer = Pick<CanvasRenderingContext2D, 'font' | 'measureText'> & Partial<Pick<CanvasRenderingContext2D, 'textBaseline'>>;

/** The font Design CAD draws text in on the screen (the sheets print Arial). */
export const SCREEN_FONT = 'system-ui, sans-serif';
/** Capitals shorter than this (px) show as a bar, not words. */
export const READ_PX = 2;
/** How strongly a bar shows: about the ink of words that small. */
export const BAR_ALPHA = 0.5;

const emPer = new Map<string, number>(), NO_INK = 1 / 0.7;
/** Font size per px of capitals in `family`: 100 over the height of an H set at 100 px above its baseline, measured
 * once (1 / 0.7, about the usual share, when the canvas gives no ink measure). */
export function emPerCap(ctx: Measurer, family: string): number {
  let k = emPer.get(family);
  if (k === undefined) {
    const was = ctx.font, base = ctx.textBaseline;
    ctx.font = `100px ${family}`;
    if (base) ctx.textBaseline = 'alphabetic';
    const cap = ctx.measureText('H').actualBoundingBoxAscent;
    ctx.font = was;
    if (base) ctx.textBaseline = base;
    k = cap > 30 && cap < 100 ? 100 / cap : NO_INK;
    emPer.set(family, k);
  }
  return k;
}
/** The same as last measured on a canvas (1 / 0.7 before that): for HTML laid over the canvas, such as the boxes a text
 * is typed in, so their letters are as high as the drawing's. */
export const emPerCapOf = (family: string): number => emPer.get(family) ?? NO_INK;

/** How wide `s` is per px of font size in `family`, measured once per string into `cache`. */
export function widthPerPx(ctx: Measurer, family: string, s: string, cache: Map<string, number>): number {
  let w = cache.get(s);
  if (w === undefined) {
    const was = ctx.font;
    ctx.font = `100px ${family}`;
    w = ctx.measureText(s).width / 100;
    ctx.font = was;
    cache.set(s, w);
  }
  return w;
}

/** A bar where a text too small to read is, added to `p`: along its baseline from its anchor (x, y) turned `rot`
 * (radians, anticlockwise), `w` long and as tall as its capitals (`cap`, at least a pixel); `align` 0 left of the
 * anchor, 1 centred on it, 2 right. */
export function textBar(p: PathLike, x: number, y: number, rot: number, cap: number, w: number, align: number): void {
  if (!(w > 0) || !(cap > 0)) return;
  const t = Math.max(cap, 1), v0 = -(cap + t) / 2, u0 = align === 1 ? -w / 2 : align === 2 ? -w : 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  // Along the baseline (u) and down the screen (v), turned as the text is.
  const to = (u: number, v: number, first = false) => (first ? p.moveTo : p.lineTo).call(p, x + u * c + v * s, y - u * s + v * c);
  to(u0, v0, true); to(u0 + w, v0); to(u0 + w, v0 + t); to(u0, v0 + t);
  p.closePath();
}
