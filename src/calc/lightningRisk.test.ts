import { describe, expect, it } from 'vitest';
import { lightningRisk, offsetAreaM2, riskText, type RiskInputs } from './lightningRisk';

// A 35 × 26 m villa, 8.5 m high. Every factor is the engineer's own entry, as in a project.
const base: RiskInputs = {
  shape: 'rectangle', lengthM: 35, widthM: 26, heightM: 8.5, thunderDays: 40, strikeRatio: 1, locationFactor: 1,
  fireRisk: 0.02, fireProvisions: 0.5, specialHazard: 1, typicalLoss: 0.5, tolerableRisk: 1e-5,
  damageProbability: { none: 1, IV: 0.2, III: 0.1, II: 0.05, I: 0.02 }, sensitivity: 1.5
};
const rectangle: [number, number][] = [[0, 0], [35, 0], [35, 26], [0, 26]];
// 40 × 30 m with a 20 × 15 m corner cut out.
const lShape: [number, number][] = [[0, 0], [40, 0], [40, 15], [20, 15], [20, 30], [0, 30]];

/** Independent check: count 0.25 m squares whose centre is inside the outline or within d of an edge. */
function sampledArea(o: [number, number][], d: number): number {
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]), step = 0.25;
  const inside = (x: number, y: number) => o.reduce((c, a, k) => {
    const b = o[(k + 1) % o.length];
    return (a[1] > y) !== (b[1] > y) && x < a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]) ? !c : c;
  }, false);
  const near = (x: number, y: number) => o.some((a, k) => {
    const b = o[(k + 1) % o.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <= d;
  });
  let n = 0;
  for (let x = Math.min(...xs) - d + step / 2; x < Math.max(...xs) + d; x += step)
    for (let y = Math.min(...ys) - d + step / 2; y < Math.max(...ys) + d; y += step) if (near(x, y) || inside(x, y)) n++;
  return n * step * step;
}

