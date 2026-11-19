import { scheduleCircuits } from '../calc/loadSchedule';
import { selectCableRuns } from '../calc/electrical';
import type { Feeder, Project, SpareWay } from '../types';
import { addOutgoingFeeder } from './mdFeeders';
import { addCircuit } from './schedule';
import { deleteSpareWay, isDbBoard, spareLabel, spareRef, spareWaysOf } from './spareWays';

export interface WayConversionResult {
  project: Project;
  message: string;
  /** The active circuit / feeder that replaced the spare or space. */
  id?: string;
}

/** The retained spare breaker (or the breaker planned for a space) needs a
 * cable it can protect. The new circuit stays at zero load until the engineer
 * enters what it supplies, so converting a way does not silently add demand. */
function withPlannedWay(project: Project, feeder: Feeder, way: SpareWay): Feeder {
  const cores = way.phase === 'RYB' ? 4 : 2;
  const cable = selectCableRuns(
    0,
    feeder.lengthM,
    project.voltageV,
    cores,
    feeder.powerFactor,
    project.ambientC,
    100,
    way.ratingA
  );
  return {
    ...feeder,
    loadKw: 0,
    cores,
    breakerRatingA: way.ratingA,
    breakerIcuKa: way.icuKa ?? feeder.breakerIcuKa,
    ...(way.device ? { device: way.device, ...(way.device !== 'ISOL' ? { breakerType: way.device } : {}) } : {}),
    cableCsaMm2: cable?.csaMm2 ?? feeder.cableCsaMm2,
    parallel: cable && cable.runs > 1 ? cable.runs : undefined,
    cpcMm2: undefined,
    manualSize: true,
    ...(way.remarks ? { remarks: way.remarks } : {})
  };
}

const replaceFeeder = (project: Project, feeder: Feeder): Project => ({
  ...project,
  feeders: project.feeders.map((f) => (f.id === feeder.id ? feeder : f))
});

/** Replaces a spare / space with an active circuit. A DB keeps the exact
 * phase + way reference; a feeder panel gets a zero-load outgoing feeder with
 * the planned SP / TP poles and protection. */
export function convertSpareWay(project: Project, boardId: string, wayId: string): WayConversionResult {
  const board = project.boards.find((b) => b.id === boardId);
  const way = board && spareWaysOf(board).find((w) => w.id === wayId);
  if (!board || !way) return { project, message: 'That spare / space is no longer on the board' };

  const what = spareLabel(way).toLowerCase();
  const ref = spareRef(way);
  if (isDbBoard(board)) {
    if (!way.way) return { project, message: `${boardId}: ${what} has no load-schedule way` };
    const occupied = scheduleCircuits(project, boardId).some((f) =>
      f.way === way.way && (f.phase === 'RYB' || way.phase === 'RYB' || f.phase === way.phase));
    if (occupied) return { project, message: `${boardId}: ${ref} is already occupied by a circuit` };

    const without = deleteSpareWay(project, boardId, way.id).project;
    const added = addCircuit(without, boardId, way.phase, way.way);
    const feeder = added.project.feeders.find((f) => f.id === added.id)!;
    const next = replaceFeeder(added.project, withPlannedWay(added.project, feeder, way));
    return { project: next, id: added.id, message: `Converted ${what} ${ref} to circuit ${ref} on ${boardId} — enter its load points` };
  }

  const without = deleteSpareWay(project, boardId, way.id).project;
  const added = addOutgoingFeeder(without, boardId);
  if (!added.id) return { project, message: added.message };
  const feeder = added.project.feeders.find((f) => f.id === added.id)!;
  const converted = withPlannedWay(added.project, {
    ...feeder,
    name: way.remarks?.trim() || feeder.name
  }, way);
  return {
    project: replaceFeeder(added.project, converted),
    id: added.id,
    message: `Converted ${what} on ${boardId} to circuit ${added.id} — enter its load and cable length`
  };
}
