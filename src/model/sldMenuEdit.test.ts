import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { applyMove } from './sldEdit';
import { evaluateProject } from '../calc/electrical';
import { branchItems, busWays, changeFeeder, changeFeeders, copyFeeder, countWords, deleteMany, duplicateBoard, duplicateFeeder, duplicateMany, moveBlockedReason, moveMany, orderTarget, pasteFeeder, pasteFeeders, selectAll, similarLoads, type PickItem } from './sldMenuEdit';
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

describe('why a place can not take it', () => {
  const bus = (boardId: string) => ({ type: 'bus' as const, boardId });
  const way = (feederId: string) => ({ type: 'feeder' as const, feederId });
  const board = (id: string) => ({ kind: 'board' as const, id });
  const load = (id: string) => ({ kind: 'feeder' as const, id });
  it('is undefined where the move works', () => {
    expect(moveBlockedReason(base, board('SMDB-GF'), bus('SMDB-FF'))).toBeUndefined();
    expect(moveBlockedReason(base, load('FF-IT'), way('FF-LTG'))).toBeUndefined();
  });
  it('names the board cases', () => {
    expect(moveBlockedReason(base, board('MDB-1'), bus('SMDB-FF'))).toBe('A main board has no incomer to move');
    expect(moveBlockedReason(base, board('SMDB-GF'), { type: 'canvas' })).toBe('Click a busbar or a load');
    expect(moveBlockedReason(base, board('SMDB-GF'), bus('SMDB-GF'))).toBe("SMDB-GF can't supply itself");
    expect(moveBlockedReason(base, board('SMDB-GF'), way('GF-LTG'))).toBe("SMDB-GF can't supply itself");
    expect(moveBlockedReason(base, board('SMDB-GF'), bus('DB-GF1'))).toBe('DB-GF1 is below SMDB-GF — that would make a loop');
    expect(moveBlockedReason(base, board('SMDB-GF'), way('INC-GF'))).toBe('That is SMDB-GF’s own incomer');
  });
  it('names the load cases', () => {
    expect(moveBlockedReason(base, load('FF-IT'), way('FF-IT'))).toBe('That is FF-IT itself');
    expect(moveBlockedReason(base, load('FF-LTG'), bus('SMDB-FF'))).toBe('FF-LTG is already last on SMDB-FF');
    expect(moveBlockedReason(base, load('FF-LTG'), { type: 'canvas' })).toBe('Click a busbar or a load');
  });
});

const L = (id: string): PickItem => ({ kind: 'feeder', id }), B = (id: string): PickItem => ({ kind: 'board', id });
const ofIds = (list: PickItem[]) => list.map((x) => `${x.kind === 'board' ? 'B' : 'L'}:${x.id}`).sort();

describe('select tools', () => {
  it('similar loads: the same type on the board, or everywhere', () => {
    expect(ofIds(similarLoads(base, 'GF-HVAC', 'board'))).toEqual(['L:GF-HVAC', 'L:GF-VRF']);
    expect(ofIds(similarLoads(base, 'FF-LTG', 'all'))).toEqual(['L:FF-LTG', 'L:GF-LTG']);
    expect(ofIds(similarLoads(base, 'FF-LTG', 'board'))).toEqual(['L:FF-LTG']);
    expect(similarLoads(base, 'NOPE', 'all')).toEqual([]);
  });
  it('everything below a board: its ways and every board fed from it, through all levels', () => {
    expect(ofIds(branchItems(base, 'SMDB-GF'))).toEqual(['B:DB-GF1', 'L:GF-HVAC', 'L:GF-LTG', 'L:GF-SKT', 'L:GF-VRF']);
    const all = ofIds(branchItems(base, 'MDB-1'));
    expect(all).toContain('B:DB-GF1');
    expect(all).toContain('L:FF-LAB');
    expect(all).not.toContain('B:MDB-1');
    expect(all.filter((x) => x.startsWith('L:INC'))).toEqual([]); // an incomer is its board, not a load
  });
  it('select on the empty drawing: loads, failing, to check, boards of one kind', () => {
    const failing: Project = { ...base, feeders: base.feeders.map((f) => (f.id === 'FF-LAB' ? { ...f, cableCsaMm2: 4 } : f)) };
    const results = evaluateProject(failing);
    expect(selectAll(failing, results, 'loads')).toHaveLength(base.feeders.filter((f) => !f.feedsBoardId && busWays(base, f.boardId).includes(f)).length);
    expect(ofIds(selectAll(failing, results, 'failing'))).toContain('L:FF-LAB');
    expect(selectAll(base, evaluateProject(base), 'failing')).toEqual([]);
    expect(ofIds(selectAll(base, [], 'kind', 'SMDB'))).toEqual(['B:SMDB-FF', 'B:SMDB-GF']);
  });
  it('counts words', () => {
    expect(countWords(3, 1)).toBe('3 loads and 1 board');
    expect(countWords(1, 0)).toBe('1 load');
    expect(countWords(0, 2)).toBe('2 boards');
  });
});

