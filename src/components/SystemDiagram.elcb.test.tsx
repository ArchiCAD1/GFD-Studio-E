// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';
import { ELCB_ROW } from '../diagram/layout';
import { breakerText, icuText, wayReach } from '../diagram/panelLabels';
import type { Feeder, Project } from '../types';

const noop = () => {};
const ELCB = 'FF-IT', PLAIN = 'FF-OFF';

/** SMDB-FF of the sample project with `patch` applied to its FF-IT way, drawn in the given style. */
function drawn(patch: Partial<Feeder>, style: 'dewa' | 'standard' = 'dewa', symbols: 'iec' | 'simple' = 'iec') {
  const project: Project = {
    ...sampleProject,
    drawing: { ...sampleProject.drawing, sldStyle: style === 'dewa' ? undefined : 'standard', symbols } as Project['drawing'],
    feeders: sampleProject.feeders.map((f) => (f.id === ELCB ? { ...f, ...patch } : f))
  };
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={project} calcProject={project} results={evaluateProject(project)} hideLegend
      selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} />
  );
  const way = (id: string) => host.querySelector(`[data-lv-id="feeder:${id}"]`)!;
  return { host, project, way, feeder: project.feeders.find((f) => f.id === ELCB)! };
}
const num = (e: Element, a: string) => Number(e.getAttribute(a));
const lineOf = (g: Element) => g.querySelector('line')!;
const textOf = (g: Element, s: string) => [...g.querySelectorAll('text')].find((t) => t.textContent === s);
const cableText = (g: Element) => [...g.querySelectorAll('text')].find((t) => /mm²/.test(t.textContent ?? ''))!;

describe.each([['dewa', ELCB_ROW.dewa], ['standard', ELCB_ROW.standard]] as const)('ELCB unit on the System diagram (%s style)', (style, row) => {
  const withUnit = drawn({ rcdMa: 30 }, style), without = drawn({ rcdMa: 0 }, style);
  const g = withUnit.way(ELCB), x = num(lineOf(g), 'x1'), busY = num(lineOf(g), 'y1');
  const mA = style === 'dewa' ? '30mA' : '30 mA';

  it('draws the core-balance CT, the ELCB box with its word and the sensitivity above it', () => {
    const ct = g.querySelector('[data-sym="cbct"]')!;
    expect(num(ct, 'data-sym-s')).toBe(0.75);
    const box = [...g.querySelectorAll('rect.sym')].find((r) => num(r, 'width') === 34)!;
    expect([num(box, 'x'), num(box, 'height')]).toEqual([x + 10, 18]);
    expect(textOf(g, 'ELCB')).toBeTruthy();
    const ma = textOf(g, mA)!;
    expect(num(ma, 'y')).toBeLessThan(num(box, 'y'));
    const second = [...g.querySelectorAll('text')].find((t) => t.textContent?.startsWith(style === 'dewa' ? `${withUnit.feeder.breakerIcuKa} kA` : 'TP'))!;
    expect(num(ma, 'y')).toBeGreaterThan(num(second, 'y'));
    expect(without.way(ELCB).querySelector('[data-sym="cbct"]')).toBeNull();
    expect(without.way(PLAIN).querySelector('[data-sym="cbct"]')).toBeNull();
    expect(withUnit.way(PLAIN).querySelector('[data-sym="cbct"]')).toBeNull();
  });

  it('keeps the mA out of the breaker text and has no side box or toroid', () => {
    if (style === 'dewa') expect(textOf(g, `${withUnit.feeder.breakerIcuKa} kA`)).toBeTruthy();
    else expect([...g.querySelectorAll('text.b')].every((t) => !/mA/.test(t.textContent ?? ''))).toBe(true);
    expect(g.querySelector('[data-sym="rcd"]')).toBeNull();
    expect(g.querySelectorAll('rect.sym[width="34"]')).toHaveLength(1);
    expect(textOf(g, '30mA ELCB')).toBeUndefined();
  });

  it('hangs everything below the breaker text one row lower, on every way of the board', () => {
    for (const id of [ELCB, PLAIN]) {
      expect(num(cableText(withUnit.way(id)), 'y') - num(cableText(without.way(id)), 'y')).toBe(row);
    }
    if (style === 'dewa') {
      const frame = [...withUnit.host.querySelectorAll('.panel-frame')].find((f) => f.querySelector('title')?.textContent?.startsWith('SMDB-FF'))!.querySelector('rect.frame-ln')!;
      expect(num(frame, 'y') + num(frame, 'height')).toBe(busY + 47 + row);
    }
  });

  it('draws the breaker at switch scale from y + 10, with the way number clear of the blade', () => {
    const sw = g.querySelector('[data-sym="cb"]')!;
    expect(num(sw, 'data-sym-s')).toBe(0.75);
    expect(num(sw, 'data-sym-y')).toBe(busY + 22);
    if (style === 'dewa') expect(num(g.querySelector('.way-no')!, 'x')).toBe(x - 12);
  });

  it('names the RCBO in the breaker text and keeps it out of the ELCB unit', () => {
    const rcbo = drawn({ rcdMa: 30, remarks: 'RCBO 30mA' }, style);
    const r = rcbo.way(ELCB);
    expect(r.querySelector('[data-sym="rcbo"]')).toBeTruthy();
    expect(r.querySelector('[data-sym="cbct"]')).toBeNull();
    if (style === 'dewa') {
      expect(textOf(r, breakerText(rcbo.feeder, true))).toBeTruthy();
      expect(breakerText(rcbo.feeder, true).endsWith(' RCBO')).toBe(true);
      expect(textOf(r, `${rcbo.feeder.breakerIcuKa} kA · 30mA`)).toBeTruthy();
    } else expect([...r.querySelectorAll('text.b')].some((t) => /30 mA/.test(t.textContent ?? ''))).toBe(true);
    const iso = drawn({ device: 'ISOL' }, style);
    if (style === 'dewa') expect(textOf(iso.way(ELCB), breakerText(iso.feeder, true))!.textContent).toMatch(/ISOLATOR$/);
  });
});

