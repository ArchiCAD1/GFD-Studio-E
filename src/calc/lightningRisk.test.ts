import { describe, expect, it } from 'vitest';
import { lightningRisk, offsetAreaM2, riskOutlineSketch, riskScope, riskStarted, riskText, studyRiskInputs, unionOffsetAreaM2, type RiskInputs, type RiskLine } from './lightningRisk';

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

describe('lightning risk — in the study', () => {
  it('the rectangle takes the building size of the study, the roof outline its height, an entered area nothing', () => {
    const size = { lengthM: 35, widthM: 26, heightM: 8.5 };
    expect(studyRiskInputs(size)).toEqual({ shape: 'rectangle', ...size });
    expect(studyRiskInputs({ ...size, risk: { shape: 'outline', outline: lShape } })).toEqual({ shape: 'outline', outline: lShape, heightM: 8.5 });
    expect(studyRiskInputs({ ...size, risk: { shape: 'area', collectionAreaM2: 5000 } })).toEqual({ shape: 'area', collectionAreaM2: 5000 });
  });

  it('a roof outline shows the area-and-perimeter cross-check in the working', () => {
    const w = lightningRisk({ ...base, shape: 'outline', outline: lShape, heightM: 8 }).working;
    expect(w.map((x) => x.step).slice(1, 3)).toEqual(['Collection area', 'Collection area — cross-check']);
    expect(w[2].result).toBe('6069.56 m²');
    expect(parseFloat(w[1].result)).toBeLessThan(6069.56);
  });

  it('started: once anything but the shape is entered', () => {
    expect([riskStarted(undefined), riskStarted({ shape: 'area' }), riskStarted({ shape: 'rectangle', damageProbability: {} }), riskStarted({ shape: 'rectangle', thunderDays: 40 }),
      riskStarted({ shape: 'rectangle', damageProbability: { II: 0.05 } })]).toEqual([false, false, false, true, true]);
  });
});

describe('lightning risk — parts of the building with their own height', () => {
  const sq = (x: number, y: number, a: number): [number, number][] => [[x, y], [x + a, y], [x + a, y + a], [x, y + a]];
  const one = (a: number, d: number) => a * a + 4 * a * d + Math.PI * d * d;
  const close = (v: number, want: number) => expect(Math.abs(v - want) / want).toBeLessThan(0.001);

  it('apart: the areas add; overlapping: counted once; a lower part inside the roof adds nothing', () => {
    close(unionOffsetAreaM2([{ outline: sq(0, 0, 10), d: 6 }, { outline: sq(200, 0, 20), d: 9 }]), one(10, 6) + one(20, 9));
    close(unionOffsetAreaM2([{ outline: sq(0, 0, 10), d: 6 }, { outline: sq(0, 0, 10), d: 6 }]), one(10, 6));
    close(unionOffsetAreaM2([{ outline: rectangle, d: 25.5 }, { outline: sq(10, 10, 4), d: 9 }]), 6063.82);
  });

  it('a tall mast on the roof takes over: its own circle, the roof inside it', () => {
    const r = lightningRisk({ ...base, shape: 'outline', outline: rectangle, parts: [{ outline: sq(17, 12.5, 1), heightM: 30 }] });
    close(r.collectionAreaM2!, one(1, 90));
    expect(r.formulaAreaM2).toBeUndefined();
    expect(r.working[1].formula).toContain('1 part each pushed out by 3 × its own height (30 m); overlaps counted once');
    // 0.103 strikes a year: even Class I leaves 1.03 × 10⁻⁵, above the tolerable risk.
    expect(r.minimum).toBe('insufficient');
  });

  it('a tower beside a low roof: more than the roof alone, less than the two apart', () => {
    const tower = sq(40, 0, 6), area = lightningRisk({ ...base, shape: 'outline', outline: rectangle, parts: [{ outline: tower, heightM: 20 }] }).collectionAreaM2!;
    expect(area).toBeGreaterThan(Math.max(6063.82, one(6, 60)));
    expect(area).toBeLessThan(6063.82 + one(6, 60));
  });

  it('a part with no height is DATA REQUIRED, by its number', () => {
    const r = lightningRisk({ ...base, shape: 'outline', outline: rectangle, parts: [{ outline: sq(0, 0, 2), heightM: 12 }, { outline: sq(5, 5, 2) }] });
    expect(r.missing).toEqual(['height of part 2']);
    expect(r.collectionAreaM2).toBeUndefined();
  });

  it('the sketch gives a path and a band for the roof and each part with a height, to one scale', () => {
    const k: RiskInputs = { shape: 'outline', outline: sq(0, 0, 10), heightM: 5, parts: [{ outline: sq(4, 4, 2), heightM: 10 }, { outline: sq(0, 0, 1) }] };
    const sk = riskOutlineSketch(k)!;
    expect(sk).toHaveLength(2);
    // The part reaches 30 m: the box is 62 m wide and tall, so 190 / 62 px a metre.
    expect(sk[0].band).toBeCloseTo((30 * 190) / 62, 3);
    expect(sk[1].band).toBeCloseTo((60 * 190) / 62, 3);
    expect(sk[0].path.startsWith('M')).toBe(true);
    expect(riskOutlineSketch({ shape: 'outline', outline: sq(0, 0, 10) })).toBeUndefined();
  });
});

