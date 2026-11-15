import { isScheduleCircuit, scheduleCircuits, SINGLE_PHASES } from '../calc/loadSchedule';
import { cellAt, cellName } from '../calc/sheetFormula';
import { addPanel, buildPanel, connectPanel, panelKindOf, PANEL_PREFIXES } from '../model/addPanel';
import { below } from '../model/moveBoard';
import { deleteRows, sheetValues, type Sheet, type SheetLink } from '../model/sheets';
import { addSpareWay, placeSpareWay, spareWaysOf } from '../model/spareWays';
import type { Phase, Project } from '../types';
import { isEditable, isItemizedCell } from './dbSheet';
import { applyMdEdits, buildMdSheet } from './mdSheet';
import { columnOf, dbKit, keyOf, mdKey, mdKit, mdPrepare, rowKey, type Ref } from './sheetApply';
import { linkFields, linkText, ownRows, pushTarget } from './sheetLink';

/** Push to load schedule: the rows an opened sheet holds become the panel and its circuits (DB schedule) or feeders, sub-panels and
 * spare ways (panel schedule), through the same kits as Apply to project (sheetApply.ts), so the same checks and sizing apply. */

export interface PushResult { project: Project; sheet: Sheet; added: number; updated: number; made: string[]; rejected: string[]; notes: string[] }
type Target = NonNullable<ReturnType<typeof pushTarget>>;
type Out = ({ key: string } | undefined)[];