describe.each([['dewa', ELCB_ROW.dewa], ['standard', ELCB_ROW.standard]] as const)('kWh meter on the System diagram (%s style)', (style, row) => {
  const sym = (g: Element, id: string) => g.querySelector(`[data-sym="${id}"]`)!;

  it('draws the meter in its own row, above the cable text that moved down a row', () => {
    const metered = drawn({ rcdMa: 0, kwhMeter: 'CT' }, style), without = drawn({ rcdMa: 0 }, style);
    const g = metered.way(ELCB), x = num(lineOf(g), 'x1'), busY = num(lineOf(g), 'y1');
    const kwh = sym(g, 'kwh'), box = kwh.querySelector('rect')!;
    expect([num(kwh, 'data-sym-y'), num(kwh, 'data-sym-s')]).toEqual([busY + 62, 0.75]);
    expect(num(sym(g, 'ct'), 'data-sym-y')).toBe(busY + 62);
    // The word fits its box (7.5 px "kWh" is about 15 wide) and the CT label is clear of it.
    expect(num(box, 'width')).toBeGreaterThanOrEqual(20);
    expect(num(textOf(g, 'CT')!, 'x')).toBeGreaterThan(num(box, 'x') + num(box, 'width'));
    expect(num(box, 'x')).toBeGreaterThan(x);
    for (const id of [ELCB, PLAIN]) expect(num(cableText(metered.way(id)), 'y') - num(cableText(without.way(id)), 'y')).toBe(row);
    expect(num(box, 'y') + num(box, 'height')).toBeLessThan(num(cableText(g), 'y') - 9); // a text height clear
    if (style === 'dewa') {
      const frame = [...metered.host.querySelectorAll('.panel-frame')].find((f) => f.querySelector('title')?.textContent?.startsWith('SMDB-FF'))!.querySelector('rect.frame-ln')!;
      expect(num(box, 'y') + num(box, 'height')).toBeLessThan(num(frame, 'y') + num(frame, 'height')); // inside the panel, above the gland
    }
  });

  it('puts the meter a row below the ELCB unit on the same way', () => {
    const both = drawn({ rcdMa: 30, kwhMeter: '3-PH' }, style), unit = drawn({ rcdMa: 30 }, style);
    const g = both.way(ELCB), busY = num(lineOf(g), 'y1');
    expect(num(sym(g, 'kwh'), 'data-sym-y')).toBe(busY + 62 + row);
    // Clear of the ELCB box above it and a text height above the cable text.
    const elcbBox = [...g.querySelectorAll('rect.sym')].find((r) => num(r, 'width') === 34)!, meterBox = sym(g, 'kwh').querySelector('rect')!;
    expect(num(meterBox, 'y')).toBeGreaterThan(num(elcbBox, 'y') + num(elcbBox, 'height'));
    expect(num(meterBox, 'y') + num(meterBox, 'height')).toBeLessThan(num(cableText(g), 'y') - 9);
    expect(g.querySelector('[data-sym="ct"]')).toBeNull();
    expect(num(cableText(g), 'y') - num(cableText(unit.way(ELCB)), 'y')).toBe(row);
  });
});

