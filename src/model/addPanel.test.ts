import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { addPanel, BOARD_RATING, buildPanel } from './addPanel';

describe('addPanel', () => {
  it('makes a DB with exactly that id under an existing board, with its incomer feeder on the parent', () => {
    const p = addPanel(sampleProject, 'DB-NEW', 'DB', 'SMDB-GF');
    const b = p.boards.find((x) => x.id === 'DB-NEW')!;
    expect(b).toMatchObject({ id: 'DB-NEW', name: 'DB-NEW', kind: 'DB', upstreamId: 'SMDB-GF', ratedCurrentA: BOARD_RATING.DB });
    const inc = p.feeders.find((f) => f.feedsBoardId === 'DB-NEW')!;
    expect(inc).toMatchObject({ id: 'INC-DB-NEW', boardId: 'SMDB-GF', breakerRatingA: 63 });
    expect(inc.cableCsaMm2).toBeGreaterThan(0);
    expect(p.boards).toHaveLength(sampleProject.boards.length + 1);
    expect(sampleProject.boards.some((x) => x.id === 'DB-NEW')).toBe(false);
  });

  it('makes a new supply when there is no parent', () => {
    const { project, board, incomer } = buildPanel(sampleProject, 'MDB-2', 'MDB');
    expect(board.upstreamId).toBeUndefined();
    expect(board.supply).toBeDefined();
    expect(incomer).toBeUndefined();
    expect(project.feeders).toBe(sampleProject.feeders);
  });

  it('refuses an id that is taken or empty, and a parent that is not there', () => {
    expect(() => addPanel(sampleProject, 'MDB-1', 'MDB')).toThrow('already exists');
    expect(() => addPanel(sampleProject, 'INC-FF', 'DB')).toThrow('already exists');
    expect(() => addPanel(sampleProject, ' ', 'DB')).toThrow('empty');
    expect(() => addPanel(sampleProject, 'DB-X', 'DB', 'NOPE')).toThrow('not in the project');
  });
});
