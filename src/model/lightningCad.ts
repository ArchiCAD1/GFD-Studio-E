import { lightningProtection, lpsLayout, type LpsInputs } from '../calc/lightningProtection';
import type { Project, SketchItem } from '../types';
import { withBlockDef, type CadBlockDef } from './cadBlocks';
import { areaOf } from './cadMeasure';
import { plansOf } from './cadPlans';
import { planScale } from './cadUnits';

/** The lightning protection study's roof layout as a Design CAD block: the roof edge conductor, the conductor runs
 * inside it, the rods or terminals, and the down conductors with their numbers. The block's base point is one corner
 * of the roof, so the engineer inserts it on the roof plan at that corner and turns it to suit (INSERT). Concept
 * geometry in plan only; the block is in the drawing's own units. */

export const LP_BLOCK = 'LP-ROOF-LAYOUT';
/** Layer 0: the block's objects take the layer the block is inserted on, as blocks usually do. */
export const LP_LAYER = '0';

/** The block for a drawing whose unit is `metresPerUnit` long (0.001 for millimetres); none while the study has no
 * layout to draw. */
export function lightningRoofBlock(i: LpsInputs, metresPerUnit: number): CadBlockDef | undefined {
  const r = lightningProtection(i);
  if (r.invalid || r.selected.status === 'data' || !(metresPerUnit > 0)) return undefined;
  const plan = lpsLayout(i, r), u = (m: number) => m / metresPerUnit;
  const at = (x: number, y: number): [number, number] => [u(x), u(y)];
  let n = 0;
  const item = (it: Omit<SketchItem, 'id' | 'layer'>): SketchItem => ({ id: `LP${++n}`, layer: LP_LAYER, ...it });
  const items: SketchItem[] = [item({ kind: 'pline', pts: [at(0, 0), at(i.lengthM, 0), at(i.lengthM, i.widthM), at(0, i.widthM)], closed: true })];
  for (const x of plan.meshX) items.push(item({ kind: 'line', pts: [at(x, 0), at(x, i.widthM)] }));
  for (const y of plan.meshY) items.push(item({ kind: 'line', pts: [at(0, y), at(i.lengthM, y)] }));
  // Rods and terminals: a 0.3 m square; down conductors: a 0.5 m circle with its number beside it.
  for (const [x, y] of plan.terminals) items.push(item({ kind: 'pline', pts: [at(x - 0.15, y - 0.15), at(x + 0.15, y - 0.15), at(x + 0.15, y + 0.15), at(x - 0.15, y + 0.15)], closed: true }));
  plan.downs.forEach(([x, y], k) => {
    items.push(item({ kind: 'circle', pts: [at(x, y)], r: u(0.25) }));
    items.push(item({ kind: 'text', pts: [at(x + 0.4, y + 0.4)], text: `DC${k + 1}`, h: u(0.4) }));
  });
  return { name: LP_BLOCK, description: 'Lightning protection roof layout (concept), from the Lightning protection study', items, explodable: true };
}

/** Drawings that are a level's plan, the roof's first when a level is named so. */
export function lightningPlanFiles(p: Project): { file: string; label: string }[] {
  const list = plansOf(p).filter((x): x is typeof x & { file: string } => !!x.file).map((x) => ({ file: x.file, label: `${x.label} — ${x.file}` }));
  return [...list.filter((x) => /roof/i.test(x.label)), ...list.filter((x) => !/roof/i.test(x.label))];
}

/** The project with the roof layout block defined (or redefined) in a drawing: inserts of it follow the study. */
export function withLightningBlock(p: Project, file: string): { project: Project; unit: string; assumed: boolean } | undefined {
  if (!p.lightning) return undefined;
  const scale = planScale(p, file, p.cadPlans?.find((x) => x.file.trim().toLowerCase() === file.trim().toLowerCase())?.units);
  const def = lightningRoofBlock(p.lightning, scale.factor);
  return def ? { project: withBlockDef(p, file, def), unit: scale.label, assumed: scale.assumed } : undefined;
}

const sameFile = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface RoofOutline { id: string; layer: string; areaM2: number; pts: [number, number][]; arcs: boolean; /** Its own lower left in the drawing (m). */ origin: [number, number] }
/** Closed outlines the engineer drew over a drawing, in metres from the outline's own lower left, largest first:
 * the roof outline of the risk assessment and its parts are picked from these. A circle counts, as 48 straight
 * sides (a mast or a round tower). A hatch or a revision cloud is not an outline; arc segments are taken as
 * straight (`arcs` says the outline has some). */
export function roofOutlines(p: Project, file: string): RoofOutline[] {
  const items = p.cadSketch?.find((x) => sameFile(x.file, file))?.items ?? [];
  const f = planScale(p, file, p.cadPlans?.find((x) => sameFile(x.file, file))?.units).factor, mm = (v: number) => Math.round(v * 1000) / 1000;
  const round = (x: SketchItem): [number, number][] => Array.from({ length: 48 }, (_, n) => [x.pts[0][0] + x.r! * Math.cos((n * Math.PI) / 24), x.pts[0][1] + x.r! * Math.sin((n * Math.PI) / 24)]);
  return items.filter((x) => (x.kind === 'pline' && x.closed && !x.hatch && !x.cloud && x.pts.length >= 3) || (x.kind === 'circle' && x.pts.length === 1 && (x.r ?? 0) > 0)).map((x) => {
    const at = x.kind === 'circle' ? round(x) : x.pts;
    const x0 = Math.min(...at.map((q) => q[0])), y0 = Math.min(...at.map((q) => q[1]));
    const pts = at.map(([a, b]): [number, number] => [mm((a - x0) * f), mm((b - y0) * f)]);
    return { id: x.id, layer: x.layer, areaM2: Math.round(areaOf(pts).area * 100) / 100, pts, arcs: !!x.bulges?.some((v) => v), origin: [mm(x0 * f), mm(y0 * f)] as [number, number] };
  }).filter((o) => o.areaM2 > 0).sort((a, b) => b.areaM2 - a.areaM2);
}

/** The project with that outline taken as the roof outline of the risk assessment (a copy: take it again after
 * changing the drawing). Parts taken against an earlier outline are dropped: they would no longer line up. */
export function withRoofOutline(p: Project, file: string, id: string): Project | undefined {
  const o = roofOutlines(p, file).find((x) => x.id === id);
  if (!o || !p.lightning) return undefined;
  const { parts: _parts, ...rest } = p.lightning.risk ?? { shape: 'outline' as const };
  return { ...p, lightning: { ...p.lightning, risk: { ...rest, shape: 'outline', outline: o.pts, outlineOrigin: o.origin } } };
}

/** The project with that outline added as a part with its own height (to be entered), placed where it is in the
 * drawing relative to the roof outline. Needs a roof outline taken from the same drawing first. */
export function withRoofPart(p: Project, file: string, id: string): Project | undefined {
  const o = roofOutlines(p, file).find((x) => x.id === id), risk = p.lightning?.risk;
  if (!o || !p.lightning || risk?.shape !== 'outline' || !risk.outline?.length || !risk.outlineOrigin) return undefined;
  const [dx, dy] = [o.origin[0] - risk.outlineOrigin[0], o.origin[1] - risk.outlineOrigin[1]], mm = (v: number) => Math.round(v * 1000) / 1000;
  const outline = o.pts.map(([x, y]): [number, number] => [mm(x + dx), mm(y + dy)]);
  return { ...p, lightning: { ...p.lightning, risk: { ...risk, parts: [...(risk.parts ?? []), { outline }] } } };
}
