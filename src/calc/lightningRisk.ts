/** Lightning risk — preliminary, for one building: how often lightning strikes it, the loss a strike that does
 * physical damage brings, and the risk left with each protection class, against the tolerable risk. A standard
 * industry calculation. Physical damage from a strike on the building is always in it; the engineer ticks the other
 * risk components that apply (injury, failure of internal systems, strikes near the building, strikes on and near
 * incoming lines) and they are added to it. One zone. A line component takes one probability for all the lines,
 * or one for each line.
 *
 * No value of a standard is built in. The lightning activity, the location and loss factors, the damage
 * probability of each class and the tolerable risk are entered by the engineer. A value that is missing gives
 * DATA REQUIRED — nothing is assumed. Only the arithmetic and the geometry of the collection area are here:
 * the roof outline pushed out by three times the building height. Metres, one height for the whole building. */

import type { LpsClass, LpsInputs } from './lightningProtection';

export type RiskShape = 'outline' | 'rectangle' | 'area';
export const RISK_SHAPES: { id: RiskShape; label: string }[] = [
  { id: 'outline', label: 'Roof outline' },
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'area', label: 'Entered area' }
];
export type RiskLevel = 'none' | LpsClass;
/** Least protection first: the first one that passes is the minimum. */
export const RISK_LEVELS: RiskLevel[] = ['none', 'IV', 'III', 'II', 'I'];
export const riskLevelLabel = (l: RiskLevel) => (l === 'none' ? 'No protection' : `Class ${l}`);
/** What the assessment covers, for the page and the report. */
export function riskScope(k: RiskInputs): string {
  const on = RISK_COMPONENTS.filter((c) => k.components?.[c.id]?.on), off = RISK_COMPONENTS.filter((c) => !k.components?.[c.id]?.on);
  if (!on.length) return 'One risk component only: physical damage from a direct strike. Strikes near the building and on incoming lines are not included, so the class is a minimum.';
  const list = (x: typeof on) => x.map((c) => c.label.toLowerCase()).join('; ');
  const shared = on.some((c) => (c.events === 'line' || c.events === 'nearLine') && !k.components![c.id]!.byLine);
  return `Risk components included: ${RISK_DAMAGE_LABEL.toLowerCase()}; ${list(on)}.${off.length ? ` Not included: ${list(off)}.` : ''} One zone${shared ? ', and one probability for each line component whatever the number of lines' : ''}.`;
}
export const RISK_NOTE = 'Standard industry calculation. The input data and the results must be verified by a qualified engineer against the applicable standard.';

/** The risk components that can be added to physical damage from a strike on the building, and the strikes each
 * one counts: on the building, near it, on an incoming line, or near one. */
export type RiskComponentId = 'touchBuilding' | 'systemsBuilding' | 'systemsNear' | 'touchLine' | 'damageLine' | 'systemsLine' | 'systemsNearLine';
export type RiskEvents = 'building' | 'near' | 'line' | 'nearLine';
export const RISK_COMPONENTS: { id: RiskComponentId; label: string; events: RiskEvents }[] = [
  { id: 'touchBuilding', label: 'Injury by touch and step voltage — strike on the building', events: 'building' },
  { id: 'systemsBuilding', label: 'Failure of internal systems — strike on the building', events: 'building' },
  { id: 'systemsNear', label: 'Failure of internal systems — strike near the building', events: 'near' },
  { id: 'touchLine', label: 'Injury by touch voltage — strike on an incoming line', events: 'line' },
  { id: 'damageLine', label: 'Physical damage — strike on an incoming line', events: 'line' },
  { id: 'systemsLine', label: 'Failure of internal systems — strike on an incoming line', events: 'line' },
  { id: 'systemsNearLine', label: 'Failure of internal systems — strike near an incoming line', events: 'nearLine' }
];
export const RISK_DAMAGE_LABEL = 'Physical damage — strike on the building';
/** A probability as entered: one value, or one for each protection class when the protection changes it. */
export interface RiskProbability { probability?: number; classProbability?: Partial<Record<RiskLevel, number>> }
/** One added risk component, as entered: whether it applies, its loss, and its probability. `byClass`: one for
 * each protection class. `byLine` (a line component): the probability is entered on each line instead. */
