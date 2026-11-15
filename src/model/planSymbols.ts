import { textWidth } from './cadText';
import type { ShapeOut } from './cadSketch';

/** Design CAD → plan symbols: the symbols of sockets, switches, boards, isolators and boxes on a floor plan, drawn in
 * paper mm about the device's point (a socket's stem and a switch's stroke point down the sheet until devices carry a
 * rotation). They are annotation: a symbol prints at the same size at every scale (src/model/cadAnnotate.ts,
 * `symbolUnits`). The same geometry draws the canvas, the plan sheets and the saved DXF / DWG. */

type Pt = [number, number];

/** A symbol's pieces, in paper mm with y up the sheet. Text is placed by the middle of its capitals, `h` their height;
 * `side` text starts at its point (a rating or tag beside the symbol), other text is centred on it. */
export type SymPrim =
  | { k: 'line'; pts: Pt[]; closed?: true; fill?: true }
  | { k: 'circle'; c: Pt; r: number; fill?: true }
  | { k: 'arc'; c: Pt; r: number; a0: number; a1: number } // degrees, anticlockwise from a0 to a1
  | { k: 'text'; at: Pt; s: string; h: number; side?: true };

export type PlanSymbolGroup = 'socket' | 'switch' | 'board' | 'isolator' | 'box' | 'plain';
export interface PlanSymbol { id: string; label: string; group: PlanSymbolGroup; prims: SymPrim[] }

// Written as on the sheet (y down the paper), kept with y up.
const L = (x1: number, y1: number, x2: number, y2: number): SymPrim => ({ k: 'line', pts: [[x1, -y1], [x2, -y2]] });
const C = (x: number, y: number, r: number, fill?: true): SymPrim => ({ k: 'circle', c: [x, -y], r, ...(fill ? { fill } : {}) });
const R = (x: number, y: number, w: number, h: number): SymPrim => ({ k: 'line', pts: [[x, -y], [x + w, -y], [x + w, -y - h], [x, -y - h]], closed: true });
const F = (...p: number[]): SymPrim => ({ k: 'line', pts: p.reduce<Pt[]>((o, v, i) => (i % 2 ? o : [...o, [v, -p[i + 1]]]), []), closed: true, fill: true });
const T = (x: number, y: number, s: string, h = 1.8): SymPrim => ({ k: 'text', at: [x, -y], s, h });
const Q = (s: string, x = 2.9, y = 1.6): SymPrim => ({ k: 'text', at: [x, -y], s, h: 1.8, side: true });

/** A socket outlet: a half circle on its bar, the stem to the wall. */
const socket = (): SymPrim[] => [{ k: 'arc', c: [0, 0], r: 1.75, a0: 180, a1: 360 }, L(0, 1.75, 0, 3.25), L(-2.4, 0, 2.4, 0)];
/** A switch: a small circle and its stroke with the end tick. */
const sw = (): SymPrim[] => [C(0, 1.5, 0.75), L(0.38, 0.85, 1.9, -1.75), L(1.9, -1.75, 2.68, -1.3)];
/** A board or panel: a rectangle with its tag. */
const board = (s: string, w = 6): SymPrim[] => [R(-w / 2, -1.75, w, 3.5), T(0, 0, s)];

const sym = (id: string, label: string, group: PlanSymbolGroup, prims: SymPrim[]): PlanSymbol => ({ id, label, group, prims });

