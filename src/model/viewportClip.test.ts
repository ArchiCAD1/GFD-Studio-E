import { describe, expect, it } from 'vitest';
import { clipFromPaper, clipOnPaper, insidePolygon, isVpClip, segmentInPolygon } from './viewportClip';
import { clipViewport, insideVp, unclipViewport, vpOutline, vpToPaper, type PlanViewport } from './planViewports';
import { asFileLayout, clipDrawingViewport, unclipDrawingViewport, viewportAt, viewportOutline, viewportWindow, withViewportBox, type DrawingLayout } from './drawingLayouts';

type Pt = [number, number];
/** An L on the paper (mm, y down): 100 wide, 80 high from 20, 10, its top right quarter cut away. */
const L: Pt[] = [[20, 10], [70, 10], [70, 50], [120, 50], [120, 90], [20, 90]];

describe('a clipped viewport\'s outline', () => {
  it('is kept as its frame (the bounding box) and its corners in fractions of it, across and down', () => {
    const c = clipFromPaper(L)!;
    expect(c.box).toEqual([20, 10, 100, 80]);
    expect(c.clip).toEqual([[0, 0], [0.5, 0], [0.5, 0.5], [1, 0.5], [1, 1], [0, 1]]);
    expect(clipOnPaper(c.clip, c.box)).toEqual(L);
    // It follows the frame: moved and resized, the same shape in the new frame.
    expect(clipOnPaper(c.clip, [0, 0, 200, 40])[3]).toEqual([200, 20]);
  });

  it('takes a corner picked twice, or the first picked again last, once; and is nothing without three corners, a side or an area', () => {
    expect(clipFromPaper([L[0], L[0], ...L.slice(1), L[0]])!.clip).toHaveLength(6);
    expect(clipFromPaper([[0, 0], [10, 0]])).toBeUndefined();
    expect(clipFromPaper([[0, 0], [10, 0], [10, 0]])).toBeUndefined();
    expect(clipFromPaper([[0, 0], [10, 0], [20, 0]])).toBeUndefined(); // a line
    expect(clipFromPaper([[0, 0], [1, 0], [1, 30], [0, 30]])).toBeUndefined(); // 1 mm wide
    expect(clipFromPaper([[0, 0], [10, 0], [0, 10]])).toBeDefined();
  });

  it('knows an outline read from a file: three or more corners, each two numbers from 0 to 1', () => {
    expect(isVpClip([[0, 0], [1, 0], [0.5, 1]])).toBe(true);
    for (const bad of [undefined, [], [[0, 0], [1, 1]], [[0, 0], [1, 0], [0.5, 2]], [[0, 0], [1, 0], [0.5]], [[0, 0], [1, 0], ['a', 1]], 'clip']) expect(isVpClip(bad)).toBe(false);
  });

  it('tells inside from outside (even-odd), and cuts a segment to the pieces inside', () => {
    expect(insidePolygon([40, 30], L)).toBe(true);
    expect(insidePolygon([100, 30], L)).toBe(false); // in the frame, in the quarter cut away
    expect(insidePolygon([100, 70], L)).toBe(true);
    expect(insidePolygon([0, 0], L)).toBe(false);
    // Across the top half: in from the left edge to the notch.
    expect(segmentInPolygon([0, 30], [200, 30], L)).toEqual([[[20, 30], [70, 30]]]);
    // Across the lower half: the whole width.
    expect(segmentInPolygon([0, 70], [200, 70], L)).toEqual([[[20, 70], [120, 70]]]);
    // Wholly inside, wholly outside.
    expect(segmentInPolygon([30, 20], [60, 40], L)).toEqual([[[30, 20], [60, 40]]]);
    expect(segmentInPolygon([80, 20], [110, 40], L)).toEqual([]);
    // Up the notch's column: out of the L between its two arms.
    const u: Pt[] = [[0, 0], [30, 0], [30, 60], [60, 60], [60, 0], [90, 0], [90, 90], [0, 90]];
    expect(segmentInPolygon([-10, 30], [100, 30], u)).toEqual([[[0, 30], [30, 30]], [[60, 30], [90, 30]]]);
  });
});