export interface RiskComponentInput extends RiskProbability { on?: boolean; loss?: number; byClass?: boolean; byLine?: boolean }
/** An incoming line (power, telecom): its length, the width that collects strikes on it and near it, and its
 * factors, all entered. Optionally the structure at its far end: its collection area and location factor. */
export interface RiskLine {
  name?: string;
  lengthM?: number;
  strikeWidthM?: number;
  nearWidthM?: number;
  installationFactor?: number;
  environmentFactor?: number;
  typeFactor?: number;
  farEndAreaM2?: number;
  farEndLocationFactor?: number;
  /** This line's own probability for a line component marked `byLine`. */
  probabilities?: Partial<Record<RiskComponentId, RiskProbability>>;
}

/** A part of the building with its own height (a tower, a lift overrun, a mast), in the coordinates of the roof outline. */
export interface RiskPart { outline: [number, number][]; heightM?: number }

export interface RiskInputs {
  shape: RiskShape;
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  /** Roof outline in plan (m), in order round the roof; the last point joins the first. */
  outline?: [number, number][];
  /** With a roof outline: parts with their own height above ground. Each reaches three times its own height. */
  parts?: RiskPart[];
  /** Where the roof outline's own lower left is in its drawing (m), so that parts taken later line up with it. */
  outlineOrigin?: [number, number];
  /** Collection area measured elsewhere (m²), for the 'area' shape. */
  collectionAreaM2?: number;
  /** Thunderstorm days a year at the site. */
  thunderDays?: number;
  /** Strike points for each flash to ground, with the thunderstorm days. */
  strikeRatio?: number;
  /** Measured strike point density (per km² a year); used instead of the thunderstorm days. */
  strikeDensity?: number;
  locationFactor?: number;
  fireRisk?: number;
  fireProvisions?: number;
  specialHazard?: number;
  typicalLoss?: number;
  /** Tolerable risk (per year). */
  tolerableRisk?: number;
  /** Probability that a strike does physical damage, with no protection and with each class. */
  damageProbability?: Partial<Record<RiskLevel, number>>;
  /** Strike density multiplier for the sensitivity check, e.g. 1.5. */
  sensitivity?: number;
  /** The other risk components, as entered; only the ones marked `on` are counted. */
  components?: Partial<Record<RiskComponentId, RiskComponentInput>>;
  /** Incoming lines, for the components that count strikes on or near a line. */
  lines?: RiskLine[];
  /** Strikes near the building: everything within this distance of it counts (m). */
  nearReachM?: number;
  /** With an entered collection area: the area for strikes near the building (m²). */
  nearAreaM2?: number;
  /** Density for strikes near the building and for lines (per km² a year); not set: as for the building. */
  nearDensity?: number;
}

export interface RiskRow {
  level: RiskLevel;
  damageProbability?: number;
  /** Risk per year, every counted component together; not set while a probability for this level is missing. */
  risk?: number;
  ok?: boolean;
  /** The same by component: physical damage from a strike on the building, and each added component. */
  parts?: Partial<Record<RiskComponentId | 'damage', number>>;
}
export type RiskMinimum = RiskLevel | 'insufficient';
export interface RiskResult {
  status: 'ok' | 'warn' | 'bad' | 'data';
  /** Inputs the calculation needs and does not have. */
  missing: string[];
  /** Strike points per km² a year. */
  strikeDensity?: number;
  collectionAreaM2?: number;
  /** Outline shapes: footprint + 3H × perimeter + 9πH², a cross-check (exact when the outline has no inward corner). */
  formulaAreaM2?: number;
  /** Direct strikes on the building a year. */
  strikesPerYear?: number;
  yearsBetweenStrikes?: number;
  loss?: number;
  /** Largest damage probability that keeps the risk within the tolerable risk (only without added components). */
  maxDamageProbability?: number;
  /** The added components that are counted. */
  included: RiskComponentId[];
  /** Strikes a year near the building, on the incoming lines (far-end structures included) and near them. */
  nearStrikesPerYear?: number;
  lineStrikesPerYear?: number;
  nearLineStrikesPerYear?: number;
  rows: RiskRow[];
  /** Least protection that passes; 'insufficient' when no class does. */
  minimum?: RiskMinimum;
  /** The same with the strike density multiplied by the sensitivity. */
  sensitivityMinimum?: RiskMinimum;
  sensitivityRisk?: number;
  /** How each figure was reached, for the page and the report. */
  working: { step: string; formula: string; result: string }[];
  checks: { status: 'ok' | 'warn' | 'bad'; text: string }[];
}