const LIST: PlanSymbol[] = [
  sym('socket', 'Socket outlet', 'socket', socket()),
  sym('socket-twin', 'Twin socket outlet', 'socket', [{ k: 'arc', c: [0, 0], r: 1.75, a0: 180, a1: 360 }, L(-2.4, 0, 2.4, 0), L(-0.7, 1.6, -0.7, 3.25), L(0.7, 1.6, 0.7, 3.25)]),
  sym('socket-floor', 'Floor socket outlet', 'socket', [...socket(), Q('FL')]),
  sym('socket-ceiling', 'Socket outlet above ceiling', 'socket', [...socket(), Q('C')]),
  sym('exhaust-fan', 'Exhaust fan point', 'socket', [C(0, 0, 1.75), F(0, 0, -1.35, -0.75, -1.35, 0.75), F(0, 0, 1.35, -0.75, 1.35, 0.75), Q('EF', 2.4, 0)]),
  sym('emergency-light', 'Emergency light point', 'socket', [R(-1.75, -1.75, 3.5, 3.5), C(0, 0, 1.4), L(-0.99, -0.99, 0.99, 0.99), L(-0.99, 0.99, 0.99, -0.99)]),
  sym('shaver', 'Shaver outlet', 'socket', [...socket(), C(3.6, 0.6, 0.8), C(4.6, 0.6, 0.8)]),
  sym('power-outlet', 'Power outlet', 'socket', [...socket(), Q('32 A')]),

  sym('switch', 'Switch', 'switch', sw()),
  sym('switch-2way', 'Two-way switch', 'switch', [...sw(), L(-0.38, 2.15, -1.9, 4.75), L(-1.9, 4.75, -2.68, 4.3)]),
  sym('dimmer', 'Dimmer switch', 'switch', [...sw(), F(1.9, -1.75, 2.9, -1.9, 2.2, -1.0)]),
  sym('switch-fan', 'Fan switch with lamp', 'switch', [C(0, 1.5, 0.95), L(-0.67, 0.83, 0.67, 2.17), L(-0.67, 2.17, 0.67, 0.83), L(0.48, 0.68, 1.9, -1.75), L(1.9, -1.75, 2.68, -1.3), Q('F', 3.2, 1.6)]),
  sym('limit-switch', 'Limit switch', 'switch', [...sw(), Q('LS', 3.2, 1.6)]),
  sym('push-button', 'Push button', 'switch', [C(0, 0, 1.25), C(0, 0, 0.55)]),
  sym('switch-panel', 'Switch panel', 'switch', board('SP')),

  sym('mdb', 'Main distribution board', 'board', board('MDB', 7.5)),
  sym('db', 'Distribution board', 'board', board('DB')),
  sym('panel', 'Panel board', 'board', board('P')),
  sym('mc-board', 'Mechanical board', 'board', board('M/C')),
  sym('cb-box', 'Circuit breaker box', 'board', [R(-3, -1.75, 6, 3.5), L(-2.2, 0, -0.9, 0), L(0.9, 0, 2.2, 0), L(0.9, 0, -1, -1.1), L(-1.25, -0.45, -0.55, 0.45), L(-1.25, 0.45, -0.55, -0.45)]),

  sym('isolator', 'Isolator', 'isolator', [R(-3, -1.75, 6, 3.5), L(-2.2, 0, -0.9, 0), L(0.9, 0, 2.2, 0), L(0.9, 0, -1, -1.1), L(-0.9, -0.55, -0.9, 0.55), C(-0.5, 0, 0.4)]),
  sym('fused-isolator', 'Fused isolator', 'isolator', [R(-3.5, -1.75, 7, 3.5), L(-2.9, 0, -1.6, 0), L(0.2, 0, 2.9, 0), L(0.2, 0, -1.7, -1.1), L(-1.6, -0.55, -1.6, 0.55), C(-1.2, 0, 0.4), R(0.8, -0.45, 1.5, 0.9)]),

  sym('junction-box', 'Junction box', 'box', [C(0, 0, 1.75), T(0, 0, 'J')]),
  sym('pull-box', 'Pull box', 'box', [R(-1.75, -1.75, 3.5, 3.5), T(0, 0, 'P')]),
  sym('junction-box-ceiling', 'Junction box above ceiling', 'box', [C(0, 0, 1.75), T(0, 0, 'J'), Q('C', 2.3, 1.2)]),
  sym('hand-dryer', 'Hand dryer', 'box', board('HD', 5)),

  // The plain symbols the plan has always drawn (a light, a fan, a square with letters), for the palette's buttons.
  sym('light', 'Light', 'plain', [C(0, 0, 1.8), L(-1.26, -1.26, 1.26, 1.26), L(-1.26, 1.26, 1.26, -1.26)]),
  sym('ceiling-fan', 'Ceiling fan', 'plain', [C(0, 0, 1.8), T(0, 0, 'F')]),
  sym('split-ac', 'Split A/C', 'plain', [R(-1.8, -1.8, 3.6, 3.6), T(0, 0, 'AC', 1.4)]),
  sym('water-heater', 'Water heater', 'plain', [R(-1.8, -1.8, 3.6, 3.6), T(0, 0, 'WH', 1.3)])
];

export const PLAN_SYMBOLS: Record<string, PlanSymbol> = Object.fromEntries(LIST.map((s) => [s.id, s]));
export const PLAN_SYMBOL_IDS = LIST.map((s) => s.id);

/** A symbol placed at a point: `paths` are its lines (an arc as short chords), all in the caller's units, y up. */
export interface SymbolGeom {
  paths: { pts: Pt[]; closed?: boolean; fill?: boolean }[];
  circles: { c: Pt; r: number; fill?: boolean }[];
  texts: { at: Pt; s: string; h: number; side?: boolean }[];
}

