/** IEC 60617 symbol library. Every symbol is drawn once, on a 2.5 mm grid, in
 * one frame: the body fits the box x 16–44, y 24–56 (28 × 32 units) on the
 * line axis x = 30, entering at the top and leaving at the bottom. Parts
 * marked `acc` (drawout marks, toroids, signal links, earths, side boxes) may
 * sit outside the box. A drawing places a symbol by its body centre (30, 40)
 * at one scale, so all symbols of a kind come out the same size. Text keeps
 * the diagram's own font sizes and is not scaled. Board symbols (`p-*`) are the
 * exception: 2:1 rectangles of 50 × 25 units, wider than the 28-unit box. */

export type SymCls = 'ln' | 'sym' | 'open' | 'fill' | 'thick' | 'dash';

export type SymPrim =
  | { k: 'p'; d: string; c?: SymCls; acc?: true }
  | { k: 'c'; cx: number; cy: number; r: number; c?: SymCls; acc?: true }
  | { k: 'e'; cx: number; cy: number; rx: number; ry: number; c?: SymCls; acc?: true }
  | { k: 'r'; x: number; y: number; w: number; h: number; c?: SymCls; acc?: true; edge?: true }
  /** Text centred on (x, y); `side` labels sit right of the axis and are drawn only on request. */
  | { k: 't'; x: number; y: number; s: string; b?: true; side?: true; acc?: true };

/** `existingInset`: units the pattern of a board symbol is pulled in from the edge when it is drawn as existing. */
export interface SymDef { label: string; iec: string; prims: SymPrim[]; existingInset?: number }

export const SYM_BOX = { x: 16, y: 24, w: 28, h: 32 } as const;
export const SYM_CX = 30;
export const SYM_CY = 40;

const p = (d: string, c?: SymCls, acc?: true): SymPrim => ({ k: 'p', d, c, acc });
const c = (cx: number, cy: number, r: number, cl: SymCls = 'sym', acc?: true): SymPrim => ({ k: 'c', cx, cy, r, c: cl, acc });
const r = (x: number, y: number, w: number, h: number, cl: SymCls = 'sym', acc?: true): SymPrim => ({ k: 'r', x, y, w, h, c: cl, acc });
const t = (x: number, y: number, s: string, b?: true): SymPrim => ({ k: 't', x, y, s, b });
const side = (s: string, y = 40): SymPrim => ({ k: 't', x: 48, y, s, side: true, acc: true });
const toroid = (y: number): SymPrim => ({ k: 'e', cx: 30, cy: y, rx: 6, ry: 3, c: 'open', acc: true });

// Switching parts: fixed contact at y 28; the blade pivots at y 48, so the frame's foot (48–56) is plain
// line where an RCD's toroid sits.
const CON = 'M30 24V28';
const BLADE = 'M30 56V48L21.5 30';
const CROSS = 'M26 24L34 32M34 24L26 32'; // breaker function 07-13-05
const BAR = 'M25 28H35'; // disconnector function 07-13-06
const CB = [p(`${CON} ${CROSS} ${BLADE}`)];
const ISOL = [p(`${CON} ${BAR} ${BLADE}`)];
const EARTH = (y: number, acc?: true) => p(`M20 ${y}H40M24 ${y + 4}H36M28 ${y + 8}H32`, 'ln', acc);
const SIGNAL = (s: string) => [p('M44 40H62', 'dash', true), side(s, 34)];
const box = (code: string): SymPrim[] => [r(16, 24, 28, 32), code.length > 2 ? t(30, 40, code) : t(30, 40, code, true)];
/** A motor starter's code in a box less tall than the frame (18 of 32), drawn at SYM_SCALE.starter: room round the code. */
const starterBox = (code: string): SymPrim[] => [r(16, 31, 28, 18), t(30, 40, code)];
/** A board: lead-in, the 50 × 25 outline (`edge`) and its pattern, which tells the kind of board. */
const board = (...pattern: SymPrim[]): SymPrim[] => [p('M30 24V27.5'), { k: 'r', x: 5, y: 27.5, w: 50, h: 25, edge: true }, ...pattern];
const fillP = (d: string) => p(d, 'fill');
const boardCode = (code: string): SymPrim[] => board(t(30, 40, code, code.length <= 2 || undefined));
const FRAME = r(8.5, 31, 43, 18, 'open');
const CROSS_LINES = p('M5 27.5L55 52.5M5 52.5L55 27.5');
const instrument = (letter: string, sub?: string): SymPrim[] => sub
  ? [c(30, 40, 14), t(30, 36, letter, true), t(30, 48, sub)]
  : [c(30, 40, 14), t(30, 40, letter, true)];
