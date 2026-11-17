import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { placePath, Sym, SYM_BOX, SYM_SCALE, SYMBOL_IDS, SYMBOLS, symSvg, type SymPrim } from './symbolLibrary';
import RiserDiagram, { RiserLegendSvg } from './RiserDiagram';
import { sampleProject } from '../data/sampleProject';
import FeederRiserDiagram, { FeederRiserLegendSvg } from './FeederRiserDiagram';
import { pathPoints } from './svgPath';
import { elcbUnitOf, FeederSwitchSym, feederSwitchOf, legendEntries, loadSymbolOf, rcdInSwitch, starterSymbolOf, SwitchSym } from './IecSymbols';
import { sldDevices } from './sldDevices';
import { ChangeoverIncomers } from './ChangeoverSym';
import type { Feeder, Project } from '../types';

const inBox = (u: number, v: number) =>
  u >= SYM_BOX.x - 0.01 && u <= SYM_BOX.x + SYM_BOX.w + 0.01 && v >= SYM_BOX.y - 0.01 && v <= SYM_BOX.y + SYM_BOX.h + 0.01;

function points(q: SymPrim): [number, number][] {
  switch (q.k) {
    case 'p': return pathPoints(q.d).flat();
    case 'c': return [[q.cx - q.r, q.cy - q.r], [q.cx + q.r, q.cy + q.r]];
    case 'e': return [[q.cx - q.rx, q.cy - q.ry], [q.cx + q.rx, q.cy + q.ry]];
    case 'r': return [[q.x, q.y], [q.x + q.w, q.y + q.h]];
    case 't': return [[q.x, q.y]];
  }
}

describe('symbol library', () => {
  it.each(SYMBOL_IDS)('%s keeps its body inside the 28 × 32 symbol box', (id) => {
    const body = (SYMBOLS[id].prims as SymPrim[]).filter((q) => !q.acc);
    expect(body.length).toBeGreaterThan(0);
    for (const q of body) for (const [u, v] of points(q)) expect(inBox(u, v), `${id} ${q.k} at ${u},${v}`).toBe(true);
  });

  it.each(SYMBOL_IDS)('%s renders without invalid numbers', (id) => {
    const svg = renderToStaticMarkup(<svg><Sym id={id} x={100} y={50} s={0.6} labels /></svg>);
    expect(svg).not.toMatch(/NaN|undefined/);
  });

  it('scales a path about the body centre', () => {
    const map = (u: number, v: number): [number, number] => [100 + (u - 30) * 0.5, 50 + (v - 40) * 0.5];
    expect(placePath('M30 24V28H34L26 32', map, 0.5)).toBe('M 100 42 V 44 H 102 L 98 46');
    expect(placePath('M26 28A4 4 0 0 1 34 28', map, 0.5)).toBe('M 98 44 A 2 2 0 0 1 102 44');
    expect(() => placePath('m0 0 l1 1', map, 1)).toThrow(/Unsupported/);
  });

  it('draws every symbol of a role at one size', () => {
    // Same scale → same body box for a breaker and an isolator in the 16-unit slot.
    const ys = (k: 'breaker' | 'isolator') => renderToStaticMarkup(<svg><SwitchSym x={0} y={0} kind={k} /></svg>).match(/V\s?(-?[\d.]+)/g);
    expect(ys('breaker')?.[0]).toBe(ys('isolator')?.[0]);
    const svg = renderToStaticMarkup(<svg><SwitchSym x={0} y={0} kind="breaker" /></svg>);
    expect(svg).toContain('V 12 L -4.25 3'); // line from the foot to the blade's pivot at y + 12, then the blade to the open tip
  });

  it('maps loads to library symbols', () => {
    expect(loadSymbolOf('fire-pump', true, true)).toBe('motor-fp');
    expect(loadSymbolOf('lighting')).toBe('lighting');
    expect(loadSymbolOf('general')).toBe('eq-l');
    expect(loadSymbolOf('hvac', true)).toBe('motor');
  });

  it('draws the RMU with its two ring ways entering at the top and the T-off leaving on the line axis', () => {
    const pts = (SYMBOLS.rmu.prims as SymPrim[]).filter((q) => q.k === 'p').flatMap(points);
    const has = (u: number, v: number) => pts.some(([a, b]) => Math.abs(a - u) < 0.01 && Math.abs(b - v) < 0.01);
    expect(has(18.5, 24) && has(41.5, 24)).toBe(true);
    expect(has(30, 56)).toBe(true);
    expect(Math.min(...pts.map(([, v]) => v))).toBe(24);
    expect(Math.max(...pts.map(([, v]) => v))).toBe(56);
    expect(SYMBOLS.rmu.prims.filter((q) => q.k === 'p' && q.c === 'thick')).toHaveLength(1); // the busbar
    expect(renderToStaticMarkup(<svg><Sym id="rmu" x={0} y={0} labels /></svg>)).toContain('>RMU<');
    expect(symSvg('rmu', 0, 0)).toContain('data-sym="rmu"');
  });

  it('keeps side labels off the drawing unless asked', () => {
    const plain = renderToStaticMarkup(<svg><Sym id="acb" x={0} y={0} /></svg>);
    expect(plain).not.toContain('>ACB<');
    expect(renderToStaticMarkup(<svg><Sym id="acb" x={0} y={0} labels /></svg>)).toContain('>ACB<');
  });
});