describe('a plan sheet\'s viewport clipped (VPCLIP)', () => {
  const v: PlanViewport = { id: 'vp1', box: [0, 0, 200, 100], at: [10, 5], scale: 100, frame: true };
  it('takes the outline\'s bounding box as its frame and keeps the model where it was on the paper', () => {
    const [c] = clipViewport([v], 'vp1', L)!;
    expect(c.box).toEqual([20, 10, 100, 80]);
    expect(c.scale).toBe(100);
    expect(c.clip).toHaveLength(6);
    expect(c.frame).toBe(true);
    // The model point that was at the old frame's centre is still at 100, 50 on the paper.
    expect(vpToPaper(c, [10, 5]).map((n) => +n.toFixed(6))).toEqual([100, 50]);
    expect(vpOutline(c)).toEqual(L);
    expect(vpOutline(v)).toEqual([[0, 0], [200, 0], [200, 100], [0, 100]]);
    expect(clipViewport([v], 'vp1', [[0, 0], [10, 0]])).toBeUndefined();
    expect(clipViewport([v], 'nope', L)).toBeUndefined();
  });

  it('is picked and worked in by its outline, not its whole frame; unclipped it is its frame again', () => {
    const [c] = clipViewport([v], 'vp1', L)!;
    expect(insideVp(c, [40, 30])).toBe(true);
    expect(insideVp(c, [100, 30])).toBe(false);
    const [back] = unclipViewport([c], 'vp1');
    expect(back).not.toHaveProperty('clip');
    expect(back.box).toEqual([20, 10, 100, 80]);
    expect(insideVp(back, [100, 30])).toBe(true);
    expect(unclipViewport([v], 'vp1')[0]).toBe(v);
  });
});

describe('a viewport of a layout made with + clipped (VPCLIP)', () => {
  /** A3 with one viewport 200 × 100 mm from 0, 100 (mm from the lower left, y up) at 1:100 in a drawing in mm. */
  const l: DrawingLayout = { name: 'Layout2', paper: [420, 297], viewports: [{ x: 0, y: 100, w: 200, h: 100, cx: 10000, cy: 5000, vh: 10000, frame: true }] };
  /** The same L, picked on the paper with y up: its top edge at y 190, its bottom at 110. */
  const up: Pt[] = L.map(([x, y]) => [x, 200 - y]);

  it('takes the outline\'s bounding box as its frame, the outline measured down from its top, the model where it was', () => {
    const c = clipDrawingViewport(l, 0, up)!.viewports[0];
    expect([c.x, c.y, c.w, c.h]).toEqual([20, 110, 100, 80]);
    expect(c.clip).toEqual([[0, 0], [0.5, 0], [0.5, 0.5], [1, 0.5], [1, 1], [0, 1]]);
    expect(c.frame).toBe(true);
    // The same scale, and the same model window as a plain resize to that frame gives.
    expect(c.vh).toBe(8000);
    expect(viewportWindow(c)).toEqual(viewportWindow(withViewportBox(l, 0, [20, 110, 100, 80], 'resize').viewports[0]));
    expect(viewportOutline(c)).toEqual(up);
    expect(viewportOutline(l.viewports[0])).toEqual([[0, 200], [200, 200], [200, 100], [0, 100]]);
    expect(clipDrawingViewport(l, 0, [[0, 0], [10, 0]])).toBeUndefined();
    expect(clipDrawingViewport(l, 3, up)).toBeUndefined();
  });

  it('is found under a point by its outline; the paper view gets the outline; unclipped it is its frame again', () => {
    const c = clipDrawingViewport(l, 0, up)!;
    expect(viewportAt(c, [40, 170])).toBe(0);
    expect(viewportAt(c, [100, 170])).toBe(-1); // in the frame, in the quarter cut away
    expect(viewportAt(c, [100, 130])).toBe(0);
    expect(asFileLayout(c, 1).viewports[0].clip).toEqual(c.viewports[0].clip);
    const back = unclipDrawingViewport(c, 0);
    expect(back.viewports[0]).not.toHaveProperty('clip');
    expect(viewportAt(back, [100, 170])).toBe(0);
  });
});
