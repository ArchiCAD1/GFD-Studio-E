import type { SketchItem } from '../types';
import type { CadPiece } from './cadCrop';
import { linetypeIdOf, lineweightOf } from './cadLayerStyle';

/** Taking over an opened drawing's object: the pieces the engine explodes it into become drawn objects of the app,
 * in world coordinates, keeping layer, colour, linetype, lineweight and exact geometry (a polyline keeps its arc
 * segments). Dimension groups are flattened into their pieces and a patterned hatch becomes outlines; later steps
 * keep those whole. Pure: no React. */
export function drawnFromPieces(pieces: CadPiece[]): Omit<SketchItem, 'id'>[] {
  const flat = (ps: CadPiece[]): Exclude<CadPiece, { kind: 'group' }>[] => ps.flatMap((p) => (p.kind === 'group' ? flat(p.items) : [p]));
  const area = (l: readonly number[][]) => Math.abs(l.reduce((t, q, i) => t + q[0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * q[1], 0));
  return flat(pieces).flatMap((p): Omit<SketchItem, 'id'>[] => {
    const lt = p.lt ? linetypeIdOf(p.lt) : undefined, lw = lineweightOf(p.lw);
    const s = { layer: p.layer, ...(p.color !== undefined && p.color !== 0xff000007 ? { color: `#${p.color.toString(16).padStart(6, '0')}` } : {}), ...(lt ? { lt } : {}), ...(lw !== undefined ? { lw } : {}) };
    switch (p.kind) {
      case 'line': return [{ ...s, kind: 'line', pts: [[...p.a], [...p.b]] }];
      case 'arc': return [{ ...s, kind: 'arc', pts: [[...p.c]], r: p.r, a0: p.a0, a1: p.a1 }];
      case 'circle': return [{ ...s, kind: 'circle', pts: [[...p.c]], r: p.r }];
      case 'pline': return p.pts.length > 1 ? [{ ...s, kind: 'pline', pts: p.pts.map(([x, y]) => [x, y]), ...(p.pts.some((v) => v[2]) ? { bulges: p.pts.map((v) => v[2] ?? 0) } : {}), ...(p.closed ? { closed: true } : {}) }] : [];
      case 'text': return p.text.trim() ? [{ ...s, kind: 'text', pts: [[...p.at]], text: p.text, h: p.h, ...(p.rot ? { rot: p.rot } : {}), ...(p.just ? { just: p.just } : {}) }] : [];
      case 'point': return [{ ...s, kind: 'point', pts: [[...p.at]] }];
      case 'solid': return p.pts.length > 2 ? [{ ...s, kind: 'pline', closed: true, pts: p.pts.map(([x, y]) => [x, y]), hatch: { pattern: 'solid', scale: 3, angle: 0 } }] : [];
      case 'hatch': {
        // One drawn hatch: its loop of the largest area is the outline, the others its islands (a patterned fill as outlines).
        const loops = p.loops.filter((l) => l.length > 2).map((l) => l.map(([x, y]): [number, number] => [x, y])).sort((a, b) => area(b) - area(a));
        if (!loops.length) return [];
        return p.solid ? [{ ...s, kind: 'pline', closed: true, pts: loops[0], hatch: { pattern: 'solid', scale: 3, angle: 0 }, ...(loops.length > 1 ? { holes: loops.slice(1) } : {}) }]
          : loops.map((l) => ({ ...s, kind: 'pline' as const, closed: true, pts: l }));
      }
      default: return [];
    }
  });
}
