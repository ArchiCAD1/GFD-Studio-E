import { describe, expect, it } from 'vitest';
import { buildBom } from '../calc/bom';
import { rcdOf } from '../calc/earthing';
import { elcbGroups, elcbSections, isRcbo, rcbosOf, scheduleCircuits } from '../calc/loadSchedule';
import { buildLoadScheduleHtml, elcbColumn, loadScheduleRows, scheduleTable } from '../docs/loadScheduleDoc';
import { buildDbSheet } from '../docs/dbSheet';
import type { Feeder, Project } from '../types';
import { neededDevices } from './enclosureLibrary';
import { addBoardElcb, allAutomatic, removeBoardElcb, setRcbo, updateBoardElcb } from './elcbs';
import { addCircuit, balancePhases, updateCircuit } from './schedule';

const WATTS = { ltg: 100, cfan: 80, exfan: 40, shaver: 20, s13: 250, wh: 3000, hd: 1800, cooker: 6000, s15: 1000, wac: 2000, sac: 2500, pump: 750 };

/** A DB with `n` 1-phase lighting circuits filled R1, Y1, B1, R2 … (way count = n / 3). */
function db(n: number, board: Partial<Project['boards'][number]> = {}): Project {
  let p: Project = {
    name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '',
    boards: [{ id: 'MDB', name: 'M', sourceKva: 1000, sourceImpedancePct: 5 }, { id: 'DB', name: 'Villa DB', upstreamId: 'MDB', ratedCurrentA: 100, pointWatts: WATTS, ...board }],
    feeders: [{ id: 'INC', boardId: 'MDB', name: 'Incomer', loadKw: 0, demandFactor: 1, powerFactor: 0.9, lengthM: 30, cableCsaMm2: 35, cores: 4, breakerRatingA: 100, breakerIcuKa: 36, feedsBoardId: 'DB' } as Feeder]
  };
  for (let i = 0; i < n; i++) {
    const r = addCircuit(p, 'DB');
    p = updateCircuit(r.project, r.id, { points: { ltg: 5 }, room: `Room ${i + 1}` });
  }
  return p;
}
const board = (p: Project) => p.boards.find((b) => b.id === 'DB')!;
const ways = (p: Project) => elcbGroups(p, board(p)).map((g) => g.ways);
const withElcbs = (p: Project, elcbs: NonNullable<Project['boards'][number]['elcbs']>): Project => ({ ...p, boards: p.boards.map((b) => (b.id === 'DB' ? { ...b, elcbs } : b)) });

