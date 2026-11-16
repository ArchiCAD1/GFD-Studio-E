// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import type { Board, Feeder, Project } from '../types';
import { textWidth } from '../diagram/panelLabels';
import { printableSvg } from '../diagram/exportSvg';

const noop = () => {};
const draw = (project: Project) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={project} calcProject={project} results={[]}
      selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} />
  );
  return host;
};
const root = (id: string, extra: Partial<Board> = {}): Board => ({ id, name: id, kind: 'MDB', sourceKva: 1500, sourceImpedancePct: 6, ratedCurrentA: 2500, incomerDevice: 'MCCB-NA', ...extra });
const project = (boards: Board[], feeders: Feeder[] = [], style: 'dewa' | 'standard' = 'dewa'): Project =>
  ({ ...sampleProject, boards, feeders, ties: [], earthingPlan: {}, earthPitIds: undefined, drawing: { ...sampleProject.drawing, sldStyle: style } });
const n = (el: Element, a: string) => Number(el.getAttribute(a));
const board = (host: HTMLElement, id: string) => host.querySelector<SVGGElement>(`g.bd[data-lv-id="board:${id}"]`)!;
const texts = (g: Element) => [...g.querySelectorAll('text')].map((t) => t.textContent);

/** The board symbol of a board: its group, the outline, the centre x and where its lead-in starts (the symbol's top). */
const symOf = (g: Element) => {
  const el = g.querySelector<SVGGElement>('.board-sym g.iec[data-sym]')!;
  const outline = el.querySelector<SVGRectElement>('rect')!;
  return { el, id: el.getAttribute('data-sym'), outline, x: n(el, 'data-sym-x'), top: n(el, 'data-sym-y') - 16 * n(el, 'data-sym-s') };
};

