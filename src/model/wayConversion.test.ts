import { describe, expect, it } from 'vitest';
import { scheduleCircuits } from '../calc/loadSchedule';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { addSpareWay, isDbBoard, spareWaysOf, updateSpareWay } from './spareWays';
import { convertSpareWay } from './wayConversion';

const boardOf = (project: Project, id: string) => project.boards.find((b) => b.id === id)!;
const db = sampleProject.boards.find((b) => isDbBoard(b) && scheduleCircuits(sampleProject, b.id).length)!;
const panel = sampleProject.boards.find((b) => !isDbBoard(b) && b.upstreamId)!;

describe('convert spare / space to circuit', () => {
  it('keeps a DB spare in the same phase and way with its planned breaker', () => {
    const added = addSpareWay(sampleProject, db.id, 'spare', 'RYB');
    const planned = updateSpareWay(added.project, db.id, added.id!, { ratingA: 40, icuKa: 15, remarks: 'future kitchen' });
    const way = spareWaysOf(boardOf(planned, db.id))[0];

    const converted = convertSpareWay(planned, db.id, way.id);
    const feeder = converted.project.feeders.find((f) => f.id === converted.id)!;
    expect(spareWaysOf(boardOf(converted.project, db.id))).toHaveLength(0);
    expect(feeder).toMatchObject({ phase: way.phase, way: way.way, breakerRatingA: 40, breakerIcuKa: 15, loadKw: 0, cores: 4, manualSize: true, remarks: 'future kitchen' });
    expect(converted.message).toContain(`circuit RYB${way.way}`);
  });

  it('turns a panel space into a zero-load feeder with its planned poles, device and protected cable', () => {
    const added = addSpareWay(sampleProject, panel.id, 'space', 'R');
    const planned = updateSpareWay(added.project, panel.id, added.id!, { ratingA: 63, device: 'MCCB', icuKa: 25, remarks: 'Future FCU' });
    const before = planned.feeders.filter((f) => f.boardId === panel.id).length;

    const converted = convertSpareWay(planned, panel.id, added.id!);
    const feeder = converted.project.feeders.find((f) => f.id === converted.id)!;
    expect(spareWaysOf(boardOf(converted.project, panel.id))).toHaveLength(0);
    expect(converted.project.feeders.filter((f) => f.boardId === panel.id)).toHaveLength(before + 1);
    expect(feeder).toMatchObject({ name: 'Future FCU', loadKw: 0, cores: 2, breakerRatingA: 63, breakerIcuKa: 25, device: 'MCCB', manualSize: true });
    expect(feeder.cableCsaMm2).toBeGreaterThanOrEqual(10);
  });

  it('does nothing when the way no longer exists', () => {
    const converted = convertSpareWay(sampleProject, panel.id, 'missing');
    expect(converted.project).toBe(sampleProject);
    expect(converted.id).toBeUndefined();
  });
});
