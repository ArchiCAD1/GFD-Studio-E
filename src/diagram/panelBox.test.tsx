// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { boardSymbolOf, boxedBoardIds, hiddenBoardIds, panelSymbolOf, symbolBoardIds } from './panelBox';
import { BOX_DY, layoutSystem, LEAF_W } from './layout';
import { legendEntries } from './IecSymbols';
import SystemDiagram from '../components/SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';
import type { Board, Feeder, Project } from '../types';

const fd = (id: string, boardId: string, p: Partial<Feeder> = {}) => ({
  id, boardId, name: id, loadKw: 10, demandFactor: 1, powerFactor: 0.9, lengthM: 10, cableCsaMm2: 16, cores: 4, breakerRatingA: 63, breakerIcuKa: 36, ...p
}) as Feeder;
const base = { name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '' };
const proj = (boards: Board[], feeders: Feeder[]) => ({ ...base, boards, feeders }) as Project;

describe('panel symbols for boards drawn as one box', () => {
  it('picks the symbol from the panel role', () => {
    const boards: Board[] = [
      { id: 'MDB', name: 'M' }, { id: 'S', name: 'S', kind: 'SMDB', upstreamId: 'MDB' }, { id: 'D', name: 'D', upstreamId: 'S' },
      { id: 'MCC', name: 'P', kind: 'MCC', upstreamId: 'MDB' }, { id: 'EM', name: 'E', kind: 'EMDB', upstreamId: 'MDB' },
      { id: 'ED', name: 'ED', kind: 'DB', upstreamId: 'EM' }, { id: 'U', name: 'U', kind: 'UPS', upstreamId: 'MDB' }, { id: 'CAP', name: 'C', upstreamId: 'MDB' },
      { id: 'ES', name: 'ES', kind: 'SMDB', upstreamId: 'EM' }, { id: 'EC', name: 'EC', kind: 'MCC', upstreamId: 'EM' }, { id: 'LE', name: 'LE', kind: 'LV-EMDB', upstreamId: 'MDB' },
      { id: 'LA', name: 'LA', kind: 'LV-ACB', upstreamId: 'MDB' }, { id: 'LM', name: 'LM', kind: 'LV-MDB', upstreamId: 'MDB' }
    ];
    const p = proj(boards, [fd('C1', 'CAP', { loadType: 'capacitor' }), fd('C2', 'CAP', { loadType: 'capacitor' })]);
    const of = (id: string) => panelSymbolOf(p, boards.find((b) => b.id === id)!);
    expect(of('MDB')).toBe('p-mdb');
    expect(of('S')).toBe('p-smdb');
    expect(of('D')).toBe('p-db');
    expect(of('MCC')).toBe('p-mcc');
    expect(of('EM')).toBe('p-emdb');
    expect(of('ED')).toBe('p-edb'); // a DB below an EMDB
    expect(of('ES')).toBe('p-esmdb'); // an SMDB below an EMDB
    expect(of('EC')).toBe('p-emcc');
    expect(of('LE')).toBe('p-emdb');
    expect(of('LA')).toBe('p-mdb');
    expect(of('LM')).toBe('p-mdb');
    expect(of('U')).toBeUndefined();
    expect(of('CAP')).toBe('p-apfc');
  });

  it('gives every board a symbol, by kind when it has no panel symbol', () => {
    const boards: Board[] = [
      { id: 'MDB', name: 'M' }, { id: 'U', name: 'U', kind: 'UPS', upstreamId: 'MDB' }, { id: 'MC', name: 'MC', kind: 'MC', upstreamId: 'MDB' },
      { id: 'FP', name: 'FP', kind: 'FP', upstreamId: 'MDB' }, { id: 'D', name: 'D', upstreamId: 'MDB' }
    ];
    const p = proj(boards, []);
    const of = (id: string) => boardSymbolOf(p, boards.find((b) => b.id === id)!);
    expect([of('U'), of('MC'), of('FP'), of('MDB'), of('D')]).toEqual(['p-ups', 'p-mc', 'p-fp', 'p-mdb', 'p-db']);
    // The set of boards drawn as one box is unchanged: UPS, MC and FP boards are not boxed.
    expect(panelSymbolOf(p, boards[1])).toBeUndefined();
    expect([...boxedBoardIds(p)]).toEqual(['D']);
  });

  it('gives a board of kind ESMDB the emergency sub-main symbol, wherever it is fed from', () => {
    const boards: Board[] = [{ id: 'MDB', name: 'M' }, { id: 'ES', name: 'ES', kind: 'ESMDB', upstreamId: 'MDB' }];
    expect(boardSymbolOf(proj(boards, []), boards[1])).toBe('p-esmdb');
  });

  it('lists the boards drawn as a symbol: the layout\'s terminal and boxed boards', () => {
    const small = proj(
      [{ id: 'MDB', name: 'M' }, { id: 'S', name: 'S', kind: 'SMDB', upstreamId: 'MDB' }, { id: 'D', name: 'D', upstreamId: 'S' }, { id: 'U', name: 'U', kind: 'UPS', upstreamId: 'MDB' }],
      [fd('INC-S', 'MDB', { feedsBoardId: 'S' }), fd('A', 'S'), fd('INC-D', 'S', { feedsBoardId: 'D' }), fd('R1', 'D', { phase: 'R', way: 1 }), fd('INC-U', 'MDB', { feedsBoardId: 'U' })]
    );
    const lone = proj([{ id: 'MDB', name: 'M' }, { id: 'MDB2', name: 'M2' }], [fd('X', 'MDB')]);
    for (const p of [sampleProject, small, lone]) {
      const drawn = layoutSystem(p).boards.filter((n) => n.terminal || n.boxed).map((n) => n.board.id).sort();
      expect([...symbolBoardIds(p)].sort()).toEqual(drawn);
      expect(drawn.length).toBeGreaterThan(0);
    }
  });

  it('boxes end boards only: a panel feeding ways keeps its busbar', () => {
    const p = proj([
      { id: 'MDB', name: 'M' }, { id: 'S', name: 'S', kind: 'SMDB', upstreamId: 'MDB' }, { id: 'D', name: 'D', upstreamId: 'S' },
      { id: 'S2', name: 'S2', kind: 'SMDB', upstreamId: 'MDB', spareWays: [{ id: 'w', ratingA: 32 }] as Board['spareWays'] },
      { id: 'U', name: 'U', kind: 'UPS', upstreamId: 'MDB' }, { id: 'CAP', name: 'C', upstreamId: 'MDB' }
    ], [
      fd('INC-S', 'MDB', { feedsBoardId: 'S' }), fd('INC-D', 'S', { feedsBoardId: 'D' }), fd('R1', 'D', { phase: 'R', way: 1 }),
      fd('C1', 'CAP', { loadType: 'capacitor' })
    ]);
    // D: final circuits only. CAP: its steps are inside the APFC panel. S feeds D, S2 has a spare way on its busbar, U has no symbol, MDB is the main board.
    expect([...boxedBoardIds(p)].sort()).toEqual(['CAP', 'D']);
    expect([...hiddenBoardIds(p)].sort()).toEqual(['CAP', 'D']);
  });

  it('lays an end board out in a load slot on its parent level', () => {
    const p = proj(
      [{ id: 'MDB', name: 'M' }, { id: 'S', name: 'S', kind: 'SMDB', upstreamId: 'MDB' }, { id: 'D', name: 'D', upstreamId: 'S' }],
      [fd('INC-S', 'MDB', { feedsBoardId: 'S' }), fd('A', 'S'), fd('INC-D', 'S', { feedsBoardId: 'D' }), fd('R1', 'D', { phase: 'R', way: 1 }), fd('L', 'MDB')]
    );
    const l = layoutSystem(p);
    const s = l.boards.find((b) => b.board.id === 'S')!, d = l.boards.find((b) => b.board.id === 'D')!;
    expect(d.boxed).toBe(true);
    expect(d.depth).toBe(2);
    expect(d.busY).toBe(s.busY + BOX_DY);
    expect(d.circuits.map((c) => c.id)).toEqual(['R1']);
    const inc = l.feeders.find((f) => f.feeder.id === 'INC-D')!;
    expect(inc.panelBoardId).toBe('D');
    expect(inc.childBoardId).toBeUndefined();
    expect(d.x).toBe(inc.x);
    expect(inc.x - l.feeders.find((f) => f.feeder.id === 'A')!.x).toBe(LEAF_W);
    expect(l.height).toBe(layoutSystem({ ...p, feeders: p.feeders.filter((f) => f.id !== 'INC-D') }).height); // no extra level
  });

  it('draws an end board as its panel symbol on the SLD, and lists it in the legend', () => {
    const project = sampleProject;
    const html = renderToStaticMarkup(
      <SystemDiagram project={project} calcProject={project} results={evaluateProject(project)}
        selectedFeederId={null} selectedBoardId={null} onSelectFeeder={() => {}} onSelectBoard={() => {}} onDrawing={() => {}} />
    );
    const host = document.createElement('div');
    host.innerHTML = html;
    const group = host.querySelector('[data-lv-id="feeder:INC-DBGF1"]')!;
    const texts = [...group.querySelectorAll('text')].map((t) => t.textContent);
    expect(group.querySelector('g.iec[data-sym="p-db"]')).not.toBeNull(); // DB-GF1 has final circuits only
    expect(texts).toContain('DB-GF1');
    expect(texts.some((t) => /^TCL [\d,]+\.\d\d · MDL [\d,]+\.\d\d kW$/.test(t ?? ''))).toBe(true); // its TCL and MDL under the symbol
    const smdb = [...host.querySelector('[data-lv-id="feeder:INC-GF"]')!.querySelectorAll('text')].map((t) => t.textContent);
    expect(smdb).not.toContain('SMDB'); // SMDB-GF feeds ways: drawn with its busbar
    expect(host.querySelector('[data-lv-id="feeder:INC-GF"] g.iec[data-sym="p-smdb"]')).toBeNull();
    expect(legendEntries(project).map((e) => e.key)).toContain('p-db');
  });
});
