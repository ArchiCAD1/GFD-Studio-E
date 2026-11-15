import { describe, expect, it } from 'vitest';
import { applySetupManaged, copyManaged, deleteManaged, managerRows, moveManaged, renameManaged, type ManagerCtx } from './cadLayoutManager';
import { drawingLayoutsOf, newDrawingLayout, withDrawingLayouts } from '../../model/drawingLayouts';
import { newLayout } from './CadLayouts';
import type { FileLayout } from '../../engines/cad/cadEngine';
import type { DrawingSet } from '../../model/drawingSet';
import { newProject } from '../../types';
import type { Project } from '../../types';

const gf = { buildingId: 'V', levelId: 'GF', name: 'Ground floor' };
const ctx: ManagerCtx = { file: 'Villa.dwg', fileNames: ['A1 Lighting'], lv: gf };
const file = { name: 'A1 Lighting', tab: 1, paper: [841, 594], margins: [0, 0, 0, 0], at: [0, 0], mm_per_unit: 1, viewports: [{ x: 0, y: 0, w: 100, h: 100, cx: 0, cy: 0, vh: 100, on: true }, { x: 0, y: 0, w: 100, h: 100, cx: 0, cy: 0, vh: 500, on: true }], origin: [0, 0], segs: new Float32Array(0), segColors: new Uint32Array(0), segLayers: new Uint16Array(0), texts: [], layers: [] } as unknown as FileLayout;
const dl = (name: string) => newDrawingLayout(name, [0, 0, 10000, 5000], 1);
const empty = { sheets: [] } as unknown as DrawingSet;

/** A project with two layouts made here (Layout2, Layout3) and two plan sheets (lighting, power) of the ground floor. */
function setup(): Project {
  const a = newLayout(empty, gf, 'lighting'), b = newLayout(a.set, gf, 'power');
  const p = { ...newProject('Villa'), drawingSet: b.set, plot: { setups: [{ id: 'n1', name: 'A1 office', size: 'A1', scale: 50, plot: { pens: 'draft' } }] } } as unknown as Project;
  return withDrawingLayouts(p, ctx.file, [dl('Layout2'), dl('Layout3')]);
}
const ids = (p: Project) => [...drawingLayoutsOf(p, ctx.file).map((l) => `dwg:${l.name}`), ...p.drawingSet!.sheets.map((s) => s.id)];

describe('layout manager rows', () => {
  it('lists the file\'s own layouts, the ones made here, then the plan sheets, with paper, what they show and page setup', () => {
    const p = setup(), s = p.drawingSet!.sheets;
    const named = { ...p, drawingSet: { ...p.drawingSet!, sheets: [s[0], { ...s[1], plot: { named: 'n1' } }] } } as Project;
    expect(managerRows(named, ctx, [file], 1)).toEqual([
      { id: 'file:A1 Lighting', kind: 'file', name: 'A1 Lighting', paper: 'A1 landscape', shows: '2 viewports at 1:1, 1:5', setup: 'Paper only' },
      { id: 'dwg:Layout2', kind: 'drawing', name: 'Layout2', paper: 'A3 landscape', shows: '1 viewport at 1:25', setup: 'Paper only' },
      { id: 'dwg:Layout3', kind: 'drawing', name: 'Layout3', paper: 'A3 landscape', shows: '1 viewport at 1:25', setup: 'Paper only' },
      { id: s[0].id, kind: 'sheet', name: 'E-LTG-001 — Ground floor · Lighting layout', paper: 'auto', shows: 'Lighting layout · 1:100', setup: "Set's default" },
      { id: s[1].id, kind: 'sheet', name: 'E-PWR-001 — Ground floor · Power layout', paper: 'auto', shows: 'Power layout · 1:100', setup: 'A1 office' }
    ]);
    const own = { ...p, drawingSet: { ...p.drawingSet!, sheets: [{ ...s[0], plot: { pens: 'draft' } }, { ...s[1], plot: { named: 'gone' } }] } } as Project;
    expect(managerRows(own, ctx, [], 1).filter((r) => r.kind === 'sheet').map((r) => r.setup)).toEqual(['Its own', 'Its own']);
  });

  it('says no viewports for a layout with none, and shows no sheets without a level', () => {
    const p = withDrawingLayouts(setup(), ctx.file, [{ name: 'Layout2', paper: [500, 300], viewports: [] }]);
    expect(managerRows(p, { ...ctx, lv: undefined }, [], 1)).toEqual([{ id: 'dwg:Layout2', kind: 'drawing', name: 'Layout2', paper: '500 × 300 mm', shows: 'no viewports', setup: 'Paper only' }]);
  });
});

