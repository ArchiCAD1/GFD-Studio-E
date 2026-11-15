import { describe, expect, it } from 'vitest';
import { sampleProject as sample } from '../data/sampleProject';
import { finalCircuits, LV_PALETTE, placedOn, placeItem, placeLvPoint, rightAngle, rotateLvPoints } from './cadDevices';
import { copyDevices } from './deviceEdit';
import type { LevelRef } from './levels';
import type { Project } from '../types';

const sampleProject: Project = { ...sample, lvPoints: undefined, building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }] }], rooms: [] } };
const level = (): LevelRef => ({ building: 'V', level: 'GF' });
const last = (p: Project) => p.lvPoints![p.lvPoints!.length - 1];
const circuit = () => finalCircuits(sampleProject)[0].id;
const socket = LV_PALETTE.find((x) => x.id === 's13')!, light = LV_PALETTE.find((x) => x.id === 'ltg')!;

describe('rotation of placed points', () => {
  it('keeps right angles only', () => {
    expect([0, 90, 180, 270, 360, -90, 100, undefined].map(rightAngle)).toEqual([0, 90, 180, 270, 0, 270, 90, 0]);
  });

  it('a socket is placed turned; a light (no wall side) is not, and 0° is not kept', () => {
    const a = placeItem(sampleProject, socket, level(), 1, 1, { feederId: circuit(), rot: 90 }).project;
    expect(last(a).rot).toBe(90);
    expect(placedOn(a, level()).find((d) => d.id === last(a).id)!.rot).toBe(90);
    const b = placeItem(sampleProject, light, level(), 1, 1, { feederId: circuit(), rot: 90 }).project;
    expect('rot' in last(b)).toBe(false);
    const c = placeItem(sampleProject, socket, level(), 1, 1, { feederId: circuit(), rot: 0 }).project;
    expect('rot' in last(c)).toBe(false);
  });

  it('turns placed points, back to 0° too, and leaves the circuit counts alone', () => {
    const { project: p, id } = placeLvPoint(sampleProject, level(), 's13', circuit(), 2, 2);
    const turned = rotateLvPoints(p, [id], 180);
    expect(turned.lvPoints!.find((d) => d.id === id)!.rot).toBe(180);
    expect(turned.feeders).toBe(p.feeders);
    expect('rot' in rotateLvPoints(turned, [id], 0).lvPoints!.find((d) => d.id === id)!).toBe(false);
  });

  it('a copy keeps the rotation', () => {
    const { project: p, id } = placeLvPoint(sampleProject, level(), 's13', circuit(), 2, 2, undefined, undefined, 270);
    const it0 = placedOn(p, level()).find((d) => d.id === id)!;
    const { project } = copyDevices(p, [it0], 1, 0, level());
    expect(last(project).rot).toBe(270);
  });
});
