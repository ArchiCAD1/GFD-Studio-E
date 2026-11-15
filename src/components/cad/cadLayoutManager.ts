import type { FileLayout } from '../../engines/cad/cadEngine';
import { layoutPaper, PLAN_LABEL, planScale } from '../../docs/planLayout';
import { asFileLayout, drawingLayoutId, drawingLayoutsOf, nextLayoutName, paperName, withDrawingLayouts, type DrawingLayout } from '../../model/drawingLayouts';
import { renumber, setOf, type DrawingSheet } from '../../model/drawingSet';
import { fileLayoutId, fileLayoutTitle, paperOf } from '../../model/fileLayouts';
import { applySetup, setupsOf } from '../../model/plotSetup';
import type { Project } from '../../types';
import { layoutsOf, moveLayout, newLayout } from './CadLayouts';

/** Design CAD → Layout manager (LAYOUTMANAGER): every layout tab of the open drawing in one list, and the actions of a
 * layout tab's right-click menu on several at once. Pure: each action is one project change (one undo step), even when
 * it touches both the layouts made here (kept by drawing file) and the level's plan sheets (the drawing set). */

/** One row of the list; `id` is the layout's tab id. */
export interface ManagerRow {
  id: string;
  kind: 'file' | 'drawing' | 'sheet';
  /** A layout's name; a plan sheet's number and title, as its tab's tooltip names it. */
  name: string;
  paper: string;
  /** Its viewports and scales (a plan sheet: what it shows and its scale). */
  shows: string;
  /** A plan sheet's page setup: the named one, "Its own" or "Set's default"; a layout of the drawing has its paper only. */
  setup: string;
}
/** The drawing open, as the actions need it: its file, the names of the file's own layouts and the level (plan sheets). */
export interface ManagerCtx { file: string; fileNames: string[]; lv?: { buildingId: string; levelId: string; name: string } }

const sheetName = (s: DrawingSheet) => `${s.number} — ${s.title}`;
/** What a file or drawing layout shows: the part of its title after the paper. */
const showsOf = (l: FileLayout, mm: number) => fileLayoutTitle(l, mm).split(' · ').slice(1).join(' · ');

/** The tabs in order: the file's own layouts, the layouts made here, then the level's plan sheets. */
export function managerRows(project: Project, ctx: ManagerCtx, files: FileLayout[], mmPerUnit: number): ManagerRow[] {
  const dwg = drawingLayoutsOf(project, ctx.file), setups = setupsOf(project);
  return [
    ...files.map((l): ManagerRow => ({ id: fileLayoutId(l.name), kind: 'file', name: l.name, paper: paperName([paperOf(l).w, paperOf(l).h]), shows: showsOf(l, mmPerUnit), setup: 'Paper only' })),
    ...dwg.map((l, n): ManagerRow => ({ id: drawingLayoutId(l.name), kind: 'drawing', name: l.name, paper: paperName(l.paper), shows: showsOf(asFileLayout(l, n), mmPerUnit), setup: 'Paper only' })),
    ...layoutsOf(project, ctx.lv).map((s): ManagerRow => ({
      id: s.id, kind: 'sheet', name: sheetName(s), paper: layoutPaper(project, s)?.size ?? s.size, shows: `${PLAN_LABEL[s.plan ?? 'lighting']} · 1:${planScale(s.scale)}`,
      setup: s.plot?.named ? setups.find((x) => x.id === s.plot?.named)?.name ?? 'Its own' : s.plot ? 'Its own' : "Set's default"
    }))
  ];
}

const withSheets = (p: Project, f: (sheets: DrawingSheet[]) => DrawingSheet[]): Project => ({ ...p, drawingSet: { ...setOf(p), sheets: f(setOf(p).sheets) } });

