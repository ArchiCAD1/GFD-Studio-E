// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SystemDiagram from './SystemDiagram';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import { getArmedItem, setArmedItem } from '../diagram/dragItem';
import { sldMenu, type SldTarget } from '../model/sldMenu';
import { DEFAULT_LAYERS } from '../diagram/annotations';
import type { Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project: Project = { ...sampleProject, id: 'menu' };
const results = evaluateProject(project);
const noop = () => {};

describe('SLD right-click menus', () => {
  let host: HTMLDivElement, root: Root;
  let selectedBoards: string[], selectedFeeders: string[], menus: [SldTarget, string, string | undefined][];
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    localStorage.clear();
    selectedBoards = []; selectedFeeders = []; menus = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); setArmedItem(null); });

  const draw = (extra: { selectedBoardId?: string | null; selectedFeederId?: string | null; withMenu?: boolean; armable?: boolean } = {}) => act(() => root.render(
    <SystemDiagram project={project} calcProject={project} results={results} selectedFeederId={extra.selectedFeederId ?? null} selectedBoardId={extra.selectedBoardId ?? null}
      onSelectFeeder={(id) => selectedFeeders.push(id)} onSelectBoard={(id) => selectedBoards.push(id)} onDrawing={noop} onPatchFeeder={noop}
      onDropItem={extra.armable ? noop : undefined}
      menuFor={extra.withMenu === false ? undefined : (t, v) => sldMenu({ project, calcProject: project, results, canUndo: false, canRedo: false, layers: DEFAULT_LAYERS, colorBy: 'none', supply: 'normal', hasGenerator: false, outages: [], grid: v.grid, detail: v.detail }, t)}
      onMenu={extra.withMenu === false ? undefined : (t, a, v) => menus.push([t, a, v])} />
  ));
  const rightClick = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 90 })); });
  const group = (sel: string) => host.querySelector(`.sysdiag > svg ${sel}`)!;
  const title = () => host.querySelector('.cad-menu-hd b')?.textContent;
  const row = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.cad-menu button')].find((b) => b.querySelector('.lb')?.textContent === label)!;
  const click = (label: string) => act(() => row(label).click());
  const menu = () => host.querySelector('.cad-menu');
  const key = (k: string, init: KeyboardEventInit = {}, el: Element = host.querySelector('.sysdiag')!) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });

  it('a board: its header, selected', () => {
    draw();
    rightClick(group('g.bd[data-lv-id="board:SMDB-FF"]'));
    expect(title()).toBe('SMDB-FF');
    expect(host.querySelector('.cad-menu-hd')!.textContent).toContain('SMDB · 250 A · from MDB-1');
    expect(selectedBoards).toEqual(['SMDB-FF']);
    expect(row('Edit SMDB-FF…')).toBeTruthy();
  });
  it('a load: its header, selected', () => {
    draw();
    rightClick(group('g.fd[data-lv-id="feeder:FF-LAB"] text'));
    expect(title()).toBe('FF-LAB');
    expect(selectedFeeders).toEqual(['FF-LAB']);
    expect(row('Delete FF-LAB')).toBeTruthy();
  });
  it('an incomer way is its board', () => {
    draw();
    rightClick(group('g.fd[data-lv-id="feeder:INC-FF"]'));
    expect(title()).toBe('SMDB-FF');
    expect(selectedBoards).toEqual(['SMDB-FF']);
    expect(selectedFeeders).toEqual([]);
  });
  it('the transformer: its supply menu, selecting its board', () => {
    draw();
    rightClick(group('g.tx[data-lv-id="board:MDB-1"]'));
    expect(title()).toBe('TX-1');
    expect(selectedBoards).toEqual(['MDB-1']);
  });
  it('the empty drawing: the diagram menu, leaving the selection', () => {
    draw();
    rightClick(host.querySelector('.sysdiag > svg')!);
    expect(title()).toBe('System diagram');
    expect(selectedBoards).toEqual([]);
    expect(selectedFeeders).toEqual([]);
  });
  it('opens at the pointer inside the drawing and hides the hover card', () => {
    draw();
    act(() => { group('g.bd[data-lv-id="board:SMDB-FF"]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    rightClick(group('g.bd[data-lv-id="board:SMDB-FF"]'));
    expect(menu()!.parentElement).toBe(host.querySelector('.sysdiag'));
    expect(host.querySelector('.hover-card')).toBeNull();
  });
  it('Esc closes it, and so does a click elsewhere', () => {
    draw();
    rightClick(group('g.bd[data-lv-id="board:SMDB-FF"]'));
    key('Escape', {}, menu()!);
    expect(menu()).toBeNull();
    rightClick(host.querySelector('.sysdiag > svg')!);
    expect(menu()).not.toBeNull();
    act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(menu()).toBeNull();
  });
  it('a picked row tells the page and closes the menu', () => {
    draw();
    rightClick(group('g.bd[data-lv-id="board:SMDB-FF"]'));
    click('Properties');
    expect(menus).toEqual([[{ kind: 'board', id: 'SMDB-FF' }, 'properties', undefined]]);
    expect(menu()).toBeNull();
    rightClick(group('g.fd[data-lv-id="feeder:FF-LAB"]'));
    click('Zoom to FF-LAB');
    expect(menus[1]).toEqual([{ kind: 'feeder', id: 'FF-LAB' }, 'zoom', undefined]);
  });
  it('a row with a value passes it on', () => {
    draw();
    rightClick(group('g.fd[data-lv-id="feeder:FF-LAB"]'));
    click('Change');
    click('Earth leakage');
    click('30 mA');
    expect(menus).toEqual([[{ kind: 'feeder', id: 'FF-LAB' }, 'change', 'rcdMa|30']]);
  });
  it('Fit and Grid are done in the drawing', () => {
    draw();
    rightClick(host.querySelector('.sysdiag > svg')!);
    click('Fit');
    expect(menus).toEqual([]);
    rightClick(host.querySelector('.sysdiag > svg')!);
    click('Grid');
    click('Dots');
    expect(menus).toEqual([]);
    expect(localStorage.getItem('sld.grid')).toBe('dots');
    expect(host.querySelector('button[aria-label="Grid: dots"]')).not.toBeNull();
    rightClick(host.querySelector('.sysdiag > svg')!);
    click('Text');
    click('Follows the zoom');
    expect(localStorage.getItem('lvds.sldDetail')).toBe('auto');
    expect(menus).toEqual([]);
  });
  it('Edit cable… opens the cable editor at the menu', () => {
    draw();
    rightClick(group('g.fd[data-lv-id="feeder:FF-LAB"]'));
    click('Edit cable…');
    expect(host.querySelector('.cable-edit b')!.textContent).toBe('FF-LAB cable');
    expect(menus).toEqual([]);
  });
  it('Rename… asks for the name, shows what is wrong and applies a good one', () => {
    draw();
    rightClick(group('g.bd[data-lv-id="board:SMDB-FF"]'));
    click('Change');
    click('Rename…');
    expect(menu()).toBeNull();
    const form = host.querySelector('.cable-edit')!;
    expect(form.querySelector('b')!.textContent).toBe('Rename SMDB-FF');
    const input = form.querySelector('input')!, apply = () => form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const type = (v: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(apply().disabled).toBe(true); // unchanged
    type('SMDB-GF');
    expect(form.querySelector('.m')!.textContent).toContain('SMDB-GF already exists');
    expect(apply().disabled).toBe(true);
    type('SMDB-L1');
    expect(form.querySelector('.m')).toBeNull();
    expect(apply().disabled).toBe(false);
    act(() => apply().click());
    expect(menus).toEqual([[{ kind: 'board', id: 'SMDB-FF' }, 'rename', 'SMDB-L1']]);
    expect(host.querySelector('.cable-edit')).toBeNull();
  });
  it('Shift+F10 and the menu key open the menu of the selection', () => {
    draw({ selectedBoardId: 'SMDB-GF' });
    key('F10', { shiftKey: true });
    expect(title()).toBe('SMDB-GF');
    key('Escape', {}, menu()!);
    draw({ selectedFeederId: 'FF-IT' });
    key('ContextMenu');
    expect(title()).toBe('FF-IT');
  });
  it('Shift+F10 with nothing selected opens the diagram menu', () => {
    draw();
    key('F10', { shiftKey: true });
    expect(title()).toBe('System diagram');
  });
  it('Z, Alt+arrows and Ctrl+D act on the selection', () => {
    draw({ selectedFeederId: 'FF-IT' });
    key('z');
    key('ArrowLeft', { altKey: true });
    key('ArrowRight', { altKey: true });
    key('d', { ctrlKey: true });
    expect(menus.map(([t, a, v]) => [t.kind === 'feeder' ? t.id : '', a, v])).toEqual([['FF-IT', 'zoom', undefined], ['FF-IT', 'order', 'left'], ['FF-IT', 'order', 'right'], ['FF-IT', 'duplicate', undefined]]);
  });
  it('those keys do nothing with nothing selected', () => {
    draw();
    key('z');
    key('d', { ctrlKey: true });
    expect(menus).toEqual([]);
  });
  it('without menuFor there is no menu and no keys', () => {
    draw({ withMenu: false, selectedBoardId: 'SMDB-GF' });
    rightClick(group('g.bd[data-lv-id="board:SMDB-FF"]'));
    // Drawings without the menu (sheets, exports) keep the browser's own right-click.
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => { group('g.bd[data-lv-id="board:SMDB-FF"]').dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(false);
    key('F10', { shiftKey: true });
    key('z');
    expect(menu()).toBeNull();
    expect(menus).toEqual([]);
    expect(selectedBoards).toEqual([]);
  });
  it('a right-click puts down an armed item and opens nothing', () => {
    draw({ armable: true });
    act(() => setArmedItem({ kind: 'tie' }));
    expect(getArmedItem()).not.toBeNull();
    rightClick(group('g.bd[data-lv-id="board:SMDB-FF"]'));
    expect(getArmedItem()).toBeNull();
    expect(menu()).toBeNull();
    expect(selectedBoards).toEqual([]);
  });
  it('a right-click never starts a pan', () => {
    (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    draw();
    const svg = host.querySelector('.sysdiag > svg')!;
    const drag = (button: number) => {
      const at = (type: string, clientX: number) => act(() => { svg.dispatchEvent(new MouseEvent(type, { bubbles: true, button, clientX, clientY: 300 })); });
      at('pointerdown', 300); at('pointermove', 500); at('pointerup', 500);
    };
    const vb = svg.getAttribute('viewBox');
    drag(2);
    expect(svg.getAttribute('viewBox')).toBe(vb);
    drag(0); // the same drag with the left button does pan
    expect(svg.getAttribute('viewBox')).not.toBe(vb);
    delete (Element.prototype as unknown as { setPointerCapture?: () => void }).setPointerCapture;
  });
});