describe('SLD symbol mappings', () => {
  const fd = (p: Partial<Feeder>) => ({ id: 'F1', boardId: 'DB-1', loadKw: 5, ...p }) as Feeder;

  it('draws a motor starter from Feeder.starter', () => {
    expect(starterSymbolOf('DOL')).toBe('dol');
    expect(starterSymbolOf('SD')).toBe('sd');
    expect(starterSymbolOf('SS')).toBe('ss');
    expect(starterSymbolOf('VFD')).toBe('vfd');
    expect(sldDevices(fd({ loadType: 'motor', starter: 'SS' })).starterType).toBe('SS');
    expect(sldDevices(fd({ loadType: 'motor' })).starterType).toBe('DOL');
  });

  it('puts only an RCBO in the switch; any other earth leakage is the ELCB unit under the breaker', () => {
    expect(feederSwitchOf(fd({}))).toBe('cb');
    expect(feederSwitchOf(fd({ remarks: 'RCBO 30mA' }))).toBe('rcbo');
    expect(feederSwitchOf(fd({ remarks: 'RCBO 30mA', device: 'ISOL' }))).toBe('rcbo');
    expect(feederSwitchOf(fd({ device: 'ISOL' }))).toBe('isolator');
    expect(rcdInSwitch(fd({ remarks: 'RCBO 30mA' }))).toBe(true);
    expect(elcbUnitOf(fd({ remarks: 'RCBO 30mA' }))).toBeUndefined();
    // rcdMa alone is an ELCB; RCCB, RCD and ELR in the remarks keep their word.
    expect(feederSwitchOf(fd({ rcdMa: 30 }))).toBe('cb');
    expect(elcbUnitOf(fd({ rcdMa: 30 }))).toEqual({ word: 'ELCB', ma: 30 });
    expect(feederSwitchOf(fd({ rcdMa: 30, device: 'ISOL' }))).toBe('isolator');
    expect(elcbUnitOf(fd({ rcdMa: 30, remarks: 'ELCB' }))?.word).toBe('ELCB');
    expect(elcbUnitOf(fd({ rcdMa: 30, remarks: 'RCCB 30mA' }))).toEqual({ word: 'RCCB', ma: 30 });
    expect(elcbUnitOf(fd({ remarks: 'RCD 100mA' }))).toEqual({ word: 'RCD', ma: 100 });
    expect(elcbUnitOf(fd({ rcdMa: 100, remarks: 'ELR' }))).toEqual({ word: 'ELR', ma: 100 });
    expect(feederSwitchOf(fd({ rcdMa: 30, remarks: 'ELR' }))).toBe('cb');
    // An ACB keeps its symbol and gets the unit, also when it is written as an RCBO.
    expect(feederSwitchOf(fd({ rcdMa: 300, device: 'ACB' }))).toBe('acb');
    expect(feederSwitchOf(fd({ remarks: 'RCBO 300mA', device: 'ACB' }))).toBe('acb');
    expect(elcbUnitOf(fd({ remarks: 'RCBO 300mA', device: 'ACB' }))).toEqual({ word: 'ELCB', ma: 300 });
    expect(elcbUnitOf(fd({ rcdMa: 30, remarks: 'no elcb' }))).toBeUndefined();
    expect(rcdInSwitch(fd({ rcdMa: 30 }))).toBe(false);
  });

  it('draws the RCBO in a 24-unit slot at switch scale, its toroid in the foot and its link left of the line', () => {
    const svg = renderToStaticMarkup(<svg><FeederSwitchSym x={0} y={0} f={fd({ remarks: 'RCBO 30mA' })} s={SYM_SCALE.switch} /></svg>);
    expect(svg).toContain('data-sym="rcbo"');
    expect(svg).toContain('data-sym-y="12"'); // centre of a slot from 0 to 24
    const cy = +/<ellipse[^>]* cy="(-?[\d.]+)"/.exec(svg)![1];
    expect(cy).toBeGreaterThan(0);
    expect(cy).toBeLessThan(24);
    const dash = /<path d="([^"]+)" class="ln" style="[^"]*stroke-dasharray/.exec(svg)![1];
    const xs = [...dash.matchAll(/[MHL]\s?(-?[\d.]+)/g)].map((m) => +m[1]);
    expect(Math.max(...xs)).toBeLessThanOrEqual(0);
  });

  it('mirrors a flipped symbol about its centre', () => {
    const up = renderToStaticMarkup(<svg><Sym id="spd" x={0} y={0} s={0.5} flip /></svg>);
    expect(up).toContain('<rect x="-4" y="-8" width="8" height="16"');
    expect(up).toContain('M -5 -10 H 5'); // earth above the body
    expect(renderToStaticMarkup(<svg><Sym id="spd" x={0} y={0} s={0.5} /></svg>)).toContain('M -5 10 H 5');
  });

  it('lists the drawn symbols in the legend', () => {
    const board = { id: 'DB-1', name: 'DB-1', pmu: true, spd: 'T2' } as Project['boards'][number];
    const project = { boards: [board], feeders: [fd({ loadType: 'motor', starter: 'VFD', rcdMa: 30, kwhMeter: 'CT' }), fd({ id: 'F2', device: 'ISOL', remarks: 'RCBO 30mA' })] } as unknown as Project;
    const keys = legendEntries(project).map((e) => e.key);
    expect(keys).toEqual(expect.arrayContaining(['rcbo', 'elcb', 'vfd', 'pmu', 'spd', 'ct', 'kwh']));
    expect(keys).not.toContain('dol');
    expect(keys).not.toContain('rccb');
    expect(keys).not.toContain('rcd');
    expect(legendEntries({ ...project, feeders: [fd({})] } as unknown as Project).map((e) => e.key)).not.toContain('elcb');
    const legend = renderToStaticMarkup(<svg>{legendEntries(project).find((e) => e.key === 'vfd')!.draw(0, 0)}</svg>);
    expect(legend).toContain('>f1<');
  });
});