/** The symbol `id` at (x, y), `k` units per paper mm. `tag` replaces its text (a board's tag, an outlet's rating). */
export function symbolGeom(id: string, x: number, y: number, k: number, tag?: string): SymbolGeom | undefined {
  const s = PLAN_SYMBOLS[id];
  if (!s) return undefined;
  const at = ([px, py]: Pt): Pt => [x + px * k, y + py * k];
  const out: SymbolGeom = { paths: [], circles: [], texts: [] };
  for (const p of s.prims) {
    if (p.k === 'line') out.paths.push({ pts: p.pts.map(at), ...(p.closed ? { closed: true } : {}), ...(p.fill ? { fill: true } : {}) });
    else if (p.k === 'circle') out.circles.push({ c: at(p.c), r: p.r * k, ...(p.fill ? { fill: true } : {}) });
    else if (p.k === 'arc') {
      const n = Math.max(2, Math.ceil((p.a1 - p.a0) / 10)), pts: Pt[] = [];
      for (let i = 0; i <= n; i += 1) { const a = ((p.a0 + ((p.a1 - p.a0) * i) / n) * Math.PI) / 180; pts.push(at([p.c[0] + p.r * Math.cos(a), p.c[1] + p.r * Math.sin(a)])); }
      out.paths.push({ pts });
    } else out.texts.push({ at: at(p.at), s: tag && !out.texts.length ? tag : p.s, h: p.h * k, ...(p.side ? { side: true } : {}) });
  }
  return out;
}

/** The symbol's extents about its point in paper mm (text included, by its drawn width). */
export function symbolBox(id: string, tag?: string): { x0: number; y0: number; x1: number; y1: number } | undefined {
  const g = symbolGeom(id, 0, 0, 1, tag);
  if (!g) return undefined;
  const xs: number[] = [], ys: number[] = [];
  for (const p of g.paths) for (const q of p.pts) { xs.push(q[0]); ys.push(q[1]); }
  for (const c of g.circles) { xs.push(c.c[0] - c.r, c.c[0] + c.r); ys.push(c.c[1] - c.r, c.c[1] + c.r); }
  for (const t of g.texts) { const w = textWidth(t.s, t.h); xs.push(t.side ? t.at[0] : t.at[0] - w / 2, t.side ? t.at[0] + w : t.at[0] + w / 2); ys.push(t.at[1] - t.h / 2, t.at[1] + t.h / 2); }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const n = (v: number) => +v.toFixed(2);
/** The symbol on a sheet (SVG, mm, y down) at (x, y), `k` sheet mm per symbol mm: black lines 0.25 mm on white. */
export function planSymbolSvg(id: string, x: number, y: number, k = 1, tag?: string): string {
  const g = symbolGeom(id, 0, 0, k, tag);
  if (!g) return '';
  const P = ([px, py]: Pt) => `${n(x + px)} ${n(y - py)}`;
  const body = [
    ...g.paths.map((p) => `<path d="M${p.pts.map(P).join('L')}${p.closed ? 'Z' : ''}"${p.fill ? ' fill="#000"' : p.closed ? '' : ' fill="none"'}/>`),
    ...g.circles.map((c) => `<circle cx="${n(x + c.c[0])}" cy="${n(y - c.c[1])}" r="${n(c.r)}"${c.fill ? ' fill="#000"' : ''}/>`),
    ...g.texts.map((t) => `<text x="${n(x + t.at[0])}" y="${n(y - t.at[1])}" font-size="${n(t.h / 0.716)}" text-anchor="${t.side ? 'start' : 'middle'}" dominant-baseline="central" fill="#000" stroke="none">${t.s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`)
  ].join('');
  return `<g fill="#fff" stroke="#000" stroke-width="0.25">${body}</g>`;
}

/** The symbol as saved in a DXF / DWG on `layer` (drawing units): lines, circles and its text. */
export function planSymbolShapes(id: string, layer: string, x: number, y: number, k: number, tag?: string): ShapeOut[] {
  const g = symbolGeom(id, x, y, k, tag);
  if (!g) return [];
  return [
    ...g.paths.map((p): ShapeOut => ({ layer, kind: p.pts.length > 2 || p.closed ? 'pline' : 'line', pts: p.pts, ...(p.closed ? { closed: true } : {}) })),
    ...g.circles.map((c): ShapeOut => ({ layer, kind: 'circle', pts: [c.c], r: c.r })),
    ...g.texts.map((t): ShapeOut => ({ layer, kind: 'text', pts: [[t.side ? t.at[0] : t.at[0] - textWidth(t.s, t.h) / 2, t.at[1] - t.h / 2]], text: t.s, h: t.h, rot: 0 }))
  ];
}