describe('layout manager actions', () => {
  it('renames a layout made here (its id follows), refusing an empty name and one another layout has', () => {
    const p = setup();
    const ok = renameManaged(p, ctx, 'dwg:Layout2', '  Ground floor ');
    expect(ok).toMatchObject({ id: 'dwg:Ground floor' });
    expect(drawingLayoutsOf((ok as { project: Project }).project, ctx.file).map((l) => l.name)).toEqual(['Ground floor', 'Layout3']);
    expect(renameManaged(p, ctx, 'dwg:Layout2', 'layout2')).toMatchObject({ id: 'dwg:layout2' }); // its own name in another case
    expect(renameManaged(p, ctx, 'dwg:Layout2', '  ')).toEqual({ error: 'Type a name for the layout.' });
    expect(renameManaged(p, ctx, 'dwg:Layout2', 'LAYOUT3')).toEqual({ error: 'There is a layout "LAYOUT3" already.' });
    expect(renameManaged(p, ctx, 'dwg:Layout2', 'a1 lighting')).toEqual({ error: 'There is a layout "a1 lighting" already.' });
  });

  it('renames a plan sheet by its title, not the file\'s own layout', () => {
    const p = setup(), sid = p.drawingSet!.sheets[0].id;
    const r = renameManaged(p, ctx, sid, ' Lights ') as { project: Project; id: string };
    expect(r.id).toBe(sid);
    expect(r.project.drawingSet!.sheets.map((s) => s.title)).toEqual(['Lights', 'Ground floor · Power layout']);
    expect(renameManaged(p, ctx, sid, '')).toEqual({ error: 'Type a title for the sheet.' });
    expect('error' in renameManaged(p, ctx, 'file:A1 Lighting', 'X')).toBe(true);
  });

  it('copies layouts of both kinds in list order and skips the file\'s own', () => {
    const p = setup(), sid = p.drawingSet!.sheets[0].id;
    const r = copyManaged(p, ctx, [sid, 'file:A1 Lighting', 'dwg:Layout3', 'dwg:Layout2']);
    expect(r.made).toEqual(['Layout1', 'Layout4', 'E-LTG-002']);
    expect(drawingLayoutsOf(r.project, ctx.file).map((l) => l.name)).toEqual(['Layout2', 'Layout3', 'Layout1', 'Layout4']);
    expect(r.project.drawingSet!.sheets.map((s) => s.number)).toEqual(['E-LTG-001', 'E-LTG-002', 'E-PWR-001']);
    expect(copyManaged(p, ctx, ['file:A1 Lighting'])).toEqual({ project: p, made: [] });
  });

  it('moves a layout made here, and a plan sheet, a place; not past the ends, not the file\'s own', () => {
    const p = setup(), [a, b] = p.drawingSet!.sheets.map((s) => s.id);
    expect(drawingLayoutsOf(moveManaged(p, ctx, 'dwg:Layout3', -1)!, ctx.file).map((l) => l.name)).toEqual(['Layout3', 'Layout2']);
    expect(drawingLayoutsOf(moveManaged(p, ctx, 'dwg:Layout2', 1)!, ctx.file).map((l) => l.name)).toEqual(['Layout3', 'Layout2']);
    expect(moveManaged(p, ctx, 'dwg:Layout2', -1)).toBeUndefined();
    expect(moveManaged(p, ctx, 'dwg:Layout3', 1)).toBeUndefined();
    expect(moveManaged(p, ctx, b, -1)!.drawingSet!.sheets.map((s) => s.id)).toEqual([b, a]);
    expect(moveManaged(p, ctx, a, -1)).toBeUndefined();
    expect(moveManaged(p, ctx, 'file:A1 Lighting', 1)).toBeUndefined();
  });

  it('deletes layouts of both kinds in one change, the sheet with its layout, and skips the file\'s own', () => {
    const p = setup(), [a] = p.drawingSet!.sheets.map((s) => s.id);
    const r = deleteManaged(p, ctx, ['dwg:Layout2', a, 'file:A1 Lighting']);
    expect(r.gone).toEqual(['Layout2', 'E-LTG-001 Ground floor · Lighting layout']);
    expect(ids(r.project)).toEqual(['dwg:Layout3', p.drawingSet!.sheets[1].id]);
    expect(ids(deleteManaged(p, ctx, ['dwg:Layout2', 'dwg:Layout3']).project)).toEqual(p.drawingSet!.sheets.map((s) => s.id));
    expect(deleteManaged(p, ctx, ['file:A1 Lighting'])).toEqual({ project: p, gone: [] });
  });

  it('gives a named page setup to the plan sheets and counts the layouts that have their paper only as skipped', () => {
    const p = setup(), [a, b] = p.drawingSet!.sheets.map((s) => s.id);
    const r = applySetupManaged(p, ctx, 'n1', [a, 'dwg:Layout2', 'file:A1 Lighting']);
    expect([r.applied, r.skipped]).toEqual([1, 2]);
    expect(r.project.drawingSet!.sheets.map((s) => [s.id, s.size, s.plot?.named])).toEqual([[a, 'A1', 'n1'], [b, 'auto', undefined]]);
    expect(applySetupManaged(p, ctx, 'n1', ['dwg:Layout3'])).toMatchObject({ applied: 0, skipped: 1 });
  });
});
