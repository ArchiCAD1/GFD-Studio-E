// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import type { Board, Feeder, Project } from '../types';
import type { ColorBy } from '../diagram/heatmap';
import { printableSvg } from '../diagram/exportSvg';

const noop = () => {};
const draw = (project: Project, colorBy: ColorBy) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={project} calcProject={project} results={[]} colorBy={colorBy}
      selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} />
  );
  return host;
};
const root = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1500, sourceImpedancePct: 6, ratedCurrentA: 2500, incomerDevice: 'MCCB-NA', ...extra });
const db = (id: string, upstreamId: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'DB', upstreamId, ratedCurrentA: 100, ...extra });
const way = (id: string, boardId: string, feedsBoardId: string, n: number): Feeder => ({ ...sampleProject.feeders[0], id, boardId, feedsBoardId, way: n });

const boards: Board[] = [
  root('MDB-1'),
  db('EMDB-1', 'MDB-1', { kind: 'EMDB', standby: { kva: 500, changeover: 'ATS' } }),
  db('EDB-1', 'EMDB-1'),
  db('DB-1', 'MDB-1'),
  db('UPS-1', 'MDB-1', { kind: 'UPS', upsKva: 10 }),
  db('DB-X', 'MDB-1', { existing: { recordedKva: 20 } })
];
const feeders: Feeder[] = [
  way('F-EMDB', 'MDB-1', 'EMDB-1', 1), way('F-EDB', 'EMDB-1', 'EDB-1', 1), way('F-DB', 'MDB-1', 'DB-1', 2),
  way('F-UPS', 'MDB-1', 'UPS-1', 3), way('F-X', 'MDB-1', 'DB-X', 4)
];
const project = (): Project =>
  ({ ...sampleProject, boards, feeders, ties: [], earthingPlan: {}, earthPitIds: undefined, drawing: { ...sampleProject.drawing, sldStyle: 'dewa' } });
const attr = (el: Element, a: string) => Number(el.getAttribute(a));
const stroke = (el: Element) => (el as SVGElement).style.stroke;
const fill = (el: Element) => (el as SVGElement).style.fill;

/** The cable of a way: the screen-coloured or plain line that starts 34 below its busbar. */
const cable = (host: HTMLElement, id: string) => {
  const g = host.querySelector(`g.fd[data-lv-id="feeder:${id}"]`)!;
  const lines = [...g.querySelectorAll<SVGLineElement>(':scope > line.ln')];
  const busY = Math.min(...lines.map((l) => attr(l, 'y1'))); // the way's first line starts at its busbar
  return lines.find((l) => attr(l, 'y1') === busY + 34)!;
};
const symOf = (host: HTMLElement, id: string) => host.querySelector(`g.fd[data-lv-id="feeder:${id}"] g.iec[data-sym^="p-"]`)!;

describe('SLD Colour by → Supply', () => {
  const host = draw(project(), 'supply');

  it('colours each cable by the supply of the board it feeds, normal ones in the usual grey', () => {
    for (const [id, c] of [['F-EMDB', 'var(--bad)'], ['F-EDB', 'var(--bad)'], ['F-UPS', 'var(--ph-b)'], ['F-DB', 'var(--mut)']] as const) {
      const l = cable(host, id);
      expect(l.classList.contains('screen-c'), id).toBe(true);
      expect(stroke(l), id).toBe(c);
    }
    const x = cable(host, 'F-X');
    expect(x.classList.contains('screen-c')).toBe(true);
    expect(stroke(x)).toContain('color-mix(');
  });

  it('tints a board symbol on emergency or UPS supply, leaves a normal one as drawn', () => {
    const edb = symOf(host, 'F-EDB');
    expect(edb.getAttribute('class')).toBe('iec screen-c');
    const prims = [...edb.querySelectorAll('path, circle, ellipse, rect')];
    expect(prims.length).toBeGreaterThan(0);
    for (const p of prims) {
      if (p.classList.contains('sym-fill')) expect(fill(p)).toBe('var(--bad)');
      else expect(stroke(p)).toBe('var(--bad)');
    }
    const plain = symOf(host, 'F-DB');
    expect(plain.getAttribute('class')).toBe('iec');
    expect(plain.querySelector('[style*="stroke"]')).toBeNull();
    const ups = host.querySelector('g.bd[data-lv-id="board:UPS-1"] .board-sym g.iec')!;
    expect(ups.getAttribute('class')).toBe('iec screen-c');
    expect(stroke(ups.querySelector('rect')!)).toBe('var(--ph-b)');
    const letters = [...ups.querySelectorAll('text')];
    expect(letters.length).toBeGreaterThan(0);
    for (const t of letters) expect(fill(t)).toBe('var(--ph-b)');
  });

  it('keeps the busbars their own colour', () => {
    const bars = [...host.querySelectorAll<SVGLineElement>('line.bus')];
    expect(bars.length).toBeGreaterThan(0);
    for (const l of bars) expect(l.getAttribute('style') ?? '').not.toMatch(/stroke/);
  });

  it('shows a legend of the four supplies instead of the colour bar', () => {
    const legend = host.querySelector('.heat-legend')!;
    expect(legend.querySelector('b')!.textContent).toBe('Supply');
    expect(legend.querySelector('.heat-bar')).toBeNull();
    expect([...legend.querySelectorAll('.heat-ticks > span')].map((s) => s.textContent)).toEqual(['Normal', 'Emergency', 'UPS', 'Existing']);
  });

  it('draws nothing of it when Colour by is off', () => {
    const off = draw(project(), 'none');
    expect(off.querySelector('.screen-c')).toBeNull();
    expect(off.querySelector('.heat-legend')).toBeNull();
    for (const p of symOf(off, 'F-EDB').querySelectorAll('path, circle, ellipse, rect')) expect(p.getAttribute('style') ?? '').not.toMatch(/stroke:|fill:/);
  });

  it('prints as drawn: no supply colour on the sheet, and the live drawing is left as it was', () => {
    vi.stubGlobal('SVGTextElement', class {}); // not in jsdom
    document.body.appendChild(host);
    const live = host.querySelector('g.fd')!.closest('svg')!;
    const before = live.outerHTML;
    const out = printableSvg(live, 100, 50);
    const after = live.outerHTML;
    expect(after).toBe(before);
    expect(before).toContain('var(--bad)'); // the live drawing does carry it
    for (const c of ['var(--bad)', 'var(--ph-b)', 'color-mix(']) expect(out).not.toContain(c);
    // The same drawing with Colour by off prints the same, apart from the screen-c marks.
    const plain = draw(project(), 'none');
    document.body.appendChild(plain);
    const outPlain = printableSvg(plain.querySelector('g.fd')!.closest('svg')!, 100, 50);
    host.remove();
    plain.remove();
    expect(out.replace(/ screen-c/g, '')).toBe(outPlain);
  });
});
