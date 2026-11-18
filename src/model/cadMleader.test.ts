import { describe, expect, it } from 'vitest';
import { alignedMleaders, collectedMleaders, mleaderNote, mleaderParts, mleaderSegments, mleaderSide, nearestLeader, newMleader, withLeaderAdded, withLeaderRemoved } from './cadMleader';
import { noteBox, plainText } from './cadMtext';
import { aligned, arrayPolar, arrayRect, explode, gripMoved, gripsOf, mirrored, scaled, sketchInWindow, stretched } from './cadEdit';
import { cropItems } from './cadCrop';
import { geomKind, kindLabel, propValue, sharedValue, textRows, withProp, type PropDef } from './cadProps';
import { findReplace } from '../components/cad/cadDrawnMenus';
import { isTextLike } from './cadDrawOrder';
import { blockable, expandInsert, placed } from './cadBlocks';
import { mleaderStylesOf, mleaderStylesToStore, currentMleaderStyle } from './cadStyles';
import { sampleProject } from '../data/sampleProject';
import { itemAt, moved, rotated as rotatedBy, segmentsOf, shapesOut, snapPoints } from './cadSketch';
import { STANDARD_MLEADER, type CadMleaderStyle } from './cadStyles';
import type { SketchItem } from '../types';

/** Multileaders (MLEADER, S12 of the Design CAD 2D gap plan): all geometry in pts, words level on the side away from the arrowheads. */

const style: CadMleaderStyle = { ...STANDARD_MLEADER, frame: false };
const words = [{ runs: [{ s: 'L1-03' }] }];
const make = (tip: [number, number], land: [number, number], st: CadMleaderStyle = style, note = words): SketchItem => ({ id: 'M1', ...newMleader(tip, land, note, st, 100, 'LV-ANNO', 2.5) });

describe('Multileader: making one', () => {
  it('takes its look in drawing units from the style at k units per paper mm, the words\' height from the annotation when the style has none', () => {
    const it = make([0, 0], [1000, 500]);
    expect(it.kind).toBe('mleader');
    expect(it.pts).toEqual([[1000, 500], [0, 0]]);
    expect(it.ml).toEqual({ style: 'Standard', arrow: 'filled', size: 300, land: 250, gap: 100 });
    expect(it.h).toBe(250);
    expect(make([0, 0], [1000, 500], { ...style, textMm: 3.5, landing: false, frame: true }).ml).toEqual({ style: 'Standard', arrow: 'filled', size: 300, land: 0, gap: 100, frame: true });
    expect(make([0, 0], [1000, 500], { ...style, textMm: 3.5 }).h).toBe(350);
  });

  it('leaves out the words when there are none or the style carries none', () => {
    expect(newMleader([0, 0], [10, 0], undefined, style, 1, 'A').note).toBeUndefined();
    expect(newMleader([0, 0], [10, 0], [{ runs: [] }], style, 1, 'A').note).toBeUndefined();
    expect(newMleader([0, 0], [10, 0], words, { ...style, content: 'none' }, 1, 'A').note).toBeUndefined();
  });
});

describe('Multileader: the side of its words and their place', () => {
  it('puts the words right of the landing when the arrowheads are to its left (or level), else left', () => {
    expect(mleaderSide(make([0, 0], [1000, 500]))).toBe(1);
    expect(mleaderSide(make([1000, 0], [1000, 500]))).toBe(1);
    expect(mleaderSide(make([2000, 0], [1000, 500]))).toBe(-1);
    expect(mleaderSide(withLeaderAdded(make([0, 0], [1000, 500]), [4000, 0]))).toBe(-1); // the mean of 0 and 4000 is right of it
  });

  it('anchors the note at the landing\'s end plus the gap, at the landing\'s height, middle left on the right side and middle right on the left', () => {
    const r = mleaderNote(make([0, 0], [1000, 500]))!;
    expect(r.kind).toBe('mtext');
    expect(r.id).toBe('M1');
    expect(r.layer).toBe('LV-ANNO');
    expect(r.pts).toEqual([[1000 + 250 + 100, 500]]);
    expect(r.just).toBe('ML');
    const l = mleaderNote(make([2000, 0], [1000, 500]))!;
    expect(l.pts).toEqual([[1000 - 250 - 100, 500]]);
    expect(l.just).toBe('MR');
    // The note's box is centred on the landing's height, and runs away from it.
    const b = noteBox(r), c = noteBox(l);
    expect(b.tl[0]).toBeCloseTo(1350); expect(b.tl[1] - b.H / 2).toBeCloseTo(500);
    expect(c.tl[0] + c.w).toBeCloseTo(650);
  });

  it('has no note for a leader without words, or one asked for always (the editor) as an empty one', () => {
    const none = make([0, 0], [1000, 500], { ...style, content: 'none' });
    expect(mleaderNote(none)).toBeUndefined();
    expect(plainText(mleaderNote(none, true)!)).toBe('');
  });
});

