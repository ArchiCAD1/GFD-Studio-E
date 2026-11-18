import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { applyMove } from './sldEdit';
import { busWays, changeFeeder, copyFeeder, duplicateBoard, duplicateFeeder, orderTarget, pasteFeeder } from './sldMenuEdit';
import { withUids } from './stableIds';

const base: Project = withUids(structuredClone(sampleProject));
const ids = (p: Project, board: string) => busWays(p, board).map((f) => f.id);
/** The ways of a board after moving one of them. */
const order = (p: Project, id: string, how: 'left' | 'right' | 'first' | 'last') => {
  const t = orderTarget(p, { kind: 'feeder', id }, how);
  return t ? ids(applyMove(p, { kind: 'feeder', id }, t).project, p.feeders.find((f) => f.id === id)!.boardId) : undefined;
};

describe('order', () => {
  it('lists the ways of a busbar in drawing order, without DB final circuits', () => {
    expect(ids(base, 'SMDB-FF')).toEqual(['FF-OFF', 'FF-IT', 'FF-LAB', 'FF-LTG']);
    expect(ids(base, 'DB-GF1')).toEqual([]);
  });
  it('moves a load one way, to the first or the last place', () => {
    expect(order(base, 'FF-IT', 'left')).toEqual(['FF-IT', 'FF-OFF', 'FF-LAB', 'FF-LTG']);
    expect(order(base, 'FF-IT', 'right')).toEqual(['FF-OFF', 'FF-LAB', 'FF-IT', 'FF-LTG']);
    expect(order(base, 'FF-LAB', 'right')).toEqual(['FF-OFF', 'FF-IT', 'FF-LTG', 'FF-LAB']);
    expect(order(base, 'FF-LAB', 'first')).toEqual(['FF-LAB', 'FF-OFF', 'FF-IT', 'FF-LTG']);
    expect(order(base, 'FF-OFF', 'last')).toEqual(['FF-IT', 'FF-LAB', 'FF-LTG', 'FF-OFF']);
  });
  it('has no target where it already is', () => {
    expect(orderTarget(base, { kind: 'feeder', id: 'FF-OFF' }, 'left')).toBeUndefined();
    expect(orderTarget(base, { kind: 'feeder', id: 'FF-OFF' }, 'first')).toBeUndefined();
    expect(orderTarget(base, { kind: 'feeder', id: 'FF-LTG' }, 'right')).toBeUndefined();
    expect(orderTarget(base, { kind: 'feeder', id: 'FF-LTG' }, 'last')).toBeUndefined();
    expect(orderTarget(base, { kind: 'board', id: 'MDB-1' }, 'left')).toBeUndefined();
  });
  it('moves a board on its upstream busbar through its incomer', () => {
    const incomers = (p: Project) => ids(p, 'MDB-1').filter((x) => x.startsWith('INC-'));
    expect(incomers(base)).toEqual(['INC-GF', 'INC-FF', 'INC-MCC']);
    const t = orderTarget(base, { kind: 'board', id: 'SMDB-FF' }, 'left')!;
    const next = applyMove(base, { kind: 'board', id: 'SMDB-FF' }, t).project;
    expect(incomers(next)).toEqual(['INC-FF', 'INC-GF', 'INC-MCC']);
    expect(next.boards.find((b) => b.id === 'SMDB-FF')?.upstreamId).toBe('MDB-1');
    expect(orderTarget(base, { kind: 'board', id: 'SMDB-GF' }, 'first')).toBeUndefined();
  });
});