/** A layout renamed: a layout made here (its tab id changes with its name) or a plan sheet (its title). The file's own cannot be. */
export function renameManaged(project: Project, ctx: ManagerCtx, id: string, raw: string): { project: Project; id: string } | { error: string } {
  const name = raw.trim(), dwg = drawingLayoutsOf(project, ctx.file), d = dwg.find((l) => drawingLayoutId(l.name) === id);
  if (d) {
    if (!name) return { error: 'Type a name for the layout.' };
    if ([...ctx.fileNames, ...dwg.filter((l) => l !== d).map((l) => l.name)].some((n) => n.toLowerCase() === name.toLowerCase())) return { error: `There is a layout "${name}" already.` };
    return { project: withDrawingLayouts(project, ctx.file, dwg.map((l) => (l === d ? { ...l, name } : l))), id: drawingLayoutId(name) };
  }
  if (!layoutsOf(project, ctx.lv).some((s) => s.id === id)) return { error: 'That layout cannot be renamed here: it is as saved in the drawing file.' };
  if (!name) return { error: 'Type a title for the sheet.' };
  return { project: withSheets(project, (sheets) => sheets.map((s) => (s.id === id ? { ...s, title: name } : s))), id };
}

/** Layouts copied, in list order: a layout made here as the next free LayoutN, a plan sheet as its tab's Copy does. The file's own are skipped. */
export function copyManaged(project: Project, ctx: ManagerCtx, ids: string[]): { project: Project; made: string[] } {
  const dwg = drawingLayoutsOf(project, ctx.file), made: string[] = [], copies: DrawingLayout[] = [];
  for (const l of dwg) if (ids.includes(drawingLayoutId(l.name))) {
    const c = { ...l, name: nextLayoutName([...ctx.fileNames, ...dwg.map((x) => x.name), ...copies.map((x) => x.name)]), viewports: l.viewports.map((v) => ({ ...v })) };
    copies.push(c); made.push(c.name);
  }
  let next = copies.length ? withDrawingLayouts(project, ctx.file, [...dwg, ...copies]) : project;
  if (ctx.lv) for (const s of layoutsOf(project, ctx.lv)) if (ids.includes(s.id)) {
    const r = newLayout(setOf(next), ctx.lv, s.plan ?? 'lighting', s);
    next = { ...next, drawingSet: r.set }; made.push(r.set.sheets.find((x) => x.id === r.id)?.number ?? s.number);
  }
  return { project: next, made };
}

/** One layout moved a place up (-1) or down (+1) among those of its kind; undefined: it cannot move that way. */
export function moveManaged(project: Project, ctx: ManagerCtx, id: string, dir: -1 | 1): Project | undefined {
  const dwg = drawingLayoutsOf(project, ctx.file), i = dwg.findIndex((l) => drawingLayoutId(l.name) === id), j = i + dir;
  if (i >= 0) {
    if (j < 0 || j >= dwg.length) return undefined;
    const list = [...dwg];
    [list[i], list[j]] = [list[j], list[i]];
    return withDrawingLayouts(project, ctx.file, list);
  }
  if (!layoutsOf(project, ctx.lv).some((s) => s.id === id)) return undefined;
  const moved = moveLayout(setOf(project), id, dir);
  return moved === setOf(project) ? undefined : { ...project, drawingSet: renumber(moved) };
}

/** Layouts deleted (a plan sheet goes with its layout): `gone` names them. The file's own are skipped. */
export function deleteManaged(project: Project, ctx: ManagerCtx, ids: string[]): { project: Project; gone: string[] } {
  const dwg = drawingLayoutsOf(project, ctx.file), sheets = layoutsOf(project, ctx.lv).filter((s) => ids.includes(s.id));
  const gone = [...dwg.filter((l) => ids.includes(drawingLayoutId(l.name))).map((l) => l.name), ...sheets.map((s) => `${s.number} ${s.title}`)];
  let next = project;
  if (dwg.some((l) => ids.includes(drawingLayoutId(l.name)))) next = withDrawingLayouts(next, ctx.file, dwg.filter((l) => !ids.includes(drawingLayoutId(l.name))));
  if (sheets.length) next = withSheets(next, (all) => all.filter((s) => !sheets.some((x) => x.id === s.id)));
  return { project: next, gone };
}

/** A named page setup given to the plan sheets among these layouts; a layout made here or the file's own has its paper only (skipped). */
export function applySetupManaged(project: Project, ctx: ManagerCtx, setupId: string, ids: string[]): { project: Project; applied: number; skipped: number } {
  const sheetIds = layoutsOf(project, ctx.lv).filter((s) => ids.includes(s.id)).map((s) => s.id);
  return { project: applySetup(project, setupId, sheetIds), applied: sheetIds.length, skipped: ids.length - sheetIds.length };
}
