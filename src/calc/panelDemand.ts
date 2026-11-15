import type { Board, Feeder, Project } from '../types';
import type { PhaseKw } from './loadSchedule';
import { feedersOn } from './network';
import { boardTotals } from './summary';

/** Connected load and maximum demand of a panel (TCL, DF, MDL = TCL × DF) —
 * the figures on its MD form, shared by the form, the SLD and the busbar riser. */

export const ZERO: PhaseKw = { R: 0, Y: 0, B: 0 };
export const add = (a: PhaseKw, b: PhaseKw): PhaseKw => ({ R: a.R + b.R, Y: a.Y + b.Y, B: a.B + b.B });
export const sum = (p: PhaseKw) => p.R + p.Y + p.B;

/** Connected (installed) load of one feeder per phase, kW: nameplate load
 * with no demand factor; single-phase circuits on their own phase. */
export function feederConnected(f: Feeder): PhaseKw {
  if (f.generation) return ZERO; // generation is not connected load
  if (f.cores === 2 && f.phase && f.phase !== 'RYB') return { ...ZERO, [f.phase]: f.loadKw };
  return { R: f.loadKw / 3, Y: f.loadKw / 3, B: f.loadKw / 3 };
}

/** Connected load per phase of everything fed from a board, kW. */
export function connectedPhaseKw(project: Project, boardId: string, seen = new Set<string>()): PhaseKw {
  if (seen.has(boardId)) return ZERO;
  seen.add(boardId);
  return feedersOn(project, boardId)
    .reduce((acc, f) => add(acc, f.feedsBoardId ? connectedPhaseKw(project, f.feedsBoardId, seen) : feederConnected(f)), ZERO);
}

/** The panel's own diversity factor: typed on the panel, else its own loads'
 * maximum demand ÷ connected load (not the project's). */
export function panelDf(project: Project, board: Board): number {
  if (board.mdDemandFactor !== undefined) return board.mdDemandFactor;
  // The project's demand factor for the MD forms, as on the TCL summary and riser forms.
  if (project.info?.mdDemandFactor !== undefined) return project.info.mdDemandFactor;
  const t = boardTotals(project, board.id);
  return t.connectedKw > 0 ? Math.round(Math.min(1, t.demandKw / t.connectedKw) * 100) / 100 : 1;
}

/** Panel summary for the SLD: TCL, DF and MDL = TCL × DF, kW. */
export function panelSummary(project: Project, board: Board): { tclKw: number; df: number; mdlKw: number } {
  const tclKw = sum(connectedPhaseKw(project, board.id));
  const df = panelDf(project, board);
  return { tclKw, df, mdlKw: tclKw * df };
}