describe('several loads at once', () => {
  it('changes one setting on every load, with one result', () => {
    const r = changeFeeders(base, ['FF-OFF', 'FF-IT', 'FF-LAB'], 'rcdMa', '30');
    expect(['FF-OFF', 'FF-IT', 'FF-LAB'].map((id) => r.project.feeders.find((f) => f.id === id)!.rcdMa)).toEqual([30, 30, 30]);
    expect(r.message).toBe('3 loads: earth leakage 30 mA');
    expect(base.feeders.find((f) => f.id === 'FF-OFF')!.rcdMa).not.toBe(30);
  });
  it('a switch goes to the opposite of all on', () => {
    const some = changeFeeders(base, ['FF-OFF', 'FF-IT'], 'essential').project;
    expect(['FF-OFF', 'FF-IT'].map((id) => !!some.feeders.find((f) => f.id === id)!.essential)).toEqual([true, true]);
    const off = changeFeeders(some, ['FF-OFF', 'FF-IT'], 'essential').project;
    expect(['FF-OFF', 'FF-IT'].map((id) => !!off.feeders.find((f) => f.id === id)!.essential)).toEqual([false, false]);
    const mixed = changeFeeders(some, ['FF-OFF', 'FF-IT', 'FF-LAB'], 'essential').project;
    expect(['FF-OFF', 'FF-IT', 'FF-LAB'].map((id) => !!mixed.feeders.find((f) => f.id === id)!.essential)).toEqual([true, true, true]);
  });
  it('says so when nothing changes', () => {
    const r = changeFeeders(base, ['FF-OFF'], 'nonsense', 'x');
    expect(r.project).toBe(base);
    expect(changeFeeders(base, ['NOPE'], 'essential').message).toBe('No loads to change');
  });
  it('duplicates each load after itself and each board with everything below, skipping a main board', () => {
    const r = duplicateMany(base, [L('FF-IT'), L('FF-LAB'), B('SMDB-GF'), B('MDB-1')]);
    expect(ids(r.project, 'SMDB-FF')).toEqual(['FF-OFF', 'FF-IT', 'FF-IT-2', 'FF-LAB', 'FF-LAB-2', 'FF-LTG']);
    expect(r.project.boards.length).toBeGreaterThan(base.boards.length);
    expect(r.message).toContain('Duplicated 2 loads and 1 board (1 skipped)');
    expect(duplicateMany(base, [B('MDB-1')]).project).toBe(base);
  });
  it('moves them to the end of one busbar, naming what it cannot take', () => {
    const r = moveMany(base, [L('FF-LAB'), L('FF-IT'), B('SMDB-GF')], 'MCC-1');
    expect(ids(r.project, 'MCC-1').slice(-3).sort()).toEqual(['FF-IT', 'FF-LAB', 'INC-GF']);
    expect(ids(r.project, 'SMDB-FF')).toEqual(['FF-OFF', 'FF-LTG']);
    const own = moveMany(base, [B('SMDB-GF'), L('GF-LTG')], 'DB-GF1');
    expect(own.message).toContain('left where they are: SMDB-GF');
    expect(own.project.feeders.find((f) => f.id === 'GF-LTG')!.boardId).toBe('DB-GF1');
    const none = moveMany(base, [L('FF-LAB')], 'SMDB-FF');
    expect(none.project).toBe(base);
    expect(none.message).toContain("FF-LAB can't go on SMDB-FF");
  });
  it('deletes loads and boards in one result, not counting a load under a deleted board twice', () => {
    const r = deleteMany(base, [L('GF-LTG'), L('FF-LAB'), B('SMDB-GF')]);
    expect(r.project.boards.some((b) => b.id === 'SMDB-GF')).toBe(false);
    expect(r.project.feeders.some((f) => f.id === 'GF-LTG' || f.id === 'FF-LAB')).toBe(false);
    expect(r.message).toContain('Deleted 1 load and 1 board');
    expect(r.select).toEqual({ type: 'board', id: 'MDB-1' });
    expect(base.feeders.some((f) => f.id === 'FF-LAB')).toBe(true);
  });
  it('keeps the last main board', () => {
    const r = deleteMany(base, [B('MDB-1')]);
    expect(r.project).toBe(base);
    expect(r.message).toContain('main board');
  });
  it('pastes several copies in order, with one result', () => {
    const end = pasteFeeders(base, ['FF-IT', 'FF-LAB'], { type: 'bus', boardId: 'SMDB-GF' });
    expect(ids(end.project, 'SMDB-GF').slice(-2)).toEqual(['FF-IT-2', 'FF-LAB-2']);
    expect(end.message).toBe('Pasted 2 loads at the end of SMDB-GF');
    const before = pasteFeeders(base, ['FF-IT', 'FF-LAB'], { type: 'feeder', feederId: 'GF-SKT' });
    expect(ids(before.project, 'SMDB-GF')).toEqual(['GF-LTG', 'FF-IT-2', 'FF-LAB-2', 'GF-SKT', 'GF-HVAC', 'GF-VRF', 'INC-DBGF1']);
    expect(pasteFeeders(base, ['FF-IT'], { type: 'bus', boardId: 'SMDB-GF' }).message).toMatch(/^Pasted FF-IT-2, a copy of FF-IT/);
    expect(pasteFeeders(base, [], { type: 'bus', boardId: 'SMDB-GF' }).project).toBe(base);
  });
});
