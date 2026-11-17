import { describe, expect, it } from 'vitest';
import { arcMid, bulgeArc, hasArcs, itemAt, moved, rotated, segmentsOf, shapesOut, snapPoints } from './cadSketch';
import { explode, gripMoved, gripsOf, mirrored, scaled } from './cadEdit';
import { closedArea, itemLength } from './cadCrop';
import type { SketchItem } from '../types';

type Pt = [number, number];
/** A slot: 10 × 4 with a semicircle at each short end. */
const slot: SketchItem = { id: 'P', kind: 'pline', layer: 'A', closed: true, pts: [[0, 0], [10, 0], [10, 4], [0, 4]], bulges: [0, 1, 0, 1] };
const open: SketchItem = { id: 'Q', kind: 'pline', layer: 'A', pts: [[0, 0], [4, 0], [4, 4]], bulges: [0, -1] };

describe('polylines with arc segments', () => {
  it('bulgeArc puts the centre on the right of a clockwise (negative) bulge, and the angles run anticlockwise', () => {
    const q = bulgeArc([0, 0], [4, 0], -1);
    expect(q.c[0]).toBeCloseTo(2); expect(q.c[1]).toBeCloseTo(0); expect(q.r).toBeCloseTo(2);
    // From a to b clockwise = from b to a anticlockwise: a0 at b (0), a1 at a (π).
    expect(q.a0).toBeCloseTo(0); expect(Math.abs(q.a1)).toBeCloseTo(Math.PI);
    const m = arcMid([0, 0], [4, 0], -1); expect(m[0]).toBeCloseTo(2); expect(m[1]).toBeCloseTo(2);
    const p = arcMid([0, 0], [4, 0], 1); expect(p[1]).toBeCloseTo(-2);
  });
  it('hasArcs: non-zero bulges only', () => {
    expect(hasArcs(slot)).toBe(true);
    expect(hasArcs({ bulges: [0, 0] })).toBe(false);
    expect(hasArcs({})).toBe(false);
  });
  it('segmentsOf draws an arc segment as its arc, straight ones as they are', () => {
    const s = segmentsOf(slot);
    expect(s.length).toBeGreaterThan(4 + 2 * 30);
    // The farthest point of the right-hand semicircle is x = 12; none of the arcs go left of the first straight side.
    expect(Math.max(...s.flat().map((q) => q[0]))).toBeCloseTo(12);
    expect(Math.min(...s.flat().map((q) => q[0]))).toBeCloseTo(-2);
    expect(segmentsOf({ ...slot, bulges: undefined }).length).toBe(4);
    // A clockwise arc from (4,0) up to (4,4) bulges to the left of the way it first heads (x down to 2).
    expect(Math.min(...segmentsOf(open).flat().filter((q) => q[1] > 0.5).map((q) => q[0]))).toBeCloseTo(2);
  });
  it('hit testing follows the arc', () => {
    expect(itemAt([slot], [12, 2], 0.05)?.id).toBe('P');
    expect(itemAt([slot], [10.5, 2], 0.05)).toBeUndefined();
  });
  it('snaps: endpoints at the vertices only, the middle and the centre of an arc segment', () => {
    const sn = snapPoints([slot]);
    expect(sn.filter((q) => q.kind === 1).map((q) => [q.x, q.y])).toEqual([[0, 0], [10, 0], [10, 4], [0, 4]]);
    const mids = sn.filter((q) => q.kind === 2).map((q) => [+q.x.toFixed(3), +q.y.toFixed(3)]);
    expect(mids).toContainEqual([5, 0]); expect(mids).toContainEqual([12, 2]); expect(mids).toContainEqual([-2, 2]);
    const cen = sn.filter((q) => q.kind === 4).map((q) => [+q.x.toFixed(3), +q.y.toFixed(3)]);
    expect(cen).toEqual([[10, 2], [0, 2]]);
  });
  it('Save DXF / DWG writes the polyline with its bulges (one per point)', () => {
    const [s] = shapesOut([slot], 0.001);
    expect(s).toMatchObject({ kind: 'pline', closed: true, bulges: [0, 1, 0, 1] });
    const [o] = shapesOut([open], 0.001);
    expect(o.bulges).toEqual([0, -1, 0]);
    expect(shapesOut([{ ...slot, bulges: undefined }], 0.001)[0].bulges).toBeUndefined();
  });
  it('move, rotate and scale keep the bulges; mirror flips the arcs to the other side', () => {
    expect(moved(slot, 1, 1).bulges).toEqual([0, 1, 0, 1]);
    expect(rotated(slot, [0, 0], 1).bulges).toEqual([0, 1, 0, 1]);
    const s = scaled(slot, [0, 0], 2);
    expect(s.bulges).toEqual([0, 1, 0, 1]); expect(closedArea(s)).toBeCloseTo(4 * closedArea(slot));
    const m = mirrored(slot, [0, 0], [1, 0]);
    expect(m.bulges).toEqual([0, -1, 0, -1]);
    // The slot below the axis: the right-hand arc still bulges outwards (x up to 12), the shape the same area.
    expect(Math.max(...segmentsOf({ ...m, id: 'M' }).flat().map((q) => q[0]))).toBeCloseTo(12);
    expect(closedArea({ ...m, kind: 'pline' })).toBeCloseTo(closedArea(slot));
  });
  it('length and area count the arcs (a slot with semicircle ends)', () => {
    expect(itemLength(slot)).toBeCloseTo(20 + 4 * Math.PI);
    expect(closedArea(slot)).toBeCloseTo(40 + 4 * Math.PI);
    expect(itemLength(open)).toBeCloseTo(4 + 2 * Math.PI);
    expect(closedArea({ ...slot, bulges: undefined })).toBeCloseTo(40);
    expect(closedArea({ kind: 'circle', pts: [[0, 0]], r: 1 })).toBeCloseTo(Math.PI);
    expect(closedArea(open)).toBe(0);
  });
  it('grips: the middle grip of an arc segment sits on the arc; a vertex moves keeping the bulges; a side moves parallel', () => {
    const g = gripsOf(slot);
    expect(g.slice(0, 4).map((x) => x.kind)).toEqual(['point', 'point', 'point', 'point']);
    const mid = g.slice(4).map((x) => x.at.map((v) => +v.toFixed(3)));
    expect(mid).toEqual([[5, 0], [12, 2], [5, 4], [-2, 2]]);
    expect(gripMoved(slot, 1, [11, 0]).bulges).toEqual([0, 1, 0, 1]);
    const side = gripMoved(slot, 5, [13, 2]);
    expect(side.pts[1]).toEqual([11, 0]); expect(side.pts[2]).toEqual([11, 4]); expect(side.bulges).toEqual([0, 1, 0, 1]);
  });
  it('explode: arc segments become arcs, straight ones lines', () => {
    const r = explode(slot);
    expect(r.items!.map((x) => x.kind)).toEqual(['line', 'arc', 'line', 'arc']);
    const a = r.items![1];
    expect(a.pts[0]).toEqual([10, 2]); expect(a.r).toBeCloseTo(2);
    expect(a.bulges).toBeUndefined();
    // Anticlockwise from (10,0) (−π/2) to (10,4) (π/2).
    expect(a.a0).toBeCloseTo(-Math.PI / 2); expect(a.a1).toBeCloseTo(Math.PI / 2);
    const o = explode(open).items!;
    expect(o.map((x) => x.kind)).toEqual(['line', 'arc']);
    const ar = o[1] as SketchItem & { a0: number; a1: number }; const c = ar.pts[0] as Pt;
    expect(c[0]).toBeCloseTo(4); expect(c[1]).toBeCloseTo(2);
    // Clockwise (4,0) → (4,4): anticlockwise from (4,4) (π/2) to (4,0) (-π/2 = 3π/2).
    expect(ar.a0).toBeCloseTo(Math.PI / 2); expect(ar.a1).toBeCloseTo(-Math.PI / 2);
    expect(explode({ ...slot, bulges: undefined }).items!.every((x) => x.kind === 'line')).toBe(true);
  });
});
