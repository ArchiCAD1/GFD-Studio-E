import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { newRiser, sizeRiser, type BusRiser } from '../calc/busbar';
import { addG10RiserMockup } from '../model/riserMockup';
import { buildRiserForm } from './riserForm';
import { buildFormWorkbook } from './formWorkbook';
import type { Project } from '../types';

const p: Project = { ...sampleProject, busRisers: [{ ...newRiser('BR-1', 'MDB-1'), name: 'BR-TA', floors: [{ id: 'a', name: 'L10', boardId: 'SMDB-FF' }, { id: 'b', name: 'Typ', kw: 30, count: 2 }] }] };

describe('bus bar riser form', () => {
  it('incomer from the riser, a row per tap-off, totals and DF', () => {
    const f = buildRiserForm(p, 'BR-1')!;
    expect(f.ref).toBe('BR-TA');
    expect(f.fedFrom).toBe('MDB-1');
    expect(f.incomer.busway).toMatch(/A TPN\+E DISTRIBUTED BUS RISER$/);
    expect(f.rows.map((r) => r.name)).toEqual(['SMDB-FF', 'Typ (1/2)', 'Typ (2/2)']);
    expect(f.rows[0].size).toBeDefined(); // the SMDB's incomer cable
    expect(f.totals.tcl).toBeCloseTo(f.rows.reduce((a, r) => a + r.tcl, 0));
    expect(f.df).toBeCloseTo(f.totals.md / f.totals.tcl);
  });
  describe('maximum demand equals the riser page\'s', () => {
    const m = addG10RiserMockup(sampleProject, 'MDB-1');
    const g10 = m.project.busRisers!.find((x) => x.id === m.riserId)!;
    const withRiser = (base: Project, r: BusRiser): Project => ({ ...base, busRisers: [r] });
    const check = (base: Project, r: BusRiser) => {
      const proj = withRiser(base, r);
      const f = buildRiserForm(proj, r.id)!;
      const res = sizeRiser(proj, r);
      expect(f.totals.md).toBeCloseTo(res.demandKw, 2);
      expect(f.incomer.acb).toBe(res.feederBreakerA);
      return f;
    };

    it('all boards: no diversity row', () => {
      const f = check(m.project, g10);
      expect(f.riserDiversity).toBeUndefined();
      expect(f.totals.md).toBeCloseTo(500, 1);
    });
    it('IEC diversity on boards: a 0.6 row over 500 kW', () => {
      const f = check(m.project, { ...g10, diversityRule: 'iec' });
      expect(f.riserDiversity).toMatchObject({ value: 0.6, label: 'IEC 61439, 11 tap-offs' });
      expect(f.riserDiversity!.beforeKw).toBeCloseTo(500, 1);
      expect(f.totals.md).toBeCloseTo(300, 1);
    });
    it('typed floors: DF 1 rows and an IEC row', () => {
      const f = check(sampleProject, { ...newRiser('BR-T', 'MDB-1'), floors: [{ id: 'T', name: 'Typ', kw: 45, pf: 0.9, count: 20 }] });
      expect(f.rows.every((r) => r.df === 1 && r.md === 45 && r.tcl === 45)).toBe(true);
      expect(f.riserDiversity).toMatchObject({ value: 0.6, beforeKw: 900 });
      expect(f.totals.md).toBeCloseTo(540, 6);
    });
    it('a typed factor is labelled typed', () => {
      const f = check(m.project, { ...g10, diversity: 0.85 });
      expect(f.riserDiversity).toMatchObject({ value: 0.85, label: 'typed' });
    });
    it('a mixed riser', () => {
      const f = check(m.project, { ...g10, floors: [...g10.floors.slice(0, 3), { id: 'X', name: 'Typed', kw: 80, pf: 0.9, count: 2 }] });
      expect(f.riserDiversity?.value).toBe(0.8);
      expect(f.riserDiversity!.beforeKw).toBeGreaterThan(160);
    });
  });
  it('Excel sheet only when there are risers', () => {
    expect(buildFormWorkbook(p).worksheets.map((w) => w.name)).toContain('BR-TA RISER');
    expect(buildFormWorkbook(sampleProject).worksheets.some((w) => w.name.endsWith('RISER'))).toBe(false);
  });
});