/** An RCD in the frame's foot: the toroid round the line, its operating link (dashed) up the blade side. */
const RCD: SymPrim[] = [{ k: 'e', cx: 30, cy: 52, rx: 7, ry: 2.6, c: 'open' }, p('M23 52H17V40H26.2', 'dash')];
/** Ring main unit: two ring switch-disconnectors and a T-off fuse switch-disconnector on one busbar, each the
 * library's own device at half size, blades toward the middle. The ring cables enter at the top on x 18.5 and
 * 41.5; the T-off leaves at the bottom on the line axis. */
const RMU: SymPrim[] = [
  p('M18.5 24V26M16 26H21M18.5 37L24 27M41.5 24V26M39 26H44M41.5 37L36 27'), c(18.5, 27.5, 1, 'open'), c(41.5, 27.5, 1, 'open'),
  p('M18.5 37H41.5', 'thick'),
  p('M30 37V42M27.5 42H32.5M30 56L24.5 43'), p('M24.05 45.9L27.3 44.6L29.95 51.1L26.7 52.4Z', 'open'),
  side('RMU')
];

export const SYMBOLS = {
  // Switching & protective devices
  cb: { label: 'Circuit breaker (MCB / MCCB)', iec: '07-13-05', prims: CB },
  acb: { label: 'Air circuit breaker, withdrawable', iec: '07-13-05', prims: [...CB, p('M24 18L30 14L36 18M24 62L30 66L36 62', 'ln', true), side('ACB')] },
  nonauto: { label: 'Non-automatic breaker', iec: '07-13-05', prims: [...CB, p('M25 21H35', 'ln', true)] },
  isolator: { label: 'Disconnector / isolator', iec: '07-13-06', prims: ISOL },
  swdisc: { label: 'Switch-disconnector', iec: '07-13-08', prims: [...ISOL, c(30, 31, 2, 'open')] },
  contactor: { label: 'Contactor', iec: '07-13-02', prims: [p(`${CON} ${BLADE}`), p('M26 28A4 4 0 0 1 34 28', 'open'), side('KM')] },
  fuse: { label: 'Fuse', iec: '07-21-01', prims: [r(24, 24, 12, 32), p('M30 24V56')] },
  fusesw: { label: 'Fuse switch-disconnector', iec: '07-21-07', prims: [...ISOL, p('M25.9 32.3L31.02 43.14L25.6 45.7L20.48 34.86Z', 'open')] },
  rcbo: { label: 'RCBO (breaker with RCD)', iec: '07-13-05 + 07-20', prims: [...CB, ...RCD] },
  rccb: { label: 'RCCB / ELCB', iec: '07-13-08 + 07-20', prims: [...ISOL, c(30, 31, 2, 'open'), ...RCD] },
  rcd: { label: 'Earth leakage protection (RCD)', iec: '07-20', prims: [p('M30 24V56'), { k: 'e', cx: 30, cy: 40, rx: 6, ry: 3, c: 'open' }] },
  shunt: { label: 'Breaker with shunt trip', iec: '07-13-05 + 07-15', prims: [...CB, p('M25 42H48', 'dash', true), r(48, 36, 12, 12, 'sym', true), { k: 't', x: 54, y: 42, s: 'ST', acc: true }] },
  ats: { label: 'Changeover / ATS', iec: '07-02-05', prims: [p('M18 24V30M42 24V30M30 56L19 31'), side('ATS')] },
  // Boards, drawn as one 2:1 rectangle without downstream detail
  'p-mdb': { label: 'Main distribution board (MDB)', iec: '11-15', existingInset: 0, prims: board(fillP('M8.5 31L51.5 31L8.5 49Z'), p('M8.5 49L51.5 31'), FRAME) },
  'p-emdb': { label: 'Emergency main distribution board (EMDB)', iec: '11-15', existingInset: 0, prims: board(fillP('M8.5 31L30 40L8.5 49Z'), fillP('M51.5 31L30 40L51.5 49Z'), p('M8.5 31L51.5 49M8.5 49L51.5 31'), FRAME) },
  'p-smdb': { label: 'Sub-main distribution board (SMDB)', iec: '11-15', existingInset: 2.5, prims: board(fillP('M5 27.5L55 27.5L5 52.5Z'), p('M5 52.5L55 27.5')) },
  'p-esmdb': { label: 'Emergency sub-main distribution board (ESMDB)', iec: '11-15', existingInset: 2.5, prims: board(fillP('M5 27.5L30 40L5 52.5Z'), fillP('M55 27.5L30 40L55 52.5Z'), CROSS_LINES) },
  'p-db': { label: 'Distribution board (DB)', iec: '11-15', existingInset: 2.5, prims: board(p('M5 52.5L55 27.5')) },
  'p-edb': { label: 'Emergency distribution board (EDB)', iec: '11-15', existingInset: 2.5, prims: board(CROSS_LINES) },
  'p-mcc': { label: 'Motor control centre (MCC)', iec: '11-15', existingInset: 2.5, prims: board(fillP('M5 27.5H55V40H5Z'), p('M5 40H55')) },
  'p-emcc': { label: 'Emergency motor control centre (EMCC)', iec: '11-15', existingInset: 2.5, prims: board(fillP('M5 27.5L55 27.5L30 40Z'), fillP('M5 52.5L55 52.5L30 40Z'), CROSS_LINES) },
  'p-fp': { label: 'Fire pump panel (FP)', iec: '11-15', existingInset: 2.5, prims: board(p('M5 40H55')) },
  'p-ups': { label: 'UPS output board (UPS)', iec: '11-15', existingInset: 2.5, prims: boardCode('UPS') },
  'p-mc': { label: 'Meter cabinet (MC)', iec: '11-15', existingInset: 2.5, prims: boardCode('MC') },
  'p-apfc': { label: 'Capacitor panel (APFC)', iec: '11-15', existingInset: 2.5, prims: boardCode('APFC') },
  // Motor starters & relays
  dol: { label: 'DOL starter', iec: '11-15', prims: starterBox('DOL') },
  sd: { label: 'Star-delta starter', iec: '11-15', prims: starterBox('Y-Δ') },
  ss: { label: 'Soft starter', iec: '06-14', prims: [r(16, 24, 28, 32), p('M20 50H26L34 30H40'), side('SS')] },
  vfd: { label: 'Variable frequency drive (VFD)', iec: '06-14', prims: [r(16, 24, 28, 32), p('M16 56L44 24'), t(23, 33, 'f1'), t(37, 49, 'f2'), side('VFD')] },
  ol: { label: 'Thermal overload relay', iec: '07-15-21', prims: [r(16, 24, 28, 32), p('M30 24V32H24V48H30V56'), side('OL')] },
  uvr: { label: 'Undervoltage relay', iec: '07-15', prims: [...box('U<'), ...SIGNAL('UVR')] },
  pmr: { label: 'Phase monitoring relay (phase failure)', iec: '07-15', prims: [...box('PMR'), ...SIGNAL('trip')] },
  pfrelay: { label: 'Power factor relay', iec: '07-15', prims: box('PFR') },
  // Sources & conversion
  tx: { label: 'Transformer, two-winding', iec: '06-09-01', prims: [c(30, 33, 9, 'open'), c(30, 47, 9, 'open')] },
  gen: { label: 'Generator, three-phase', iec: '06-04-01', prims: instrument('G', '3~') },
  incomer: { label: 'Authority supply', iec: '—', prims: [p('M16 40H44M30 40V56'), p('M18 36L30 24L42 36Z', 'open')] },
  rmu: { label: 'Ring main unit (RMU): 2 × ring switch + T-off fuse switch', iec: '07-13-08 + 07-21-07', prims: RMU },
  pv: { label: 'Solar PV with inverter', iec: '04-26 + 06-14', prims: [r(16, 24, 28, 32), p('M16 56L44 24'), t(23, 33, '='), t(37, 49, '~'), p('M6 12L13 19M10 19H13V16M12 6L19 13M16 13H19V10', 'ln', true)] },
  // Metering, monitoring & interfaces
  ct: { label: 'Current transformer', iec: '06-09-11', prims: [p('M30 24V56M36 40H44'), c(30, 40, 6, 'open'), side('CT')] },
  vt: { label: 'Voltage transformer', iec: '06-09-01', prims: [c(30, 33, 9, 'open'), c(30, 47, 9, 'open'), side('VT')] },
  voltmeter: { label: 'Voltmeter', iec: '08-02-01', prims: instrument('V') },
  ammeter: { label: 'Ammeter', iec: '08-02-01', prims: instrument('A') },
  kwh: { label: 'kWh meter', iec: '08-04-03', prims: box('kWh') },
  pmu: { label: 'Power monitoring unit (PMU)', iec: '08-04', prims: [...box('PMU'), ...SIGNAL('RS485')] },
  bms: { label: 'BMS interface', iec: '—', prims: [...box('BMS'), ...SIGNAL('BMS')] },
  faim: { label: 'Fire alarm interface module', iec: '—', prims: [...box('FAIM'), ...SIGNAL('FA')] },
  /** Ring core round the feeder's cable with a two-turn winding on its left end; the leads end at u 43.33, where
   * the ELCB box starts at scale 0.75 (x + 10). No line of its own: the cable passes through it. */
  cbct: { label: 'Core-balance CT wired to an ELCB / RCCB / ELR', iec: '06-09-11', prims: [{ k: 'e', cx: 30, cy: 40, rx: 7.4, ry: 2.9, c: 'open' }, p('M43.33 30.67H25A4.67 4.67 0 0 0 25 40A4.67 4.67 0 0 0 25 49.33H43.33')] },
  elr: { label: 'Earth leakage relay with CBCT', iec: '07-20 + 06-09-11', prims: [p('M30 24V56'), toroid(30), p('M36 30H48V36', 'dash', true), r(38, 36, 20, 14, 'sym', true), { k: 't', x: 48, y: 43, s: 'ELR', acc: true }] },
  lamp: { label: 'Indication lamp', iec: '08-10-01', prims: [p('M30 24V56M30 40H44'), c(50, 40, 6, 'sym', true), p('M46 36L54 44M54 36L46 44', 'ln', true)] },
  spd: { label: 'Surge protective device (SPD)', iec: '07-22-03', prims: [r(22, 24, 16, 32), p('M30 28V52M27 48L30 52L33 48'), p('M30 56V60', 'ln', true), EARTH(60, true)] },
  earth: { label: 'Earth', iec: '02-15-01', prims: [p('M30 24V40'), EARTH(40)] },
  pe: { label: 'Protective earth (PE)', iec: '02-15-03', prims: [c(30, 40, 14, 'open'), p('M30 24V36M22 36H38M25 40H35M28 44H32')] },
  // Distribution & loads
  busbar: { label: 'Busbar', iec: '03-01', prims: [p('M16 40H44', 'thick')] },
  motor: { label: 'Motor, three-phase', iec: '06-04-01', prims: instrument('M', '3~') },
  'motor-fp': { label: 'Fire pump motor', iec: '06-04-01', prims: instrument('M', 'FP') },
  lighting: { label: 'Lighting', iec: '08-10-01', prims: [p('M30 24V26'), c(30, 40, 14), p('M20.1 30.1L39.9 49.9M39.9 30.1L20.1 49.9')] },
  socket: { label: 'Socket outlets', iec: '11-13-01', prims: [p('M30 24V32M16 32H44'), p('M16 32A14 14 0 0 0 44 32', 'open')] },
  capacitor: { label: 'Capacitor bank', iec: '04-02-01', prims: [p('M30 24V36M30 44V48'), p('M16 36H44M16 44H44', 'thick'), EARTH(48)] },
  'eq-ac': { label: 'HVAC equipment (AC)', iec: '02-01-01', prims: box('AC') },
  'eq-ev': { label: 'EV charger (EV)', iec: '02-01-01', prims: box('EV') },
  'eq-it': { label: 'IT / data (IT)', iec: '02-01-01', prims: box('IT') },
  'eq-l': { label: 'Other load (L)', iec: '02-01-01', prims: box('L') },
  existing: { label: 'Existing equipment', iec: '—', prims: [r(16, 24, 28, 32, 'dash'), t(30, 40, 'EX', true)] }
} satisfies Record<string, SymDef>;

