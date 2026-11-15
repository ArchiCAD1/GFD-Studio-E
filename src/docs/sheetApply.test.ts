import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { addPanel } from '../model/addPanel';
import { addSpareWay } from '../model/spareWays';
import { newSheet, withCells, type Sheet } from '../model/sheets';
import type { Project } from '../types';
import { applyLinked, pendingMarks } from './sheetApply';
import { pushRows } from './sheetPush';
import { addCircuitRow, fillLinked, ownRows, setLinkColumn, suggestLink, typeLinked } from './sheetLink';
import { panelData, panelRowKeys } from './panelFields';
import { scheduleRowKeys, templateData } from './scheduleFields';

/** A panel schedule on DB-GF1: the board number in B2, the first circuit row 6, a column each for the typed values and one of your own. */
const linked = (): Sheet => ({ ...newSheet(), link: { category: 'db', boardId: 'DB-GF1', firstRow: 6, cells: { B2: { field: 'board.id' } }, rows: [], columns: { A: 'row.ref', B: 'row.room', C: 'row.mcb', D: 'row.wire', E: 'row.ecc', F: 'row.length', G: 'row.watts', H: 'row.remarks', I: 'own' } } });
const shown = (p: Project, s: Sheet = linked()) => fillLinked(p, s);
const typed = (p: Project, s: Sheet, edits: Record<string, string>) => typeLinked(p, s, edits).sheet;
const feeder = (p: Project, id: string) => p.feeders.find((f) => f.id === id)!;
const N = scheduleRowKeys(sampleProject, 'DB-GF1').length; // the first free row after the circuits is 6 + N

describe('applyLinked', () => {
  it('room and remarks reach the circuit; the typed values leave the sheet and the next fill shows them from the project', () => {
    const s = typed(sampleProject, shown(sampleProject), { B6: 'Hall lights', H6: 'dimmable' });
    expect(s.link!.pending).toEqual({ 'DB-GF1-R1': { B: 'Hall lights', H: 'dimmable' } });
    const r = applyLinked(sampleProject, s);
    expect(r).toMatchObject({ changed: 1, added: 0, rejected: [] });
    expect(feeder(r.project, 'DB-GF1-R1')).toMatchObject({ room: 'Hall lights', remarks: 'dimmable' });
    expect(r.sheet.link!.pending).toBeUndefined();
    expect(shown(r.project, r.sheet).cells.B6).toBe('Hall lights');
  });

  it('a typed MCB is kept as sized by hand', () => {
    const s = typed(sampleProject, shown(sampleProject), { C7: '16' });
    const f = feeder(applyLinked(sampleProject, s).project, 'DB-GF1-Y1');
    expect(f).toMatchObject({ breakerRatingA: 16, manualSize: true });
  });

  it('an invalid cable size is rejected with the user\'s cell and stays pending; the rest is applied', () => {
    const s = typed(sampleProject, shown(sampleProject), { D6: '3', B6: 'Hall' });
    const r = applyLinked(sampleProject, s);
    expect(r.rejected).toEqual(['D6: "3" is not a valid cable size']);
    expect(r.changed).toBe(1);
    expect(feeder(r.project, 'DB-GF1-R1').cableCsaMm2).toBe(2.5);
    expect(r.sheet.link!.pending).toEqual({ 'DB-GF1-R1': { D: '3' } });
    const only = typed(sampleProject, shown(sampleProject), { D6: '3' });
    const none = applyLinked(sampleProject, only);
    expect(none.rejected).toHaveLength(1);
    expect(none.project).toBe(sampleProject);
    expect(none.sheet).toBe(only);
  });

  it('a typed load is one load item: ltg for a lights description, spare1 otherwise', () => {
    const s = typed(sampleProject, shown(sampleProject), { B6: 'Hall LIGHTS', G6: '2500', B7: 'Store', G7: '600' });
    const r = applyLinked(sampleProject, s);
    expect(r.changed).toBe(2);
    expect(feeder(r.project, 'DB-GF1-R1')).toMatchObject({ points: {}, loadItems: [{ name: 'Hall LIGHTS', pointType: 'ltg', quantity: 1, unitWatts: 2500 }] });
    expect(feeder(r.project, 'DB-GF1-Y1').loadItems).toEqual([{ name: 'Store', pointType: 'spare1', quantity: 1, unitWatts: 600 }]);
    const rows = templateData(r.project, 'DB-GF1').rows;
    expect([rows[0]['row.watts'], rows[1]['row.watts']]).toEqual([2500, 600]);
    const bad = applyLinked(sampleProject, typed(sampleProject, shown(sampleProject), { G6: 'lots', G7: '0' }));
    expect(bad.rejected).toEqual(['G6: "lots" is not a load in watts', 'G7: "0" is not a load in watts']);
  });

  it('a new row with a description and a load becomes a circuit sized by the rules, and its own text stays beside it', () => {
    const s0 = addCircuitRow(shown(sampleProject));
    const s1 = shown(sampleProject, s0);
    expect(s1.link!.rows[N]).toBe('new:0');
    const row = 6 + N;
    const s = typed(sampleProject, s1, { [`B${row}`]: 'New store', [`G${row}`]: '1500', [`I${row}`]: 'mine' });
    expect(s.link!.added).toEqual([{ B: 'New store', G: '1500' }]);
    const r = applyLinked(sampleProject, s);
    expect(r).toMatchObject({ changed: 0, added: 1, rejected: [] });
    expect(r.project.feeders).toHaveLength(sampleProject.feeders.length + 1);
    const made = r.project.feeders.find((f) => !sampleProject.feeders.some((x) => x.id === f.id))!;
    expect(made).toMatchObject({ boardId: 'DB-GF1', room: 'New store' });
    expect(made.manualSize).toBeFalsy();
    expect(made.breakerRatingA).toBeGreaterThan(0);
    expect(made.cableCsaMm2).toBeGreaterThanOrEqual(2.5);
    expect(r.sheet.link!.added).toBeUndefined();
    const again = shown(r.project, r.sheet);
    const keys = scheduleRowKeys(r.project, 'DB-GF1');
    const at = keys.indexOf(made.id);
    expect(again.cells[`I${6 + at}`]).toBe('mine');
    expect(again.cells[`B${6 + at}`]).toBe('New store');
    expect(Object.values(again.cells).filter((v) => v === 'mine')).toHaveLength(1);
  });

  it('a new row with nothing useful is rejected and kept; the rows left are numbered again', () => {
    const base = shown(sampleProject, addCircuitRow(addCircuitRow(shown(sampleProject))));
    const s = typed(sampleProject, shown(sampleProject, base), { [`H${6 + N}`]: 'remark only', [`B${7 + N}`]: 'Pump room' });
    const r = applyLinked(sampleProject, s);
    expect(r.rejected).toEqual([`Row ${6 + N}: give a description or a load`]);
    expect(r.added).toBe(1);
    expect(r.sheet.link!.added).toEqual([{ H: 'remark only' }]);
    expect(r.sheet.link!.rows[N]).toBe('new:0');
    expect(r.sheet.link!.rows).toHaveLength(N + 2);
    expect(r.sheet.link!.rows[N + 1]).toMatch(/^DB-GF1-/);
  });

  it('a spare takes its MCB rating', () => {
    const p = addSpareWay(sampleProject, 'DB-GF1', 'spare').project;
    const keys = scheduleRowKeys(p, 'DB-GF1'), at = keys.findIndex((k) => k.startsWith('spare:'));
    const s = typed(p, shown(p), { [`C${6 + at}`]: '25' });
    const r = applyLinked(p, s);
    expect(r.changed).toBe(1);
    expect(r.project.boards.find((b) => b.id === 'DB-GF1')!.spareWays![0].ratingA).toBe(25);
  });

  it('has nothing to do for a sheet with nothing typed', () => {
    const s = shown(sampleProject);
    const r = applyLinked(sampleProject, s);
    expect(r).toEqual({ project: sampleProject, sheet: s, changed: 0, added: 0, rejected: [] });
    expect(r.project).toBe(sampleProject);
    expect(r.sheet).toBe(s);
  });
});