describe('simple icons mode', () => {
  it('keeps the plain box at y + 18 and the boxed ELCB beside the breaker', () => {
    const { way } = drawn({ rcdMa: 30 }, 'dewa', 'simple');
    const g = way(ELCB), busY = num(lineOf(g), 'y1');
    const box = [...g.querySelectorAll('rect.sym')].find((r) => num(r, 'height') === 16)!;
    expect([num(box, 'width'), num(box, 'y')]).toEqual([12, busY + 18]);
    expect(textOf(g, 'ELCB')).toBeTruthy();
    expect(g.querySelector('[data-sym]')).toBeNull();
  });
});

describe('device text and reach', () => {
  const f = sampleProject.feeders.find((x) => x.id === ELCB)!;
  it('names the device drawn: ISOLATOR for a switch-disconnector, RCBO only with IEC symbols', () => {
    expect(breakerText({ ...f, device: 'ISOL' })).toMatch(/ISOLATOR$/);
    expect(breakerText({ ...f, remarks: 'RCBO 30mA' }, true)).toMatch(/RCBO$/);
    expect(breakerText({ ...f, remarks: 'RCBO 30mA' })).not.toMatch(/RCBO/);
    expect(icuText({ ...f, rcdMa: 30 }, true)).toBe(`${f.breakerIcuKa} kA`);
    expect(icuText({ ...f, rcdMa: 30 })).toBe(`${f.breakerIcuKa} kA · 30mA ELCB`);
    expect(icuText({ ...f, remarks: 'RCBO 100mA' }, true)).toBe(`${f.breakerIcuKa} kA · 100mA`);
    // An RCBO with no sensitivity anywhere prints no mA, never "undefinedmA".
    expect(icuText({ ...f, rcdMa: undefined, remarks: 'RCBO' }, true)).toBe(`${f.breakerIcuKa} kA`);
    // An isolator written as RCBO is drawn as the RCBO, so its text says so.
    expect(breakerText({ ...f, device: 'ISOL', remarks: 'RCBO 30mA' }, true)).toMatch(/RCBO$/);
  });

  it('covers the ELCB box in a way\'s reach with IEC symbols', () => {
    const e = { ...f, rcdMa: 30, breakerRatingA: 16 };
    expect(wayReach(sampleProject, e, true, false, true)).toBeGreaterThanOrEqual(44);
    expect(wayReach(sampleProject, e, true, false, true)).toBeGreaterThanOrEqual(wayReach(sampleProject, e, true));
  });
});