describe('Multileader: its parts', () => {
  it('has a leg from each arrowhead to the landing, the landing and arrowheads pointing away from it', () => {
    const it = withLeaderAdded(make([0, 0], [1000, 0]), [0, -400]);
    const p = mleaderParts(it);
    expect(p.legs).toEqual([[[0, 0], [1000, 0]], [[0, -400], [1000, 0]]]);
    expect(p.landing).toEqual([[1000, 0], [1250, 0]]);
    // The filled arrowhead's lines all start at its tip, 300 long towards the landing for the first leader.
    expect(p.arrows.length).toBeGreaterThan(0);
    const first = p.arrows.filter(([a, b]) => Math.hypot(a[0], a[1]) < 1e-9 || Math.hypot(b[0], b[1]) < 1e-9);
    expect(first.length).toBeGreaterThan(0);
    const xs = p.arrows.flatMap(([a, b]) => [a, b]).filter((q) => Math.abs(q[1]) < 200 && q[0] < 400).map((q) => q[0]);
    expect(Math.max(...xs)).toBeCloseTo(300);
    expect(p.frame).toBeUndefined();
  });

  it('has no landing at length 0 and no arrows at size 0 or arrow none', () => {
    const a = make([0, 0], [1000, 0], { ...style, landing: false });
    expect(mleaderParts(a).landing).toBeUndefined();
    expect(mleaderParts(make([0, 0], [1000, 0], { ...style, arrow: 'none' })).arrows).toEqual([]);
    expect(mleaderParts(make([0, 0], [1000, 0], { ...style, arrowMm: 0 })).arrows).toEqual([]);
  });

  it('puts a frame round the words, pushed out by the gap, its side on the landing\'s end', () => {
    const it = make([0, 0], [1000, 0], { ...style, frame: true });
    const f = mleaderParts(it).frame!, b = noteBox(mleaderNote(it)!);
    expect(f).toHaveLength(4);
    expect(f[0][0]).toBeCloseTo(1250); // the landing's end
    expect(f[1][0]).toBeCloseTo(b.tl[0] + b.w + 100);
    expect(f[0][1]).toBeCloseTo(b.tl[1] + 100);
    expect(f[2][1]).toBeCloseTo(b.tl[1] - b.H - 100);
    const left = mleaderParts(make([2000, 0], [1000, 0], { ...style, frame: true })).frame!;
    expect(left[1][0]).toBeCloseTo(750); // its right side on the landing's end
    expect(mleaderSegments(it)).toHaveLength(1 + 1 + mleaderParts(it).arrows.length + 4);
  });

  it('is drawn, snapped to and picked through its lines and its words', () => {
    const it = make([0, 0], [1000, 0]);
    expect(segmentsOf(it)).toEqual(mleaderSegments(it));
    const snaps = snapPoints([it]).map((q) => [q.x, q.y, q.kind]);
    expect(snaps).toContainEqual([0, 0, 1]);
    expect(snaps).toContainEqual([1000, 0, 1]);
    expect(snaps).toContainEqual([1250, 0, 1]); // the landing's end
    expect(itemAt([it], [500, 0], 10)?.id).toBe('M1'); // on the leg
    const n = noteBox(mleaderNote(it)!);
    expect(itemAt([it], [n.tl[0] + n.w / 2, n.tl[1] - n.H / 2], 10)?.id).toBe('M1'); // on its words
    expect(itemAt([it], [500, 900], 10)).toBeUndefined();
  });
});

describe('Multileader: adding and removing leaders', () => {
  it('adds a leader at an arrowhead, and removes one but never the last', () => {
    const one = make([0, 0], [1000, 0]);
    const two = withLeaderAdded(one, [0, -500]);
    expect(two.pts).toEqual([[1000, 0], [0, 0], [0, -500]]);
    expect(withLeaderRemoved(two, 1)!.pts).toEqual([[1000, 0], [0, -500]]);
    expect(withLeaderRemoved(one, 1)).toBeUndefined();
    expect(withLeaderRemoved(two, 0)).toBeUndefined(); // the landing is not a leader
  });

  it('finds the leader nearest a point', () => {
    const it = withLeaderAdded(make([0, 0], [1000, 0]), [0, -800]);
    expect(nearestLeader(it, [500, -10])).toBe(1);
    expect(nearestLeader(it, [500, -420])).toBe(2);
  });
});