/** The study's risk inputs: the rectangle shape takes the building size of the study, the roof outline its height. */
export function studyRiskInputs(i: Pick<LpsInputs, 'lengthM' | 'widthM' | 'heightM' | 'risk'>): RiskInputs {
  const k: RiskInputs = i.risk ?? { shape: 'rectangle' };
  return k.shape === 'rectangle' ? { ...k, lengthM: i.lengthM, widthM: i.widthM, heightM: i.heightM } : k.shape === 'outline' ? { ...k, heightM: i.heightM } : k;
}
/** Whether anything has been entered for the risk assessment (a study without one shows no risk checks). */
export function riskStarted(k: RiskInputs | undefined): boolean {
  return !!k && Object.entries(k).some(([key, v]) => key !== 'shape' && (typeof v === 'object' ? Object.values(v ?? {}).some((x) => x !== undefined) : v !== undefined));
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const pos = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;
const zeroUp = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v >= 0;
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** A small number as 1.21 × 10⁻⁴; ordinary sizes to four decimals. */
export function riskText(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 0.001) return String(Math.round(v * 10000) / 10000);
  let e = Math.floor(Math.log10(Math.abs(v))), m = Math.round((v / 10 ** e) * 100) / 100;
  if (Math.abs(m) >= 10) { m /= 10; e += 1; }
  return `${m} × 10⁻${String(-e).split('').map((d) => SUP[+d]).join('')}`;
}

type Pt = [number, number];
const shoelace = (p: Pt[]) => p.reduce((s, [x, y], k) => s + x * p[(k + 1) % p.length][1] - p[(k + 1) % p.length][0] * y, 0) / 2;
const perimeter = (p: Pt[]) => p.reduce((s, [x, y], k) => s + Math.hypot(p[(k + 1) % p.length][0] - x, p[(k + 1) % p.length][1] - y), 0);
function convex(p: Pt[]): boolean {
  let sign = 0;
  for (let k = 0; k < p.length; k++) {
    const [ax, ay] = p[k], [bx, by] = p[(k + 1) % p.length], [cx, cy] = p[(k + 2) % p.length];
    const z = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(z) < 1e-12) continue;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
}

/** Where a horizontal line at y meets everything within d of the segment a–b (a rectangle with a round end at
 * each point; convex, so one stretch of x). */
function reach(a: Pt, b: Pt, d: number, y: number): [number, number] | undefined {
  let lo = Infinity, hi = -Infinity;
  for (const [cx, cy] of [a, b]) {
    const h = d * d - (y - cy) * (y - cy);
    if (h >= 0) { lo = Math.min(lo, cx - Math.sqrt(h)); hi = Math.max(hi, cx + Math.sqrt(h)); }
  }
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len > 0) {
    const nx = (-(b[1] - a[1]) / len) * d, ny = ((b[0] - a[0]) / len) * d;
    const q: Pt[] = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
    for (let k = 0; k < 4; k++) {
      const [x1, y1] = q[k], [x2, y2] = q[(k + 1) % 4];
      if (y1 === y2 ? y === y1 : (y - y1) * (y - y2) <= 0) {
        const xs = y1 === y2 ? [x1, x2] : [x1 + ((y - y1) / (y2 - y1)) * (x2 - x1)];
        for (const x of xs) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      }
    }
  }
  return hi >= lo ? [lo, hi] : undefined;
}

