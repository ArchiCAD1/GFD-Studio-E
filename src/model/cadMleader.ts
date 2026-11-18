import { arrowLines } from './cadSketch';
import { noteBox, noteFromText, plainText, type NotePara } from './cadMtext';
import type { CadMleaderStyle } from './cadStyles';
import type { SketchItem } from '../types';

/** Design CAD → Multileader (MLEADER, S12 of the 2D gap plan): one note with several leaders. All its geometry is in
 * `pts`: pts[0] is the start of its landing, where its leaders meet, pts[1..] are the arrowheads, so the edit tools
 * that move points move it whole. The landing and the words stay level, on the side away from the arrowheads. */

type Pt = [number, number];

/** +1 when the words sit to the right of the landing (the arrowheads' mean x is left of it, or equal), else -1. */
export function mleaderSide(it: Pick<SketchItem, 'pts'>): 1 | -1 {
  const tips = it.pts.slice(1);
  return !tips.length || tips.reduce((t, q) => t + q[0], 0) / tips.length <= it.pts[0][0] ? 1 : -1;
}

/** Where the words start: the landing's end and the gap beyond it, at the landing's height. */
const anchorOf = (it: SketchItem): Pt => [it.pts[0][0] + mleaderSide(it) * ((it.ml?.land ?? 0) + (it.ml?.gap ?? 0)), it.pts[0][1]];

/** The words as a virtual note (a drawn note's own item), anchored middle left of its box on the right side and middle
 * right on the left; none for a leader without words (`always`: an empty note then, for the editor). */
export function mleaderNote(it: SketchItem, always = false): SketchItem | undefined {
  if (!always && (!it.note || !plainText(it).trim())) return undefined;
  const { id, layer, color, lt, lw, h, w } = it, note = it.note ?? [{ runs: [] }];
  return { id, kind: 'mtext', layer, pts: [anchorOf(it)], note, h, ...(w !== undefined ? { w } : {}), just: mleaderSide(it) > 0 ? 'ML' : 'MR', ...(color ? { color } : {}), ...(lt ? { lt } : {}), ...(lw !== undefined ? { lw } : {}) };
}

export interface MleaderParts { legs: [Pt, Pt][]; landing?: [Pt, Pt]; arrows: [Pt, Pt][]; frame?: Pt[] }
/** What a multileader is drawn with: each leg from its arrowhead to the landing, the landing, the arrowheads' lines
 * and, when set, the frame round the words (their box pushed out by the gap). */
export function mleaderParts(it: SketchItem): MleaderParts {
  const [p0, ...tips] = it.pts, ml = it.ml, side = mleaderSide(it);
  const legs = tips.map((q): [Pt, Pt] => [q, p0]);
  const arrows = ml && ml.size > 0 ? tips.flatMap((q) => {
    const d = Math.hypot(p0[0] - q[0], p0[1] - q[1]);
    if (d < 1e-12) return [];
    const ux = (p0[0] - q[0]) / d, uy = (p0[1] - q[1]) / d;
    return arrowLines(ml.arrow, q, 1, ml.size, (at, a, b): Pt => [at[0] + ux * a - uy * b, at[1] + uy * a + ux * b]);
  }) : [];
  const parts: MleaderParts = { legs, arrows };
  if (ml && ml.land > 0) parts.landing = [p0, [p0[0] + side * ml.land, p0[1]]];
  const n = mleaderNote(it);
  if (n && ml?.frame) {
    const b = noteBox(n), g = ml.gap, at = (x: number, y: number): Pt => [b.tl[0] + x, b.tl[1] + y];
    parts.frame = [at(-g, g), at(b.w + g, g), at(b.w + g, -b.H - g), at(-g, -b.H - g)];
  }
  return parts;
}

/** The segments a multileader is drawn with. */
export function mleaderSegments(it: SketchItem): [Pt, Pt][] {
  const { legs, landing, arrows, frame } = mleaderParts(it);
  return [...legs, ...(landing ? [landing] : []), ...arrows, ...(frame ? frame.map((q, i): [Pt, Pt] => [q, frame[(i + 1) % frame.length]]) : [])];
}