describe('Multileader: aligning and collecting', () => {
  const a = make([0, 0], [1000, 100]), b = { ...make([0, -600], [1400, -500]), id: 'M2' }, c = { ...make([0, -1200], [1700, -1100]), id: 'M3' };

  it('lines the landings up in a column (vertical) on the one aligned to, the arrowheads staying', () => {
    const out = alignedMleaders([b, c], a);
    expect(out.map((x) => x.pts[0])).toEqual([[1000, -500], [1000, -1100]]);
    expect(out.map((x) => x.pts[1])).toEqual([[0, -600], [0, -1200]]);
  });

  it('lines them up along the direction from the landing to a point', () => {
    const out = alignedMleaders([b], a, [1100, 200]); // up and to the right at 45°
    const [x, y] = out[0].pts[0], [ox, oy] = a.pts[0];
    expect((x - ox) * 1 - (y - oy) * 1).toBeCloseTo(0, 6); // on the line through a's landing at 45°
    expect(alignedMleaders([b], a, a.pts[0])[0].pts[0][0]).toBe(1000); // no direction: vertical
  });

  it('collects the arrowheads into one with the first one\'s look, the words one paragraph each or joined', () => {
    const v = collectedMleaders([a, b, c], [3000, 0], 'vertical');
    expect(v.pts).toEqual([[3000, 0], [0, 0], [0, -600], [0, -1200]]);
    expect(v.ml).toEqual(a.ml);
    expect(v.layer).toBe('LV-ANNO');
    expect(v.note!.map((p) => p.runs.map((r) => r.s).join(''))).toEqual(['L1-03', 'L1-03', 'L1-03']);
    const h = collectedMleaders([a, b, c], [3000, 0], 'horizontal');
    expect(h.note!).toHaveLength(1);
    expect(h.note![0].runs.map((r) => r.s).join('')).toBe('L1-03, L1-03, L1-03');
    // One without words adds none.
    const bare = { ...b, note: undefined };
    expect(collectedMleaders([a, bare], [3000, 0], 'horizontal').note![0].runs.map((r) => r.s).join('')).toBe('L1-03');
    expect(collectedMleaders([bare, { ...c, note: undefined }], [3000, 0], 'vertical').note).toBeUndefined();
  });
});

describe('Multileader: the edit tools keep it whole and its words level', () => {
  const ml2 = withLeaderAdded(make([0, 0], [1000, 0]), [0, -600]);

  it('moves and scales with every size, the words keeping their height scaled too', () => {
    expect(moved(ml2, 50, 70).pts).toEqual([[1050, 70], [50, 70], [50, -530]]);
    const s = scaled(ml2, [0, 0], 2);
    expect(s.pts).toEqual([[2000, 0], [0, 0], [0, -1200]]);
    expect(s.ml).toMatchObject({ size: 600, land: 500, gap: 200 });
    expect(s.h).toBe(500);
  });

  it('rotates and mirrors its points but never turns the words (no rot)', () => {
    const r = rotatedBy(ml2, [0, 0], Math.PI / 2);
    expect(r.rot).toBeUndefined();
    expect(r.pts[0][0]).toBeCloseTo(0); expect(r.pts[0][1]).toBeCloseTo(1000);
    expect(mleaderNote(r)!.rot).toBeUndefined();
    const m = mirrored(ml2, [500, 0], [500, 1]);
    expect(m.pts[0]).toEqual([0, 0]);
    expect(m.rot).toBeUndefined();
    // Mirrored, the arrowheads are right of the landing: the words go to its left.
    expect(mleaderSide({ ...ml2, pts: m.pts })).toBe(-1);
    expect(mleaderNote({ ...ml2, pts: m.pts })!.just).toBe('MR');
  });
});

describe('Multileader: saved to a DXF', () => {
  it('as lines and one MTEXT of its words, centred on its landing\'s height', () => {
    const it = make([0, 0], [1000, 0]);
    const out = shapesOut([it], 0.001);
    expect(out.filter((s) => s.kind === 'line')).toHaveLength(mleaderSegments(it).length);
    const t = out.filter((s) => s.kind === 'mtext');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ layer: 'LV-ANNO', pts: [[1350, 0]], text: 'L1-03', h: 250, just: 'ML' });
    expect(out.every((s) => s.id === 'M1' && s.layer === 'LV-ANNO')).toBe(true);
    expect(shapesOut([make([0, 0], [1000, 0], { ...style, content: 'none' })], 0.001).some((s) => s.kind === 'mtext')).toBe(false);
  });
});