/** Area of everything within `d` of a roof outline, the roof included (m²): the outline pushed out by d with
 * round corners. Exact by formula when the outline has no inward corner; otherwise summed over thin strips. */
export function offsetAreaM2(outline: Pt[], d: number): number {
  const area = Math.abs(shoelace(outline));
  if (convex(outline)) return area + perimeter(outline) * d + Math.PI * d * d;
  return unionOffsetAreaM2([{ outline, d }]);
}

/** Area covered by several outlines, each pushed out by its own distance; where they overlap it counts once (m²).
 * Summed over thin strips. */
export function unionOffsetAreaM2(regions: { outline: Pt[]; d: number }[]): number {
  if (!regions.length) return 0;
  const y0 = Math.min(...regions.map((g) => Math.min(...g.outline.map((p) => p[1])) - g.d));
  const y1 = Math.max(...regions.map((g) => Math.max(...g.outline.map((p) => p[1])) + g.d)), n = 4000, h = (y1 - y0) / n;
  let total = 0;
  for (let s = 0; s < n; s++) {
    const y = y0 + (s + 0.5) * h;
    const spans: [number, number][] = [];
    for (const { outline, d } of regions) {
      const cuts: number[] = [];
      outline.forEach((a, k) => {
        const b = outline[(k + 1) % outline.length];
        const span = reach(a, b, d, y);
        if (span) spans.push(span);
        if ((a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1])) cuts.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      });
      cuts.sort((p, q) => p - q);
      for (let k = 0; k + 1 < cuts.length; k += 2) spans.push([cuts[k], cuts[k + 1]]);
    }
    spans.sort((p, q) => p[0] - q[0]);
    let end = -Infinity;
    for (const [lo, hi] of spans) {
      if (hi <= end) continue;
      total += hi - Math.max(lo, end);
      end = hi;
    }
  }
  return total * h;
}

const sound = (o: Pt[]) => o.length >= 3 && o.every((p) => p.every(Number.isFinite)) && Math.abs(shoelace(o)) > 0;

/** For drawing the collection area of a roof outline in a 300 × 190 box at (20, 10): the path of the outline and
 * of each part (y upwards in the drawing), and the width of its band — twice its reach. The roof outline first. */
export function riskOutlineSketch(k: RiskInputs): { path: string; band: number }[] | undefined {
  if (!sound(k.outline ?? []) || !pos(k.heightM)) return undefined;
  const regions = [{ outline: k.outline!, d: 3 * k.heightM }, ...(k.parts ?? []).filter((part) => sound(part.outline) && pos(part.heightM)).map((part) => ({ outline: part.outline, d: 3 * part.heightM! }))];
  const edge = (pick: (v: number[]) => number, axis: 0 | 1, sign: 1 | -1) => pick(regions.map((g) => pick(g.outline.map((p) => p[axis])) + sign * g.d));
  const x0 = edge((v) => Math.min(...v), 0, -1), x1 = edge((v) => Math.max(...v), 0, 1), y0 = edge((v) => Math.min(...v), 1, -1), y1 = edge((v) => Math.max(...v), 1, 1);
  const s = Math.min(300 / (x1 - x0), 190 / (y1 - y0));
  return regions.map((g) => ({ band: 2 * g.d * s, path: `M${g.outline.map(([x, y]) => `${(20 + (x - x0) * s).toFixed(1)} ${(10 + (y1 - y) * s).toFixed(1)}`).join('L')}Z` }));
}

