import { describe, expect, it } from 'vitest';
import { sampleProject as sample } from '../data/sampleProject';
import { finalCircuits, LV_PALETTE, lvItemOf, placedOn, placeItem } from './cadDevices';
import { copyDevices, matchDevice, replaceDevices } from './deviceEdit';
import type { LevelRef } from './levels';
import type { Project } from '../types';

const base: Project = { ...sample, lvPoints: undefined, building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }] }], rooms: [] } };
const level: LevelRef = { building: 'V', level: 'GF' };
const circuit = finalCircuits(base)[0];
const item = (id: string) => LV_PALETTE.find((x) => x.id === id)!;
const count = (p: Project, t: 's13' | 'isol' | 's13t') => p.feeders.find((f) => f.id === circuit.id)!.points?.[t] ?? 0;
const last = (p: Project) => p.lvPoints![p.lvPoints!.length - 1];
const placed = (p: Project) => placedOn(p, level).filter((d) => d.what === 'lv');

describe('points as fitted (floor socket, socket above ceiling, fused isolator)', () => {
  it('a floor socket counts as a 13 A socket and is drawn with its own symbol', () => {
    const p = placeItem(base, item('s13-floor'), level, 1, 1, { feederId: circuit.id }).project;
    expect(last(p)).toMatchObject({ type: 's13', variant: 'floor' });
    expect(count(p, 's13')).toBe(count(base, 's13') + 1);
    expect(placed(p)[0]).toMatchObject({ label: 'Floor socket', symbol: { plan: 'socket-floor' } });
    // A plain socket has no variant.
    expect('variant' in last(placeItem(base, item('s13'), level, 1, 1, { feederId: circuit.id }).project)).toBe(false);
  });

  it('a fused isolator counts as an isolator', () => {
    const p = placeItem(base, item('isol-fused'), level, 1, 1, { feederId: circuit.id }).project;
    expect(last(p)).toMatchObject({ type: 'isol', variant: 'fused' });
    expect(count(p, 'isol')).toBe(count(base, 'isol') + 1);
    expect(placed(p)[0].symbol.plan).toBe('fused-isolator');
  });

  it('finds the item as fitted, else the plain one', () => {
    expect(lvItemOf('s13', 'ceiling')!.id).toBe('s13-ceiling');
    expect(lvItemOf('s13')!.id).toBe('s13');
    expect(lvItemOf('s13t', 'floor')!.id).toBe('s13t');
  });

  it('replace: to a fitting of the same type keeps the count; to another type moves it and drops the fitting', () => {
    const p = placeItem(base, item('s13'), level, 1, 1, { feederId: circuit.id }).project;
    const a = replaceDevices(p, placed(p), 's13-ceiling');
    expect(a.changed).toBe(1);
    expect(last(a.project)).toMatchObject({ type: 's13', variant: 'ceiling' });
    expect(count(a.project, 's13')).toBe(count(p, 's13'));
    expect(replaceDevices(a.project, placed(a.project), 's13-ceiling').changed).toBe(0);
    const b = replaceDevices(a.project, placed(a.project), 's13t');
    expect(last(b.project).type).toBe('s13t');
    expect('variant' in last(b.project)).toBe(false);
    expect(count(b.project, 's13')).toBe(count(p, 's13') - 1);
    expect(count(b.project, 's13t')).toBe(count(p, 's13t') + 1);
    expect(replaceDevices(p, placed(p), 'junction-box').changed).toBe(0);
  });

  it('a copy and a match keep the fitting', () => {
    let p = placeItem(base, item('s13-floor'), level, 1, 1, { feederId: circuit.id }).project;
    p = copyDevices(p, placed(p), 1, 0, level).project;
    expect(last(p)).toMatchObject({ type: 's13', variant: 'floor', x: 2 });
    p = placeItem(p, item('s13'), level, 5, 5, { feederId: circuit.id }).project;
    const [from, , target] = placed(p);
    p = matchDevice(p, from, target, { circuit: false, type: true });
    expect(last(p)).toMatchObject({ type: 's13', variant: 'floor' });
  });
});