describe('SLD board with no outgoing ways', () => {
  for (const style of ['dewa', 'standard'] as const) {
    it(`ends the incomer on a board symbol with its name, kind and tags beside it (${style})`, () => {
      const host = draw(project([root('MDB-6')], [], style));
      const g = board(host, 'MDB-6');
      const sym = symOf(g);
      const bottom = n(sym.outline, 'y') + n(sym.outline, 'height');
      expect(sym.id).toBe('p-mdb');
      // The outline is 2:1.
      expect(n(sym.outline, 'width') / n(sym.outline, 'height')).toBeCloseTo(2, 1);
      // The incomer comes down to where the symbol's lead-in starts; nothing hangs below the symbol.
      const incomer = [...host.querySelectorAll<SVGLineElement>('g.tx line.ln')].filter((l) => n(l, 'x1') === sym.x && n(l, 'x2') === sym.x);
      expect(Math.max(...incomer.map((l) => n(l, 'y2')))).toBe(sym.top);
      for (const l of g.querySelectorAll<SVGLineElement>(':scope > line')) expect(n(l, 'y1')).toBeLessThan(bottom);
      // No square, busbar or marks of its own: the symbol is the whole drawing.
      expect(g.querySelector('.board-sym rect.box')).toBeNull();
      expect(g.querySelectorAll('.board-sym > path, .board-sym > line').length).toBe(0);
      expect(texts(g)).toEqual(expect.arrayContaining(['MDB-6', 'MDB', 'NO OUTGOING WAYS']));
      // Every text is right of the symbol, none inside it.
      for (const t of g.querySelectorAll<SVGTextElement>('text')) {
        if (t.closest('.acc') || t.closest('.iec')) continue; // the incomer device label, on the line above
        expect(n(t, 'x')).toBeGreaterThan(sym.x + n(sym.outline, 'width') / 2);
      }
    });
  }

  it('draws the symbol of its kind', () => {
    const kinds: [string, string][] = [['DB', 'p-db'], ['MCC', 'p-mcc'], ['FP', 'p-fp'], ['UPS', 'p-ups'], ['MC', 'p-mc'], ['MDB', 'p-mdb'], ['EMDB', 'p-emdb']];
    const host = draw(project(kinds.map(([kind]) => root(`${kind}-1`, { kind: kind as Board['kind'] }))));
    for (const [kind, id] of kinds) expect(symOf(board(host, `${kind}-1`)).id, kind).toBe(id);
  });

  it('draws an existing board with a dashed outline', () => {
    const host = draw(project([root('DB-1', { kind: 'DB', existing: { recordedKva: 20 } })]));
    const sym = symOf(board(host, 'DB-1'));
    expect(sym.el.getAttribute('data-sym-ex')).toBe('1');
    expect(sym.outline.getAttribute('style')).toContain('stroke-dasharray');
  });

  it('puts the status dot right of the name, outside the symbol', () => {
    const host = draw(project([root('MDB-6')]));
    const g = board(host, 'MDB-6');
    const dot = g.querySelector<SVGCircleElement>('.board-sym circle.status-dot')!;
    const name = [...g.querySelectorAll<SVGTextElement>('.board-sym text')].find((t) => t.textContent === 'MDB-6')!;
    expect(n(dot, 'cx')).toBeGreaterThan(n(name, 'x') + textWidth('MDB-6', 12, true));
    expect(g.querySelector('.board-sym g.iec circle')).toBeNull();
  });

  it('prints no status dot, so no green dot on the sheet', () => {
    vi.stubGlobal('SVGTextElement', class {}); // not in jsdom
    const host = draw(project([root('MDB-6')]));
    document.body.appendChild(host);
    const live = host.querySelector('.board-sym')!.closest('svg')!;
    const out = printableSvg(live, 100, 50);
    host.remove();
    const doc = new DOMParser().parseFromString(out, 'text/html'); // jsdom writes xmlns twice, which XML refuses
    expect(doc.querySelector('.board-sym')).not.toBeNull();
    expect(doc.querySelector('.board-sym circle')).toBeNull();
  });

  it('frames it with a dashed panel frame in DEWA style, holding the incomer, voltage label and MET, pits outside', () => {
    const host = draw(project([root('MDB-6'), root('MDB-7')]));
    const frame = board(host, 'MDB-7').querySelector<SVGRectElement>('.board-frame rect.frame-ln')!;
    const [x1, y1] = [n(frame, 'x'), n(frame, 'y')], [x2, y2] = [x1 + n(frame, 'width'), y1 + n(frame, 'height')];
    const inside = (x: number, y: number) => x > x1 && x < x2 && y > y1 && y < y2;
    const g = board(host, 'MDB-7');
    const sym = symOf(g);
    expect(inside(n(sym.outline, 'x'), n(sym.outline, 'y'))).toBe(true);
    expect(inside(n(sym.outline, 'x') + n(sym.outline, 'width'), n(sym.outline, 'y') + n(sym.outline, 'height'))).toBe(true);
    for (const t of g.querySelectorAll<SVGTextElement>('text')) expect(inside(n(t, 'x') + textWidth(t.textContent!, 11, true), n(t, 'y'))).toBe(true);
    const x = sym.x;
    const volt = [...host.querySelectorAll<SVGTextElement>('g.tx text.m')].find((t) => / V$/.test(t.textContent ?? '') && n(t, 'x') === x - 8)!;
    expect(inside(n(volt, 'x') - textWidth(volt.textContent!, 11), n(volt, 'y') - 10)).toBe(true);
    const earth = host.querySelector('.earth-pit[data-board-id="MDB-7"]')!;
    const met = earth.querySelector('.met-bar')!;
    expect(inside(n(met, 'x1'), n(met, 'y1')) && inside(n(met, 'x2'), n(met, 'y1'))).toBe(true);
    for (const pit of earth.querySelectorAll<SVGRectElement>('.earth-electrode rect')) expect(n(pit, 'x') + n(pit, 'width')).toBeLessThan(x1);
    // The previous board's frame ends before this board's earth detail starts.
    const prev = board(host, 'MDB-6').querySelector<SVGRectElement>('.board-frame rect.frame-ln')!;
    const left = Math.min(...[...earth.querySelectorAll('text, rect')].filter((el) => !el.closest('.tx-earth')).map((el) => n(el, 'x')));
    expect(n(prev, 'x') + n(prev, 'width')).toBeLessThan(left);
    // Standard style draws no panel frames.
    expect(draw(project([root('MDB-6')], [], 'standard')).querySelector('.board-frame')).toBeNull();
  });

  it('lists its final circuits from the load schedule instead of "no outgoing ways"', () => {
    const f = (id: string, way: number): Feeder => ({ ...sampleProject.feeders[0], id, boardId: 'MDB-6', feedsBoardId: undefined, phase: 'R', way });
    const host = draw(project([root('MDB-6')], [f('C1', 1), f('C2', 2)]));
    const g = board(host, 'MDB-6');
    expect(texts(g)).not.toContain('NO OUTGOING WAYS');
    expect(g.querySelector('.sched text')!.textContent).toMatch(/^2 circuits/);
  });

  it('keeps each transformer\'s LV earth detail by its own incomer, clear of the previous incomer\'s labels', () => {
    for (const style of ['dewa', 'standard'] as const) {
      const host = draw(project([root('MDB-6'), root('MDB-7'), root('MDB-8')], [], style));
      const xs = ['MDB-6', 'MDB-7', 'MDB-8'].map((id) => symOf(board(host, id)).x);
      const devs = [...host.querySelectorAll<SVGTextElement>('text.dev')];
      for (let i = 1; i < 3; i++) {
        const earth = host.querySelector(`.earth-pit[data-board-id="MDB-${6 + i}"]`)!;
        const left = Math.min(...[...earth.querySelectorAll('text, rect, line')].filter((el) => !el.closest('.tx-earth'))
          .map((el) => n(el, el.tagName === 'line' ? 'x1' : 'x')));
        // Right of the previous incomer's device label and the text beside its board symbol...
        const dev = devs.find((t) => Math.abs(n(t, 'x') - 10 - xs[i - 1]) < 0.5)!;
        expect(left).toBeGreaterThan(n(dev, 'x') + textWidth(dev.textContent!, 11, true));
        // ...and nearer its own incomer than the previous one.
        expect(xs[i] - left).toBeLessThan(left - xs[i - 1]);
      }
    }
  });
});
