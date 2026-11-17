/** Lightning risk — preliminary, for one building: how often lightning strikes it, the loss a strike that does
 * physical damage brings, and the risk left with each protection class, against the tolerable risk. A standard
 * industry calculation, for one risk component only: physical damage from a direct strike. Strikes near the
 * building and on incoming lines are not covered, so the class it gives is a minimum.
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
export const RISK_NOTE = 'Standard industry calculation. The input data and the results must be verified by a qualified engineer against the applicable standard.';

export interface RiskInputs {
  shape: RiskShape;
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  /** Roof outline in plan (m), in order round the roof; the last point joins the first. */
  outline?: [number, number][];
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
}

export interface RiskRow {
  level: RiskLevel;
  damageProbability?: number;
  /** Risk per year; not set while the damage probability is missing. */
  risk?: number;
  ok?: boolean;
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
  /** Largest damage probability that keeps the risk within the tolerable risk. */
  maxDamageProbability?: number;
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
  const ys = outline.map((p) => p[1]);
  const y0 = Math.min(...ys) - d, y1 = Math.max(...ys) + d, n = 4000, h = (y1 - y0) / n;
  let total = 0;
  for (let s = 0; s < n; s++) {
    const y = y0 + (s + 0.5) * h;
    const spans: [number, number][] = [];
    const cuts: number[] = [];
    outline.forEach((a, k) => {
      const b = outline[(k + 1) % outline.length];
      const span = reach(a, b, d, y);
      if (span) spans.push(span);
      if ((a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1])) cuts.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    });
    cuts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cuts.length; k += 2) spans.push([cuts[k], cuts[k + 1]]);
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
  const o = i.outline ?? [];
  const drawn = o.length >= 3 && o.every((p) => p.every(Number.isFinite)) && Math.abs(shoelace(o)) > 0;
  if (!drawn) missing.push('roof outline');
  if (!drawn || !pos(i.heightM)) return {};
  const d = 3 * i.heightM, area = offsetAreaM2(o, d);
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

  if (!pos(i.tolerableRisk)) missing.push('tolerable risk');
  const ready = strikes !== undefined && loss !== undefined && pos(i.tolerableRisk);
  const maxP = ready && strikes! * loss! > 0 ? i.tolerableRisk! / (strikes! * loss!) : undefined;
  if (maxP !== undefined) working.push({ step: 'Largest damage probability allowed', formula: `tolerable risk ÷ (strikes × loss) = ${riskText(i.tolerableRisk!)} ÷ (${riskText(strikes!)} × ${riskText(loss!)})`, result: riskText(maxP) });

  const rows: RiskRow[] = RISK_LEVELS.map((level) => {
    const p = i.damageProbability?.[level];
    if (!zeroUp(p) || !ready) return { level, damageProbability: zeroUp(p) ? p : undefined };
    const risk = strikes! * p * loss!;
    return { level, damageProbability: p, risk, ok: risk <= i.tolerableRisk! };
  });
  // The minimum is the first level that passes; a level before it with no damage probability leaves it unknown.
  const least = (factor: number): { minimum?: RiskMinimum; risk?: number; gap?: RiskLevel } => {
    for (const row of rows) {
      if (row.risk === undefined) return { gap: row.level };
      if (row.risk * factor <= i.tolerableRisk!) return { minimum: row.level, risk: row.risk * factor };
    }
    return { minimum: 'insufficient' };
  };
  const base = ready ? least(1) : {};
  if (ready && base.gap) missing.push(`damage probability — ${riskLevelLabel(base.gap).toLowerCase()}`);
  const sens = ready && !base.gap && pos(i.sensitivity) ? least(i.sensitivity) : {};

  const checks: RiskResult['checks'] = [];
  if (missing.length) checks.push({ status: 'bad', text: `Risk assessment: DATA REQUIRED — ${missing.join(', ')}` });
  else if (base.minimum === 'insufficient') checks.push({ status: 'bad', text: 'Risk assessment: no protection class brings the risk within the tolerable risk — further measures are needed' });
  else if (base.minimum) checks.push({ status: 'ok', text: `Risk assessment: ${base.minimum === 'none' ? 'no protection is needed' : `minimum protection ${riskLevelLabel(base.minimum)}`} (physical damage from a direct strike only)` });
  const moved = sens.minimum !== undefined && sens.minimum !== base.minimum;
  if (moved) checks.push({ status: 'warn', text: `Sensitivity: with the strike density × ${r2(i.sensitivity!)} the minimum becomes ${sens.minimum === 'insufficient' ? 'more than Class I' : riskLevelLabel(sens.minimum as RiskLevel)}` });

  return {
    status: missing.length ? 'data' : base.minimum === 'insufficient' ? 'bad' : moved ? 'warn' : 'ok',
    missing, strikeDensity: density, collectionAreaM2: area, formulaAreaM2: formula, strikesPerYear: strikes,
    yearsBetweenStrikes: strikes ? 1 / strikes : undefined, loss, maxDamageProbability: maxP, rows,
    minimum: missing.length ? undefined : base.minimum, sensitivityMinimum: missing.length ? undefined : sens.minimum, sensitivityRisk: missing.length ? undefined : sens.risk,
    working, checks
  };
}