describe('pendingMarks', () => {
  it('marks a typed value pending, a refused one with its reason, and a size that fails its check', () => {
    const s = typed(sampleProject, shown(sampleProject), { B6: 'Hall', D7: '3', C8: '32' });
    const marks = pendingMarks(sampleProject, s);
    expect(marks.B6).toEqual({ kind: 'pending', text: 'Typed, not applied yet' });
    expect(marks.D7).toEqual({ kind: 'refused', text: '"3" is not a valid cable size' });
    expect(marks.C8.kind).toBe('check');
    expect(marks.C8.text).toBe('After Apply this circuit needs a check: Cable not protected: In 32 A > Iz 31.3 A; DEWA Table 1: 32 A breaker on 2.5 mm² (max 16 A)');
    expect(Object.keys(marks).sort()).toEqual(['B6', 'C8', 'D7']);
    expect(pendingMarks(sampleProject, shown(sampleProject))).toEqual({});
  });
});

/** A panel schedule: the board number in B2, the first feeder row 6, a column for each typed value and one of your own. */
const panel = (boardId: string): Sheet => ({ ...newSheet(), link: { category: 'md', boardId, firstRow: 6, cells: { B2: { field: 'board.id' } }, rows: [], columns: { A: 'row.sl', B: 'row.name', C: 'row.device', D: 'row.rating', E: 'row.fault', F: 'row.cores', G: 'row.cableType', H: 'row.size', I: 'row.ecc', J: 'row.length', K: 'row.tcl', L: 'row.remarks', M: 'own' } } });
const withWay = addSpareWay(sampleProject, 'SMDB-GF', 'spare').project;
const wayOf = (p: Project) => p.boards.find((b) => b.id === 'SMDB-GF')!.spareWays![0];