function collection(i: RiskInputs, missing: string[], working: RiskResult['working']): { area?: number; formula?: number } {
  if (i.shape === 'area') {
    if (!pos(i.collectionAreaM2)) { missing.push('collection area'); return {}; }
    working.push({ step: 'Collection area', formula: 'entered', result: `${r2(i.collectionAreaM2)} m²` });
    return { area: i.collectionAreaM2 };
  }
  if (!pos(i.heightM)) missing.push('building height');
  if (i.shape === 'rectangle') {
    const sized = pos(i.lengthM) && pos(i.widthM);
    if (!sized) missing.push('building length and width');
    if (!sized || !pos(i.heightM)) return {};
    const L = i.lengthM!, W = i.widthM!, H = i.heightM;
    const area = L * W + 6 * H * (L + W) + 9 * Math.PI * H * H;
    working.push({ step: 'Collection area', formula: `L × W + 6 × H × (L + W) + 9 × π × H² = ${r2(L)} × ${r2(W)} + 6 × ${r2(H)} × (${r2(L)} + ${r2(W)}) + 9 × π × ${r2(H)}²`, result: `${r2(area)} m²` });
    return { area };
  }
  const o = i.outline ?? [], parts = i.parts ?? [];
  const drawn = sound(o);
  if (!drawn) missing.push('roof outline');
  const high = parts.map((part, n) => (sound(part.outline) && pos(part.heightM)) || (missing.push(`height of part ${n + 1}`), false)).every(Boolean);
  if (!drawn || !pos(i.heightM) || !high) return {};
  const d = 3 * i.heightM;
  if (parts.length) {
    const area = unionOffsetAreaM2([{ outline: o, d }, ...parts.map((part) => ({ outline: part.outline, d: 3 * part.heightM! }))]);
    working.push({ step: 'Collection area', formula: `roof outline pushed out by 3 × H = ${r2(d)} m, and ${parts.length} part${parts.length > 1 ? 's' : ''} each pushed out by 3 × its own height (${parts.map((part) => r2(part.heightM!)).join(', ')} m); overlaps counted once`, result: `${r2(area)} m²` });
    return { area };
  }
  const area = offsetAreaM2(o, d);
  const formula = Math.abs(shoelace(o)) + perimeter(o) * d + Math.PI * d * d;
  working.push({ step: 'Collection area', formula: `roof outline pushed out by 3 × H = ${r2(d)} m (roof ${r2(Math.abs(shoelace(o)))} m², perimeter ${r2(perimeter(o))} m)`, result: `${r2(area)} m²` });
  working.push({ step: 'Collection area — cross-check', formula: 'roof + 3 × H × perimeter + 9 × π × H² (the same when the outline has no inward corner, higher when it has)', result: `${r2(formula)} m²` });
  return { area, formula };
}

