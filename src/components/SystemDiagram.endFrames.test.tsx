// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram, { sldLayout } from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import type { Board, Feeder, Project } from '../types';
import { textWidth } from '../diagram/panelLabels';
import { LEAF_W } from '../diagram/layout';
import { DEFAULT_LAYERS } from '../diagram/annotations';

const noop = () => {};
const draw = (project: Project, location = false) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={project} calcProject={project} results={[]} layers={location ? { ...DEFAULT_LAYERS, location: true } : undefined}
      selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} />
  );
  return host;
};
/** A main board on a transformer; a UPS board and a fire pump panel with no outgoing ways (end boards); an SMDB. */
const boards: Board[] = [
  { id: 'MDB-1', name: 'MDB-1', kind: 'MDB', sourceKva: 1500, sourceImpedancePct: 6, ratedCurrentA: 2500, incomerDevice: 'MCCB-NA' },
  { id: 'UPS-1', name: 'UPS-1', kind: 'UPS', upstreamId: 'MDB-1', upsKva: 40 },
  { id: 'FP-1', name: 'FP-1', kind: 'FP', upstreamId: 'MDB-1' },
  { id: 'SMDB-1', name: 'SMDB-1', kind: 'SMDB', upstreamId: 'MDB-1', ratedCurrentA: 250 }
];
const way = (id: string, feeds?: string, boardId = 'MDB-1'): Feeder => ({
  id, boardId, name: id, loadKw: feeds ? 0 : 15, demandFactor: 1, powerFactor: 0.9, lengthM: 30,
  cableCsaMm2: 25, cores: 4, breakerRatingA: 63, breakerIcuKa: 36, breakerType: 'MCCB', feedsBoardId: feeds
});
/** MDB-1 with these ways, and only the boards they feed. */
const project = (feeders: Feeder[], style: 'dewa' | 'standard' = 'dewa'): Project => {
  const fed = new Set(feeders.map((f) => f.feedsBoardId));
  return {
    ...sampleProject, boards: boards.filter((b) => !b.upstreamId || fed.has(b.id)), feeders, ties: [], earthingPlan: {}, earthPitIds: undefined,
    drawing: { ...sampleProject.drawing, sldStyle: style }
  };
};
const n = (el: Element, a: string) => Number(el.getAttribute(a));
const board = (host: HTMLElement, id: string) => host.querySelector<SVGGElement>(`g.bd[data-lv-id="board:${id}"]`)!;
interface Box { x1: number; y1: number; x2: number; y2: number }
/** A board's dashed panel frame. */
const frame = (host: HTMLElement, id: string): Box => {
  const r = board(host, id).querySelector('.panel-frame > rect.frame-ln')!;
  return { x1: n(r, 'x'), y1: n(r, 'y'), x2: n(r, 'x') + n(r, 'width'), y2: n(r, 'y') + n(r, 'height') };
};
/** The box round each text of a board, generously (12 px bold, its largest font). */
const textBoxes = (host: HTMLElement, id: string) => [...board(host, id).querySelectorAll<SVGTextElement>('text')].map((t) => {
  const w = textWidth(t.textContent!, 12, true), x = n(t, 'x'), anchor = t.getAttribute('text-anchor');
  const x1 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return { text: t.textContent!, x1, x2: x1 + w, y1: n(t, 'y') - 12, y2: n(t, 'y') + 3 };
});
const meet = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
/** Where a way drops from its busbar. */
const wayX = (p: Project, id: string) => sldLayout(p, p.drawing?.sldStyle === 'dewa').layout.feeders.find((f) => f.feeder.id === id)!.x;

describe('SLD end boards beside each other (DEWA panel frames)', () => {
  it('moves the second of two end boards on neighbouring ways clear: frames apart, no text of one in the other\'s frame', () => {
    const p = project([way('W-UPS', 'UPS-1'), way('W-FP', 'FP-1')]);
    const host = draw(p);
    const ups = frame(host, 'UPS-1'), fp = frame(host, 'FP-1');
    expect(meet({ ...ups, x1: -Infinity, x2: Infinity }, fp)).toBe(true); // one level: the frames share a band
    // The usual gap between neighbouring frames (2 × FRAME_INSET ≈ 17.7), and no more.
    expect(fp.x1 - ups.x2).toBeGreaterThanOrEqual(17);
    expect(fp.x1 - ups.x2).toBeLessThan(18);
    for (const t of textBoxes(host, 'UPS-1')) expect(meet(t, fp), `UPS-1: ${t.text}`).toBe(false);
    for (const t of textBoxes(host, 'FP-1')) expect(meet(t, ups), `FP-1: ${t.text}`).toBe(false);
    // The first stays where it was; the standard style (no frames) keeps one slot between them.
    expect(wayX(p, 'W-UPS')).toBe(wayX(project([way('W-UPS', 'UPS-1'), way('L1')]), 'W-UPS'));
    const plain = project([way('W-UPS', 'UPS-1'), way('W-FP', 'FP-1')], 'standard');
    expect(wayX(plain, 'W-FP') - wayX(plain, 'W-UPS')).toBe(LEAF_W);
  });

  it('keeps an end board and a framed panel beside it clear of each other, either way round', () => {
    const loads = [way('S1', undefined, 'SMDB-1'), way('S2', undefined, 'SMDB-1')];
    for (const ways of [[way('W-S', 'SMDB-1'), way('W-UPS', 'UPS-1')], [way('W-UPS', 'UPS-1'), way('W-S', 'SMDB-1')]]) {
      const p = project([...ways, ...loads]);
      const host = draw(p);
      const [a, b] = ways.map((w) => frame(host, w.feedsBoardId!));
      expect(b.x1 - a.x2, ways.map((w) => w.id).join(', ')).toBeGreaterThanOrEqual(17);
      expect(wayX(p, 'S2') - wayX(p, 'S1')).toBe(LEAF_W); // a panel moves as a whole
    }
  });

  it('moves nothing where the frames clear each other already: a load between two end boards, or after one', () => {
    const p = project([way('W-UPS', 'UPS-1'), way('L1'), way('W-FP', 'FP-1')]);
    expect(wayX(p, 'L1') - wayX(p, 'W-UPS')).toBe(LEAF_W);
    expect(wayX(p, 'W-FP') - wayX(p, 'L1')).toBe(LEAF_W);
    const host = draw(p);
    expect(frame(host, 'FP-1').x1 - frame(host, 'UPS-1').x2).toBeGreaterThanOrEqual(17);
  });

  it('makes room for the Level and room line while it is shown', () => {
    const p0 = project([way('W-UPS', 'UPS-1'), way('W-FP', 'FP-1')]);
    const p: Project = { ...p0, boards: p0.boards.map((b) => (b.id === 'UPS-1' ? { ...b, location: 'Ground floor UPS and battery room' } : b)) };
    const hidden = draw(p), shown = draw(p, true);
    expect(frame(shown, 'UPS-1').x2).toBeGreaterThan(frame(hidden, 'UPS-1').x2);
    for (const host of [hidden, shown]) {
      expect(frame(host, 'FP-1').x1 - frame(host, 'UPS-1').x2).toBeGreaterThanOrEqual(17);
      expect(frame(host, 'FP-1').x1 - frame(host, 'UPS-1').x2).toBeLessThan(18);
    }
  });
});
