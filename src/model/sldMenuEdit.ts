import { isScheduleCircuit } from '../calc/loadSchedule';
import type { FeederResult } from '../calc/electrical';
import { applyRecommendation, recommend } from '../calc/sizing';
import { loadTypeOf } from '../calc/summary';
import { cableTypeDef } from './cableTypes';
import { deleteBoard } from './edit';
import { below } from './moveBoard';
import { pasteBoard } from './copyBoard';
import { setCircuitPhase } from './phases';
import { kindOf } from './renamePanels';
import { applyDrop, applyMove, canMove, type DropResult, type DropTarget, type MoveItem, type ProtectionDevice } from './sldEdit';
import type { Feeder, MeterType, Project } from '../types';

/** The edits behind the SLD right-click menu (sldMenu.ts) that the drag and drop tools did not have: moving a way along
 * its busbar, copying and duplicating a load or a board, and changing one setting of a load. Pure: each returns the
 * project (unchanged, with a message, when nothing can be done) for the app's one undo step. */

/** The ways drawn on a busbar, in drawing order: the layout's own list (DB final circuits stay on the schedule). */
export const busWays = (project: Project, boardId: string): Feeder[] => project.feeders.filter((f) => f.boardId === boardId && !isScheduleCircuit(f));

/** The feeder that moves: a load itself, or a board's incomer. */
function moverOf(project: Project, m: MoveItem): Feeder | undefined {
  if (m.kind === 'feeder') return project.feeders.find((f) => f.id === m.id);
  const b = project.boards.find((x) => x.id === m.id);
  return b?.upstreamId ? project.feeders.find((f) => f.feedsBoardId === b.id && f.boardId === b.upstreamId) : undefined;
}

/** Where applyMove must put a load (or a board, through its incomer) to move it one way left / right or to the first / last
 * place on its busbar; undefined when it is already there. */
export function orderTarget(project: Project, item: MoveItem, how: 'left' | 'right' | 'first' | 'last'): DropTarget | undefined {
  const f = moverOf(project, item);
  if (!f) return undefined;
  const ways = busWays(project, f.boardId), i = ways.findIndex((x) => x.id === f.id), end = ways.length - 1;
  if (i < 0) return undefined;
  const before = (n: number): DropTarget => (n <= end ? { type: 'feeder', feederId: ways[n].id } : { type: 'bus', boardId: f.boardId });
  switch (how) {
    case 'left': return i > 0 ? before(i - 1) : undefined;
    case 'right': return i < end ? before(i + 2) : undefined;
    case 'first': return i > 0 ? before(0) : undefined;
    case 'last': return i < end ? before(end + 1) : undefined;
  }
}

/** Why a place can't take what is being moved, in a few words for the label under the pointer; undefined when it can. */
export function moveBlockedReason(project: Project, item: MoveItem, target: DropTarget): string | undefined {
  if (canMove(project, item, target)) return undefined;
  const f = moverOf(project, item);
  if (!f) return item.kind === 'board' ? 'A main board has no incomer to move' : 'It can’t go there';
  if (target.type === 'canvas') return 'Click a busbar or a load';
  const way = target.type === 'feeder' ? project.feeders.find((x) => x.id === target.feederId) : undefined;
  const to = target.type === 'bus' ? target.boardId : way?.boardId;
  if (!to) return 'It can’t go there';
  if (item.kind === 'board') {
    if (way?.id === f.id) return `That is ${item.id}’s own incomer`;
    if (to === item.id) return `${item.id} can't supply itself`;
    if (below(project, item.id).has(to)) return `${to} is below ${item.id} — that would make a loop`;
  } else {
    if (way?.id === f.id) return `That is ${item.id} itself`;
    if (target.type === 'bus' && to === f.boardId) return `${item.id} is already last on ${to}`;
  }
  return 'It can’t go there';
}

const newUid = (): string | undefined => globalThis.crypto?.randomUUID?.();

/** A copy of a load with a new id (the app's "-2", "-3" rule) and a new permanent id; what tied it to the original's
 * place or plan stays behind. */
export function copyFeeder(project: Project, id: string): Feeder {
  const f = project.feeders.find((x) => x.id === id);
  if (!f) throw new Error(`No load ${id}`);
  const taken = new Set([...project.boards.map((b) => b.id), ...project.feeders.map((x) => x.id)]);
  let n = 2;
  while (taken.has(`${id}-${n}`)) n++;
  const { uid: _uid, fromRoom: _room, trayRoute: _tray, cadVerticalM: _vertical, lengthToCheck: _check, feedsBoardId: _feeds, ...rest } = structuredClone(f);
  const uid = newUid();
  return { ...rest, id: `${id}-${n}`, ...(uid ? { uid } : {}) };
}

