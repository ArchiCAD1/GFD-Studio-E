import { elcbGroups, isScheduleCircuit, scheduleCircuits } from '../calc/loadSchedule';
import type { BoardElcb, Project } from '../types';
import { refreshBoard } from './schedule';
import { isDbBoard } from './spareWays';

/** ELCBs (RCCBs) placed by hand over whole ways of a DB, and 1-phase RCBOs in place of a circuit's MCB. A circuit has either
 * an ELCB or an RCBO, never both: an RCBO circuit leaves the ELCB of its ways. After each change the board's circuits are
 * sized again, because the earth-fault check (and so the MCB and wire) reads the earth leakage protection. */

export interface ElcbResult { project: Project; id: string; message: string }

const waysText = (a: number, b: number) => (a === b ? `way ${a}` : `ways ${a}–${b}`);

function boardOf(project: Project, boardId: string) {
  const board = project.boards.find((b) => b.id === boardId);
  if (!board) throw new Error(`${boardId} is no longer in the project`);
  if (!isDbBoard(board)) throw new Error(`${boardId} has no load schedule of final circuits`);
  return board;
}

/** Why these ways cannot hold an ELCB placed by hand: not whole numbers in order, or overlapping another one (named as the
 * schedule names it). Undefined when they are fine. */
export function elcbWaysProblem(project: Project, boardId: string, e: Pick<BoardElcb, 'fromWay' | 'toWay'>, skip?: string): string | undefined {
  if (!Number.isInteger(e.fromWay) || !Number.isInteger(e.toWay) || e.fromWay < 1 || e.toWay < e.fromWay) return 'Give whole way numbers, from 1, with the first way not after the last';
  const clash = (project.boards.find((b) => b.id === boardId)?.elcbs ?? []).find((x) => x.id !== skip && x.fromWay <= e.toWay && e.fromWay <= x.toWay);
  if (!clash) return undefined;
  const n = numberOf(project, boardId, clash.id)?.n;
  const mine = waysText(e.fromWay, e.toWay);
  return `${mine[0].toUpperCase()}${mine.slice(1)} overlap ${n ? `ELCB-${n}` : 'another ELCB'} (${waysText(clash.fromWay, clash.toWay)})`;
}

function checkWays(project: Project, boardId: string, e: Pick<BoardElcb, 'fromWay' | 'toWay'>, skip?: string) {
  const why = elcbWaysProblem(project, boardId, e, skip);
  if (why) throw new Error(why);
}

const withElcbs = (project: Project, boardId: string, list: BoardElcb[]): Project =>
  refreshBoard({ ...project, boards: project.boards.map((b) => (b.id === boardId ? { ...b, elcbs: list.length ? list : undefined } : b)) }, boardId);

const clean = (e: Partial<BoardElcb>): Partial<BoardElcb> => {
  const o = { ...e };
  for (const k of Object.keys(o) as (keyof BoardElcb)[]) if (o[k] === undefined) delete o[k];
  return o;
};

/** The ELCB's number on the schedule (ELCB-n) after a change, for the message. */
function numberOf(project: Project, boardId: string, id: string): { n: number; label: string } | undefined {
  const board = project.boards.find((b) => b.id === boardId)!;
  const g = elcbGroups(project, board).find((x) => x.byHand?.id === id);
  return g && { n: g.index, label: g.label };
}

export function addBoardElcb(project: Project, boardId: string, e: Omit<BoardElcb, 'id'>): ElcbResult {
  const board = boardOf(project, boardId);
  const list = board.elcbs ?? [];
  checkWays(project, boardId, e);
  let n = list.length + 1;
  while (list.some((x) => x.id === `elcb${n}`)) n++;
  const id = `elcb${n}`;
  const next = withElcbs(project, boardId, [...list, { ...clean(e), id } as BoardElcb]);
  const g = numberOf(next, boardId, id);
  return { project: next, id, message: `ELCB-${g?.n ?? n} ${g?.label ?? ''} placed over ${waysText(e.fromWay, e.toWay)}`.replace(/\s+placed/, ' placed') };
}

export function updateBoardElcb(project: Project, boardId: string, id: string, patch: Partial<Omit<BoardElcb, 'id'>>): ElcbResult {
  const board = boardOf(project, boardId);
  const list = board.elcbs ?? [];
  const cur = list.find((x) => x.id === id);
  if (!cur) throw new Error('That ELCB is no longer on the board');
  const merged: BoardElcb = { ...cur, ...patch };
  for (const k of Object.keys(patch) as (keyof BoardElcb)[]) if (patch[k as keyof typeof patch] === undefined) delete merged[k];
  checkWays(project, boardId, merged, id);
  const next = withElcbs(project, boardId, list.map((x) => (x.id === id ? merged : x)));
  const g = numberOf(next, boardId, id);
  return { project: next, id, message: `ELCB-${g?.n ?? ''} ${g?.label ?? ''} over ${waysText(merged.fromWay, merged.toWay)}`.replace(/\s+over/, ' over') };
}

export function removeBoardElcb(project: Project, boardId: string, id: string): Project {
  const board = boardOf(project, boardId);
  return withElcbs(project, boardId, (board.elcbs ?? []).filter((x) => x.id !== id));
}

/** Makes a 1-phase circuit's breaker an RCBO (on), IΔn as given or Auto, or an MCB again (off). */
export function setRcbo(project: Project, feederId: string, on: boolean, rcdMa?: number): Project {
  const f = project.feeders.find((x) => x.id === feederId);
  if (!f || !isScheduleCircuit(f)) throw new Error('That circuit is no longer on a load schedule');
  if (on && f.phase === 'RYB') throw new Error('An RCBO is for 1-phase circuits; use an ELCB for a 3-phase circuit');
  const next = { ...f };
  if (on) {
    next.rcbo = true;
    if (rcdMa) next.rcdMa = rcdMa;
    else delete next.rcdMa;
  } else {
    delete next.rcbo;
    delete next.rcdMa;
  }
  return refreshBoard({ ...project, feeders: project.feeders.map((x) => (x.id === feederId ? next : x)) }, f.boardId);
}

/** Back to the board's automatic grouping: no ELCBs placed by hand and no RCBOs. */
export function allAutomatic(project: Project, boardId: string): Project {
  boardOf(project, boardId);
  const rcbos = new Set(scheduleCircuits(project, boardId).filter((f) => f.rcbo).map((f) => f.id));
  const feeders = project.feeders.map((f) => {
    if (!rcbos.has(f.id)) return f;
    const rest = { ...f };
    delete rest.rcbo;
    delete rest.rcdMa;
    return rest;
  });
  return withElcbs({ ...project, feeders }, boardId, []);
}