describe('changeover incomer symbols', () => {
  const brk = { ratingA: 1600, device: 'ACB' as const, drawOut: true };
  const draw = (pmu: boolean, spd?: 'T2') => renderToStaticMarkup(
    <svg><ChangeoverIncomers x={100} genX={300} headY={0} busY={300} kva={500} mains={brk} generator={brk} instruments pmu={pmu} spd={spd} /></svg>
  );

  it('draws the PMU from board.pmu as the library symbol, one per incomer', () => {
    expect(draw(false)).not.toContain('>PMU<');
    expect(draw(true).match(/>PMU</g)).toHaveLength(2);
    expect(draw(true)).toContain('<rect x="65" y="172" width="14" height="16"'); // mains PMU, centred 28 left of its line
  });

  it('hangs the library SPD below the voltmeter row', () => {
    const svg = draw(false, 'T2');
    expect(svg).toContain('<rect x="44" y="217" width="8" height="16"'); // body centred on busY − 75, 52 left of the mains line
  });
});

describe('symbols as printable SVG strings', () => {
  it('draws black on white, in the same place as the React symbol', () => {
    const svg = symSvg('p-smdb', 100, 50, 0.6);
    const colours = new Set([...svg.matchAll(/(?:stroke|fill)="([^"]+)"/g)].map((m) => m[1]));
    expect([...colours].every((c) => c === '#000' || c === 'none')).toBe(true);
    expect(svg).toContain('<rect x="91.6" y="40.4" width="16.8" height="19.2"');
    expect(renderToStaticMarkup(<svg><Sym id="p-smdb" x={100} y={50} s={0.6} /></svg>)).toContain('x="91.6" y="40.4" width="16.8" height="19.2"');
    expect(symSvg('pmu', 0, 0)).not.toContain('RS485'); // side labels left off
    expect(symSvg('kwh', 0, 0)).toContain('>kWh</text>');
  });
});

describe('riser panel symbols', () => {
  const at = { building: 'A', level: 'g' };
  const inc = (id: string, to: string) => ({ ...sampleProject.feeders[0], id, boardId: 'MDB', feedsBoardId: to, name: to });
  const project = {
    ...sampleProject, busRisers: [],
    building: { rooms: [], buildings: [{ id: 'A', name: 'A', levels: [{ id: 'g', name: 'GF', kind: 'ground', heightM: 4 }] }] },
    boards: [{ id: 'MDB', name: 'M', kind: 'MDB', sourceKva: 1000, level: at }, { id: 'DB1', name: 'D', kind: 'DB', upstreamId: 'MDB', level: at }, { id: 'UPS1', name: 'U', kind: 'UPS', upstreamId: 'MDB', level: at }],
    feeders: [inc('I1', 'DB1'), inc('I2', 'UPS1')]
  } as unknown as Project;

  it('draws each board as its panel symbol, a UPS board as the plain box', () => {
    const html = renderToStaticMarkup(<RiserDiagram project={project} buildingId="A" />);
    expect(html).toContain('>MDB</text>');
    expect(html).toContain('>DB</text>');
    expect(html).toContain('<polygon'); // the UPS board keeps the plain DB box
    const fr = renderToStaticMarkup(<FeederRiserDiagram project={project} buildingId="A" />);
    expect(fr).toContain('>DB</text>'); // end board as its panel symbol
    expect(fr).toContain('>UPS</text>'); // UPS keeps its own box
  });

  it('lists the panel symbols in the riser legends', () => {
    const legend = renderToStaticMarkup(<RiserLegendSvg used={new Set(['p-db', 'p-mdb'])} />);
    expect(legend).toContain('Distribution board (DB)');
    expect(legend).toContain('LV main panel (MDB)');
    expect(legend).not.toContain('Sub-main board');
    expect(renderToStaticMarkup(<FeederRiserLegendSvg used={new Set(['p-mcc'])} />)).toContain('Motor control centre (MCC)');
  });
});
