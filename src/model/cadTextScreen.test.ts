import { describe, expect, it } from 'vitest';
import { emPerCap, textBar, widthPerPx } from './cadTextScreen';

type P = [number, number];
/** A path that keeps its points. */
function path() {
  const pts: P[] = [];
  let closed = 0;
  return { pts, closed: () => closed, moveTo: (x: number, y: number) => { pts.push([x, y]); }, lineTo: (x: number, y: number) => { pts.push([x, y]); }, closePath: () => { closed += 1; } };
}
/** A canvas measuring text at the font size set: half a px of width a character a px of font, and capitals `ink` of the
 * font size (no ink measure when not given). */
function canvas(ink?: number) {
  const calls: string[] = [];
  const ctx = {
    font: '10px Other',
    measureText(s: string) {
      calls.push(ctx.font);
      const px = Number(/^([\d.]+)px/.exec(ctx.font)?.[1]);
      return { width: s.length * px * 0.5, ...(ink === undefined ? {} : { actualBoundingBoxAscent: ink * px }) } as TextMetrics;
    }
  };
  return { ctx, calls };
}

describe('text on the CAD screen', () => {
  it('sizes the font from the capitals: the em over the height of an H, measured once a font', () => {
    const { ctx, calls } = canvas(0.72);
    expect(emPerCap(ctx, 'Font A')).toBeCloseTo(1 / 0.72);
    expect(emPerCap(ctx, 'Font A')).toBeCloseTo(1 / 0.72);
    expect(calls).toEqual(['100px Font A']);
    expect(ctx.font).toBe('10px Other'); // the font set before is back
  });

  it('takes the usual 0.7 where the canvas gives no plausible ink measure', () => {
    expect(emPerCap(canvas().ctx, 'Font B')).toBeCloseTo(1 / 0.7);
    expect(emPerCap(canvas(0.1).ctx, 'Font C')).toBeCloseTo(1 / 0.7);
  });

  it('measures how wide a string is per px of font once', () => {
    const { ctx, calls } = canvas(), cache = new Map<string, number>();
    expect(widthPerPx(ctx, 'Font D', 'ABCD', cache)).toBeCloseTo(2);
    expect(widthPerPx(ctx, 'Font D', 'ABCD', cache)).toBeCloseTo(2);
    expect(calls).toEqual(['100px Font D']);
    expect(ctx.font).toBe('10px Other');
  });

  it('puts the bar on the baseline, as long as the text and as tall as its capitals', () => {
    const p = path();
    textBar(p, 100, 50, 0, 1.5, 40, 0);
    expect(p.pts).toEqual([[100, 48.5], [140, 48.5], [140, 50], [100, 50]]);
    expect(p.closed()).toBe(1);
  });

  it('centres it on its anchor or ends it there, and keeps it a pixel tall about the middle of smaller capitals', () => {
    const c = path(), r = path();
    textBar(c, 100, 50, 0, 2, 40, 1);
    expect(c.pts).toEqual([[80, 48], [120, 48], [120, 50], [80, 50]]);
    textBar(r, 100, 50, 0, 0.5, 40, 2);
    expect(r.pts).toEqual([[60, 49.25], [100, 49.25], [100, 50.25], [60, 50.25]]);
  });

  it('turns it with the text', () => {
    // A quarter turn anticlockwise: the text reads up the screen, its capitals to the left of its baseline.
    const p = path();
    textBar(p, 100, 50, Math.PI / 2, 2, 40, 0);
    const want: P[] = [[98, 50], [98, 10], [100, 10], [100, 50]];
    p.pts.forEach((q, i) => { expect(q[0]).toBeCloseTo(want[i][0]); expect(q[1]).toBeCloseTo(want[i][1]); });
  });

  it('adds nothing for a text with no length or height', () => {
    const p = path();
    textBar(p, 0, 0, 0, 2, 0, 0);
    textBar(p, 0, 0, 0, 0, 40, 0);
    expect(p.pts).toEqual([]);
  });
});
