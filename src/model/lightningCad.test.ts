import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { LpsInputs } from '../calc/lightningProtection';
import type { Project } from '../types';
import { blockDefsOf } from './cadBlocks';
import { lightningPlanFiles, lightningRoofBlock, LP_BLOCK, LP_LAYER, roofOutlines, withLightningBlock, withRoofOutline } from './lightningCad';

const study: LpsInputs = { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', meshM: 10, sphereRadiusM: 30, rodHeightM: 3, downSpacingM: 10 };

describe('lightning protection roof layout block', () => {
  it('mesh: roof edge, runs and numbered down conductors, in the drawing\'s units, base at a roof corner', () => {
    const def = lightningRoofBlock(study, 0.001)!;
    expect(def.name).toBe(LP_BLOCK);
    expect(def.items.every((x) => x.layer === LP_LAYER)).toBe(true);
    expect(new Set(def.items.map((x) => x.id)).size).toBe(def.items.length);
    expect(def.items[0]).toMatchObject({ kind: 'pline', closed: true, pts: [[0, 0], [40000, 0], [40000, 25000], [0, 25000]] });
    expect(def.items.filter((x) => x.kind === 'line').length).toBe(5);
    expect(def.items.find((x) => x.kind === 'line')!.pts).toEqual([[10000, 0], [10000, 25000]]);
    const downs = def.items.filter((x) => x.kind === 'circle');
    expect(downs.length).toBe(13);
    expect(downs[0]).toMatchObject({ pts: [[0, 0]], r: 250 });
    expect(def.items.filter((x) => x.kind === 'text').map((x) => x.text)).toEqual(Array.from({ length: 13 }, (_, k) => `DC${k + 1}`));
  });

  it('follows the drawing\'s units', () => {
    const m = lightningRoofBlock(study, 1)!;
    expect(m.items[0].pts[2]).toEqual([40, 25]);
    expect(m.items.find((x) => x.kind === 'text')!.h).toBe(0.4);
  });

  it('rods: one square each', () => {
    const def = lightningRoofBlock({ ...study, method: 'sphere' }, 1)!;
    expect(def.items.filter((x) => x.kind === 'pline').length).toBe(1 + 12);
  });

  it('nothing to draw while the study has data missing', () => {
    expect(lightningRoofBlock({ ...study, meshM: undefined }, 0.001)).toBeUndefined();
    expect(lightningRoofBlock({ ...study, lengthM: 0 }, 0.001)).toBeUndefined();
    expect(lightningRoofBlock(study, 0)).toBeUndefined();
  });

  it('is defined in the chosen drawing, and redefined when the study changes', () => {
    const p: Project = { ...sampleProject, lightning: study, cadPlanUnits: { 'roof.dwg': 'm' } };
    const a = withLightningBlock(p, 'ROOF.dwg')!;
    expect(a.unit).toBe('m');
    expect(a.assumed).toBe(false);
    expect(blockDefsOf(a.project, 'roof.dwg').map((d) => d.name)).toEqual([LP_BLOCK]);
    const b = withLightningBlock({ ...a.project, lightning: { ...study, downSpacingM: 30 } }, 'ROOF.dwg')!;
    const defs = blockDefsOf(b.project, 'ROOF.dwg');
    expect(defs.length).toBe(1);
    expect(defs[0].items.filter((x) => x.kind === 'circle').length).toBe(5);
    expect(withLightningBlock(sampleProject, 'ROOF.dwg')).toBeUndefined();
    expect(withLightningBlock({ ...sampleProject, lightning: study }, 'other.dwg')).toMatchObject({ unit: 'mm', assumed: true });
  });

  it('lists the level plans, none when no drawing is a plan yet', () => {
    expect(lightningPlanFiles({ ...sampleProject, cadPlans: [] })).toEqual([]);
    const building = { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground' as const, heightM: 4 }, { id: 'RF', name: 'Roof', kind: 'roof' as const, heightM: 3 }] }], rooms: [] };
    const files = lightningPlanFiles({ ...sampleProject, building, cadPlans: [{ building: 'V', level: 'GF', file: 'gf.dwg' }, { building: 'V', level: 'RF', file: 'roof.dwg' }] } as Project);
    expect(files.map((x) => x.file)).toEqual(['roof.dwg', 'gf.dwg']);
  });
});

describe('roof outline for the lightning risk assessment', () => {
  // A drawing in millimetres: an L-shaped roof, a smaller closed outline, an open polyline, a hatch and a cloud.
  const L: [number, number][] = [[5000, 2000], [45000, 2000], [45000, 17000], [25000, 17000], [25000, 32000], [5000, 32000]];
  const square: [number, number][] = [[0, 0], [3000, 0], [3000, 3000], [0, 3000]];
  const p: Project = { ...sampleProject, lightning: study, cadSketch: [{ file: 'Roof.dwg', items: [
    { id: 'S1', kind: 'pline', layer: 'A-TANK', pts: square, closed: true },
    { id: 'S2', kind: 'pline', layer: 'A-ROOF', pts: L, closed: true },
    { id: 'S3', kind: 'pline', layer: 'A-ROOF', pts: L },
    { id: 'S4', kind: 'pline', layer: 'A-HATCH', pts: L, closed: true, hatch: { pattern: 'ANSI31' } as never },
    { id: 'S5', kind: 'pline', layer: 'A-REV', pts: L, closed: true, cloud: 500 },
    { id: 'S6', kind: 'pline', layer: 'A-ROOF', pts: square, closed: true, bulges: [0.5, 0, 0, 0] }
  ] }] };

  it('lists the closed outlines in metres from their own corner, largest first; not hatches, clouds or open lines', () => {
    const list = roofOutlines(p, 'roof.dwg');
    expect(list.map((x) => [x.id, x.areaM2, x.layer, x.arcs])).toEqual([['S2', 900, 'A-ROOF', false], ['S1', 9, 'A-TANK', false], ['S6', 9, 'A-ROOF', true]]);
    expect(list[0].pts).toEqual([[0, 0], [40, 0], [40, 15], [20, 15], [20, 30], [0, 30]]);
    expect(roofOutlines(p, 'other.dwg')).toEqual([]);
  });

  it('follows the drawing\'s units', () => {
    expect(roofOutlines({ ...p, cadPlanUnits: { 'roof.dwg': 'm' } }, 'Roof.dwg')[0].areaM2).toBe(900e6);
  });

  it('taking an outline sets the risk assessment to it and keeps its other entries', () => {
    const done = withRoofOutline({ ...p, lightning: { ...study, risk: { shape: 'rectangle', thunderDays: 40 } } }, 'Roof.dwg', 'S2')!;
    expect(done.lightning!.risk).toMatchObject({ shape: 'outline', thunderDays: 40 });
    expect(done.lightning!.risk!.outline).toHaveLength(6);
    expect(withRoofOutline(p, 'Roof.dwg', 'S3')).toBeUndefined();
    expect(withRoofOutline({ ...p, lightning: undefined }, 'Roof.dwg', 'S2')).toBeUndefined();
  });
});