describe('lightning risk — preliminary (physical damage from a direct strike)', () => {
  it('rectangle: strike density, collection area, strikes a year and loss', () => {
    const r = lightningRisk(base);
    expect(r.strikeDensity).toBe(4);
    // 35 × 26 + 6 × 8.5 × 61 + 9π × 8.5² = 910 + 3111 + 2042.82
    expect(r.collectionAreaM2).toBeCloseTo(6063.82, 2);
    expect(r.strikesPerYear).toBeCloseTo(0.024255, 6);
    expect(r.yearsBetweenStrikes).toBeCloseTo(41.23, 2);
    expect(r.loss).toBeCloseTo(0.005, 10);
    expect(r.maxDamageProbability).toBeCloseTo(0.0825, 4);
  });

  it('risk for each class, and the least protection that passes', () => {
    const r = lightningRisk(base);
    expect(r.rows.map((x) => [x.level, x.ok])).toEqual([['none', false], ['IV', false], ['III', false], ['II', true], ['I', true]]);
    expect(r.rows[0].risk).toBeCloseTo(1.2128e-4, 8);
    expect(r).toMatchObject({ status: 'ok', minimum: 'II', sensitivityMinimum: 'II', missing: [] });
    expect(r.sensitivityRisk).toBeCloseTo(9.096e-6, 9);
  });

  it('a higher strike density moves the class, and the sensitivity check warns when it would', () => {
    expect(lightningRisk({ ...base, strikeRatio: 2 }).minimum).toBe('I');
    const r = lightningRisk({ ...base, sensitivity: 2 });
    expect(r).toMatchObject({ status: 'warn', minimum: 'II', sensitivityMinimum: 'I' });
    expect(r.checks.some((c) => c.status === 'warn' && c.text.includes('Class I'))).toBe(true);
  });

  it('a measured strike density replaces the thunderstorm days', () => {
    const r = lightningRisk({ ...base, thunderDays: undefined, strikeRatio: undefined, strikeDensity: 6 });
    expect(r.strikeDensity).toBe(6);
    expect(r.missing).toEqual([]);
  });

  it('no class is enough: status bad', () => {
    expect(lightningRisk({ ...base, typicalLoss: 1, specialHazard: 10 })).toMatchObject({ status: 'bad', minimum: 'insufficient' });
  });

  it('no protection needed when the bare risk is within the tolerable risk', () => {
    expect(lightningRisk({ ...base, tolerableRisk: 1e-3 }).minimum).toBe('none');
  });

  it('nothing is assumed: a missing value gives DATA REQUIRED and names it', () => {
    const r = lightningRisk({ shape: 'rectangle', lengthM: 35, widthM: 26, heightM: 8.5 });
    expect(r.status).toBe('data');
    expect(r.minimum).toBeUndefined();
    expect(r.missing).toEqual(['thunderstorm days or measured strike density', 'strike point ratio', 'location factor', 'fire risk factor',
      'fire provisions factor', 'special hazard factor', 'typical loss', 'tolerable risk']);
    expect(r.checks[0]).toMatchObject({ status: 'bad' });
    expect(r.collectionAreaM2).toBeCloseTo(6063.82, 2);
  });

  it('a damage probability missing before the first class that passes leaves the minimum unknown', () => {
    const r = lightningRisk({ ...base, damageProbability: { none: 1, IV: 0.2, II: 0.05, I: 0.02 } });
    expect(r.status).toBe('data');
    expect(r.missing).toEqual(['damage probability — class iii']);
    expect(r.rows[3]).toMatchObject({ level: 'II', ok: true });
  });

  it('entered area: used as it is', () => {
    const r = lightningRisk({ ...base, shape: 'area', collectionAreaM2: 5000, lengthM: undefined, widthM: undefined, heightM: undefined });
    expect(r.collectionAreaM2).toBe(5000);
    expect(r.strikesPerYear).toBeCloseTo(0.02, 10);
    expect(lightningRisk({ ...base, shape: 'area' }).missing).toEqual(['collection area']);
  });

  it('roof outline: a rectangle drawn as an outline gives the rectangle result, either way round', () => {
    const r = lightningRisk({ ...base, shape: 'outline', outline: rectangle });
    expect(r.collectionAreaM2).toBeCloseTo(6063.82, 2);
    expect(r.formulaAreaM2).toBeCloseTo(6063.82, 2);
    expect(lightningRisk({ ...base, shape: 'outline', outline: [...rectangle].reverse() }).collectionAreaM2).toBeCloseTo(6063.82, 2);
  });

  it('roof outline with an inward corner: the true area, below the bounding rectangle', () => {
    const d = 24, area = offsetAreaM2(lShape, d);
    const bounding = 40 * 30 + 2 * d * 70 + Math.PI * d * d;
    expect(area).toBeLessThan(bounding);
    expect(Math.abs(area - sampledArea(lShape, d)) / area).toBeLessThan(0.002);
    const r = lightningRisk({ ...base, shape: 'outline', outline: lShape, heightM: 8 });
    expect(r.collectionAreaM2).toBeCloseTo(area, 6);
    expect(r.formulaAreaM2).toBeCloseTo(900 + 140 * d + Math.PI * d * d, 6);
  });

  it('a narrow slot in the outline is filled by the offset: same as the bounding rectangle', () => {
    const slot: [number, number][] = [[0, 0], [40, 0], [40, 30], [21, 30], [21, 10], [19, 10], [19, 30], [0, 30]];
    const bounding = 40 * 30 + 2 * 24 * 70 + Math.PI * 24 * 24;
    expect(Math.abs(offsetAreaM2(slot, 24) - bounding) / bounding).toBeLessThan(0.0005);
  });

  it('roof outline: fewer than three points, or no height, is DATA REQUIRED', () => {
    expect(lightningRisk({ ...base, shape: 'outline', outline: [[0, 0], [10, 0]] }).missing).toEqual(['roof outline']);
    expect(lightningRisk({ ...base, shape: 'outline', outline: rectangle, heightM: undefined }).missing).toEqual(['building height']);
  });

  it('the working lists each step with its figures, for the report', () => {
    const w = lightningRisk(base).working;
    expect(w.map((x) => x.step)).toEqual(['Strike point density', 'Collection area', 'Direct strikes on building', 'Loss from physical damage', 'Largest damage probability allowed']);
    expect(w[1].result).toBe('6063.82 m²');
    expect(w[3].formula).toContain('0.02 × 0.5 × 1 × 0.5');
  });

  it('small numbers are written as a power of ten', () => {
    expect([riskText(1.2128e-4), riskText(1e-5), riskText(9.996e-6), riskText(0.0243), riskText(0)]).toEqual(['1.21 × 10⁻⁴', '1 × 10⁻⁵', '1 × 10⁻⁵', '0.0243', '0']);
  });
});
