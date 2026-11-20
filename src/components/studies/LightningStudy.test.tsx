// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LightningStudy from './LightningStudy';
import { sampleProject } from '../../data/sampleProject';
import type { Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const field = (label: string) => [...document.querySelectorAll('label.nf')].find((l) => l.querySelector('span')?.textContent === label)!.querySelector('input')!;
const enter = (el: HTMLInputElement, value: string) => act(() => { el.value = value; el.focus(); el.blur(); });
const text = () => document.body.textContent ?? '';

describe('Lightning protection study', () => {
  let last: Project;
  const render = (p: Project) => act(() => root.render(<LightningStudy project={p} onChange={(x) => { last = x; render(x); }} />));

  it('starts empty: nothing is assumed and the building size is asked for', () => {
    render(sampleProject);
    expect(text()).toContain('Building length, width and height must be more than zero');
    expect(text()).toContain('Not entered');
    expect(field('Mesh size').value).toBe('');
    expect(field('Rolling sphere radius').placeholder).toBe('');
  });

  it('saves the entries with the project and works out the mesh and the down conductors', () => {
    render(sampleProject);
    enter(field('Length'), '40');
    enter(field('Width'), '25');
    enter(field('Height'), '18');
    expect(text()).toContain('DATA REQUIRED');
    enter(field('Mesh size'), '10');
    enter(field('Down conductor spacing'), '10');
    expect(last.lightning).toMatchObject({ lengthM: 40, widthM: 25, heightM: 18, meshM: 10, downSpacingM: 10, method: 'mesh' });
    expect(text()).toContain('5 runs · 285 m of roof conductor');
    expect(document.querySelectorAll('svg circle[stroke]').length).toBe(13);
  });

  it('compares the four methods and selects one from its row', () => {
    render({ ...sampleProject, lightning: { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', lpsClass: 'II', meshM: 10, sphereRadiusM: 30, downSpacingM: 10, rodHeightM: 3, angleDeg: 45, eseMastM: 5, eseDeltaTUs: 60, eseDownPerTerminal: 2 } });
    expect(text()).toContain('12 rods on a 13.33 × 12.5 m grid');
    expect(text()).toContain('Rp 86.46 m · 1 terminal');
    expect(text()).toContain('not an IEC 62305 method');
    const eseRow = [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.startsWith('ESE air terminal')) as HTMLElement;
    act(() => eseRow.click());
    expect(last.lightning?.method).toBe('ese');
    expect(text()).toContain('ESE air terminal (selected)');
  });

  it('clearing a value brings DATA REQUIRED back', () => {
    render({ ...sampleProject, lightning: { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', meshM: 10, downSpacingM: 10 } });
    enter(field('Mesh size'), '');
    expect(last.lightning?.meshM).toBeUndefined();
    expect(text()).toContain('Data required');
  });

  it('puts the quantities in the BOQ only when ticked', () => {
    render({ ...sampleProject, lightning: { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', meshM: 10, downSpacingM: 10 } });
    const box = [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Include these quantities in the project BOQ'))!.querySelector('input')!;
    expect(box.checked).toBe(false);
    act(() => box.click());
    expect(last.lightning?.inBoq).toBe(true);
  });

  it('places the roof layout as a block in a level\'s plan drawing', () => {
    const study = { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh' as const, meshM: 10, downSpacingM: 10 };
    render({ ...sampleProject, lightning: study });
    const button = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Place on roof plan')!;
    expect(button().disabled).toBe(true);
    const building = { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground' as const, heightM: 4 }, { id: 'RF', name: 'Roof', kind: 'roof' as const, heightM: 3 }] }], rooms: [] };
    render({ ...sampleProject, building, lightning: study, cadPlans: [{ building: 'V', level: 'GF', file: 'gf.dwg', units: 4 }, { building: 'V', level: 'RF', file: 'roof.dwg', units: 4 }] } as Project);
    expect(document.querySelector<HTMLSelectElement>('select[disabled], label.nf select')).toBeTruthy();
    expect([...document.querySelectorAll('option')].find((o) => o.value === 'roof.dwg')!.textContent).toContain('Roof');
    expect(button().disabled).toBe(false);
    act(() => button().click());
    expect(last.cadBlockDefs?.find((x) => x.file === 'roof.dwg')?.defs.map((d) => d.name)).toEqual(['LP-ROOF-LAYOUT']);
  });

  it('risk assessment: saved with the study, gives the minimum class and passes it to the design values', () => {
    render({ ...sampleProject, lightning: { lengthM: 35, widthM: 26, heightM: 8.5, method: 'mesh' } });
    expect(text()).not.toContain('Minimum protection class');
    const entries: [string, string][] = [['Thunderstorm days', '40'], ['Strike point ratio', '1'], ['Location factor', '1'], ['Fire risk factor', '0.02'],
      ['Fire provisions factor', '0.5'], ['Special hazard factor', '1'], ['Typical loss', '0.5'], ['Tolerable risk', '1e-5']];
    entries.forEach(([label, value]) => enter(field(label), value));
    expect(text()).toContain('DATA REQUIRED');
    const p = (level: string) => document.querySelector<HTMLInputElement>(`input[aria-label="Damage probability — ${level}"]`)!;
    ([['No protection', '1'], ['Class IV', '0.2'], ['Class III', '0.1'], ['Class II', '0.05'], ['Class I', '0.02']] as const).forEach(([level, value]) => enter(p(level), value));
    expect(last.lightning?.risk).toMatchObject({ shape: 'rectangle', thunderDays: 40, tolerableRisk: 1e-5, damageProbability: { none: 1, II: 0.05 } });
    expect(text()).toContain('Class II (minimum)');
    expect(text()).toContain('1.21 × 10⁻⁴');
    expect(text()).toContain('1 in 41 years');
    expect(text()).toContain('6063.82 m²');
    const use = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Use Class II in this study')!;
    act(() => use.click());
    expect(last.lightning).toMatchObject({ lpsClass: 'II', riskRef: 'Preliminary risk assessment in this study' });
  });

  it('risk assessment: an entered collection area replaces the rectangle', () => {
    render({ ...sampleProject, lightning: { lengthM: 35, widthM: 26, heightM: 8.5, method: 'mesh', risk: { shape: 'area', collectionAreaM2: 5000, strikeDensity: 4, locationFactor: 1 } } });
    expect(field('Collection area (entered)').value).toBe('5000');
    expect(text()).toContain('1 in 50 years');
  });
});

describe('Lightning protection study — roof outline for the risk assessment', () => {
  it('takes a closed outline from the roof drawing as the collection area', () => {
    let last: Project | undefined;
    const render = (p: Project) => act(() => root.render(<LightningStudy project={p} onChange={(x) => { last = x; render(x); }} />));
    const building = { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground' as const, heightM: 4 }, { id: 'RF', name: 'Roof', kind: 'roof' as const, heightM: 3 }] }], rooms: [] };
    const outline: [number, number][] = [[0, 0], [40000, 0], [40000, 15000], [20000, 15000], [20000, 30000], [0, 30000]];
    render({ ...sampleProject, building, cadPlans: [{ building: 'V', level: 'RF', file: 'roof.dwg', units: 4 }], cadSketch: [{ file: 'roof.dwg', items: [{ id: 'S1', kind: 'pline', layer: 'A-ROOF', pts: outline, closed: true }] }],
      lightning: { lengthM: 40, widthM: 30, heightM: 8, method: 'mesh', risk: { shape: 'outline', thunderDays: 40, strikeRatio: 1, locationFactor: 1 } } } as Project);
    expect(text()).toContain('No outline taken yet');
    expect(text()).toContain('900 m² · 6 points · layer A-ROOF');
    const take = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Take roof outline')!;
    act(() => take.click());
    expect(last!.lightning!.risk).toMatchObject({ shape: 'outline', outline: [[0, 0], [40, 0], [40, 15], [20, 15], [20, 30], [0, 30]] });
    expect(text()).toContain('Outline taken: 6 points');
    expect(text()).toContain('Collection area — cross-check');
    expect(document.querySelectorAll('svg path[stroke-linejoin="round"]').length).toBe(1);
  });
});

describe('Lightning protection study — risk factor presets', () => {
  it('saves the factors under a name on this computer and loads them into another study', () => {
    localStorage.clear();
    let last: Project | undefined;
    const messages: string[] = [];
    const render = (p: Project) => act(() => root.render(<LightningStudy project={p} onChange={(x) => { last = x; render(x); }} onStatus={(m) => messages.push(m)} />));
    const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === label)!;
    render({ ...sampleProject, lightning: { lengthM: 35, widthM: 26, heightM: 8.5, method: 'mesh', risk: { shape: 'rectangle', thunderDays: 40, fireRisk: 0.02, tolerableRisk: 1e-5, damageProbability: { II: 0.05 } } } });
    expect(button('Load preset').disabled).toBe(true);
    expect(button('Save as preset').disabled).toBe(true);
    const name = [...document.querySelectorAll('label.nf')].find((l) => l.querySelector('span')?.textContent === 'Preset name')!.querySelector('input')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'Villas'); name.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => button('Save as preset').click());
    expect(messages[messages.length - 1]).toContain('Saved risk factor preset "Villas"');
    expect(JSON.parse(localStorage.getItem('gfde.lightningRiskPresets')!)[0]).toMatchObject({ name: 'Villas', factors: { fireRisk: 0.02, tolerableRisk: 1e-5, damageProbability: { II: 0.05 } } });

    act(() => root.unmount());
    root = createRoot(host);
    render({ ...sampleProject, lightning: { lengthM: 20, widthM: 10, heightM: 6, method: 'mesh', risk: { shape: 'rectangle', thunderDays: 25, fireRisk: 0.5, typicalLoss: 0.1 } } });
    act(() => button('Load preset').click());
    expect(last!.lightning!.risk).toEqual({ shape: 'rectangle', thunderDays: 25, fireRisk: 0.02, tolerableRisk: 1e-5, damageProbability: { II: 0.05 } });
    act(() => button('Delete preset').click());
    expect(JSON.parse(localStorage.getItem('gfde.lightningRiskPresets')!)).toEqual([]);
    expect(button('Load preset').disabled).toBe(true);
  });
});

describe('Lightning protection study — parts with their own height', () => {
  it('adds a drawn outline as a part, takes its height and counts it in the collection area', () => {
    let last: Project | undefined;
    const render = (p: Project) => act(() => root.render(<LightningStudy project={p} onChange={(x) => { last = x; render(x); }} />));
    const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === label)!;
    const building = { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground' as const, heightM: 4 }, { id: 'RF', name: 'Roof', kind: 'roof' as const, heightM: 3 }] }], rooms: [] };
    const items: import('../../types').SketchItem[] = [{ id: 'R', kind: 'pline', layer: 'A-ROOF', pts: [[0, 0], [35000, 0], [35000, 26000], [0, 26000]], closed: true }, { id: 'T', kind: 'pline', layer: 'A-ROOF', pts: [[17000, 12000], [18000, 12000], [18000, 13000], [17000, 13000]], closed: true }];
    render({ ...sampleProject, building, cadPlans: [{ building: 'V', level: 'RF', file: 'roof.dwg', units: 4 }], cadSketch: [{ file: 'roof.dwg', items }],
      lightning: { lengthM: 35, widthM: 26, heightM: 8.5, method: 'mesh', risk: { shape: 'outline', thunderDays: 40, strikeRatio: 1, locationFactor: 1 } } } as Project);
    expect(button('Add as a part with its own height').disabled).toBe(true);
    act(() => button('Take roof outline').click());
    expect(text()).toContain('6063.82 m²');
    const pick = [...document.querySelectorAll('label.nf')].find((l) => l.querySelector('span')?.textContent === 'Closed outline')!.querySelector('select')!;
    act(() => { pick.value = 'T'; pick.dispatchEvent(new Event('change', { bubbles: true })); });
    act(() => button('Add as a part with its own height').click());
    expect(last!.lightning!.risk!.parts).toEqual([{ outline: [[17, 12], [18, 12], [18, 13], [17, 13]] }]);
    expect(text()).toContain('height of part 1');
    const height = document.querySelector<HTMLInputElement>('input[aria-label="Height of part 1"]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(height, '30'); height.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(last!.lightning!.risk!.parts![0].heightM).toBe(30);
    expect(text()).toContain('Roof outline and 1 part');
    expect(document.querySelectorAll('svg path[stroke-linejoin="round"]').length).toBe(2);
    act(() => button('Remove').click());
    expect(last!.lightning!.risk!.parts).toEqual([]);
    expect(text()).toContain('6063.82 m²');
  });
});

describe('Lightning protection study — other risk components', () => {
  it('ticks a component, takes its loss and probability and an incoming line, and shows the risk by component', () => {
    let last: Project | undefined;
    const render = (p: Project) => act(() => root.render(<LightningStudy project={p} onChange={(x) => { last = x; render(x); }} />));
    const box = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    const type = (label: string, value: string) => act(() => { const el = box(label); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    const risk = { shape: 'rectangle' as const, thunderDays: 40, strikeRatio: 1, locationFactor: 1, fireRisk: 0.02, fireProvisions: 0.5, specialHazard: 1, typicalLoss: 0.5, tolerableRisk: 1e-5, damageProbability: { none: 1, IV: 0.2, III: 0.1, II: 0.05, I: 0.02 } };
    render({ ...sampleProject, lightning: { lengthM: 35, widthM: 26, heightM: 8.5, method: 'mesh', risk } });
    expect(text()).toContain('One risk component only');
    expect(text()).not.toContain('Incoming line');
    const line = 'Physical damage — strike on an incoming line';
    act(() => box(`Count — ${line}`).click());
    expect(last!.lightning!.risk!.components).toEqual({ damageLine: { on: true } });
    expect(text()).toContain('incoming lines');
    act(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Add incoming line')!.click());
    ([['Length of line 1', '1000'], ['Width for strikes on line 1', '40'], ['Installation factor of line 1', '0.5'], ['Environment factor of line 1', '0.5'], ['Line type factor of line 1', '1'],
      [`Loss — ${line}`, '0.005'], [`Probability — ${line}`, '0.01']] as const).forEach(([label, value]) => type(label, value));
    expect(last!.lightning!.risk).toMatchObject({ lines: [{ lengthM: 1000, strikeWidthM: 40, typeFactor: 1 }], components: { damageLine: { on: true, loss: 0.005, probability: 0.01 } } });
    expect(text()).toContain('Risk per year by component');
    expect(text()).toContain('8.06 × 10⁻⁶');
    expect(text()).toContain('Class II (minimum)');
    expect(text()).toContain('2 risk components');
    expect(text()).toContain('Risk components included: physical damage — strike on the building; physical damage — strike on an incoming line.');

    act(() => box(`Probability by class — ${line}`).click());
    expect(text()).toContain('DATA REQUIRED');
    type(`Probability — ${line} — No protection`, '1');
    expect(last!.lightning!.risk!.components!.damageLine).toMatchObject({ byClass: true, classProbability: { none: 1 } });
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Remove line 1"]')!.click());
    expect(last!.lightning!.risk!.lines).toEqual([]);
  });
});

describe('Lightning protection study — a probability for each line', () => {
  it('"By line" moves the probability to a row for each line', () => {
    let last: Project | undefined;
    const render = (p: Project) => act(() => root.render(<LightningStudy project={p} onChange={(x) => { last = x; render(x); }} />));
    const box = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    const type = (label: string, value: string) => act(() => { const el = box(label); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    const name = 'Physical damage — strike on an incoming line', line = { lengthM: 1000, strikeWidthM: 40, installationFactor: 0.5, environmentFactor: 0.5, typeFactor: 1 };
    render({ ...sampleProject, lightning: { lengthM: 35, widthM: 26, heightM: 8.5, method: 'mesh', risk: { shape: 'rectangle', thunderDays: 40, strikeRatio: 1, locationFactor: 1, fireRisk: 0.02, fireProvisions: 0.5, specialHazard: 1, typicalLoss: 0.5,
      tolerableRisk: 1e-5, damageProbability: { none: 1, IV: 0.2, III: 0.1, II: 0.05, I: 0.02 }, lines: [{ ...line, name: 'Power' }, { ...line, lengthM: 500 }], components: { damageLine: { on: true, loss: 0.005, probability: 0.05 } } } } });
    expect(text()).toContain('More than Class I');
    expect(box(`Probability by line — Injury by touch and step voltage — strike on the building`)).toBeNull();
    act(() => box(`Probability by line — ${name}`).click());
    expect(text()).toContain('For each line, below');
    expect(text()).toContain('probability — physical damage — strike on an incoming line — Power');
    type(`Probability — ${name} — line 1`, '0.01');
    type(`Probability — ${name} — line 2`, '0.05');
    expect(last!.lightning!.risk!.lines!.map((x) => x.probabilities)).toEqual([{ damageLine: { probability: 0.01 } }, { damageLine: { probability: 0.05 } }]);
    expect(text()).toContain('Class I (minimum)');
    expect(text()).toContain('7 × 10⁻⁶');
  });
});