describe('lightning risk — the other risk components', () => {
  const byClass = { none: 1, IV: 0.2, III: 0.1, II: 0.05, I: 0.02 };
  const line: RiskLine = { name: 'Power', lengthM: 1000, strikeWidthM: 40, nearWidthM: 4000, installationFactor: 0.5, environmentFactor: 0.5, typeFactor: 1 };

  it('none ticked: the result is the single component, as before', () => {
    const r = lightningRisk({ ...base, components: { touchBuilding: { loss: 1e-4, probability: 1 } }, lines: [line] });
    expect(r).toMatchObject({ minimum: 'II', included: [], missing: [] });
    expect(r.rows[3]).toEqual({ level: 'II', damageProbability: 0.05, risk: expect.closeTo(6.0638e-6, 9), ok: true });
    expect(r.maxDamageProbability).toBeCloseTo(0.0825, 4);
  });

  it('injury on the building, by class: added to physical damage level by level', () => {
    const r = lightningRisk({ ...base, components: { touchBuilding: { on: true, loss: 1e-4, byClass: true, classProbability: byClass } } });
    // 0.024255 strikes a year × 1 × 10⁻⁴ = 2.4255 × 10⁻⁶ with no protection, on top of 1.2128 × 10⁻⁴.
    expect(r.rows[0].parts).toEqual({ damage: expect.closeTo(1.2128e-4, 8), touchBuilding: expect.closeTo(2.4255e-6, 10) });
    expect(r.rows[0].risk).toBeCloseTo(1.23702e-4, 9);
    expect(r.rows[3].risk).toBeCloseTo(6.0638e-6 + 1.2128e-7, 10);
    expect(r).toMatchObject({ minimum: 'II', included: ['touchBuilding'] });
    expect(r.maxDamageProbability).toBeUndefined();
    expect(r.checks[0].text).toContain('minimum protection Class II (2 risk components)');
  });

  it('strikes near the building: perimeter × distance + π × distance², with the density for near strikes', () => {
    const k: RiskInputs = { ...base, nearReachM: 500, components: { systemsNear: { on: true, loss: 1e-6, probability: 0.01 } } };
    const r = lightningRisk(k);
    // 122 × 500 + π × 500² = 846 398.16 m²; × 4 × 10⁻⁶ = 3.3856 a year.
    expect(r.nearStrikesPerYear).toBeCloseTo(3.385593, 5);
    expect(r.rows[0].parts!.systemsNear).toBeCloseTo(3.385593e-8, 12);
    expect(lightningRisk({ ...k, nearDensity: 2 }).nearStrikesPerYear).toBeCloseTo(1.692796, 5);
    expect(lightningRisk({ ...k, nearReachM: undefined }).missing).toEqual(['distance for strikes near the building']);
    const area = lightningRisk({ ...k, shape: 'area', collectionAreaM2: 6000, nearAreaM2: 800000 });
    expect(area.nearStrikesPerYear).toBeCloseTo(3.2, 10);
    expect(lightningRisk({ ...k, shape: 'area', collectionAreaM2: 6000 }).missing).toEqual(['area for strikes near the building']);
  });

  it('incoming lines: strikes on each line, its far-end structure, and near it, summed over the lines', () => {
    const k: RiskInputs = { ...base, lines: [{ ...line, farEndAreaM2: 2000, farEndLocationFactor: 0.5 }, { ...line, name: '', lengthM: 500 }],
      components: { damageLine: { on: true, loss: 0.005, probability: 0.05 }, systemsNearLine: { on: true, loss: 1e-6, probability: 0.1 } } };
    const r = lightningRisk(k);
    // Line 1: 4 × 1000 × 40 × 0.25 × 10⁻⁶ = 0.04, far end 4 × 2000 × 0.5 × 10⁻⁶ = 0.004; line 2: 0.02. Near: 4 + 2.
    expect(r.lineStrikesPerYear).toBeCloseTo(0.064, 10);
    expect(r.nearLineStrikesPerYear).toBeCloseTo(6, 10);
    expect(r.rows[4].parts).toMatchObject({ damageLine: expect.closeTo(1.6e-5, 12), systemsNearLine: expect.closeTo(6e-7, 12) });
    // The line damage alone is above the tolerable risk whatever the class.
    expect(r).toMatchObject({ status: 'bad', minimum: 'insufficient' });
    expect(r.working.map((w) => w.step)).toEqual(expect.arrayContaining(['Strikes on Power', 'Strikes near Power', 'Strikes on line 2', 'Strikes near line 2']));
  });

  it('a line component with its probability by class can pass', () => {
    const r = lightningRisk({ ...base, lines: [line], components: { damageLine: { on: true, loss: 0.005, byClass: true, classProbability: { none: 1, IV: 0.05, III: 0.05, II: 0.01, I: 0.01 } } } });
    // Class II: 6.064 × 10⁻⁶ + 0.04 × 0.01 × 0.005 = 2 × 10⁻⁶.
    expect(r.rows[3].risk).toBeCloseTo(8.0638e-6, 10);
    expect(r.minimum).toBe('II');
  });

  it('nothing is assumed: what a ticked component lacks is named', () => {
    const r = lightningRisk({ ...base, lines: [{ lengthM: 1000, strikeWidthM: 40, farEndAreaM2: 2000 }], components: { touchLine: { on: true }, systemsBuilding: { on: true, loss: 1e-3, byClass: true, classProbability: { none: 1 } } } });
    expect(r.status).toBe('data');
    expect(r.missing).toEqual(['line 1: installation factor', 'line 1: environment factor', 'line 1: line type factor', 'line 1: far-end structure area and location factor',
      'loss — injury by touch voltage — strike on an incoming line',
      'probability — injury by touch voltage — strike on an incoming line']);
    expect(lightningRisk({ ...base, components: { touchLine: { on: true, loss: 1e-4, probability: 1 } } }).missing).toEqual(['incoming lines']);
    const gap = lightningRisk({ ...base, components: { systemsBuilding: { on: true, loss: 1e-9, byClass: true, classProbability: { none: 1 } } } });
    expect(gap.missing).toEqual(['probability — failure of internal systems — strike on the building — class iv']);
  });

  it('the scope names what is counted and what is not', () => {
    expect(riskScope(base)).toContain('One risk component only');
    const text = riskScope({ ...base, components: { touchBuilding: { on: true }, damageLine: { on: true }, systemsNear: {} } });
    expect(text).toContain('included: physical damage — strike on the building; injury by touch and step voltage — strike on the building; physical damage — strike on an incoming line.');
    expect(text).toContain('Not included: failure of internal systems — strike on the building;');
    expect(text).toContain('One zone');
  });
});