export type SymbolId = keyof typeof SYMBOLS;
export const SYMBOL_IDS = Object.keys(SYMBOLS) as SymbolId[];
/** Boards drawn as one symbol. */
export const PANEL_SYMBOL_IDS = SYMBOL_IDS.filter((id) => id.startsWith('p-'));

/** Scale per drawing role: switching devices fill the 16-unit breaker slot (device) or, on the System
 * diagram's feeders, spares and incomers, a 24-unit slot (switch); loads the 28-unit
 * load slot; the legend draws every symbol at one size.
 * A starter's code box (DOL, Y-Δ) is drawn larger, here and in the legend:
 * 22 × 14, so its 7.5 px code keeps about 3 units clear of the box. */
export const SYM_SCALE = { device: 0.5, switch: 0.75, starter: 0.8, load: 0.875, legend: 0.6 } as const;

const n = (v: number) => +v.toFixed(2);

/** A symbol path (absolute M L H V A Z only) mapped to drawing coordinates. */
export function placePath(d: string, map: (u: number, v: number) => [number, number], s: number, mirror = false): string {
  const tok = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const out: string[] = [];
  let cmd = '', u = 0, v = 0, i = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) {
      cmd = tok[i++];
      if (!'MLHVAZ'.includes(cmd)) throw new Error(`Unsupported symbol path command: ${cmd}`);
      out.push(cmd);
      continue;
    }
    if (cmd === 'M' || cmd === 'L') { u = num(); v = num(); out.push(map(u, v).map(n).join(' ')); }
    else if (cmd === 'H') { u = num(); out.push(String(n(map(u, v)[0]))); }
    else if (cmd === 'V') { v = num(); out.push(String(n(map(u, v)[1]))); }
    else if (cmd === 'A') {
      const rx = num(), ry = num(), rot = num(), large = num(), sweep = num();
      u = num(); v = num();
      out.push(`${n(rx * s)} ${n(ry * s)} ${rot} ${large} ${mirror ? 1 - sweep : sweep} ${map(u, v).map(n).join(' ')}`);
    } else throw new Error(`Symbol path value without a command: ${d}`);
  }
  return out.join(' ');
}

