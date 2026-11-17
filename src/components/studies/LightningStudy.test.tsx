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
