import { describe, expect, it } from 'vitest';
import type { CadObject, CadView } from '../engines/cad/cadEngine';
import { layerStatsOf, outlinePoints, planOfView } from './cadViewPlan';

// A square (4 segments) and a hatch with an island: its second loop is left out. Segments are relative to the origin.
const segs = new Float32Array([0, 0, 4, 0, 4, 0, 4, 3, 4, 3, 0, 3, 0, 3, 0, 0, /* hatch */ 10, 0, 12, 0, 12, 0, 12, 2, 12, 2, 10, 0, 11, 1, 11.5, 1, 11.5, 1, 11, 1]);
const obj = (id: number, kind: string, layer: number, a: number, b: number): CadObject => ({ id, kind, layer, handle: `H${id}`, closed: true, area: 1, seg_start: a, seg_end: b });
const view = {
  file: 'GF.dxf', segs, info: { origin: [100, 200], texts: [{ x: 102, y: 201, h: 0.2, rot: 0, s: 'STORE', layer: 1, rgb: 0, align: 0 }], layers: [{ name: 'A-ROOM', rgb: 0, on: true, count: 4 }, { name: 'A-ROOM-NAME', rgb: 0, on: true, count: 0 }, { name: 'A-HATCH', rgb: 0, on: true, count: 5 }] },
  outlines: () => [obj(0, 'Polyline', 0, 0, 4), obj(1, 'Hatch', 2, 4, 9)]
} as unknown as CadView;

describe('a Design CAD drawing as a plan', () => {
  it('takes the corners of each closed object along its first loop, in absolute drawing units', () => {
    expect(outlinePoints(view, view.outlines()[0])).toEqual([[100, 200], [104, 200], [104, 203], [100, 203]]);
    expect(outlinePoints(view, view.outlines()[1])).toEqual([[110, 200], [112, 200], [112, 202]]);
  });

  it('gives outlines and texts on shown layers, and what each layer holds', () => {
    const plan = planOfView(view, 6, new Uint8Array([1, 1, 0]));
    expect(plan.outlines.map((o) => [o.layer, o.handle])).toEqual([['A-ROOM', 'H0']]);
    expect(plan.texts).toEqual([{ layer: 'A-ROOM-NAME', x: 102, y: 201, text: 'STORE' }]);
    expect(plan.layers).toEqual([
      { name: 'A-ROOM', curves: 4, texts: 0, outlines: 1, hatches: 0, blocks: 0 },
      { name: 'A-ROOM-NAME', curves: 0, texts: 1, outlines: 0, hatches: 0, blocks: 0 },
      { name: 'A-HATCH', curves: 5, texts: 0, outlines: 0, hatches: 1, blocks: 0 }
    ]);
  });

  it('counts what each of thousands of layers holds', () => {
    const layers = Array.from({ length: 2000 }, (_, i) => ({ name: `L${i}`, rgb: 0, on: true, count: i % 3 }));
    const texts = Array.from({ length: 20000 }, (_, i) => ({ x: 0, y: 0, h: 1, rot: 0, s: 'T', layer: (i * 7) % 2000, rgb: 0, align: 0 }));
    const closed = Array.from({ length: 30000 }, (_, i) => obj(i, i % 4 ? 'Polyline' : 'Hatch', (i * 13) % 2000, 0, 4));
    const big = { ...view, info: { ...view.info, layers, texts }, outlines: () => closed } as unknown as CadView;
    const stats = layerStatsOf(big);
    const want = layers.map((l, i) => ({
      name: l.name, curves: l.count, texts: texts.filter((t) => t.layer === i).length,
      outlines: closed.filter((o) => o.layer === i && o.kind !== 'Hatch').length, hatches: closed.filter((o) => o.layer === i && o.kind === 'Hatch').length, blocks: 0
    })).filter((l) => l.curves + l.texts > 0);
    expect(stats).toEqual(want);
  });
});