describe('Multileader: grips, explode, window, stretch, arrays, crop, blocks, FIND, draw order', () => {
  const ml3 = withLeaderAdded(make([0, 0], [1000, 0]), [0, -600]);

  it('has a point grip on the landing and each arrowhead; an arrowhead grip moves that arrowhead alone, the landing grip the landing and words', () => {
    expect(gripsOf(ml3).map((g) => [g.at, g.kind])).toEqual([[[1000, 0], 'point'], [[0, 0], 'point'], [[0, -600], 'point']]);
    expect(gripMoved(ml3, 2, [50, -700]).pts).toEqual([[1000, 0], [0, 0], [50, -700]]);
    expect(gripMoved(ml3, 0, [1200, 80]).pts).toEqual([[1200, 80], [0, 0], [0, -600]]);
  });

  it('explodes into a line for each segment and one note of its words', () => {
    const r = explode(ml3);
    const items = (r as { items: Omit<SketchItem, 'id'>[] }).items;
    expect(items.filter((x) => x.kind === 'line')).toHaveLength(mleaderSegments(ml3).length);
    const notes = items.filter((x) => x.kind === 'mtext');
    expect(notes).toHaveLength(1);
    expect(plainText(notes[0] as SketchItem)).toBe('L1-03');
    expect(items.every((x) => x.layer === 'LV-ANNO')).toBe(true);
  });

  it('is in a window when its lines and its words are', () => {
    const it = make([0, 0], [1000, 0]);
    const n = noteBox(mleaderNote(it)!);
    expect(sketchInWindow([it], [-50, -50], [1300, 50], false)).toEqual([]); // the words stick out
    expect(sketchInWindow([it], [-50, -n.H], [n.tl[0] + n.w + 50, n.H], false)).toHaveLength(1);
    expect(sketchInWindow([it], [n.tl[0] - 5, n.tl[1] - 5], [n.tl[0] + 5, n.tl[1] + 5], true)).toHaveLength(1); // crossing the corner of its words only
  });

  it('stretches point by point, the others staying', () => {
    expect(stretched(ml3, [-10, -700], [10, 10], 100, 0)!.pts).toEqual([[1000, 0], [100, 0], [100, -600]]);
  });

  it('copies in arrays and aligns whole, its sizes kept', () => {
    const rows = arrayRect(ml3, 1, 2, 3000, 0);
    expect(rows).toHaveLength(1); // the copies: the original is the first
    expect(rows[0].pts[0]).toEqual([4000, 0]);
    expect(rows[0].ml).toEqual(ml3.ml);
    expect(arrayPolar(ml3, [0, 0], 3, 360, true)).toHaveLength(2);
    const a = aligned(ml3, [0, 0], { a: 0, k: 2, dx: 10, dy: 0 });
    expect(a.ml).toMatchObject({ size: 600 });
  });

  it('stays whole when cropped: kept with all its points and its words inside, dropped when none is', () => {
    const it = make([0, 0], [1000, 0]);
    const around = { kind: 'polygon' as const, pts: [[-5000, -5000], [9000, -5000], [9000, 5000], [-5000, 5000]] as [number, number][] };
    const kept = cropItems([it], around, 'inside');
    expect(kept.items).toHaveLength(1);
    expect(kept.items![0].kind).toBe('mleader');
    const cut = cropItems([it], { kind: 'polygon', pts: [[-500, -500], [500, -500], [500, 500], [-500, 500]] }, 'inside');
    expect(cut.items).toEqual([]);
    expect(cut.skipped).toEqual(['multileader']); // half in, half out: not cut
  });

  it('scales and keeps its look in a block', () => {
    const q = placed(ml3, 2, 0, [0, 0]);
    expect(q.ml).toMatchObject({ size: 600, land: 500, gap: 200 });
    expect(blockable(ml3)).toBe(true);
    expect(expandInsert({ id: 'I', kind: 'insert', layer: 'L', pts: [[100, 0]], block: 'B', sc: 1 }, [{ name: 'B', items: [ml3], explodable: true }])[0].pts[0]).toEqual([1100, 0]);
  });

  it('has its words searched and replaced, and is a leader for TEXTTOFRONT', () => {
    const f = findReplace([ml3], 'L1', 'L2');
    expect(f.n).toBe(1);
    expect(plainText(f.changed[0])).toBe('L2-03');
    expect(isTextLike(ml3, 'leaders')).toBe(true);
    expect(isTextLike(ml3, 'text')).toBe(false);
    expect(isTextLike(ml3, 'all')).toBe(true);
  });
});

