import { describe, expect, it } from 'vitest';
import { drawnFromPieces } from './cadTakeOver';
import { linetypeIdOf, lineweightOf } from './cadLayerStyle';
import type { CadPiece } from './cadCrop';

type P2 = [number, number];
const S = { layer: 'E-LIGHT' };

describe('drawnFromPieces: an opened drawing\'s object as drawn objects', () => {
  it('a line keeps layer, colour, linetype and lineweight (lineweight snapped to a standard one)', () => {
    const [l] = drawnFromPieces([{ ...S, kind: 'line', a: [0, 0], b: [3, 4], color: 0xff8000, lt: 'DASHED', lw: 52 }]);
    expect(l).toEqual({ layer: 'E-LIGHT', kind: 'line', pts: [[0, 0], [3, 4]], color: '#ff8000', lt: 'dashed', ltName: 'DASHED', lw: 0.5 });
  });
  it('foreground colour, unknown linetype and no lineweight leave those out', () => {
    const [l] = drawnFromPieces([{ ...S, kind: 'line', a: [0, 0], b: [1, 0], color: 0xff000007, lt: 'ACAD_ISO02W100' }]);
    expect(l).toEqual({ layer: 'E-LIGHT', kind: 'line', pts: [[0, 0], [1, 0]], ltName: 'ACAD_ISO02W100' });
  });
  it('arc, circle, point', () => {
    const r = drawnFromPieces([{ ...S, kind: 'arc', c: [1, 2], r: 3, a0: 0.5, a1: 2 }, { ...S, kind: 'circle', c: [4, 5], r: 6, lt: 'CENTER2' }, { ...S, kind: 'point', at: [7, 8] }]);
    expect(r[0]).toMatchObject({ kind: 'arc', pts: [[1, 2]], r: 3, a0: 0.5, a1: 2 });
    expect(r[1]).toMatchObject({ kind: 'circle', pts: [[4, 5]], r: 6, lt: 'center', ltName: 'CENTER2' });
    expect(r[2]).toMatchObject({ kind: 'point', pts: [[7, 8]] });
  });
  it('a polyline keeps its bulges and closed; none when all are straight', () => {
    const [a, b, c] = drawnFromPieces([
      { ...S, kind: 'pline', pts: [[0, 0, 0], [10, 0, 1], [10, 4, 0], [0, 4, 1]], closed: true, lw: 35 },
      { ...S, kind: 'pline', pts: [[0, 0, 0], [1, 1, 0]], closed: false },
      { ...S, kind: 'pline', pts: [[0, 0, 0]], closed: false }
    ] as CadPiece[]);
    expect(a).toMatchObject({ kind: 'pline', closed: true, pts: [[0, 0], [10, 0], [10, 4], [0, 4]], bulges: [0, 1, 0, 1], lw: 0.35 });
    expect(b.bulges).toBeUndefined(); expect(b.closed).toBeUndefined();
    expect(c).toBeUndefined();
  });
  it('text keeps height, rotation and justification; an empty text is dropped', () => {
    const r = drawnFromPieces([{ ...S, kind: 'text', at: [1, 1], h: 2.5, rot: 0.5, text: 'DB-1', just: 'C' }, { ...S, kind: 'text', at: [1, 1], h: 2, rot: 0, text: ' ' }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'text', pts: [[1, 1]], text: 'DB-1', h: 2.5, rot: 0.5, just: 'C' });
  });
  it('a 2D solid is a closed polyline with a solid hatch', () => {
    const [s] = drawnFromPieces([{ ...S, kind: 'solid', pts: [[0, 0], [1, 0], [1, 1], [0, 1]] }]);
    expect(s).toMatchObject({ kind: 'pline', closed: true, hatch: { pattern: 'solid' } });
  });
  it('a solid hatch is one hatch with islands; a patterned one becomes outlines', () => {
    const big: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]], hole: [number, number, number][] = [[2, 2, 0], [4, 2, 0], [4, 4, 0]];
    const solid = drawnFromPieces([{ ...S, kind: 'hatch', loops: [hole, big], solid: true, pattern: 'SOLID', color: 0xff0000 }]);
    expect(solid).toHaveLength(1);
    expect(solid[0]).toMatchObject({ pts: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[2, 2], [4, 2], [4, 4]]], color: '#ff0000', hatch: { pattern: 'solid' } });
    const pat = drawnFromPieces([{ ...S, kind: 'hatch', loops: [hole, big], solid: false, pattern: 'ANSI31' }]);
    expect(pat).toHaveLength(2);
    expect(pat.every((x) => x.kind === 'pline' && x.closed && !x.hatch)).toBe(true);
  });
  it('groups (dimensions, nested blocks) are flattened into their pieces', () => {
    const r = drawnFromPieces([{ ...S, kind: 'group', items: [{ ...S, kind: 'line', a: [0, 0] as P2, b: [1, 0] as P2 }, { ...S, kind: 'group', items: [{ ...S, kind: 'text', at: [0, 0] as P2, h: 1, rot: 0, text: '5' }] }] }]);
    expect(r.map((x) => x.kind)).toEqual(['line', 'text']);
  });
});

describe('linetypeIdOf / lineweightOf', () => {
  it('matches by id or label, case aside, and the 2 / X2 variants', () => {
    expect(linetypeIdOf('Continuous')).toBe('continuous');
    expect(linetypeIdOf('DASHED')).toBe('dashed');
    expect(linetypeIdOf('hidden2')).toBe('hidden');
    expect(linetypeIdOf('HIDDENX2')).toBe('hidden');
    expect(linetypeIdOf('Center')).toBe('center');
    expect(linetypeIdOf('CENTER2')).toBe('center');
    expect(linetypeIdOf('DASHDOT')).toBe('dashdot');
    expect(linetypeIdOf('Dash dot')).toBe('dashdot');
    expect(linetypeIdOf('PHANTOMX2')).toBe('phantom');
    expect(linetypeIdOf('DOT2')).toBe('dot');
  });
  it('unknown names are undefined', () => {
    for (const n of ['ByLayer', 'ByBlock', 'ACAD_ISO02W100', 'GAS_LINE', '']) expect(linetypeIdOf(n)).toBeUndefined();
  });
  it('lineweight: hundredths of a mm to the nearest standard one; none for absent or default', () => {
    expect(lineweightOf(undefined)).toBeUndefined(); expect(lineweightOf(0)).toBeUndefined(); expect(lineweightOf(-1)).toBeUndefined();
    expect(lineweightOf(25)).toBe(0.25); expect(lineweightOf(30)).toBe(0.25); expect(lineweightOf(32)).toBe(0.35); expect(lineweightOf(211)).toBe(1);
  });
});