describe('copy and paste a load', () => {
  it('a copy has a new id and a new permanent id and none of the original\'s plan links', () => {
    const src = { ...base.feeders.find((f) => f.id === 'FF-LAB')!, fromRoom: 'R1', trayRoute: 'A-B', cadVerticalM: 3, lengthToCheck: true };
    const p = { ...base, feeders: base.feeders.map((f) => (f.id === 'FF-LAB' ? src : f)) };
    const c = copyFeeder(p, 'FF-LAB');
    expect(c.id).toBe('FF-LAB-2');
    expect(c.uid).toBeTruthy();
    expect(c.uid).not.toBe(src.uid);
    expect(c.name).toBe('Lab');
    for (const k of ['fromRoom', 'trayRoute', 'cadVerticalM', 'lengthToCheck', 'feedsBoardId'] as const) expect(c[k]).toBeUndefined();
    expect(copyFeeder({ ...p, feeders: [...p.feeders, c] }, 'FF-LAB').id).toBe('FF-LAB-3');
  });
  it('pastes at the end of a busbar and before a load', () => {
    const end = pasteFeeder(base, 'FF-LAB', { type: 'bus', boardId: 'SMDB-FF' });
    expect(ids(end.project, 'SMDB-FF')).toEqual(['FF-OFF', 'FF-IT', 'FF-LAB', 'FF-LTG', 'FF-LAB-2']);
    expect(end.select).toEqual({ type: 'feeder', id: 'FF-LAB-2' });
    expect(end.message).toContain('copy of FF-LAB');
    const mid = pasteFeeder(base, 'FF-LAB', { type: 'feeder', feederId: 'FF-IT' });
    expect(ids(mid.project, 'SMDB-FF')).toEqual(['FF-OFF', 'FF-LAB-2', 'FF-IT', 'FF-LAB', 'FF-LTG']);
  });
  it('re-sizes a copy pasted on another busbar and leaves the original alone', () => {
    const r = pasteFeeder(base, 'GF-HVAC', { type: 'bus', boardId: 'MCC-1' });
    const c = r.project.feeders.find((f) => f.id === 'GF-HVAC-2')!;
    expect(c.boardId).toBe('MCC-1');
    expect(r.project.feeders.find((f) => f.id === 'GF-HVAC')).toEqual(base.feeders.find((f) => f.id === 'GF-HVAC'));
    expect(r.message).toContain('re-checked');
  });
  it('does not paste a board incomer or on nothing', () => {
    expect(pasteFeeder(base, 'INC-FF', { type: 'bus', boardId: 'SMDB-GF' }).project).toBe(base);
    expect(pasteFeeder(base, 'FF-LAB', { type: 'canvas' }).project).toBe(base);
    expect(pasteFeeder(base, 'NOPE', { type: 'bus', boardId: 'SMDB-GF' }).project).toBe(base);
  });
  it('duplicates right after the original, or at the end for the last way', () => {
    expect(ids(duplicateFeeder(base, 'FF-IT').project, 'SMDB-FF')).toEqual(['FF-OFF', 'FF-IT', 'FF-IT-2', 'FF-LAB', 'FF-LTG']);
    expect(ids(duplicateFeeder(base, 'FF-LTG').project, 'SMDB-FF')).toEqual(['FF-OFF', 'FF-IT', 'FF-LAB', 'FF-LTG', 'FF-LTG-2']);
  });
});

describe('duplicate a board', () => {
  const incomers = (p: Project) => ids(p, 'MDB-1').filter((x) => x.startsWith('INC-'));
  it('copies the whole branch with new names, right after the original', () => {
    const r = duplicateBoard(base, 'SMDB-GF');
    const copy = r.project.boards.find((b) => b.id === 'SMDB-GF-2')!;
    expect(copy.upstreamId).toBe('MDB-1');
    expect(r.project.boards.some((b) => b.id === 'DB-GF1-2' && b.upstreamId === 'SMDB-GF-2')).toBe(true);
    expect(r.project.feeders.filter((f) => f.boardId === 'SMDB-GF-2').length).toBe(base.feeders.filter((f) => f.boardId === 'SMDB-GF').length);
    expect(r.project.feeders.filter((f) => f.boardId === 'DB-GF1-2').length).toBe(base.feeders.filter((f) => f.boardId === 'DB-GF1').length);
    const inc = incomers(r.project);
    expect(inc.length).toBe(4);
    expect(inc[0]).toBe('INC-GF');
    expect(r.project.feeders.find((f) => f.id === inc[1])?.feedsBoardId).toBe('SMDB-GF-2');
    expect(inc.slice(2)).toEqual(['INC-FF', 'INC-MCC']);
    expect(r.select).toEqual({ type: 'board', id: 'SMDB-GF-2' });
    expect(r.message).toContain('SMDB-GF-2');
    // The original is untouched, and the copy has its own permanent id.
    expect(r.project.boards.find((b) => b.id === 'SMDB-GF')).toEqual(base.boards.find((b) => b.id === 'SMDB-GF'));
    expect(withUids(r.project, base).boards.find((b) => b.id === 'SMDB-GF-2')!.uid).not.toBe(base.boards.find((b) => b.id === 'SMDB-GF')!.uid);
  });
  it('leaves the last board where the paste put it', () => {
    const inc = incomers(duplicateBoard(base, 'MCC-1').project);
    expect(inc.slice(0, 3)).toEqual(['INC-GF', 'INC-FF', 'INC-MCC']);
    expect(inc.length).toBe(4);
  });
  it('does nothing for a main board', () => {
    expect(duplicateBoard(base, 'MDB-1').project).toBe(base);
  });
});

