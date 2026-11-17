import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { evaluateFeeder } from '../calc/electrical';
import type { Board, Feeder, Project } from '../types';
import { COLOR_BY, feederRatio, heatColor, supplyOf, supplyTint } from './heatmap';

describe('SLD colour by result', () => {
  const r = evaluateFeeder(sampleProject, sampleProject.feeders.find((f) => f.id === 'MCC-WP')!);

  it('measures each colouring against its own limit', () => {
    expect(feederRatio(r, 'vd', 4)).toBeCloseTo(r.vdTotalPct / 4, 9);
    expect(feederRatio(r, 'loading', 4)).toBeCloseTo(r.ib / 160, 9);
    expect(feederRatio(r, 'utilisation', 4)).toBeCloseTo(r.ib / r.ampacity, 9);
    expect(feederRatio(r, 'fault', 4)).toBeCloseTo(r.breakerFaultKA / 25, 9);
    expect(feederRatio(r, 'none', 4)).toBeUndefined();
  });

  it('goes green → amber → red, and stays red above the limit', () => {
    expect(heatColor(0.2)).toBe('hsl(130 80% 52%)');
    expect(heatColor(0.5)).toBe('hsl(130 80% 52%)');
    expect(heatColor(0.85)).toBe('hsl(45 80% 52%)');
    expect(heatColor(1)).toBe('hsl(0 80% 58%)');
    expect(heatColor(3)).toBe('hsl(0 80% 58%)');
    const hue = (c: string) => Number(c.match(/hsl\((\d+)/)![1]);
    expect(hue(heatColor(0.7))).toBeLessThan(130);
    expect(hue(heatColor(0.7))).toBeGreaterThan(45);
  });
});

describe('earth fault loop colouring', () => {
  it('green–amber while disconnection is in time, amber for thermal 5 s, red when too slow', async () => {
    const { earthRatio } = await import('./heatmap');
    const { evaluateEarthingAll } = await import('../calc/earthing');
    const all = evaluateEarthingAll(sampleProject);
    for (const e of all) {
      const r = earthRatio(e);
      if (e.status === 'ok') expect(r).toBeLessThan(0.85);
      if (e.status === 'warn') expect(r).toBeGreaterThanOrEqual(0.86);
      if (e.status === 'bad') expect(r).toBeGreaterThanOrEqual(1);
    }
    const base = all[0];
    expect(earthRatio({ ...base, status: 'bad', zsOhm: 0.1, maxZsOhm: 1 })).toBe(1);
    expect(earthRatio({ ...base, status: 'ok', zsOhm: 0.5, maxZsOhm: 1 })).toBe(0.5);
  });
});

describe('colour by supply', () => {
  const b = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'DB', ratedCurrentA: 100, ...extra });
  const standby = { kva: 500, changeover: 'ATS' as const };
  const boards: Board[] = [
    b('MDB', { kind: 'MDB' }),
    b('EMDB', { kind: 'EMDB', upstreamId: 'MDB', standby }),
    b('EM-DB', { upstreamId: 'EMDB' }),
    b('UPS', { kind: 'UPS', upstreamId: 'EMDB', upsKva: 10 }),
    b('UPS-DB', { upstreamId: 'UPS' }),
    b('SMDB', { kind: 'SMDB', upstreamId: 'MDB' }),
    b('EX-DB', { upstreamId: 'SMDB', existing: { recordedKva: 20 } }),
    b('EX-EM', { upstreamId: 'EMDB', existing: { recordedKva: 20 } }),
    b('EDB', { kind: 'EDB', upstreamId: 'MDB' }),
    b('ESMDB', { kind: 'ESMDB', upstreamId: 'MDB' }),
    b('ESM-DB', { upstreamId: 'ESMDB' }),
    b('GEN-ROOT', { kind: 'MDB', standby }),
    b('GEN-DB', { upstreamId: 'GEN-ROOT' })
  ];
  const f = (id: string, boardId: string, extra: Partial<Feeder> = {}): Feeder => ({ ...sampleProject.feeders[0], id, boardId, feedsBoardId: undefined, existing: undefined, ...extra });
  const feeders: Feeder[] = [
    f('F-EMDB', 'MDB', { feedsBoardId: 'EMDB' }), f('F-UPS', 'MDB', { feedsBoardId: 'UPS' }), f('C-EM', 'EMDB'),
    f('C-EX', 'SMDB', { existing: true }), f('C-NEW', 'EX-DB'), f('F-EX', 'SMDB', { feedsBoardId: 'EX-DB' }), f('F-ESM', 'MDB', { feedsBoardId: 'ESMDB' })
  ];
  const sup = supplyOf({ ...sampleProject, boards, feeders } as Project);
  const of = (id: string) => sup.board(boards.find((x) => x.id === id)!);
  const fd = (id: string) => sup.feeder(feeders.find((x) => x.id === id)!);

  it('takes each board\'s supply from the nearest emergency or UPS board up the network', () => {
    expect(of('MDB')).toBe('normal');
    expect(of('EMDB')).toBe('emergency');
    expect(of('EM-DB')).toBe('emergency');
    expect(of('UPS')).toBe('ups');
    expect(of('UPS-DB')).toBe('ups');
    expect(of('SMDB')).toBe('normal');
    expect(of('EX-DB')).toBe('existing');
    expect(of('EX-EM')).toBe('emergency');
    expect(of('EDB')).toBe('emergency');
    expect(of('ESMDB')).toBe('emergency'); // a kind-ESMDB board on a normal MDB
    expect(of('ESM-DB')).toBe('emergency');
    expect(of('GEN-ROOT')).toBe('emergency');
    expect(of('GEN-DB')).toBe('emergency');
  });

  it('gives a feeder its end board\'s supply, and a final circuit its own board\'s', () => {
    expect(fd('F-EMDB')).toBe('emergency');
    expect(fd('F-UPS')).toBe('ups');
    expect(fd('F-ESM')).toBe('emergency');
    expect(fd('C-EM')).toBe('emergency');
    expect(fd('C-EX')).toBe('existing');
    expect(fd('C-NEW')).toBe('normal');
    expect(fd('F-EX')).toBe('existing');
  });

  it('treats a loop in the network as normal and returns', () => {
    const loop = [b('A', { upstreamId: 'B' }), b('B', { upstreamId: 'A' })];
    const s = supplyOf({ ...sampleProject, boards: loop, feeders: [] } as Project);
    expect(s.board(loop[0])).toBe('normal');
    expect(s.board(loop[1])).toBe('normal');
  });

  it('draws nothing for normal supply, and the Supply choice comes last', () => {
    expect(supplyTint('normal')).toBeUndefined();
    expect(supplyTint('emergency')).toBe('var(--bad)');
    expect(COLOR_BY.map((c) => c.value)).toEqual(['none', 'vd', 'loading', 'utilisation', 'fault', 'earth', 'supply']);
    expect(COLOR_BY[COLOR_BY.length - 1].label).toBe('Supply');
  });
});