describe('applyLinked — panel schedules', () => {
  it("an equipment feeder's name and remarks reach the feeder, and the next fill shows them", () => {
    const s = typed(sampleProject, shown(sampleProject, panel('MCC-1')), { B6: 'Duty pump', L6: 'duty' });
    expect(s.link!.pending).toEqual({ 'MCC-WP': { B: 'Duty pump', L: 'duty' } });
    const r = applyLinked(sampleProject, s);
    expect(r).toMatchObject({ changed: 1, added: 0, rejected: [] });
    expect(feeder(r.project, 'MCC-WP')).toMatchObject({ name: 'Duty pump', remarks: 'duty' });
    expect(r.sheet.link!.pending).toBeUndefined();
    expect(shown(r.project, r.sheet).cells).toMatchObject({ B6: 'DUTY PUMP', L6: 'duty' });
  });

  it("a typed rating lands on the breaker of the device the feeder uses", () => {
    const r = applyLinked(sampleProject, typed(sampleProject, shown(sampleProject, panel('MCC-1')), { D6: '200' }));
    expect(feeder(r.project, 'MCC-WP')).toMatchObject({ breakerRatingA: 200, device: 'MCCB' });
    expect(r.rejected).toEqual([]);
  });

  it('a typed device moves the rating to that device; both typed together are one change', () => {
    const base = shown(sampleProject, panel('MCC-1'));
    const moved = applyLinked(sampleProject, typed(sampleProject, base, { C6: 'acb' }));
    expect(feeder(moved.project, 'MCC-WP')).toMatchObject({ device: 'ACB', breakerRatingA: 160 });
    const after = shown(moved.project, moved.sheet);
    expect([after.cells.C6, after.cells.D6]).toEqual(['ACB', '160']);
    const both = applyLinked(sampleProject, typed(sampleProject, base, { C6: ' isol ', D6: '125' }));
    expect(feeder(both.project, 'MCC-WP')).toMatchObject({ device: 'ISOL', breakerRatingA: 125 });
    expect(both.changed).toBe(1);
    const bad = applyLinked(sampleProject, typed(sampleProject, base, { C6: 'MCB' }));
    expect(bad.rejected).toEqual(['C6: "MCB" is not ACB, MCCB or ISOL']);
    expect(bad.project).toBe(sampleProject);
  });

  it("an invalid cable size is rejected with the user's cell and stays pending; the rest is applied", () => {
    const r = applyLinked(sampleProject, typed(sampleProject, shown(sampleProject, panel('MCC-1')), { H6: '3', L6: 'ok' }));
    expect(r.rejected).toEqual(['H6: "3" is not a cable size from the cable table']);
    expect(r.changed).toBe(1);
    expect(feeder(r.project, 'MCC-WP')).toMatchObject({ remarks: 'ok', cableCsaMm2: 70 });
    expect(r.sheet.link!.pending).toEqual({ 'MCC-WP': { H: '3' } });
    const only = typed(sampleProject, shown(sampleProject, panel('MCC-1')), { H6: '3' }), none = applyLinked(sampleProject, only);
    expect([none.project, none.sheet]).toEqual([sampleProject, only]);
    expect(none.project).toBe(sampleProject);
  });

  it('a typed load changes an equipment feeder; on a feeder that supplies a board it is rejected', () => {
    const r = applyLinked(sampleProject, typed(sampleProject, shown(sampleProject, panel('MCC-1')), { K6: '90' }));
    expect(feeder(r.project, 'MCC-WP').loadKw).toBe(90);
    expect(panelData(r.project, 'MCC-1').rows[0]['row.tcl']).toBe(90);
    const s = typed(sampleProject, shown(sampleProject, panel('SMDB-GF')), { K10: '50' });
    expect(panelRowKeys(sampleProject, 'SMDB-GF')[4]).toBe('INC-DBGF1');
    const bad = applyLinked(sampleProject, s);
    expect(bad.rejected).toEqual(['K10: Connected load (TCL), kW cannot be changed on this row']);
    expect(bad.sheet.link!.pending).toEqual({ 'INC-DBGF1': { K: '50' } });
    expect(bad.project).toBe(sampleProject);
  });

  it('a spare way takes its rating; other values on it are rejected', () => {
    const key = panelRowKeys(withWay, 'SMDB-GF')[5], row = 6 + 5;
    expect(key).toMatch(/^spare:/);
    const s = typed(withWay, shown(withWay, panel('SMDB-GF')), { [`D${row}`]: '63', [`L${row}`]: 'future' });
    const r = applyLinked(withWay, s);
    expect(r).toMatchObject({ changed: 1, rejected: [] });
    expect(wayOf(r.project)).toMatchObject({ ratingA: 63, remarks: 'future' });
    const forced: Sheet = { ...s, link: { ...s.link!, pending: { [key]: { B: 'x' } } } };
    expect(applyLinked(withWay, forced).rejected).toEqual([`B${row}: Feeder / circuit name cannot be changed on this row`]);
  });

  it('a new row with a name and a load becomes an outgoing feeder; its own text stays beside it', () => {
    const base = fillLinked(sampleProject, panel('MCC-1')), n = panelRowKeys(sampleProject, 'MCC-1').length;
    const s = typed(sampleProject, shown(sampleProject, addCircuitRow(base)), { [`B${6 + n}`]: 'Jockey pump', [`K${6 + n}`]: '12', [`M${6 + n}`]: 'note' });
    const r = applyLinked(sampleProject, s);
    expect(r).toMatchObject({ changed: 0, added: 1, rejected: [] });
    const made = r.project.feeders.find((f) => f.boardId === 'MCC-1' && f.name === 'Jockey pump')!;
    expect(made.loadKw).toBe(12);
    expect(r.sheet.link!.added).toBeUndefined();
    expect(r.sheet.link!.rows[n]).toBe(made.uid ?? made.id);
    const f = shown(r.project, r.sheet);
    expect(f.link!.rows).toEqual(panelRowKeys(r.project, 'MCC-1'));
    expect([f.cells[`B${6 + n}`], f.cells[`K${6 + n}`], f.cells[`M${6 + n}`]]).toEqual(['JOCKEY PUMP', '12', 'note']);
  });

  it('a new row with nothing useful, or a value that fails, is not made', () => {
    const n = panelRowKeys(sampleProject, 'MCC-1').length, base = shown(sampleProject, addCircuitRow(fillLinked(sampleProject, panel('MCC-1'))));
    const none = applyLinked(sampleProject, typed(sampleProject, base, { [`L${6 + n}`]: 'remark only' }));
    expect(none.rejected).toEqual([`Row ${6 + n}: give a feeder name or a load`]);
    expect([none.added, none.project]).toEqual([0, sampleProject]);
    const bad = applyLinked(sampleProject, typed(sampleProject, base, { [`B${6 + n}`]: 'Pump', [`H${6 + n}`]: '3' }));
    expect(bad.rejected).toEqual([`H${6 + n}: "3" is not a cable size from the cable table`]);
    expect(bad.added).toBe(0);
    expect(bad.project).toBe(sampleProject);
  });

  it('pendingMarks gives pending, and refused with the reason', () => {
    const s = typed(sampleProject, shown(sampleProject, panel('MCC-1')), { L6: 'ok', H7: '3' });
    expect(pendingMarks(sampleProject, s)).toEqual({ L6: { kind: 'pending', text: 'Typed, not applied yet' }, H7: { kind: 'refused', text: '"3" is not a cable size from the cable table' } });
  });
});