const PHASE_TEXT: Record<string, Phase> = { R: 'R', Y: 'Y', B: 'B', RYB: 'RYB', '3PH': 'RYB', TP: 'RYB', '3': 'RYB' };
const INCOMER = /^(main\s+)?incom(er|ing)\b/i, LABEL = /^out\s?going\b/i, SPARE = /^spare\b/i, SPACE = /^space\b/i;
const positive = (t: string | undefined) => { const n = Number((t ?? '').trim().replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : undefined; };

/** The text of a cell by its value (a formula by what it shows), trimmed. */
function textReader(sheet: Sheet, l: SheetLink) {
  const values = sheetValues(sheet);
  return {
    textAt: (letters: string | undefined, r: number) => { if (!letters) return ''; const k = `${letters}${r}`, raw = sheet.cells[k] ?? ''; return (raw.startsWith('=') ? String(values[k]?.value ?? '') : raw).trim(); },
    letterOf: (field: string) => Object.keys(l.columns).find((c) => l.columns[c] === field)
  };
}

/** Whether a way is taken on the board: by a circuit or a spare way, on any of the phases it covers. */
function slotUsed(p: Project, boardId: string, slot: { phase: Phase; way: number }): boolean {
  const used = new Set<string>();
  for (const f of [...scheduleCircuits(p, boardId), ...spareWaysOf(p.boards.find((b) => b.id === boardId)!).filter((w) => w.way)]) for (const ph of f.phase === 'RYB' ? SINGLE_PHASES : [f.phase as 'R' | 'Y' | 'B']) used.add(`${ph}${f.way}`);
  return (slot.phase === 'RYB' ? SINGLE_PHASES : [slot.phase as 'R' | 'Y' | 'B']).some((ph) => used.has(`${ph}${slot.way}`));
}

/** The sheet after a push: rows left out (`gone`) are deleted so the rows below move up, the pushed rows come first, each with the key
 * of its circuit or feeder, then the rows that failed as added rows. */
function rebuilt(sheet: Sheet, l: SheetLink, rows: { typed: Record<string, string> }[], out: Out, gone: number[]): Sheet {
  let s = sheet;
  for (const i of [...gone].sort((a, b) => b - a)) s = deleteRows(s, l.firstRow + i);
  const keep = rows.map((_, i) => i).filter((i) => !gone.includes(i));
  const good = keep.filter((i) => out[i]), badRows = keep.filter((i) => !out[i]), order = [...good, ...badRows], cells = { ...s.cells };
  for (const k of Object.keys(cells)) { const at = cellAt(k)!; if (at.row >= l.firstRow && at.row < l.firstRow + keep.length) delete cells[k]; }
  order.forEach((from, to) => { const src = l.firstRow + keep.indexOf(from); for (const [k, t] of Object.entries(s.cells)) { const at = cellAt(k)!; if (at.row === src) cells[cellName(at.col, l.firstRow + to)] = t; } });
  const { pending: _p, added: _a, ...base } = { ...s.link!, boardId: l.boardId };
  const news = badRows.map((i) => rows[i].typed);
  return { ...s, cells, link: { ...base, rows: [...good.map((i) => out[i]!.key), ...news.map((_, j) => `new:${j}`)], ...(news.length ? { added: news } : {}) } };
}

/** The rows an opened schedule already holds become the panel and its circuits (DB schedule) or feeders, sub-panels and spare ways
 * (panel schedule). The panel (and the board it is fed from, when that is not in the project either) is made if needed; the values
 * go through the same checks as an added row of Apply to project. A row that fails is not made and stays after the block as an added
 * row. Nothing changes when no row could be pushed. */
export function pushRows(project: Project, sheet: Sheet): PushResult {
  const none = (rejected: string[]): PushResult => ({ project, sheet, added: 0, updated: 0, made: [], rejected, notes: [] });
  const link = sheet.link, target = pushTarget(project, sheet), n = ownRows(sheet);
  if (!link || !target) return none(['Link the cell that holds the panel number first.']);
  if (!n) return none(['This sheet has no rows of its own.']);
  return link.category === 'md' ? pushPanel(project, sheet, link, target, n, none) : pushDb(project, sheet, link, target, n, none);
}

function pushDb(project: Project, sheet: Sheet, link: SheetLink, target: Target, n: number, none: (r: string[]) => PushResult): PushResult {
  let p = project;
  const made: string[] = [], find = (id: string) => p.boards.find((b) => b.id.toLowerCase() === id.toLowerCase());
  try {
    if (!find(target.id)) {
      if (target.fedFrom && !find(target.fedFrom)) { p = addPanel(p, target.fedFrom, panelKindOf(target.fedFrom) ?? 'SMDB'); made.push(target.fedFrom); }
      p = addPanel(p, target.id, 'DB', target.fedFrom ? find(target.fedFrom)?.id : undefined);
      made.push(target.id);
    }
  } catch (e) { return none([(e as Error).message]); }
  const boardId = find(target.id)!.id, l = { ...link, boardId };
  const kit = dbKit(l, find(target.id)!);

  const typedFields = new Set(linkFields('db').filter((f) => f.typed && f.key !== 'own').map((f) => f.key));
  const { textAt, letterOf } = textReader(sheet, l);
  const rows = Array.from({ length: n }, (_, i) => {
    const r = l.firstRow + i, typed: Record<string, string> = {};
    for (const [c, f] of Object.entries(l.columns)) if (typedFields.has(f) && textAt(c, r) !== '') typed[c] = textAt(c, r);
    const ref = /^(RYB|[RYB])\s*-?\s*(\d+)$/i.exec(textAt(letterOf('row.ref'), r)), desc = typed[letterOf('row.room') ?? ''] ?? '';
    const loaded = Object.entries(typed).some(([c, t]) => l.columns[c] === 'row.watts' || l.columns[c].startsWith('row.points.') ? positive(t) !== undefined : false);
    const spare = loaded ? undefined : SPARE.test(desc) ? 'spare' as const : SPACE.test(desc) ? 'space' as const : undefined;
    return { r, typed, spare, slot: ref ? { phase: ref[1].toUpperCase() as Phase, way: Number(ref[2]) } : undefined, phase: PHASE_TEXT[textAt(letterOf('row.phase'), r).toUpperCase()] };
  });

  const out: Out = Array(n).fill(undefined), rejected: string[] = [], touched = new Set<string>();
  let added = 0, updated = 0;
  // Rows that name their way go first, so a row without one cannot take it.
  for (const i of [...rows.keys()].sort((a, b) => Number(!rows[a].slot) - Number(!rows[b].slot) || a - b)) {
    const { r, typed, slot, phase, spare } = rows[i];
    const bad: string[] = [], reject = (x: Ref) => bad.push(x.cell ? `${x.cell}: ${x.text}` : x.text), cellOf = (letters: string) => `${letters}${r}`;
    const fail = (...why: string[]) => { rejected.push(...why); };
    if (spare) {
      // A spare or a space: the spare way at the named way, else the next one not taken by a row, else a new one.
      const mine = spareWaysOf(p.boards.find((b) => b.id === boardId)!).filter((w) => w.kind === spare);
      let q = p, id = (slot ? mine.find((w) => w.phase === slot.phase && w.way === slot.way) : mine.find((w) => w.way && !touched.has(`spare:${w.id}`)))?.id;
      const fresh = !id;
      if (!id) {
        if (slot && slotUsed(p, boardId, slot)) { fail(`Row ${r}: ${slot.phase}${slot.way} is already used on ${boardId}`); continue; }
        try {
          const a = addSpareWay(p, boardId, spare, slot?.phase ?? phase);
          if (!a.id) { fail(`Row ${r}: ${a.message}`); continue; }
          q = slot ? placeSpareWay(a.project, boardId, a.id, slot.phase, slot.way) : a.project;
          id = a.id;
        } catch { fail(`Row ${r}: no free way on ${boardId}`); continue; }
      }
      const key = `spare:${id}`;
      if (touched.has(key)) { fail(`Row ${r}: ${slot ? `${slot.phase}${slot.way}` : 'that spare'} is already used by another row`); continue; }
      const tbl = kit.build(q, boardId), y = tbl.rows.findIndex((x) => rowKey(x) === key);
      // Only the values whose column the table lets this row take: the word SPARE in the description is not one.
      const takes = Object.fromEntries(Object.entries(typed).filter(([c]) => { const x = tbl.sheetCols.findIndex((k) => k.key === columnOf(l.columns[c])); return x >= 0 && y >= 0 && (isItemizedCell(tbl, y, x) || isEditable(tbl, y, x)); }));
      const prep = kit.prepare(q, tbl, key, takes, cellOf, reject);
      if (bad.length) { fail(...bad); continue; }
      p = kit.commit(q, tbl, prep.good);
      touched.add(key); out[i] = { key }; if (fresh) added++; else updated++;
      continue;
    }
    if (!kit.wants(typed)) { fail(`Row ${r}: give a description or a load`); continue; }
    const circuits = scheduleCircuits(p, boardId);
    let existing = slot ? circuits.find((f) => f.phase === slot.phase && f.way === slot.way) : undefined;
    if (!slot) {
      const desc = (typed[letterOf('row.room') ?? ''] ?? '').toLowerCase(), same = desc ? circuits.filter((f) => !touched.has(keyOf(f)) && (f.room || f.name || '').trim().toLowerCase() === desc) : [];
      if (same.length === 1) existing = same[0];
    } else if (!existing && slotUsed(p, boardId, slot)) { fail(`Row ${r}: ${slot.phase}${slot.way} is already used on ${boardId}`); continue; }
    if (existing) {
      const key = keyOf(existing);
      if (touched.has(key)) { fail(`Row ${r}: ${existing.phase}${existing.way} is already used by another row`); continue; }
      const tbl = kit.build(p, boardId), prep = kit.prepare(p, tbl, key, typed, cellOf, reject);
      if (bad.length) { fail(...bad); continue; }
      p = kit.commit(p, tbl, prep.good);
      if (prep.after) p = prep.after(p);
      touched.add(key); out[i] = { key }; updated++;
      continue;
    }
    const trial = kit.add(p, boardId, slot ?? (phase ? { phase } : undefined));
    if (typeof trial === 'string') { fail(`Row ${r}: ${trial}`); continue; }
    const key = keyOf(trial.project.feeders.find((f) => f.id === trial.id)!), tbl = kit.build(trial.project, boardId), prep = kit.prepare(trial.project, tbl, key, typed, cellOf, reject);
    if (bad.length) { fail(...bad); continue; }
    p = kit.commit(trial.project, tbl, prep.good);
    if (prep.after) p = prep.after(p);
    touched.add(key); out[i] = { key }; added++;
  }
  if (!added && !updated) return none(rejected);
  return { project: p, sheet: rebuilt(sheet, l, rows, out, []), added, updated, made, rejected, notes: [] };
}

const INCOMER_FIELDS = ['device', 'rating', 'fault', 'cores', 'cableType', 'size', 'ecc', 'length'] as const;

/** The panel a name stands for, or undefined for a load: an existing board whose number or name is the text (or the part before
 * " (" or " - "), else a leading run that starts with a panel kind and has more than the kind (SMDB-1, DB-GF; a bare SMDB only as the
 * whole name). */
function subPanelOf(p: Project, name: string): string | undefined {
  const n = name.trim();
  if (!n) return undefined;
  const head = n.split(/ \(| - /)[0].trim().toLowerCase();
  const hit = p.boards.find((b) => [b.id, b.name].some((x) => [n.toLowerCase(), head].includes(x.toLowerCase())));
  if (hit) return hit.id;
  const run = n.split(/[\s(]/)[0];
  return panelKindOf(run) && (run === n || !PANEL_PREFIXES.includes(run.toUpperCase())) ? run : undefined;
}

function pushPanel(project: Project, sheet: Sheet, link: SheetLink, target: Target, n: number, none: (r: string[]) => PushResult): PushResult {
  const { textAt, letterOf } = textReader(sheet, link);
  const typedFields = new Set(linkFields('md').filter((f) => f.typed && f.key !== 'own').map((f) => f.key));
  const rows = Array.from({ length: n }, (_, i) => {
    const r = link.firstRow + i, typed: Record<string, string> = {};
    for (const [c, f] of Object.entries(link.columns)) if (typedFields.has(f) && textAt(c, r) !== '') typed[c] = textAt(c, r);
    const name = textAt(letterOf('row.name'), r), to = textAt(letterOf('row.to'), r), poles = textAt(letterOf('row.poles'), r);
    const kind = to ? 'panel' : INCOMER.test(name) ? 'incomer' : LABEL.test(name) ? 'label' : SPARE.test(name) ? 'spare' : SPACE.test(name) ? 'space' : 'other';
    return { r, typed, name, to, poles, kind } as const;
  });

  // The incomer: the row of the block that says so, else the linked cells.
  const incRow = rows.find((x) => x.kind === 'incomer'), inc: Record<string, { text: string; cell: string }> = {};
  for (const f of INCOMER_FIELDS) {
    const letters = letterOf(`row.${f}`), fromRow = incRow && letters ? textAt(letters, incRow.r) : '';
    const cell = Object.entries(link.cells).find(([, c]) => c.field === `incomer.${f}`)?.[0], text = fromRow || linkText(sheet, `incomer.${f}`) || '';
    if (text) inc[f] = { text, cell: fromRow ? `${letters}${incRow!.r}` : cell ?? '' };
  }

  let p = project;
  const made: string[] = [], find = (id: string) => p.boards.find((b) => b.id.toLowerCase() === id.toLowerCase());
  try {
    if (!find(target.id)) {
      let parentId: string | undefined;
      if (target.parentIsPanel) {
        if (!find(target.fedFrom)) { p = addPanel(p, target.fedFrom, panelKindOf(target.fedFrom) ?? 'SMDB'); made.push(target.fedFrom); }
        parentId = find(target.fedFrom)!.id;
      }
      p = buildPanel(p, target.id, panelKindOf(target.id) ?? 'SMDB', parentId, { ratedA: positive(inc.rating?.text) }).project;
      made.push(target.id);
    }
  } catch (e) { return none([(e as Error).message]); }
  const tid = find(target.id)!.id, l = { ...link, boardId: tid }, kit = mdKit(l);
  const rejected: string[] = [], notes: string[] = [];

  // Incomer values go to the incomer row of the panel form; a panel with no incomer feeder takes only its device, rating and fault duty.
  const tbl0 = buildMdSheet(p, tid), hasFeeder = tbl0.rows[0].type === 'incomer' && !!tbl0.rows[0].feeder;
  const take = INCOMER_FIELDS.filter((f) => inc[f] && (hasFeeder || ['device', 'rating', 'fault'].includes(f)));
  if (take.length) {
    const typed = Object.fromEntries(take.map((f) => [`row.${f}`, inc[f].text])), cells = Object.fromEntries(take.map((f) => [`row.${f}`, inc[f].cell]));
    const prep = mdPrepare({ ...link, columns: Object.fromEntries(take.map((f) => [`row.${f}`, `row.${f}`])) }, p, tbl0, 0, typed, (k) => cells[k], (x) => rejected.push(`Incomer: ${x.cell ? `${x.cell}: ` : ''}${x.text}`), true);
    p = applyMdEdits(p, tbl0, prep.good).project;
  }

  const out: Out = Array(n).fill(undefined), touched = new Set<string>(), gone: number[] = [], loadless: string[] = [];
  let added = 0, updated = 0;
  for (let i = 0; i < n; i++) {
    const row = rows[i], { r, typed } = row;
    const bad: string[] = [], reject = (x: Ref) => bad.push(x.cell ? `${x.cell}: ${x.text}` : x.text), cellOf = (letters: string) => `${letters}${r}`;
    const fail = (...why: string[]) => { rejected.push(...why); };
    const val = (field: string) => { const c = letterOf(field); return c ? typed[c] : undefined; };
    if (row.kind === 'incomer') { notes.push(`Row ${r}: read as the panel's incomer.`); gone.push(i); continue; }
    if (row.kind === 'label') { notes.push(`Row ${r} (${row.name}) is a heading: left out.`); gone.push(i); continue; }

    if (row.kind === 'spare' || row.kind === 'space') {
      const kind = row.kind;
      let q = p, id = spareWaysOf(p.boards.find((b) => b.id === tid)!).find((w) => w.kind === kind && !touched.has(`spare:${w.id}`))?.id;
      const fresh = !id;
      if (!id) {
        const a = addSpareWay(p, tid, kind, /^sp$/i.test(row.poles) ? 'R' : undefined);
        if (!a.id) { fail(`Row ${r}: ${a.message}`); continue; }
        q = a.project; id = a.id;
      }
      const key = `spare:${id}`, tbl = kit.build(q, tid), y = tbl.rows.findIndex((x) => mdKey(x) === key);
      if (y < 0) { fail(`Row ${r}: ${tid} has no spare ways`); continue; }
      // Only the values the form lets a spare way take; the name SPARE is not one.
      const prep = mdPrepare(l, q, tbl, y, Object.fromEntries(Object.entries(typed).filter(([c]) => l.columns[c] !== 'row.name')), cellOf, reject, true);
      if (bad.length) { fail(...bad); continue; }
      p = kit.commit(q, tbl, prep.good);
      touched.add(key); out[i] = { key }; if (fresh) added++; else updated++;
      continue;
    }

    const S0 = row.kind === 'panel' ? row.to : subPanelOf(p, row.name);
    if (S0) {
      // A panel under this one: made, or connected, or its feeder updated.
      const have = find(S0), S = have?.id ?? S0;
      let q = p, how: 'added' | 'updated' = 'updated', connected = false;
      if (have?.id === tid) { fail(`Row ${r}: ${S} is this sheet's own panel`); continue; }
      if (have && below(p, have.id).has(tid)) { fail(`Row ${r}: ${S} is above ${tid} in the project`); continue; }
      if (have?.upstreamId && have.upstreamId !== tid) { fail(`Row ${r}: ${S} is fed from ${have.upstreamId} in the project`); continue; }
      if (have && !have.upstreamId && have.sourceKva !== undefined) { fail(`Row ${r}: ${S} has its own supply in the project`); continue; }
      try {
        if (!have) {
          const bracket = /^[^\s(]+\s*\((.*)\)\s*$/.exec(row.name)?.[1].trim();
          q = buildPanel(p, S, panelKindOf(S) ?? 'SMDB', tid, { name: bracket || S, ratedA: positive(val('row.rating')), lengthM: positive(val('row.length')) }).project;
          how = 'added';
        } else if (!have.upstreamId) { q = connectPanel(p, S, tid, { ratedA: positive(val('row.rating')), lengthM: positive(val('row.length')) }); connected = true; }
      } catch (e) { fail(`Row ${r}: ${(e as Error).message}`); continue; }
      const f = q.feeders.find((x) => x.boardId === tid && x.feedsBoardId === S);
      if (!f) { fail(`Row ${r}: ${S} has no feeder on ${tid}`); continue; }
      const key = keyOf(f);
      if (touched.has(key)) { fail(`Row ${r}: ${S} is already used by another row`); continue; }
      // A panel's name is the board's and its load comes from its own schedule: neither is taken from the row.
      const tbl = kit.build(q, tid), prep = kit.prepare(q, tbl, key, Object.fromEntries(Object.entries(typed).filter(([c]) => !['row.name', 'row.tcl'].includes(l.columns[c]))), cellOf, reject);
      if (bad.length) { fail(...bad); continue; }
      p = kit.commit(q, tbl, prep.good);
      touched.add(key); out[i] = { key };
      if (how === 'added') { added++; made.push(S); } else updated++;
      if (connected) notes.push(`${S} is now fed from ${tid}.`);
      if (val('row.tcl')) loadless.push(S);
      continue;
    }

    // A load: the feeder of that name, else a new one.
    if (!kit.wants(typed)) { fail(`Row ${r}: give a feeder name or a load`); continue; }
    const same = row.name ? p.feeders.filter((f) => f.boardId === tid && !f.feedsBoardId && !isScheduleCircuit(f) && !touched.has(keyOf(f)) && (f.name || f.id).trim().toLowerCase() === row.name.toLowerCase()) : [];
    let q = p, key: string, how: 'added' | 'updated' = 'updated';
    if (same.length === 1) key = keyOf(same[0]);
    else {
      const trial = kit.add(p, tid);
      if (typeof trial === 'string') { fail(`Row ${r}: ${trial}`); continue; }
      q = trial.project; key = keyOf(q.feeders.find((f) => f.id === trial.id)!); how = 'added';
    }
    const tbl = kit.build(q, tid), prep = kit.prepare(q, tbl, key, typed, cellOf, reject);
    if (bad.length) { fail(...bad); continue; }
    p = kit.commit(q, tbl, prep.good);
    touched.add(key); out[i] = { key }; if (how === 'added') added++; else updated++;
  }
  if (!added && !updated) return none(rejected.length ? rejected : ['This sheet has no feeder or spare rows to push.']);
  if (loadless.length) notes.push(`Load not taken for ${loadless.join(', ')}: a panel's load comes from its own schedule. Push those sheets too.`);
  return { project: p, sheet: rebuilt(sheet, l, rows, out, gone), added, updated, made, rejected, notes };
}