export function lightningRisk(i: RiskInputs): RiskResult {
  const missing: string[] = [], working: RiskResult['working'] = [];

  let density: number | undefined;
  if (pos(i.strikeDensity)) {
    density = i.strikeDensity;
    working.push({ step: 'Strike point density', formula: 'measured value entered', result: `${r2(density)} /km²/yr` });
  } else {
    if (!pos(i.thunderDays)) missing.push('thunderstorm days or measured strike density');
    if (!pos(i.strikeRatio)) missing.push('strike point ratio');
    if (pos(i.thunderDays) && pos(i.strikeRatio)) {
      density = 0.1 * i.thunderDays * i.strikeRatio;
      working.push({ step: 'Strike point density', formula: `0.1 × thunderstorm days × ratio = 0.1 × ${r2(i.thunderDays)} × ${r2(i.strikeRatio)}`, result: `${r2(density)} /km²/yr` });
    }
  }

  const { area, formula } = collection(i, missing, working);

  if (!pos(i.locationFactor)) missing.push('location factor');
  let strikes: number | undefined;
  if (density !== undefined && area !== undefined && pos(i.locationFactor)) {
    strikes = density * area * i.locationFactor * 1e-6;
    working.push({ step: 'Direct strikes on building', formula: `density × area × location factor × 10⁻⁶ = ${r2(density)} × ${r2(area)} × ${r2(i.locationFactor)} × 10⁻⁶`, result: `${riskText(strikes)} /yr` });
  }

  const factors: [string, number | undefined][] = [['fire risk factor', i.fireRisk], ['fire provisions factor', i.fireProvisions], ['special hazard factor', i.specialHazard], ['typical loss', i.typicalLoss]];
  factors.forEach(([name, v]) => { if (!zeroUp(v)) missing.push(name); });
  let loss: number | undefined;
  if (factors.every(([, v]) => zeroUp(v))) {
    loss = factors.reduce((p, [, v]) => p * v!, 1);
    working.push({ step: 'Loss from physical damage', formula: `fire risk × fire provisions × special hazard × typical loss = ${factors.map(([, v]) => v).join(' × ')}`, result: riskText(loss) });
  }

  // The added components: the strikes each one counts, then its loss and probability.
  const on = RISK_COMPONENTS.filter((c) => i.components?.[c.id]?.on), needs = (e: RiskEvents) => on.some((c) => c.events === e);
  const far = pos(i.nearDensity) ? i.nearDensity : density;
  const events: Partial<Record<RiskEvents, number>> = { building: strikes };
  const perLine: Partial<Record<RiskEvents, number>>[] = [], lineTag = (line: RiskLine, n: number) => line.name?.trim() || `line ${n + 1}`;
  const byLine = (c: (typeof RISK_COMPONENTS)[number]) => (c.events === 'line' || c.events === 'nearLine') && !!i.components?.[c.id]?.byLine;
  if (needs('near')) {
    let nearArea: number | undefined;
    if (i.shape === 'area') {
      if (pos(i.nearAreaM2)) nearArea = i.nearAreaM2; else missing.push('area for strikes near the building');
    } else {
      if (!pos(i.nearReachM)) missing.push('distance for strikes near the building');
      const round = i.shape === 'rectangle' ? (pos(i.lengthM) && pos(i.widthM) ? 2 * (i.lengthM + i.widthM) : undefined) : sound(i.outline ?? []) ? perimeter(i.outline!) : undefined;
      if (pos(i.nearReachM) && round !== undefined) nearArea = round * i.nearReachM + Math.PI * i.nearReachM * i.nearReachM;
    }
    if (far !== undefined && nearArea !== undefined) {
      events.near = far * nearArea * 1e-6;
      working.push({ step: 'Strikes near the building', formula: `density × area near the building × 10⁻⁶ = ${r2(far)} × ${r2(nearArea)} × 10⁻⁶${i.shape === 'area' ? '' : ` (perimeter × distance + π × distance², distance ${r2(i.nearReachM!)} m)`}`, result: `${riskText(events.near)} /yr` });
    }
  }
  if (needs('line') || needs('nearLine')) {
    const lines = i.lines ?? [];
    if (!lines.length) missing.push('incoming lines');
    let onLines: number | undefined = 0, nearLines: number | undefined = 0;
    lines.forEach((line, n) => {
      const tag = lineTag(line, n), lack = (what: string) => { missing.push(`${tag}: ${what}`); return false; };
      const sized = [pos(line.lengthM) || lack('length'), pos(line.installationFactor) || lack('installation factor'), pos(line.environmentFactor) || lack('environment factor'), pos(line.typeFactor) || lack('line type factor')].every(Boolean);
      const common = sized && far !== undefined ? far * line.lengthM! * line.installationFactor! * line.environmentFactor! * line.typeFactor! * 1e-6 : undefined;
      if (needs('line')) {
        const wide = pos(line.strikeWidthM) || lack('width for strikes on the line');
        const end = line.farEndAreaM2 === undefined && line.farEndLocationFactor === undefined ? 0
          : pos(line.farEndAreaM2) && pos(line.farEndLocationFactor) ? (far !== undefined && pos(line.typeFactor) ? far * line.farEndAreaM2 * line.farEndLocationFactor * line.typeFactor * 1e-6 : undefined)
            : (lack('far-end structure area and location factor'), undefined);
        const hit = common !== undefined && wide && end !== undefined ? common * line.strikeWidthM! + end : undefined;
        if (hit !== undefined) working.push({ step: `Strikes on ${tag}`, formula: `density × length × width × installation × environment × type × 10⁻⁶${end ? ' + far-end structure (density × area × location factor × type × 10⁻⁶)' : ''} = ${r2(far!)} × ${r2(line.lengthM!)} × ${r2(line.strikeWidthM!)} × ${line.installationFactor} × ${line.environmentFactor} × ${line.typeFactor} × 10⁻⁶${end ? ` + ${riskText(end)}` : ''}`, result: `${riskText(hit)} /yr` });
        onLines = onLines !== undefined && hit !== undefined ? onLines + hit : undefined;
        perLine[n] = { ...perLine[n], line: hit };
      }
      if (needs('nearLine')) {
        const wide = pos(line.nearWidthM) || lack('width for strikes near the line');
        const hit = common !== undefined && wide ? common * line.nearWidthM! : undefined;
        if (hit !== undefined) working.push({ step: `Strikes near ${tag}`, formula: `density × length × width × installation × environment × type × 10⁻⁶ = ${r2(far!)} × ${r2(line.lengthM!)} × ${r2(line.nearWidthM!)} × ${line.installationFactor} × ${line.environmentFactor} × ${line.typeFactor} × 10⁻⁶`, result: `${riskText(hit)} /yr` });
        nearLines = nearLines !== undefined && hit !== undefined ? nearLines + hit : undefined;
        perLine[n] = { ...perLine[n], nearLine: hit };
      }
    });
    if (lines.length && needs('line')) events.line = onLines;
    if (lines.length && needs('nearLine')) events.nearLine = nearLines;
  }
  // What each added component has apart from a probability by class: its strikes a year × its loss.
  const weight = new Map<RiskComponentId, number | undefined>();
  for (const c of on) {
    const e = i.components![c.id]!, name = c.label.toLowerCase();
    if (!zeroUp(e.loss)) missing.push(`loss — ${name}`);
    const n = events[c.events];
    if (byLine(c)) {
      // Each line has its own probability: the weight is the loss, and the strikes come line by line.
      const each = (i.lines ?? []).map((line, m) => e.byClass || zeroUp(line.probabilities?.[c.id]?.probability) || (missing.push(`probability — ${name} — ${lineTag(line, m)}`), false)).every(Boolean);
      weight.set(c.id, n !== undefined && zeroUp(e.loss) && each ? e.loss : undefined);
      continue;
    }
    if (!e.byClass && !zeroUp(e.probability)) missing.push(`probability — ${name}`);
    weight.set(c.id, n !== undefined && zeroUp(e.loss) && (e.byClass || zeroUp(e.probability)) ? n * e.loss : undefined);
  }

  if (!pos(i.tolerableRisk)) missing.push('tolerable risk');
  const ready = strikes !== undefined && loss !== undefined && pos(i.tolerableRisk) && on.every((c) => weight.get(c.id) !== undefined);
  const maxP = ready && !on.length && strikes! * loss! > 0 ? i.tolerableRisk! / (strikes! * loss!) : undefined;
  if (maxP !== undefined) working.push({ step: 'Largest damage probability allowed', formula: `tolerable risk ÷ (strikes × loss) = ${riskText(i.tolerableRisk!)} ÷ (${riskText(strikes!)} × ${riskText(loss!)})`, result: riskText(maxP) });

  // Probabilities a level still lacks, by level: named only for the level that leaves the minimum unknown.
  const lacks = new Map<RiskLevel, string[]>();
  const rows: RiskRow[] = RISK_LEVELS.map((level) => {
    const p = i.damageProbability?.[level], gaps: string[] = [];
    if (!zeroUp(p)) gaps.push(`damage probability — ${riskLevelLabel(level).toLowerCase()}`);
    const parts: RiskRow['parts'] = {};
    if (ready && zeroUp(p)) parts.damage = strikes! * p * loss!;
    for (const c of on) {
      const e = i.components![c.id]!;
      if (byLine(c)) {
        let sum: number | undefined = 0;
        (i.lines ?? []).forEach((line, m) => {
          const own = line.probabilities?.[c.id], q = e.byClass ? own?.classProbability?.[level] : own?.probability;
          if (!zeroUp(q)) { gaps.push(`probability — ${c.label.toLowerCase()} — ${lineTag(line, m)} — ${riskLevelLabel(level).toLowerCase()}`); sum = undefined; }
          else if (sum !== undefined && ready) sum += perLine[m][c.events]! * q * weight.get(c.id)!;
        });
        if (sum !== undefined && ready) parts[c.id] = sum;
        continue;
      }
      const q = e.byClass ? e.classProbability?.[level] : e.probability;
      if (!zeroUp(q)) gaps.push(`probability — ${c.label.toLowerCase()} — ${riskLevelLabel(level).toLowerCase()}`);
      else if (ready) parts[c.id] = weight.get(c.id)! * q;
    }
    lacks.set(level, gaps);
    if (gaps.length || !ready) return { level, damageProbability: zeroUp(p) ? p : undefined, ...(Object.keys(parts).length ? { parts } : {}) };
    const risk = Object.values(parts).reduce((a, b) => a + b!, 0);
    return { level, damageProbability: p, risk, ok: risk <= i.tolerableRisk!, ...(on.length ? { parts } : {}) };
  });
  // The minimum is the first level that passes; a level before it with a probability missing leaves it unknown.
  const least = (factor: number): { minimum?: RiskMinimum; risk?: number; gap?: RiskLevel } => {
    for (const row of rows) {
      if (row.risk === undefined) return { gap: row.level };
      if (row.risk * factor <= i.tolerableRisk!) return { minimum: row.level, risk: row.risk * factor };
    }
    return { minimum: 'insufficient' };
  };
  const base = ready ? least(1) : {};
  if (ready && base.gap) missing.push(...lacks.get(base.gap)!);
  const sens = ready && !base.gap && pos(i.sensitivity) ? least(i.sensitivity) : {};

  const checks: RiskResult['checks'] = [];
  if (missing.length) checks.push({ status: 'bad', text: `Risk assessment: DATA REQUIRED — ${missing.join(', ')}` });
  else if (base.minimum === 'insufficient') checks.push({ status: 'bad', text: 'Risk assessment: no protection class brings the risk within the tolerable risk — further measures are needed' });
  else if (base.minimum) checks.push({ status: 'ok', text: `Risk assessment: ${base.minimum === 'none' ? 'no protection is needed' : `minimum protection ${riskLevelLabel(base.minimum)}`} (${on.length ? `${on.length + 1} risk components` : 'physical damage from a direct strike only'})` });
  const moved = sens.minimum !== undefined && sens.minimum !== base.minimum;
  if (moved) checks.push({ status: 'warn', text: `Sensitivity: with the strike density × ${r2(i.sensitivity!)} the minimum becomes ${sens.minimum === 'insufficient' ? 'more than Class I' : riskLevelLabel(sens.minimum as RiskLevel)}` });

  return {
    status: missing.length ? 'data' : base.minimum === 'insufficient' ? 'bad' : moved ? 'warn' : 'ok',
    missing, strikeDensity: density, collectionAreaM2: area, formulaAreaM2: formula, strikesPerYear: strikes,
    yearsBetweenStrikes: strikes ? 1 / strikes : undefined, loss, maxDamageProbability: maxP, rows,
    included: on.map((c) => c.id), nearStrikesPerYear: events.near, lineStrikesPerYear: events.line, nearLineStrikesPerYear: events.nearLine,
    minimum: missing.length ? undefined : base.minimum, sensitivityMinimum: missing.length ? undefined : sens.minimum, sensitivityRisk: missing.length ? undefined : sens.risk,
    working, checks
  };
}
