import { selectCable } from '../calc/electrical';
import { applyRecommendation, recommend } from '../calc/sizing';
import { supplyAuthorityOf } from './designReference';
import type { Board, BoardKind, Feeder, Project } from '../types';

/** Adding a panel with a chosen id: the core of the add_panel tool (headless/editTools.ts) and of Push to load schedule (sheets). */

/** Board ratings for a new panel, A, as the diagram palette gives them (src/model/sldEdit.ts). */
export const BOARD_RATING: Record<BoardKind, number> = { MC: 400, 'LV-ACB': 1600, MDB: 1600, 'LV-MDB': 1600, SMDB: 250, DB: 63, EDB: 63, MCC: 400, EMCC: 400, EMDB: 250, 'LV-EMDB': 800, FP: 250, UPS: 32 };

export interface NewPanel { name?: string; ratedA?: number; lengthM?: number; location?: string; transformerKva?: number; impedancePct?: number }

const taken = (p: Project) => new Set([...p.boards.map((b) => b.id), ...p.feeders.map((f) => f.id)]);
const uniqueId = (p: Project, base: string) => { const t = taken(p); for (let n = 1; ; n++) if (!t.has(`${base}-${n}`)) return `${base}-${n}`; };

/** The project with the panel, and the panel and its incomer feeder. Under a parent the incomer is a feeder on the parent with its
 * breaker at the panel's rating and a cable sized by the app; without one the panel is a main board with its own supply.
 * Throws when the id is empty or taken, or the parent is not in the project. */
export function buildPanel(p: Project, id: string, kind: BoardKind, parentId?: string, a: NewPanel = {}): { project: Project; board: Board; incomer?: Feeder } {
  if (!id.trim()) throw new Error('The id is empty.');
  if (taken(p).has(id)) throw new Error(`${id} already exists in the project.`);
  const parent = parentId ? p.boards.find((b) => b.id === parentId) : undefined;
  if (parentId && !parent) throw new Error(`${parentId} is not in the project.`);
  const board: Board = {
    id, name: a.name ?? id, kind, ratedCurrentA: a.ratedA ?? BOARD_RATING[kind],
    ...(parent ? { upstreamId: parent.id } : { supply: { fedFrom: supplyAuthorityOf(p) } }),
    ...(a.location ? { location: a.location } : {}),
    ...(a.transformerKva !== undefined ? { sourceKva: a.transformerKva, sourceImpedancePct: a.impedancePct } : {})
  };
  if (!parent) return { project: { ...p, boards: [...p.boards, board] }, board };
  const rating = board.ratedCurrentA!, lengthM = a.lengthM ?? 30;
  const inc0: Feeder = {
    id: taken(p).has(`INC-${id}`) ? uniqueId(p, `INC-${id}`) : `INC-${id}`, boardId: parent.id, feedsBoardId: id, name: `Incomer to ${board.name}`,
    loadKw: 0, demandFactor: 1, powerFactor: 0.85, lengthM, cores: 4, breakerRatingA: rating, breakerIcuKa: 36,
    cableCsaMm2: selectCable(rating, lengthM, p.voltageV, 4, 0.85, p.ambientC, 100, rating) ?? 300,
    breakerType: rating > 1600 ? 'ACB' : rating > 63 ? 'MCCB' : 'C'
  };
  const withBoard = { ...p, boards: [...p.boards, board], feeders: [...p.feeders, inc0] };
  const incomer = applyRecommendation(inc0, recommend(withBoard, inc0, 'fix'));
  return { project: { ...withBoard, feeders: withBoard.feeders.map((f) => (f.id === incomer.id ? incomer : f)) }, board, incomer };
}

/** A panel with exactly this id (and the id as its name) of this kind, under a parent panel or as a new supply. */
export const addPanel = (project: Project, id: string, kind: BoardKind, parentId?: string): Project => buildPanel(project, id, kind, parentId).project;