/** The copy of a load at the end of a busbar, or before another load. On another busbar it is re-sized as a move is. */
export function pasteFeeder(project: Project, sourceId: string, target: DropTarget): DropResult {
  const src = project.feeders.find((x) => x.id === sourceId);
  if (!src) return { project, message: `${sourceId} no longer exists` };
  if (src.feedsBoardId) return { project, message: `${sourceId} feeds ${src.feedsBoardId}: copy the board to repeat it` };
  const before = target.type === 'feeder' ? project.feeders.find((x) => x.id === target.feederId) : undefined;
  const toBoard = before ? before.boardId : target.type === 'bus' ? target.boardId : undefined;
  if (!toBoard || !project.boards.some((b) => b.id === toBoard)) return { project, message: 'Paste a load on a board or before another load' };
  let copy = { ...copyFeeder(project, sourceId), boardId: toBoard };
  const at = before ? project.feeders.findIndex((x) => x.id === before.id) : project.feeders.length;
  let p: Project = { ...project, feeders: [...project.feeders.slice(0, at), copy, ...project.feeders.slice(at)] };
  if (toBoard !== src.boardId) {
    copy = applyRecommendation(copy, recommend(p, copy, 'fix'));
    p = { ...p, feeders: p.feeders.map((x) => (x.id === copy.id ? copy : x)) };
  }
  return { project: p, select: { type: 'feeder', id: copy.id }, message: `Pasted ${copy.id}, a copy of ${sourceId}, ${before ? `before ${before.name || before.id}` : `at the end of ${toBoard}`}${toBoard !== src.boardId ? ' (cable and breaker re-checked for this busbar)' : ''}` };
}

/** A copy of a load right after the original on its busbar. */
export function duplicateFeeder(project: Project, id: string): DropResult {
  const f = project.feeders.find((x) => x.id === id);
  if (!f) return { project, message: `${id} no longer exists` };
  const ways = busWays(project, f.boardId), next = ways[ways.findIndex((x) => x.id === id) + 1];
  return pasteFeeder(project, id, next ? { type: 'feeder', feederId: next.id } : { type: 'bus', boardId: f.boardId });
}

/** A board with everything below it, pasted on its own upstream board with new names (no dialog), right after the original. */
export function duplicateBoard(project: Project, id: string): DropResult {
  const b = project.boards.find((x) => x.id === id);
  if (!b?.upstreamId) return { project, message: 'A main board has no board above it to duplicate on' };
  // New ids by the app's "-2", "-3" rule: the dialog's suggested rename needs the replacement typed in.
  const pasted = pasteBoard(project, id, b.upstreamId, { idFind: '', idReplace: '', nameFind: '', nameReplace: '' });
  const way = pasted.project.feeders.find((f) => f.feedsBoardId === id && f.boardId === b.upstreamId);
  const ways = busWays(pasted.project, b.upstreamId), next = way ? ways[ways.findIndex((x) => x.id === way.id) + 1] : undefined;
  const newIncomer = pasted.project.feeders.find((f) => f.feedsBoardId === pasted.rootId);
  let p = pasted.project;
  if (next && next.id !== newIncomer?.id) {
    const moved = applyMove(p, { kind: 'board', id: pasted.rootId }, { type: 'feeder', feederId: next.id });
    p = moved.project;
  }
  return { project: p, select: { type: 'board', id: pasted.rootId }, message: `Duplicated ${id} as ${pasted.rootId} — ${pasted.message.replace(/^Pasted [^:]*: /, '')}` };
}

/** What a setting is called in the status line. */
const FIELD_WORDS: Record<string, string> = { device: 'switching device', rcdMa: 'earth leakage', kwhMeter: 'kWh meter', phase: 'phase', cableType: 'cable type', essential: 'essential', existing: 'existing', localIsolator: 'local isolator' };