describe('ELCB sections and groups', () => {
  it('without hand ELCBs the groups are as before', () => {
    const p = db(21);
    expect(ways(p)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
    expect(elcbGroups(p, board(p)).map((g) => [g.index, g.poles, g.byHand])).toEqual([[1, 4, undefined], [2, 4, undefined], [3, 4, undefined], [4, 4, undefined]]);
  });

  it('a hand ELCB on way 5 splits the automatic sections around it', () => {
    const p = withElcbs(db(21), [{ id: 'h', fromWay: 5, toWay: 5 }]);
    expect(ways(p)).toEqual([[1, 2], [3, 4], [5], [6, 7]]);
    const g = elcbGroups(p, board(p))[2];
    expect(g).toMatchObject({ index: 3, byHand: { id: 'h' }, poles: 4 });
    expect(g.circuits.map((c) => c.way)).toEqual([5, 5, 5]);
    expect(elcbSections(board(p), 7).map((s) => s.index)).toEqual([1, 2, 3, 4]);
  });

  it('a hand ELCB over spares only is a group, an automatic section of spares only is not', () => {
    let p = db(6);
    p = { ...p, boards: p.boards.map((b) => (b.id === 'DB' ? { ...b, spareWays: [{ id: 'sp1', kind: 'spare', phase: 'R', way: 4, ratingA: 20 }, { id: 'sp2', kind: 'spare', phase: 'R', way: 6, ratingA: 20 }] } : b)) };
    expect(ways(p)).toEqual([[1, 2]]);
    const q = withElcbs(p, [{ id: 'h', fromWay: 4, toWay: 4 }]);
    expect(elcbGroups(q, board(q)).map((g) => [g.index, g.circuits.length, g.category])).toEqual([[1, 6, 'lighting'], [3, 0, 'power']]);
  });

  it('an RCBO circuit is in no group and a section of only RCBOs has none', () => {
    let p = db(6, { elcbGroupSize: 3 });
    for (const f of scheduleCircuits(p, 'DB').filter((x) => x.way === 1)) p = setRcbo(p, f.id, true);
    expect(ways(p)).toEqual([[2]]);
    expect(elcbGroups(p, board(p))[0].index).toBe(2);
    p = setRcbo(p, 'DB-R2', true);
    expect(elcbGroups(p, board(p))[0].circuits.map((c) => c.id)).toEqual(['DB-Y2', 'DB-B2']);
  });

  it('hand rating, mA and 3 poles give the label', () => {
    const p = withElcbs(db(6), [{ id: 'h', fromWay: 1, toWay: 2, poles: 3, ratingA: 63, sensitivityMa: 100 }]);
    expect(elcbGroups(p, board(p))[0]).toMatchObject({ ratingA: 63, sensitivityMa: 100, poles: 3, label: '63 A 100 mA 3P' });
  });

  it('with no ELCB grouping, only hand ELCBs make sections', () => {
    const p = withElcbs(db(6, { elcbGroupSize: 0 }), [{ id: 'h', fromWay: 2, toWay: 2 }]);
    expect(elcbGroups(p, board(p)).map((g) => [g.index, g.ways])).toEqual([[1, [2]]]);
  });

  it('rcbosOf numbers RCBOs in way order and labels them 2P', () => {
    let p = db(6);
    p = setRcbo(p, 'DB-Y2', true);
    p = setRcbo(p, 'DB-R1', true, 100);
    const r = rcbosOf(p, board(p));
    expect(r.map((x) => [x.index, x.circuit.id, x.sensitivityMa])).toEqual([[1, 'DB-R1', 100], [2, 'DB-Y2', 100]]);
    expect(r[0].label).toBe(`${r[0].ratingA} A 100 mA 2P`);
  });
});

describe('placing ELCBs and RCBOs', () => {
  it('adds, refuses an overlap, updates and removes a hand ELCB', () => {
    const p = db(21);
    const a = addBoardElcb(p, 'DB', { fromWay: 5, toWay: 5 });
    expect(a.message).toMatch(/^ELCB-3 \d+ A \d+ mA 4P placed over way 5$/);
    expect(() => addBoardElcb(a.project, 'DB', { fromWay: 4, toWay: 5 })).toThrow('Ways 4–5 overlap ELCB-3 (way 5)');
    expect(() => addBoardElcb(p, 'DB', { fromWay: 3, toWay: 2 })).toThrow();
    expect(() => addBoardElcb(p, 'MDB', { fromWay: 1, toWay: 1 })).toThrow();
    const u = updateBoardElcb(a.project, 'DB', a.id, { toWay: 6, poles: 3, ratingA: 63 });
    expect(board(u.project).elcbs).toEqual([{ id: a.id, fromWay: 5, toWay: 6, poles: 3, ratingA: 63 }]);
    expect(board(removeBoardElcb(u.project, 'DB', a.id)).elcbs).toBeUndefined();
  });

  it('setRcbo turns an RCBO on and off; a 3-phase circuit cannot be one', () => {
    let p = db(3);
    p = addCircuit(p, 'DB', 'RYB').project;
    expect(() => setRcbo(p, 'DB-RYB2', true)).toThrow(/3-phase/);
    expect(() => setRcbo(p, 'INC', true)).toThrow();
    const on = setRcbo(p, 'DB-R1', true, 100);
    expect(on.feeders.find((f) => f.id === 'DB-R1')).toMatchObject({ rcbo: true, rcdMa: 100 });
    expect(isRcbo(on.feeders.find((f) => f.id === 'DB-R1')!)).toBe(true);
    const auto = setRcbo(on, 'DB-R1', true);
    expect(auto.feeders.find((f) => f.id === 'DB-R1')!.rcdMa).toBeUndefined();
    const off = setRcbo(on, 'DB-R1', false);
    expect(off.feeders.find((f) => f.id === 'DB-R1')).not.toHaveProperty('rcbo');
    expect(off.feeders.find((f) => f.id === 'DB-R1')).not.toHaveProperty('rcdMa');
  });

  it('allAutomatic removes both', () => {
    let p = db(6);
    p = setRcbo(p, 'DB-R1', true, 100);
    p = addBoardElcb(p, 'DB', { fromWay: 2, toWay: 2 }).project;
    const q = allAutomatic(p, 'DB');
    expect(board(q).elcbs).toBeUndefined();
    expect(q.feeders.some((f) => f.rcbo || (f.boardId === 'DB' && f.rcdMa))).toBe(false);
  });

  it('sizes the board again: the earth leakage change reaches the earth-fault check', () => {
    const p = db(3);
    const before = rcdOf(p, p.feeders.find((f) => f.id === 'DB-R1')!);
    const q = setRcbo(p, 'DB-R1', true, 10);
    expect(rcdOf(q, q.feeders.find((f) => f.id === 'DB-R1')!)).toBe(10);
    expect(before).toBe(100); // lighting group, project setting
  });
});

describe('earth leakage of circuits', () => {
  it('an Auto RCBO gets the setting for its type, a chosen mA stays, a circuit under a hand ELCB gets its mA', () => {
    let p = db(6);
    p = setRcbo(p, 'DB-R1', true);
    const get = (q: Project, id: string) => rcdOf(q, q.feeders.find((f) => f.id === id)!);
    expect(get(p, 'DB-R1')).toBe(100);
    p = setRcbo(p, 'DB-Y1', true, 30);
    expect(get(p, 'DB-Y1')).toBe(30);
    const h = addBoardElcb(p, 'DB', { fromWay: 2, toWay: 2, sensitivityMa: 300 }).project;
    expect(get(h, 'DB-R2')).toBe(300);
  });
});

describe('Balance phases with hand ELCBs', () => {
  it('without hand ELCBs the result is as before', () => {
    const p = db(9);
    const same = balancePhases(p, 'DB');
    expect(scheduleCircuits(same, 'DB').map((f) => f.id)).toEqual(scheduleCircuits(balancePhases(allAutomatic(p, 'DB'), 'DB'), 'DB').map((f) => f.id));
  });

  it('keeps circuits under a hand ELCB and fills the other ways, sections starting on automatic sections', () => {
    const p = addBoardElcb(db(15, { elcbGroupSize: 6 }), 'DB', { fromWay: 2, toWay: 2 }).project;
    const b = balancePhases(p, 'DB');
    const cs = scheduleCircuits(b, 'DB');
    expect(cs.filter((f) => f.way === 2).map((f) => f.id)).toEqual(['DB-R2', 'DB-Y2', 'DB-B2']);
    expect(new Set(cs.map((f) => `${f.phase}${f.way}`)).size).toBe(15);
    expect(Math.max(...cs.map((f) => f.way!))).toBe(5); // 12 others in ways 1, 3, 4, 5
  });

  it('a power section starts on the next automatic ELCB section of the ways that are left', () => {
    let p = db(7, { elcbGroupSize: 6 });
    p = addBoardElcb(p, 'DB', { fromWay: 2, toWay: 2 }).project;
    const r = addCircuit(p, 'DB', 'R', 9);
    p = updateCircuit(r.project, r.id, { points: { s13: 1 } });
    const power = scheduleCircuits(balancePhases(p, 'DB'), 'DB').find((f) => f.points?.s13);
    expect(power!.way).toBe(5); // 4 lighting circuits fill ways 1 and 3; the section [3, 4] ends, the next starts at way 5
  });

  it('a 3-phase circuit moves to a free way, never under the hand ELCB', () => {
    let p = db(3);
    p = addCircuit(p, 'DB', 'RYB').project;
    p = addBoardElcb(p, 'DB', { fromWay: 1, toWay: 1 }).project;
    const b = balancePhases(p, 'DB');
    expect(b.feeders.find((f) => f.id === 'DB-RYB3')).toBeUndefined();
    expect(scheduleCircuits(b, 'DB').filter((f) => f.phase === 'RYB').map((f) => f.way)).toEqual([2]);
    expect(scheduleCircuits(b, 'DB').filter((f) => f.way === 1)).toHaveLength(3);
  });
});

describe('BOQ and enclosure', () => {
  it('an RCBO replaces the MCB and no RCCB is counted for an all-RCBO section', () => {
    let p = db(3, { elcbGroupSize: 3 });
    for (const id of ['DB-R1', 'DB-Y1', 'DB-B1']) p = setRcbo(p, id, true, 30);
    const bom = buildBom(p).filter((i) => i.where.includes('DB'));
    expect(bom.filter((i) => i.key.startsWith('rcbo:30:SP+N:'))).toHaveLength(1);
    expect(bom.find((i) => i.key.startsWith('rcbo:'))!.qty).toBe(3);
    expect(bom.some((i) => i.key.startsWith('mcb:') && i.where.includes('DB'))).toBe(false);
    expect(bom.some((i) => i.key.startsWith('rccb:') || i.key.startsWith('rcd:'))).toBe(false);
  });

  it('a 3-pole hand ELCB is TP, 4-pole stays TP+N', () => {
    const p = addBoardElcb(db(6), 'DB', { fromWay: 1, toWay: 2, poles: 3 }).project;
    expect(buildBom(p).some((i) => /^rccb:\d+:TP:/.test(i.key))).toBe(true);
    const q = addBoardElcb(db(6), 'DB', { fromWay: 1, toWay: 2 }).project;
    expect(buildBom(q).some((i) => /^rccb:\d+:TP\+N:/.test(i.key))).toBe(true);
  });

  it('the enclosure counts RCBOs and a 3-pole RCCB', () => {
    let p = db(6);
    p = setRcbo(p, 'DB-R1', true);
    p = addBoardElcb(p, 'DB', { fromWay: 2, toWay: 2, poles: 3 }).project;
    const devices = neededDevices(p, 'DB', []);
    expect(devices.find((d) => d.kind === 'RCBO')?.count).toBe(1);
    expect(devices.some((d) => d.kind === 'RCCB' && d.poles === 3)).toBe(true);
  });
});

describe('schedule documents', () => {
  const sample = () => {
    let p = db(9, { elcbGroupSize: 6 });
    p = setRcbo(p, 'DB-Y1', true, 30);
    return addBoardElcb(p, 'DB', { fromWay: 3, toWay: 3 }).project;
  };

  it('elcbColumn: an RCBO in the middle splits its group into two cells', () => {
    const { entries } = loadScheduleRows(sample(), 'DB');
    const col = elcbColumn(entries);
    expect(col.map((c) => c && [c.span, c.group ? `E${c.group.index}` : c.rcbo ? `R${c.rcbo.index}` : '-'])).toEqual([
      [1, 'E1'], [1, 'R1'], [4, 'E1'], null, null, null, [3, 'E2'], null, null
    ].map((x) => x) as never);
  });

  it('the PDF has the RCBO cell, the table and the grid sheet merge it', () => {
    const p = sample();
    const html = buildLoadScheduleHtml(p, 'DB');
    expect(html).toContain('RCBO-1<br>');
    expect(html).toMatch(/rowspan="3">ELCB-2<br>/);
    const t = scheduleTable(p, 'DB');
    expect(t.rows.map((r) => r[2]).filter(Boolean).map((s) => s.split(' ')[0])).toEqual(['ELCB-1', 'RCBO-1', 'ELCB-1', 'ELCB-2']);
    const sheet = buildDbSheet(p, 'DB');
    const e = sheet.sheetCols.findIndex((c) => c.key === 'elcb');
    const labels = sheet.data.map((r) => String(r[e])).filter(Boolean);
    expect(labels.some((l) => l.startsWith('RCBO-1 '))).toBe(true);
    expect(Object.values(sheet.merges).some(([, span]) => span === 3)).toBe(true);
  });

  it('with nothing placed by hand the printed forms are unchanged', () => {
    const p = db(9);
    expect(buildLoadScheduleHtml(allAutomatic(p, 'DB'), 'DB')).toBe(buildLoadScheduleHtml(p, 'DB'));
    expect(buildLoadScheduleHtml(p, 'DB')).not.toContain('RCBO');
  });
});