describe('pushRows', () => {
  /** An opened schedule: panel number in B2, Fed from in C2, headings in row 5, rows from 6; column G is your own. */
  const opened = (panelId: string, fed: string, rows: string[][], extra: Record<string, string> = {}): Sheet => {
    const cells: Record<string, string> = { A1: 'PANEL SCHEDULE', A2: 'PANEL', B2: panelId, C2: `FED FROM: ${fed}`, A5: 'CKT', B5: 'DESCRIPTION', C5: 'LOAD (W)', D5: 'MCB (A)', E5: 'CABLE (mm²)', F5: 'REMARKS', ...extra };
    rows.forEach((r, i) => r.forEach((t, c) => { if (t) cells[`${'ABCDEF'[c]}${6 + i}`] = t; }));
    return setLinkColumn(suggestLink(withCells(newSheet(), cells))!, 'G', 'own');
  };
  const on = (p: Project, id: string) => p.feeders.filter((f) => f.boardId === id && f.phase);

  it('rows into an existing DB: a free way is added, a way that is a circuit is updated, and the counts say so', () => {
    const W = Math.max(...sampleProject.feeders.filter((f) => f.boardId === 'DB-GF1' && f.way).map((f) => f.way!)) + 1;
    const s = opened('DB-GF1', 'SMDB-GF', [['R1', 'Hall (new text)', '', '', '', 'checked'], [`R${W}`, 'Roof lights', '900', '10'], [`Y${W}`, 'Roof sockets', '1500', '20', '4']]);
    expect(ownRows(s)).toBe(3);
    const r = pushRows(sampleProject, s);
    expect(r).toMatchObject({ added: 2, updated: 1, made: [], rejected: [] });
    expect(feeder(r.project, 'DB-GF1-R1')).toMatchObject({ room: 'Hall (new text)', remarks: 'checked' });
    expect(feeder(r.project, `DB-GF1-R${W}`)).toMatchObject({ room: 'Roof lights', breakerRatingA: 10, manualSize: true });
    expect(feeder(r.project, `DB-GF1-Y${W}`)).toMatchObject({ room: 'Roof sockets', cableCsaMm2: 4 });
    expect(r.project.boards).toBe(sampleProject.boards);
    expect(r.sheet.link!.boardId).toBe('DB-GF1');
    expect(r.sheet.link!.rows).toEqual(['DB-GF1-R1', `DB-GF1-R${W}`, `DB-GF1-Y${W}`]);
  });

  it('a new panel id under an existing SMDB: the panel and its incomer exist, and the schedule holds the pushed circuits', () => {
    const s = opened('DB-NEW', 'SMDB-GF', [['R1', 'Lights', '1200'], ['Y1', 'Sockets', '2400'], ['B1', 'Store', '600']]);
    const r = pushRows(sampleProject, s);
    expect(r).toMatchObject({ added: 3, updated: 0, made: ['DB-NEW'], rejected: [] });
    expect(r.project.boards.find((b) => b.id === 'DB-NEW')).toMatchObject({ kind: 'DB', upstreamId: 'SMDB-GF' });
    expect(r.project.feeders.find((f) => f.feedsBoardId === 'DB-NEW')).toMatchObject({ boardId: 'SMDB-GF' });
    expect(scheduleRowKeys(r.project, 'DB-NEW')).toEqual(['DB-NEW-R1', 'DB-NEW-Y1', 'DB-NEW-B1']);
    expect(templateData(r.project, 'DB-NEW').rows.map((x) => x['row.watts'])).toEqual([1200, 2400, 600]);
    expect(sampleProject.boards.some((b) => b.id === 'DB-NEW')).toBe(false);
  });

  it('a Fed from that is not in the project is made first, as a supply of the kind its name says', () => {
    const r = pushRows(sampleProject, opened('DB-N2', 'SMDB-X', [['R1', 'Lights', '1200']]));
    expect(r.made).toEqual(['SMDB-X', 'DB-N2']);
    expect(r.project.boards.find((b) => b.id === 'SMDB-X')).toMatchObject({ kind: 'SMDB' });
    expect(r.project.boards.find((b) => b.id === 'SMDB-X')!.upstreamId).toBeUndefined();
    expect(r.project.boards.find((b) => b.id === 'DB-N2')!.upstreamId).toBe('SMDB-X');
    expect(pushRows(sampleProject, opened('DB-N3', 'MCC-9', [['R1', 'Lights', '1200']])).project.boards.find((b) => b.id === 'MCC-9')!.kind).toBe('MCC');
    expect(pushRows(sampleProject, opened('DB-N3', 'MDB-9', [['R1', 'Lights', '1200']])).project.boards.find((b) => b.id === 'MDB-9')!.kind).toBe('MDB');
    expect(pushRows(sampleProject, opened('DB-N3', 'MC-9', [['R1', 'Lights', '1200']])).project.boards.find((b) => b.id === 'MC-9')!.kind).toBe('MC');
    const none = pushRows(sampleProject, opened('DB-N4', '', [['R1', 'Lights', '1200']]));
    expect(none.made).toEqual(['DB-N4']);
    expect(none.project.boards.find((b) => b.id === 'DB-N4')!.upstreamId).toBeUndefined();
  });

  it('a row with no description and no load is rejected and kept as an added row; the others are pushed', () => {
    const s = opened('DB-NEW', 'SMDB-GF', [['R1', 'Lights', '1200'], ['Y1', '', '', '16', '', 'orphan'], ['B1', 'Store', '600']], { G7: 'my note' });
    const r = pushRows(sampleProject, s);
    expect(r).toMatchObject({ added: 2, updated: 0, rejected: ['Row 7: give a description or a load'] });
    expect(r.sheet.link!.rows).toEqual(['DB-NEW-R1', 'DB-NEW-B1', 'new:0']);
    expect(r.sheet.link!.added).toEqual([{ D: '16', F: 'orphan' }]);
    const f = fillLinked(r.project, r.sheet);
    expect(f.link!.rows).toEqual(['DB-NEW-R1', 'DB-NEW-B1', 'new:0']);
    expect([f.cells.D8, f.cells.F8, f.cells.G8]).toEqual(['16', 'orphan', 'my note']);
    expect(pendingMarks(r.project, f)).toMatchObject({ D8: { kind: 'refused' }, F8: { kind: 'refused' } });
  });

  it('a value the table refuses stops its row and gives the cell; a blank MCB and cable are sized, typed ones kept', () => {
    const r = pushRows(sampleProject, opened('DB-NEW', 'SMDB-GF', [['R1', 'Lights', '1200', '', ''], ['Y1', 'Sockets', '2400', '25', '6'], ['B1', 'Bad cable', '300', '', '3']]));
    expect(r).toMatchObject({ added: 2, rejected: ['E8: "3" is not a valid cable size'] });
    const [a, b] = [feeder(r.project, 'DB-NEW-R1'), feeder(r.project, 'DB-NEW-Y1')];
    expect(a.manualSize).toBeFalsy();
    expect(a.breakerRatingA).toBeGreaterThan(0);
    expect(b).toMatchObject({ breakerRatingA: 25, cableCsaMm2: 6, manualSize: true });
    expect(r.project.feeders.some((f) => f.id === 'DB-NEW-B1')).toBe(false);
    expect(r.sheet.link!.added).toEqual([{ B: 'Bad cable', C: '300', E: '3' }]);
  });

  it('after the push the next fill shows one row per circuit of the panel, and your own text stays beside its circuit', () => {
    const s = opened('DB-NEW', 'SMDB-GF', [['Y1', 'Sockets', '2400'], ['R1', 'Lights', '1200']], { G6: 'sockets note', G7: 'lights note' });
    const r = pushRows(sampleProject, s), f = fillLinked(r.project, r.sheet);
    expect(f.link!.rows).toEqual(scheduleRowKeys(r.project, 'DB-NEW'));
    expect(f.link!.rows).toEqual(['DB-NEW-R1', 'DB-NEW-Y1']);
    expect([f.cells.B6, f.cells.G6, f.cells.B7, f.cells.G7]).toEqual(['Lights', 'lights note', 'Sockets', 'sockets note']);
    expect(f.cells.B2).toBe('DB-NEW');
  });

  it('pushing the same sheet again adds nothing and updates the same circuits; rows without a reference match by description', () => {
    const s = opened('DB-NEW', 'SMDB-GF', [['R1', 'Lights', '1200'], ['Y1', 'Sockets', '2400']]);
    const first = pushRows(sampleProject, s), again = pushRows(first.project, s);
    expect(again).toMatchObject({ added: 0, updated: 2, made: [], rejected: [] });
    expect(again.project.feeders.map((f) => f.id)).toEqual(first.project.feeders.map((f) => f.id));
    const bare = opened('DB-N5', 'SMDB-GF', [['', 'Corridor', '500'], ['', 'Stair', '700'], ['', 'Stair', '800']]);
    const one = pushRows(sampleProject, bare);
    expect(one).toMatchObject({ added: 3, updated: 0 });
    expect(on(one.project, 'DB-N5').map((f) => f.room)).toEqual(['Corridor', 'Stair', 'Stair']);
    const two = pushRows(one.project, bare);
    expect([two.added, two.updated]).toEqual([2, 1]); // two circuits are called Stair, so neither Stair row is told from them and each adds one
  });

  it('a way that is taken by another phase is rejected, and no panel number changes nothing', () => {
    const r = pushRows(sampleProject, opened('DB-NEW', 'SMDB-GF', [['R1', 'Lights', '1200'], ['RYB1', 'Three-phase', '3000']]));
    expect(r).toMatchObject({ added: 1, rejected: ['Row 7: RYB1 is already used on DB-NEW'] });
    const noId = opened('DB-NEW', 'SMDB-GF', [['R1', 'Lights', '1200']]);
    const bad = pushRows(sampleProject, withCells(noId, { B2: '' }));
    expect(bad).toMatchObject({ added: 0, updated: 0, made: [], rejected: ['Link the cell that holds the panel number first.'] });
    expect([bad.project, bad.sheet]).toEqual([sampleProject, withCells(noId, { B2: '' })]);
    expect(bad.project).toBe(sampleProject);
  });
  it('a SPARE or SPACE row is a spare way at its reference, not a circuit; pushing again updates it and adds nothing', () => {
    const W = Math.max(...sampleProject.feeders.filter((f) => f.boardId === 'DB-GF1' && f.way).map((f) => f.way!)) + 1;
    const s = opened('DB-GF1', 'SMDB-GF', [[`R${W}`, 'SPARE', '', '16'], [`Y${W}`, 'SPACE'], ['', 'Spare', '', '25']]);
    const r = pushRows(sampleProject, s), ways = (p: Project) => p.boards.find((b) => b.id === 'DB-GF1')!.spareWays ?? [];
    expect(r).toMatchObject({ added: 3, updated: 0, rejected: [], notes: [] });
    expect(ways(r.project).filter((w) => w.way === W)).toMatchObject([{ kind: 'spare', phase: 'R', ratingA: 16 }, { kind: 'space', phase: 'Y' }]);
    expect(ways(r.project).find((w) => w.way !== W && w.kind === 'spare')).toMatchObject({ ratingA: 25 });
    expect(r.project.feeders.length).toBe(sampleProject.feeders.length);
    expect(r.sheet.link!.rows.every((k) => k.startsWith('spare:'))).toBe(true);
    const again = pushRows(r.project, s);
    expect(again).toMatchObject({ added: 0, updated: 3, rejected: [] });
    expect(ways(again.project)).toEqual(ways(r.project));
    const used = pushRows(sampleProject, opened('DB-GF1', 'SMDB-GF', [['R1', 'SPARE']]));
    expect(used).toMatchObject({ added: 0, rejected: ['Row 6: R1 is already used on DB-GF1'] });
  });

  it('a row that reads SPARE but has a load is still a circuit', () => {
    const r = pushRows(sampleProject, opened('DB-NEW', 'SMDB-GF', [['R1', 'Spare socket', '300']]));
    expect(on(r.project, 'DB-NEW').map((f) => f.room)).toEqual(['Spare socket']);
    const lit = pushRows(sampleProject, opened('DB-NEW', 'SMDB-GF', [['R1', 'SPARE', '300']]));
    expect(on(lit.project, 'DB-NEW')).toHaveLength(1);
  });
});