/** One setting of a load, from its menu. `value` is the choice ('' = none / automatic); the three switches ignore it and toggle. */
export function changeFeeder(project: Project, id: string, field: string, value = ''): DropResult {
  const f = project.feeders.find((x) => x.id === id);
  if (!f) return { project, message: `${id} no longer exists` };
  const done = (patch: Partial<Feeder>, what: string): DropResult => {
    const next: Feeder = { ...f, ...patch };
    for (const k of Object.keys(patch) as (keyof Feeder)[]) if (next[k] === undefined) delete next[k];
    return { project: { ...project, feeders: project.feeders.map((x) => (x.id === id ? next : x)) }, select: { type: 'feeder', id }, message: `${id}: ${what}` };
  };
  switch (field) {
    case 'device':
      if (!['ACB', 'MCCB', 'MCB', 'ISOL'].includes(value)) break;
      return applyDrop(project, { kind: 'device', device: value as ProtectionDevice }, { type: 'feeder', feederId: id });
    case 'rcdMa': {
      const ma = value ? Number(value) : undefined;
      if (ma !== undefined && !(ma > 0)) break;
      return done({ rcdMa: ma }, `${FIELD_WORDS.rcdMa} ${ma ? `${ma} mA` : 'none'}`);
    }
    case 'kwhMeter':
      if (value && !['1-PH', '3-PH', 'CT'].includes(value)) break;
      return done({ kwhMeter: (value || undefined) as MeterType | undefined }, `${FIELD_WORDS.kwhMeter} ${value === 'CT' ? 'CT-operated' : value ? `${value} direct` : 'none'}`);
    case 'phase': {
      if (value !== 'R' && value !== 'Y' && value !== 'B') break;
      const r = setCircuitPhase(project, id, value);
      return { project: r.project, select: { type: 'feeder', id: r.id }, message: r.project === project ? `${id}: ${f.cores === 2 && !f.feedsBoardId ? `already on phase ${value}` : 'only a single-phase circuit has a phase to choose'}` : `${r.id}: phase ${value}` };
    }
    case 'cableType':
      return done({ cableType: value || undefined }, `${FIELD_WORDS.cableType} ${value ? cableTypeDef(value).label : 'automatic (fire-rated for life safety)'}`);
    case 'essential': return done({ essential: f.essential ? undefined : true }, f.essential ? 'not essential (off the generator)' : 'essential (on the generator)');
    case 'existing': return done({ existing: f.existing ? undefined : true }, f.existing ? 'new (not existing)' : 'existing');
    case 'localIsolator': return done({ localIsolator: f.localIsolator ? undefined : true }, `local isolator ${f.localIsolator ? 'off' : 'on'}`);
  }
  return { project, message: `${id}: nothing changed` };
}

// ---- Several picked (the SLD's Shift+click and window picks) ------------------------------------------------------

/** A board or a load picked on the drawing (an incomer way counts as its board). */
export type PickItem = { kind: 'board'; id: string } | { kind: 'feeder'; id: string };

const loadIds = (items: PickItem[]): string[] => items.filter((x) => x.kind === 'feeder').map((x) => x.id);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** "3 loads and 1 board", leaving out a zero part. */
export const countWords = (loads: number, boards: number): string => [loads ? plural(loads, 'load') : '', boards ? plural(boards, 'board') : ''].filter(Boolean).join(' and ');

/** The drawn loads (not an incomer): the same type as this one, on its board or everywhere. */
export function similarLoads(project: Project, id: string, scope: 'board' | 'all'): PickItem[] {
  const f = project.feeders.find((x) => x.id === id);
  if (!f) return [];
  const type = loadTypeOf(f);
  return project.feeders.filter((x) => !x.feedsBoardId && !isScheduleCircuit(x) && loadTypeOf(x) === type && (scope === 'all' || x.boardId === f.boardId)).map((x) => ({ kind: 'feeder' as const, id: x.id }));
}

/** A board's drawn ways and every board fed from it, with their ways, through all levels. */
export function branchItems(project: Project, boardId: string): PickItem[] {
  const boards = [boardId, ...below(project, boardId)];
  return [
    ...boards.slice(1).map((id) => ({ kind: 'board' as const, id })),
    ...project.feeders.filter((f) => !f.feedsBoardId && !isScheduleCircuit(f) && boards.includes(f.boardId)).map((f) => ({ kind: 'feeder' as const, id: f.id }))
  ];
}

/** The empty drawing's Select list: every drawn load, the drawn ways that fail or are to check (an incomer is its board), or the boards of one kind. */
export function selectAll(project: Project, results: FeederResult[], what: 'loads' | 'failing' | 'warn' | 'kind', kind?: string): PickItem[] {
  if (what === 'kind') return project.boards.filter((b) => kindOf(b) === kind).map((b) => ({ kind: 'board' as const, id: b.id }));
  const status = new Map(results.map((r) => [r.feeder.id, r.status]));
  const ways = project.feeders.filter((f) => !isScheduleCircuit(f));
  if (what === 'loads') return ways.filter((f) => !f.feedsBoardId).map((f) => ({ kind: 'feeder' as const, id: f.id }));
  return ways.filter((f) => status.get(f.id) === (what === 'failing' ? 'bad' : 'warn')).map((f) => (f.feedsBoardId ? { kind: 'board' as const, id: f.feedsBoardId } : { kind: 'feeder' as const, id: f.id }));
}

