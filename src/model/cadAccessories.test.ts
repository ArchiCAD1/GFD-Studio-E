import { describe, expect, it } from 'vitest';
import { sampleProject as sample } from '../data/sampleProject';
import { buildBom } from '../calc/bom';
import { finalCircuits, LV_PALETTE, moveItem, placeAccessory, placedOn, placeItem, removeItem, rotateAccessories } from './cadDevices';
import { copyDevices, editsFor, typeOf } from './deviceEdit';
import { deviceRows } from './cadExports';
import type { LevelRef } from './levels';
import type { Project } from '../types';

const base: Project = { ...sample, lvPoints: undefined, building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }] }], rooms: [] } };
const level: LevelRef = { building: 'V', level: 'GF' };
const circuit = finalCircuits(base)[0];
const item = (id: string) => LV_PALETTE.find((x) => x.id === id)!;
const points = (p: Project) => JSON.stringify(p.feeders.map((f) => f.points));

describe('accessories on the plan (switches, boxes)', () => {
  it('a switch is placed with no load: the circuit counts do not change, the circuit it controls is kept', () => {
    const { project, message } = placeItem(base, item('switch'), level, 3, 4, { feederId: circuit.id, rot: 90 });
    expect(message).toBe('Switch placed');
    expect(project.cadAccessories).toEqual([{ id: 'A1', type: 'switch', buildingId: 'V', levelId: 'GF', x: 3, y: 4, rot: 90, feederId: circuit.id }]);
    expect(points(project)).toBe(points(base));
    expect(project.lvPoints).toBeUndefined();
    const [d] = placedOn(project, level).filter((x) => x.what === 'acc');
    expect(d).toMatchObject({ key: 'acc:A1', what: 'acc', label: 'Switch', rot: 90, symbol: { plan: 'switch' } });
    expect(d.detail).toContain(circuit.boardId);
  });

  it('a box takes no circuit, and a circuit that is not the project\'s is not kept', () => {
    const box = placeItem(base, item('junction-box'), level, 1, 1, { feederId: circuit.id }).project;
    expect('feederId' in box.cadAccessories![0]).toBe(false);
    expect('feederId' in placeAccessory(base, level, 'switch', 1, 1, { feederId: 'gone' }).project.cadAccessories![0]).toBe(false);
    expect(() => placeAccessory(base, level, 'nothing', 1, 1)).toThrow();
  });

  it('moves, turns, copies and deletes; a deleted number is not given out again', () => {
    let p = placeAccessory(base, level, 'dimmer', 1, 1, { feederId: circuit.id }).project;
    const it0 = () => placedOn(p, level).find((x) => x.key === 'acc:A1')!;
    expect(typeOf(p, it0())).toBe('dimmer');
    expect(editsFor(p, [it0()])).toEqual(['move', 'copy', 'delete']);
    p = moveItem(p, it0(), 5, 6, level);
    expect(p.cadAccessories![0]).toMatchObject({ x: 5, y: 6 });
    p = rotateAccessories(p, ['A1'], 180);
    expect(p.cadAccessories![0].rot).toBe(180);
    const copied = copyDevices(p, [it0()], 1, 0, level);
    expect(copied.copied).toBe(1);
    expect(copied.project.cadAccessories![1]).toMatchObject({ id: 'A2', type: 'dimmer', x: 6, y: 6, rot: 180, feederId: circuit.id });
    p = removeItem(copied.project, placedOn(copied.project, level).find((x) => x.key === 'acc:A2')!);
    expect(p.cadAccessories!.map((d) => d.id)).toEqual(['A1']);
    expect(placeAccessory(p, level, 'switch', 0, 0).id).toBe('A3');
    p = removeItem(p, it0());
    expect(p.cadAccessories).toBeUndefined();
    expect(points(p)).toBe(points(base));
  });

  it('is listed in the device export and counted in the BOQ by type', () => {
    let p = placeAccessory(base, level, 'switch', 1, 1).project;
    p = placeAccessory(p, level, 'switch', 2, 1).project;
    p = placeAccessory(p, level, 'pull-box', 3, 1).project;
    expect(deviceRows(placedOn(p, level).filter((x) => x.what === 'acc')).map((r) => [r[0], r[1]])).toEqual([['Accessory', 'Pull box'], ['Accessory', 'Switch'], ['Accessory', 'Switch']]);
    const lines = buildBom(p).filter((x) => x.key.startsWith('acc:'));
    expect(lines.map((x) => [x.key, x.qty]).sort()).toEqual([['acc:pull-box', 1], ['acc:switch', 2]]);
    expect(lines.find((x) => x.key === 'acc:switch')!.description).toContain('Switch');
    expect(buildBom(base).some((x) => x.key.startsWith('acc:'))).toBe(false);
  });
});