describe('pushRows — panel schedules', () => {
  const COLS: Record<string, string> = { A: 'row.sl', B: 'row.name', C: 'row.device', D: 'row.rating', E: 'row.fault', F: 'row.cores', G: 'row.cableType', H: 'row.size', I: 'row.ecc', J: 'row.length', K: 'row.tcl', L: 'row.remarks', M: 'own', N: 'row.to' };
  /** An opened panel schedule: the panel number in B2, Fed from in C2, rows from 6 (cells by column letter). */
  const mdOpen = (id: string, fed: string, rows: Record<string, string>[], extra: Record<string, string> = {}): Sheet => {
    const cells: Record<string, string> = { A1: 'PANEL SCHEDULE', B2: id, C2: `FED FROM: ${fed}`, ...extra };
    rows.forEach((r, i) => Object.entries(r).forEach(([c, t]) => { cells[`${c}${6 + i}`] = t; }));
    return withCells({ ...newSheet(), link: { category: 'md', firstRow: 6, cells: { B2: { field: 'board.id' }, C2: { field: 'board.fedFrom', before: 'FED FROM: ' } }, rows: [], columns: COLS } }, cells);
  };
  const board = (p: Project, id: string) => p.boards.find((b) => b.id === id)!;
  const fedBy = (p: Project, id: string) => p.feeders.filter((f) => f.feedsBoardId === id);
  const big = (): Sheet => mdOpen('MDB-X', 'DEWA', [{ B: 'SMDB-A (GROUND FLOOR)', D: '250', H: '120' }, { B: 'SMDB-B', K: '30' }, { B: 'CHILLER 1', K: '45' }, { B: 'SPARE', D: '100' }, { B: 'SPACE' }]);

  it('a new main panel fed from DEWA: panels, a load and spare ways go in, and no board is made from DEWA', () => {
    const r = pushRows(sampleProject, big());
    expect(r).toMatchObject({ added: 5, updated: 0, made: ['MDB-X', 'SMDB-A', 'SMDB-B'], rejected: [] });
    expect(r.project.boards.some((b) => b.id === 'DEWA')).toBe(false);
    expect(board(r.project, 'MDB-X')).toMatchObject({ kind: 'MDB' });
    expect(board(r.project, 'MDB-X').upstreamId).toBeUndefined();
    expect(board(r.project, 'SMDB-A')).toMatchObject({ kind: 'SMDB', upstreamId: 'MDB-X', name: 'GROUND FLOOR' });
    expect(board(r.project, 'SMDB-B')).toMatchObject({ upstreamId: 'MDB-X', name: 'SMDB-B' });
    expect(fedBy(r.project, 'SMDB-A')).toMatchObject([{ boardId: 'MDB-X', breakerRatingA: 250, cableCsaMm2: 120 }]);
    expect(fedBy(r.project, 'SMDB-B')).toHaveLength(1);
    expect(r.project.feeders.find((f) => f.boardId === 'MDB-X' && f.name === 'CHILLER 1')).toMatchObject({ loadKw: 45 });
    expect(board(r.project, 'MDB-X').spareWays).toMatchObject([{ kind: 'spare', ratingA: 100 }, { kind: 'space' }]);
    expect(r.notes).toEqual(['Load not taken for SMDB-B: a panel\'s load comes from its own schedule. Push those sheets too.']);
    expect(fedBy(r.project, 'SMDB-B')[0].loadKw).toBe(0);
    expect(sampleProject.boards.some((b) => b.id === 'MDB-X')).toBe(false);
  });

  it('an INCOMER row and an OUT GOING row are left out with a note, the incomer values reach the main panel, and the rows below move up', () => {
    const s = mdOpen('MDB-X', 'DEWA', [{ B: 'INCOMER', C: 'ACB', D: '630', E: '50', F: '4', H: '300' }, { B: 'OUT GOING' }, { B: 'CHILLER 1', K: '45' }], { A9: 'TOTAL', B9: 'after' });
    const r = pushRows(sampleProject, s);
    expect(r).toMatchObject({ added: 1, rejected: [], notes: ["Row 6: read as the panel's incomer.", 'Row 7 (OUT GOING) is a heading: left out.'] });
    expect(board(r.project, 'MDB-X').supply).toMatchObject({ device: 'ACB', ratingA: 630, faultKa: 50 });
    expect(board(r.project, 'MDB-X').ratedCurrentA).toBe(630);
    expect(r.sheet.cells).toMatchObject({ B6: 'CHILLER 1', A7: 'TOTAL', B7: 'after' });
    expect([r.sheet.cells.B8, r.sheet.cells.A9]).toEqual([undefined, undefined]);
    expect(r.sheet.link!.rows).toHaveLength(1);
    // a panel fed from a panel: the rating is the incomer feeder's breaker, and a bad incomer value is listed but does not stop the push
    const sub = pushRows(sampleProject, mdOpen('SMDB-N', 'MDB-1', [{ B: 'Incoming', D: '400', H: '37' }, { B: 'PUMP', K: '5' }]));
    expect(sub).toMatchObject({ added: 1, made: ['SMDB-N'], rejected: ['Incomer: H6: "37" is not a cable size from the cable table'] });
    expect(fedBy(sub.project, 'SMDB-N')[0]).toMatchObject({ boardId: 'MDB-1', breakerRatingA: 400 });
    // the incomer from the linked cells when the block has no incomer row
    const cells = pushRows(sampleProject, withCells({ ...mdOpen('MDB-Y', 'DEWA', [{ B: 'PUMP', K: '5' }]), link: { ...mdOpen('MDB-Y', 'DEWA', []).link!, cells: { B2: { field: 'board.id' }, C2: { field: 'board.fedFrom', before: 'FED FROM: ' }, E3: { field: 'incomer.rating' }, F3: { field: 'incomer.fault' } } } }, { E3: '800', F3: '36' }));
    expect(board(cells.project, 'MDB-Y').supply).toMatchObject({ ratingA: 800, device: 'MCCB', faultKa: 36 });
  });

  it('a row naming a board already fed from the panel updates its feeder; pushing the sheet again adds nothing', () => {
    const upd = pushRows(sampleProject, mdOpen('MDB-1', 'DEWA', [{ B: 'SMDB-GF (GROUND FLOOR SMDB)', D: '500', L: 'checked' }]));
    expect(upd).toMatchObject({ added: 0, updated: 1, made: [], rejected: [] });
    expect(fedBy(upd.project, 'SMDB-GF')).toMatchObject([{ id: 'INC-GF', breakerRatingA: 500, remarks: 'checked' }]);
    const first = pushRows(sampleProject, big()), again = pushRows(first.project, big());
    expect(again).toMatchObject({ added: 0, updated: 5, made: [], rejected: [] });
    expect(again.project.feeders.length).toBe(first.project.feeders.length);
    expect(again.project.boards.length).toBe(first.project.boards.length);
    expect(board(again.project, 'MDB-X').spareWays).toHaveLength(2);
  });

  it('a main board with a default supply is connected under the panel; one fed elsewhere, one above, and the panel itself are refused', () => {
    const main = addPanel(sampleProject, 'SMDB-M', 'SMDB');
    const r = pushRows(main, mdOpen('MDB-1', 'DEWA', [{ B: 'SMDB-M', D: '160' }]));
    expect(r).toMatchObject({ added: 0, updated: 1, rejected: [], notes: ['SMDB-M is now fed from MDB-1.'] });
    expect(board(r.project, 'SMDB-M')).toMatchObject({ upstreamId: 'MDB-1' });
    expect(board(r.project, 'SMDB-M').supply).toBeUndefined();
    expect(fedBy(r.project, 'SMDB-M')).toMatchObject([{ boardId: 'MDB-1', breakerRatingA: 160 }]);
    const no = pushRows(sampleProject, mdOpen('SMDB-GF', 'MDB-1', [{ B: 'SMDB-FF' }, { B: 'SMDB-GF' }, { B: 'MDB-1' }, { B: 'MDB-X' }]));
    expect(no).toMatchObject({ added: 1, rejected: ['Row 6: SMDB-FF is fed from MDB-1 in the project', "Row 7: SMDB-GF is this sheet's own panel", 'Row 8: MDB-1 is above SMDB-GF in the project'] });
    expect(no.sheet.link!.added).toEqual([{ B: 'SMDB-FF' }, { B: 'SMDB-GF' }, { B: 'MDB-1' }]);
    const bad = pushRows(sampleProject, mdOpen('SMDB-GF', 'MDB-1', [{ B: 'MDB-1' }]));
    expect(bad).toMatchObject({ added: 0, updated: 0 });
    expect(bad.project).toBe(sampleProject);
    expect(bad.sheet).toEqual(mdOpen('SMDB-GF', 'MDB-1', [{ B: 'MDB-1' }]));
  });

  it('a value the form refuses stops its row, names the cell, and the panel that row would have made is not kept', () => {
    const r = pushRows(sampleProject, mdOpen('MDB-X', 'DEWA', [{ B: 'SMDB-C', H: '37' }, { B: 'CHILLER 1', K: '45' }]));
    expect(r).toMatchObject({ added: 1, made: ['MDB-X'], rejected: ['H6: "37" is not a cable size from the cable table'] });
    expect(r.project.boards.some((b) => b.id === 'SMDB-C')).toBe(false);
    expect(r.project.feeders.some((f) => f.feedsBoardId === 'SMDB-C')).toBe(false);
    expect(r.sheet.link!.rows).toEqual([keyOfName(r.project, 'CHILLER 1'), 'new:0']);
    expect(r.sheet.link!.added).toEqual([{ B: 'SMDB-C', H: '37' }]);
  });

  it('after the push the next fill shows one row per feeder and spare way, and your own text stays beside its feeder', () => {
    const s = mdOpen('MDB-X', 'DEWA', [{ B: 'SPARE', D: '100', M: 'spare note' }, { B: 'SMDB-A', M: 'a note' }, { B: 'CHILLER 1', K: '45', M: 'chiller note' }]);
    const r = pushRows(sampleProject, s), f = fillLinked(r.project, r.sheet);
    expect(f.link!.rows).toEqual(panelRowKeys(r.project, 'MDB-X'));
    expect(f.link!.rows).toHaveLength(3);
    const note = (name: string) => { for (let row = 6; row < 9; row++) if (f.cells[`B${row}`]?.startsWith(name)) return f.cells[`M${row}`]; };
    expect([note('SPARE'), note('SMDB-A'), note('CHILLER')]).toEqual(['spare note', 'a note', 'chiller note']);
    expect(f.cells.B2).toBe('MDB-X');
  });

  it('MCC ROOM AC and DB ROOM LIGHTING are loads; a Board it feeds cell always decides', () => {
    const r = pushRows(sampleProject, mdOpen('MDB-X', 'DEWA', [{ B: 'MCC ROOM AC', K: '10' }, { B: 'DB ROOM LIGHTING', K: '5' }, { B: 'UPS 20 KVA', K: '16' }, { B: 'CHILLER 2', N: 'MCC-Z', D: '100' }, { B: 'DB-GF (LIGHTING)', K: '3' }, { B: 'MCC1' }]));
    expect(r).toMatchObject({ added: 6, made: ['MDB-X', 'MCC-Z', 'DB-GF', 'MCC1'], rejected: [] });
    expect(r.project.feeders.filter((f) => f.boardId === 'MDB-X' && !f.feedsBoardId).map((f) => f.name)).toEqual(['MCC ROOM AC', 'DB ROOM LIGHTING', 'UPS 20 KVA']);
    expect(board(r.project, 'MCC-Z')).toMatchObject({ kind: 'MCC', name: 'MCC-Z' });
    expect(board(r.project, 'DB-GF')).toMatchObject({ kind: 'DB', name: 'LIGHTING' });
    const none = pushRows(sampleProject, mdOpen('MDB-X', 'DEWA', [{ D: '100', L: 'no name' }]));
    expect(none).toMatchObject({ added: 0, rejected: ['Row 6: give a feeder name or a load'] });
    expect(none.project).toBe(sampleProject);
  });
});

const keyOfName = (p: Project, name: string) => { const f = p.feeders.find((x) => x.name === name)!; return f.uid ?? f.id; };