/** One setting on every picked load. The three switches go to the opposite of "all on". */
export function changeFeeders(project: Project, ids: string[], field: string, value = ''): DropResult {
  const list = ids.map((id) => project.feeders.find((x) => x.id === id)).filter((f): f is Feeder => !!f && !f.feedsBoardId);
  if (!list.length) return { project, message: 'No loads to change' };
  const toggle = field === 'essential' || field === 'existing' || field === 'localIsolator';
  const allOn = toggle && list.every((f) => !!f[field as 'essential' | 'existing' | 'localIsolator']);
  let p = project, done = 0, what = '';
  for (const f of list) {
    if (toggle && !!f[field as 'essential'] === !allOn) continue; // already as wanted
    const r = changeFeeder(p, f.id, field, value);
    if (r.project === p) continue;
    p = r.project; done++; what ||= r.message.replace(/^[^:]*: /, '');
  }
  if (!done) return { project, message: `${plural(list.length, 'load')}: nothing changed` };
  return { project: p, message: `${plural(done, 'load')}: ${what}` };
}

/** Each picked load right after itself, each picked board with everything below it right after itself; main boards are skipped. */
export function duplicateMany(project: Project, targets: PickItem[]): DropResult {
  let p = project, loads = 0, boards = 0, skipped = 0;
  for (const t of targets) {
    const r = t.kind === 'board' ? duplicateBoard(p, t.id) : duplicateFeeder(p, t.id);
    if (r.project === p) { skipped++; continue; }
    p = r.project;
    if (t.kind === 'board') boards++; else loads++;
  }
  if (p === project) return { project, message: 'Nothing to duplicate (a main board has no board above it to duplicate on)' };
  return { project: p, message: `Duplicated ${countWords(loads, boards)}${skipped ? ` (${skipped} skipped)` : ''}` };
}

/** Every picked item to the end of one busbar, in the order of the project's ways; those it can't take are skipped and named. */
export function moveMany(project: Project, targets: PickItem[], toBoard: string): DropResult {
  const order = (t: PickItem) => { const f = moverOf(project, t); return f ? project.feeders.indexOf(f) : Infinity; };
  const sorted = [...targets].sort((a, b) => order(a) - order(b));
  let p = project, moved = 0;
  const skipped: string[] = [];
  for (const t of sorted) {
    const f = moverOf(p, t);
    if (!f || f.boardId === toBoard || !canMove(p, t, { type: 'bus', boardId: toBoard })) { skipped.push(t.id); continue; }
    p = applyMove(p, t, { type: 'bus', boardId: toBoard }).project;
    moved++;
  }
  if (!moved) return { project, message: `Nothing moved: ${skipped.join(', ')} can't go on ${toBoard}` };
  return { project: p, message: `Moved ${plural(moved, 'item')} to ${toBoard}${skipped.length ? `; left where they are: ${skipped.join(', ')}` : ''}` };
}

/** Delete the picked boards (with everything below them) and loads; a load under a deleted board is not counted twice. */
export function deleteMany(project: Project, targets: PickItem[]): DropResult {
  let p = project, boards = 0;
  const left: string[] = [];
  for (const t of targets.filter((x) => x.kind === 'board')) {
    if (!p.boards.some((b) => b.id === t.id)) continue; // already gone with a board above it
    try { p = deleteBoard(p, t.id); boards++; } catch { left.push(t.id); }
  }
  const alive = new Set(p.feeders.map((f) => f.id));
  const gone = new Set(loadIds(targets).filter((id) => alive.has(id) && !p.feeders.find((f) => f.id === id)?.feedsBoardId));
  if (gone.size) p = { ...p, feeders: p.feeders.filter((f) => !gone.has(f.id)) };
  if (p === project) return { project, message: left.length ? `${left.join(', ')} can't be deleted: a project needs at least one main board` : 'Nothing to delete' };
  const main = p.boards.find((b) => !b.upstreamId) ?? p.boards[0];
  return { project: p, ...(main ? { select: { type: 'board' as const, id: main.id } } : {}), message: `Deleted ${countWords(gone.size, boards)}${left.length ? `; kept ${left.join(', ')} (a project needs a main board)` : ''} (undo with ⌘Z)` };
}

/** The copies of several loads, in order, at the end of a busbar or before a load: one result, one undo step. */
export function pasteFeeders(project: Project, sourceIds: string[], target: DropTarget): DropResult {
  let p = project, last: DropResult | undefined, n = 0;
  for (const id of sourceIds) {
    const r = pasteFeeder(p, id, target);
    if (r.project === p) { last = last ?? r; continue; }
    p = r.project; last = r; n++;
  }
  if (!last) return { project, message: 'Nothing to paste' };
  if (n <= 1) return last;
  return { project: p, select: last.select, message: `Pasted ${n} loads ${target.type === 'bus' ? `at the end of ${target.boardId}` : 'before the load picked'}` };
}