describe('Multileader: the Properties palette', () => {
  const ml3 = withLeaderAdded(make([0, 0], [1000, 0]), [0, -600]);
  const k = 0.001;

  it('lists Contents, Style, Text height, Arrowhead, Arrow size, Landing, Frame and Leaders', () => {
    expect(geomKind(ml3)).toBe('mleader');
    expect(kindLabel(ml3)).toBe('Multileader');
    expect(textRows('mleader').map((d: PropDef) => d.label)).toEqual(['Contents', 'Style', 'Text height', 'Arrowhead', 'Arrow size', 'Landing', 'Frame', 'Leaders']);
    expect(textRows('mleader').filter((d) => d.ro).map((d) => d.label)).toEqual(['Style', 'Leaders']);
    const v = (key: PropDef['key']) => propValue(ml3, key, k);
    expect([v('text'), v('mlstyle'), v('h'), v('mlarrow'), v('mlsize'), v('mlland'), v('mlframe'), v('mlcount')]).toEqual(['L1-03', 'Standard', 0.25, 'filled', 0.3, 0.25, 'No', '2']);
  });

  it('sets its words, arrowhead, sizes, landing and frame; a blank text takes the words away; the style and count are read only', () => {
    expect(plainText(withProp(ml3, 'text', 'A-01\nA-02', k)!)).toBe('A-01\nA-02');
    expect(withProp(ml3, 'text', '  ', k)!.note).toBeUndefined();
    expect(withProp(ml3, 'mlarrow', 'dot', k)!.ml!.arrow).toBe('dot');
    expect(withProp(ml3, 'mlarrow', 'nonsense', k)).toBeUndefined();
    expect(withProp(ml3, 'mlsize', 0.5, k)!.ml!.size).toBeCloseTo(500);
    expect(withProp(ml3, 'mlland', 0, k)!.ml!.land).toBe(0);
    expect(withProp(ml3, 'mlframe', 'Yes', k)!.ml!.frame).toBe(true);
    expect(withProp(withProp(ml3, 'mlframe', 'Yes', k)!, 'mlframe', 'No', k)!.ml!.frame).toBeUndefined();
    expect(withProp(ml3, 'h', 0.35, k)!.h).toBeCloseTo(350);
    expect(withProp(ml3, 'mlstyle', 'Other', k)).toBeUndefined();
    expect(withProp(ml3, 'mlcount', '5', k)).toBeUndefined();
    expect(sharedValue([ml3, { ...ml3, id: 'M2', ml: { ...ml3.ml!, arrow: 'open' } }], 'mlarrow', k)).toBe('varies');
  });
});

describe('Multileader styles', () => {
  it('starts with a Standard that is not stored while unchanged', () => {
    const st = mleaderStylesOf(sampleProject);
    expect(st).toEqual({ styles: [STANDARD_MLEADER], current: 'Standard' });
    expect(STANDARD_MLEADER).toEqual({ name: 'Standard', arrow: 'filled', arrowMm: 3, landing: true, landingMm: 2.5, content: 'note', textMm: 0, gapMm: 1, frame: false, circuit: false });
    expect(mleaderStylesToStore(st)).toBeUndefined();
    expect(currentMleaderStyle(sampleProject).name).toBe('Standard');
  });

  it('keeps a changed Standard and the others, and the current one', () => {
    const st = { styles: [{ ...STANDARD_MLEADER, arrow: 'dot' as const }, { ...STANDARD_MLEADER, name: 'Circuit', circuit: true, frame: true }], current: 'Circuit' };
    const kept = mleaderStylesToStore(st)!;
    expect(kept.styles).toHaveLength(2);
    const p = { ...sampleProject, cadMleaderStyles: kept };
    expect(currentMleaderStyle(p)).toMatchObject({ name: 'Circuit', circuit: true });
    expect(mleaderStylesOf(p).styles.map((x) => x.name)).toEqual(['Standard', 'Circuit']);
    // A style saved without a newer setting reads with Standard's.
    const old = { ...sampleProject, cadMleaderStyles: { styles: [{ name: 'Old', arrow: 'open' } as CadMleaderStyle], current: 'Old' } };
    expect(currentMleaderStyle(old)).toMatchObject({ name: 'Old', arrow: 'open', arrowMm: 3, landing: true });
    expect(mleaderStylesOf(old).styles.map((x) => x.name)).toEqual(['Standard', 'Old']);
  });
});
