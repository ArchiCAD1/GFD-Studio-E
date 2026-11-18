import { describe, expect, it } from 'vitest';
import { sampleProject } from '../../data/sampleProject';
import { layoutSystem } from '../../diagram/layout';
import { mergePicks, pickInWindow, pickPoints, zoomBox } from './sldPick';

const layout = layoutSystem(sampleProject);
const points = pickPoints(layout, new Map());
const at = (kind: 'board' | 'feeder', id: string) => points.find((p) => p.item.kind === kind && p.item.id === id)!;

describe('window pick', () => {
  it('puts a way at its symbol, an incomer as its board, and a busbar at its middle', () => {
    const lab = at('feeder', 'FF-LAB'), node = layout.feeders.find((n) => n.feeder.id === 'FF-LAB')!;
    expect(lab.x).toBe(node.x);
    expect(lab.y).toBe(node.busY + 94);
    expect(points.some((p) => p.item.kind === 'feeder' && p.item.id === 'INC-FF')).toBe(false);
    const bus = layout.boards.find((b) => b.board.id === 'SMDB-FF')!;
    expect(points.filter((p) => p.item.kind === 'board' && p.item.id === 'SMDB-FF').pop()).toMatchObject({ x: (bus.busX1 + bus.busX2) / 2, y: bus.busY });
  });
  it('picks what lies inside, whichever way the corners are given, each once', () => {
    const a = at('feeder', 'FF-OFF'), b = at('feeder', 'FF-LAB');
    const win = { x0: b.x + 20, y0: b.y + 20, x1: a.x - 20, y1: a.y - 20 };
    const got = pickInWindow(points, win);
    expect(got).toEqual(expect.arrayContaining([{ kind: 'feeder', id: 'FF-OFF' }, { kind: 'feeder', id: 'FF-LAB' }, { kind: 'feeder', id: 'FF-IT' }]));
    expect(got.some((x) => x.kind === 'feeder' && x.id === 'FF-LTG')).toBe(false);
    expect(new Set(got.map((x) => `${x.kind}${x.id}`)).size).toBe(got.length);
    expect(pickInWindow(points, { x0: -50, y0: -50, x1: -10, y1: -10 })).toEqual([]);
  });
  it('merges without repeating', () => {
    expect(mergePicks([{ kind: 'feeder', id: 'A' }], [{ kind: 'feeder', id: 'A' }, { kind: 'board', id: 'A' }])).toEqual([{ kind: 'feeder', id: 'A' }, { kind: 'board', id: 'A' }]);
  });
  it('zoom fits the picked points with a margin in the shape of the screen', () => {
    const v = zoomBox(points, [{ kind: 'feeder', id: 'FF-OFF' }, { kind: 'feeder', id: 'FF-LTG' }], 2)!;
    expect(v.w / v.h).toBeCloseTo(2, 5);
    for (const id of ['FF-OFF', 'FF-LTG']) { const p = at('feeder', id); expect(p.x).toBeGreaterThan(v.x); expect(p.x).toBeLessThan(v.x + v.w); expect(p.y).toBeGreaterThan(v.y); expect(p.y).toBeLessThan(v.y + v.h); }
    expect(zoomBox(points, [{ kind: 'feeder', id: 'NOPE' }], 1)).toBeUndefined();
  });
});