const SVG_PAINT: Record<SymCls, string> = {
  ln: 'fill="none" stroke="#000" stroke-width="1.2"', sym: 'fill="none" stroke="#000" stroke-width="1.2"', open: 'fill="none" stroke="#000" stroke-width="1.2"',
  fill: 'fill="#000" stroke="#000" stroke-width="1.2"', thick: 'fill="none" stroke="#000" stroke-width="3"', dash: 'fill="none" stroke="#000" stroke-width="1.2" stroke-dasharray="2 1.5"'
};
const SVG_EDGE_EXISTING = `${SVG_PAINT.sym} stroke-dasharray="4 2.5"`;
const EDGE_DASH = { strokeDasharray: '4 2.5' };
const xmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** How a symbol's prims are mapped: normally by `map`; for an existing board symbol its edge is dashed and every
 * prim after it is pulled in from the edge by the symbol's `existingInset` first. */
function primMaps(id: SymbolId, map: (u: number, v: number) => [number, number], existing: boolean) {
  const prims = SYMBOLS[id].prims as SymPrim[];
  const edgeAt = existing ? prims.findIndex((q) => q.k === 'r' && q.edge) : -1;
  const ins = (SYMBOLS[id] as SymDef).existingInset ?? 0;
  const inner = (u: number, v: number): [number, number] => map(SYM_CX + (u - SYM_CX) * (50 - 2 * ins) / 50, SYM_CY + (v - SYM_CY) * (25 - 2 * ins) / 25);
  return { prims, edgeAt, mapOf: (i: number) => (edgeAt >= 0 && i > edgeAt ? inner : map) };
}