describe('change one setting of a load', () => {
  const get = (p: Project, id: string) => p.feeders.find((f) => f.id === id)!;
  it('the switching device goes through the Devices drop, with its MCB rule', () => {
    expect(get(changeFeeder(base, 'FF-LAB', 'device', 'ACB').project, 'FF-LAB')).toMatchObject({ breakerType: 'ACB', device: 'ACB' });
    expect(get(changeFeeder(base, 'FF-LAB', 'device', 'ISOL').project, 'FF-LAB').device).toBe('ISOL');
    const mcb = changeFeeder(base, 'FF-LAB', 'device', 'MCB');
    expect(get(mcb.project, 'FF-LAB').breakerType).toBe('MCCB');
    expect(mcb.message).toContain('MCBs go up to 63 A');
    expect(changeFeeder(base, 'FF-LAB', 'device', 'XYZ').project).toBe(base);
  });
  it('earth leakage, kWh meter and cable type set and clear', () => {
    const a = changeFeeder(base, 'FF-LAB', 'rcdMa', '30');
    expect(get(a.project, 'FF-LAB').rcdMa).toBe(30);
    expect(a.message).toBe('FF-LAB: earth leakage 30 mA');
    const cleared = changeFeeder(a.project, 'FF-LAB', 'rcdMa', '').project;
    expect('rcdMa' in get(cleared, 'FF-LAB')).toBe(false);
    const m = changeFeeder(base, 'FF-LAB', 'kwhMeter', 'CT');
    expect(get(m.project, 'FF-LAB').kwhMeter).toBe('CT');
    expect('kwhMeter' in get(changeFeeder(m.project, 'FF-LAB', 'kwhMeter', '').project, 'FF-LAB')).toBe(false);
    expect(changeFeeder(base, 'FF-LAB', 'kwhMeter', 'ZZ').project).toBe(base);
    const t = changeFeeder(base, 'FF-LAB', 'cableType', 'FR BS 8491');
    expect(get(t.project, 'FF-LAB').cableType).toBe('FR BS 8491');
    expect('cableType' in get(changeFeeder(t.project, 'FF-LAB', 'cableType', '').project, 'FF-LAB')).toBe(false);
  });
  it('the phase of a single-phase circuit, and not of a 3-phase one', () => {
    expect(get(changeFeeder(base, 'FF-LTG', 'phase', 'B').project, 'FF-LTG').phase).toBe('B');
    expect(changeFeeder(base, 'FF-LAB', 'phase', 'B').project).toBe(base);
  });
  it('the switches toggle on and back off, leaving nothing stored', () => {
    for (const k of ['essential', 'existing', 'localIsolator'] as const) {
      const on = changeFeeder(base, 'FF-LAB', k);
      expect(get(on.project, 'FF-LAB')[k]).toBe(true);
      const off = changeFeeder(on.project, 'FF-LAB', k);
      expect(k in get(off.project, 'FF-LAB')).toBe(false);
      expect(off.message.startsWith('FF-LAB: ')).toBe(true);
    }
  });
  it('says so for a load that is gone', () => {
    expect(changeFeeder(base, 'NOPE', 'essential').project).toBe(base);
  });
});