/** A new multileader (without its id) for a style, at `k` drawing units per paper mm; `annoTextMm` is the annotation
 * text height, taken when the style's own is 0. */
export function newMleader(tip: Pt, landingPt: Pt, note: NotePara[] | undefined, style: CadMleaderStyle, k: number, layer: string, annoTextMm = 2.5): Omit<SketchItem, 'id'> {
  const words = !!note && note.some((p) => p.runs.some((r) => r.s.trim()));
  return {
    kind: 'mleader', layer, pts: [landingPt, tip], h: (style.textMm > 0 ? style.textMm : annoTextMm) * k,
    ...(style.content === 'note' && words ? { note } : {}),
    ml: { style: style.name, arrow: style.arrow, size: style.arrowMm * k, land: style.landing ? style.landingMm * k : 0, gap: style.gapMm * k, ...(style.frame ? { frame: true as const } : {}) }
  };
}

/** The multileader with one more leader, its arrowhead at `tip`. */
export const withLeaderAdded = (it: SketchItem, tip: Pt): SketchItem => ({ ...it, pts: [...it.pts, tip] });
/** Without the leader whose arrowhead is pts[i] (i from 1); undefined when it is the last one (a multileader keeps one). */
export function withLeaderRemoved(it: SketchItem, i: number): SketchItem | undefined {
  if (it.pts.length <= 2 || i < 1 || i >= it.pts.length) return undefined;
  return { ...it, pts: it.pts.filter((_, k) => k !== i) };
}
/** The index in pts (from 1) of the leader nearest the point. */
export function nearestLeader(it: SketchItem, p: Pt): number {
  const p0 = it.pts[0];
  const d = (q: Pt) => {
    const dx = p0[0] - q[0], dy = p0[1] - q[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - (q[0] + t * dx), p[1] - (q[1] + t * dy));
  };
  let best = 1;
  for (let i = 2; i < it.pts.length; i += 1) if (d(it.pts[i]) < d(it.pts[best])) best = i;
  return best;
}

/** Each multileader's landing start moved onto the line through the reference's, in the direction of `dirPt` from it
 * (none: vertical, so the words line up in a column); the arrowheads stay. */
export function alignedMleaders(items: SketchItem[], ref: SketchItem, dirPt?: Pt): SketchItem[] {
  const o = ref.pts[0];
  let ux = 0, uy = 1;
  if (dirPt) { const d = Math.hypot(dirPt[0] - o[0], dirPt[1] - o[1]); if (d > 1e-12) { ux = (dirPt[0] - o[0]) / d; uy = (dirPt[1] - o[1]) / d; } }
  return items.map((it) => {
    const q = it.pts[0], t = (q[0] - o[0]) * ux + (q[1] - o[1]) * uy;
    return { ...it, pts: [[o[0] + ux * t, o[1] + uy * t] as Pt, ...it.pts.slice(1)] };
  });
}

/** One multileader with every arrowhead of those given, its landing at `at`, the first one's style and look, and the
 * words joined: one paragraph each (vertical), or one paragraph joined with ", " (horizontal). */
export function collectedMleaders(items: SketchItem[], at: Pt, mode: 'vertical' | 'horizontal'): Omit<SketchItem, 'id'> {
  const [first] = items, { id: _id, pts: _p, note: _n, ...rest } = first;
  const words = items.filter((it) => it.note && plainText(it).trim()).map((it) => it.note as NotePara[]);
  const note: NotePara[] = mode === 'vertical' ? words.flat()
    : [{ runs: words.flatMap((paras, i) => [...(i ? [{ s: ', ' }] : []), ...paras.flatMap((q, j) => [...(j ? [{ s: ' ' }] : []), ...q.runs])]) }];
  return { ...rest, pts: [at, ...items.flatMap((it) => it.pts.slice(1))], ...(words.length ? { note } : {}) };
}

/** A multileader's words as the Properties palette and FIND read them. */
export const mleaderText = (it: SketchItem) => plainText(it);
/** A multileader with its words replaced by typed text (blank: none). */
export const withMleaderText = (it: SketchItem, s: string): SketchItem => {
  const { note: _n, ...rest } = it;
  return s.trim() ? { ...rest, note: noteFromText(s) } : rest;
};