/** A rect prim as drawing coordinates through `map`. */
function rectOf(q: Extract<SymPrim, { k: 'r' }>, map: (u: number, v: number) => [number, number]) {
  const [x0, y0] = map(q.x, q.y), [x1, y1] = map(q.x + q.w, q.y + q.h);
  return { x: n(Math.min(x0, x1)), y: n(Math.min(y0, y1)), w: n(Math.abs(x1 - x0)), h: n(Math.abs(y1 - y0)) };
}

/** The drawing of a library symbol as SVG elements, body centre at (x, y), `flip` mirroring it top to bottom
 * as Sym does; side labels are left off. */
export function symBody(id: SymbolId, x: number, y: number, s = 1, flip = false, existing = false): string {
  const X = (u: number) => n(x + (u - SYM_CX) * s);
  const Y = (v: number) => n(y + (v - SYM_CY) * (flip ? -s : s));
  const map = (u: number, v: number): [number, number] => [X(u), Y(v)];
  const { prims, edgeAt, mapOf } = primMaps(id, map, existing);
  return prims.map((q, i) => {
    const paint = q.k === 't' ? '' : i === edgeAt ? SVG_EDGE_EXISTING : SVG_PAINT[q.c ?? (q.k === 'p' ? 'ln' : 'sym')];
    const m = mapOf(i);
    switch (q.k) {
      case 'p': return `<path d="${placePath(q.d, m, s, flip)}" ${paint}/>`;
      case 'c': return `<circle cx="${X(q.cx)}" cy="${Y(q.cy)}" r="${n(q.r * s)}" ${paint}/>`;
      case 'e': return `<ellipse cx="${X(q.cx)}" cy="${Y(q.cy)}" rx="${n(q.rx * s)}" ry="${n(q.ry * s)}" ${paint}/>`;
      case 'r': { const b = rectOf(q, m); return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" ${paint}/>`; }
      case 't':
        if (q.side) return '';
        return `<text x="${X(q.x)}" y="${n(Y(q.y) + (q.b ? 4 : 3))}" fill="#000" font-family="Arial, Helvetica, sans-serif" font-size="${q.b ? 11 : 7.5}"${q.b ? ' font-weight="bold"' : ''} text-anchor="middle">${xmlText(q.s)}</text>`;
    }
  }).join('');
}

/** A library symbol as a black-on-white SVG string (printed sheets and DXF): symBody in a group that
 * names the symbol, so the DXF export can insert it as a block. */
export function symSvg(id: SymbolId, x: number, y: number, s = 1, flip = false, existing = false): string {
  return `<g class="iec" data-sym="${id}" data-sym-x="${n(x)}" data-sym-y="${n(y)}" data-sym-s="${s}"${flip ? ' data-sym-flip="1"' : ''}${existing ? ' data-sym-ex="1"' : ''}>${symBody(id, x, y, s, flip, existing)}</g>`;
}

const CLASS: Record<SymCls, string> = { ln: 'ln', sym: 'sym', open: 'sym-open', fill: 'sym-fill', thick: 'ln thick', dash: 'ln' };
const DASH = { strokeDasharray: '2 1.5' };

/** Draw a library symbol with its body centre at (x, y). `flip` mirrors it
 * top to bottom, for a device drawn upward from a busbar. `existing` draws a
 * board symbol's outline dashed with its pattern pulled in. `tint` colours it
 * on screen only (Colour by → Supply); its group is marked `screen-c`, so the
 * print shows it as drawn. */
export function Sym({ id, x, y, s = 1, labels = false, flip = false, existing = false, tint }: { id: SymbolId; x: number; y: number; s?: number; labels?: boolean; flip?: boolean; existing?: boolean; tint?: string }) {
  const X = (u: number) => n(x + (u - SYM_CX) * s);
  const Y = (v: number) => n(y + (v - SYM_CY) * (flip ? -s : s));
  const map = (u: number, v: number): [number, number] => [X(u), Y(v)];
  const { prims, edgeAt, mapOf } = primMaps(id, map, existing);
  return (
    <g className={tint ? 'iec screen-c' : 'iec'} data-sym={id} data-sym-x={x} data-sym-y={y} data-sym-s={s} data-sym-flip={flip ? 1 : undefined} data-sym-ex={existing ? 1 : undefined}>
      {prims.map((q, i) => {
        const edgeEx = i === edgeAt;
        const cls = q.k === 't' ? '' : edgeEx ? 'ln' : CLASS[q.c ?? (q.k === 'p' ? 'ln' : 'sym')];
        const base = q.k !== 't' && edgeEx ? EDGE_DASH : q.k !== 't' && q.c === 'dash' ? DASH : undefined;
        const style = tint && q.k !== 't' ? { ...base, ...(cls === 'sym-fill' ? { fill: tint } : { stroke: tint }) } : base;
        const m = mapOf(i);
        switch (q.k) {
          case 'p': return <path key={i} d={placePath(q.d, m, s, flip)} className={cls} style={style} />;
          case 'c': return <circle key={i} cx={X(q.cx)} cy={Y(q.cy)} r={n(q.r * s)} className={cls} style={style} />;
          case 'e': return <ellipse key={i} cx={X(q.cx)} cy={Y(q.cy)} rx={n(q.rx * s)} ry={n(q.ry * s)} className={cls} style={style} />;
          case 'r': { const b = rectOf(q, m); return <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} className={cls} style={style} />; }
          case 't':
            if (q.side && !labels) return null;
            return <text key={i} x={X(q.x)} y={Y(q.y) + (q.b ? 4 : 3)} textAnchor={q.side ? 'start' : 'middle'} className={q.b ? 'iec-t b' : 'iec-t s'} style={tint ? { fill: tint } : undefined} data-sym-side={q.side ? 1 : undefined}>{q.s}</text>;
        }
      })}
    </g>
  );
}
