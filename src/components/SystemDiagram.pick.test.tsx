// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SystemDiagram from './SystemDiagram';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import { setArmedItem } from '../diagram/dragItem';
import { sldMenu, type SldTarget } from '../model/sldMenu';
import { DEFAULT_LAYERS } from '../diagram/annotations';
import type { Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const last = <T,>(a: T[]): T | undefined => a[a.length - 1];
const project: Project = { ...sampleProject, id: 'pick' };
const failing: Project = { ...project, id: 'pick-fail', feeders: project.feeders.map((f) => (f.id === 'FF-LAB' ? { ...f, cableCsaMm2: 4 } : f)) };

describe('SLD picking several', () => {
  let host: HTMLDivElement, root: Root;
  let selectedFeeders: string[], selectedBoards: string[], statuses: string[], menus: [SldTarget, string, string | undefined][];
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    localStorage.clear();
    selectedFeeders = []; selectedBoards = []; statuses = []; menus = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); setArmedItem(null); });

  const draw = (extra: { project?: Project; selectedFeederId?: string | null; selectedBoardId?: string | null } = {}) => {
    const p = extra.project ?? project;
    const results = evaluateProject(p);
    act(() => root.render(
      <SystemDiagram project={p} calcProject={p} results={results} selectedFeederId={extra.selectedFeederId ?? null} selectedBoardId={extra.selectedBoardId ?? null}
        onSelectFeeder={(id) => selectedFeeders.push(id)} onSelectBoard={(id) => selectedBoards.push(id)} onDrawing={noop} onPatchFeeder={noop} onMoveItem={noop} onStatus={(s) => statuses.push(s)}
        menuFor={(t, v) => sldMenu({ project: p, calcProject: p, results, canUndo: false, canRedo: false, layers: DEFAULT_LAYERS, colorBy: 'none', supply: 'normal', hasGenerator: false, outages: [], grid: v.grid, detail: v.detail }, t)}
        onMenu={(t, a, v) => menus.push([t, a, v])} />
    ));
  };
  const svg = () => host.querySelector<SVGSVGElement>('.sysdiag > svg')!;
  const fd = (id: string) => host.querySelector(`.sysdiag > svg g.fd[data-lv-id="feeder:${id}"]`)!;
  const bd = (id: string) => host.querySelector(`.sysdiag > svg g.bd[data-lv-id="board:${id}"]`)!;
  const click = (el: Element, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })); });
  const shiftClick = (el: Element) => click(el, { shiftKey: true });
  const rightClick = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 90 })); });
  const key = (k: string, init: KeyboardEventInit = {}) => act(() => { host.querySelector('.sysdiag')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
  const rings = () => [...host.querySelectorAll('.sel-ring')].map((r) => r.closest('g.fd')!.getAttribute('data-lv-id'));
  const title = () => host.querySelector('.cad-menu-hd b')?.textContent;
  const row = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.cad-menu button')].find((b) => b.querySelector('.lb')?.textContent === label)!;
  const pickRow = (...labels: string[]) => labels.forEach((l) => act(() => row(l).click()));
  const three = () => { shiftClick(fd('FF-OFF')); shiftClick(fd('FF-IT')); shiftClick(fd('FF-LAB')); };

  it('Shift+click adds and takes away; the first one takes in what is selected now', () => {
    draw({ selectedFeederId: 'FF-LTG' });
    shiftClick(fd('FF-LAB'));
    expect(rings().sort()).toEqual(['feeder:FF-LAB', 'feeder:FF-LTG']);
    expect(last(statuses)).toBe('2 picked: a right-click on any of them opens the menu for all of them. Esc clears.');
    shiftClick(fd('FF-IT'));
    expect(rings()).toHaveLength(3);
    shiftClick(fd('FF-LAB'));
    expect(rings().sort()).toEqual(['feeder:FF-IT', 'feeder:FF-LTG']);
    expect(selectedFeeders).toContain('FF-LAB'); // the last one clicked is still the app's selection
  });
  it('a picked board has its busbar drawn selected, and an incomer is its board', () => {
    draw();
    shiftClick(bd('SMDB-FF'));
    shiftClick(fd('INC-GF'));
    expect(host.querySelector('g.bd[data-lv-id="board:SMDB-FF"] line.bus.sel')).not.toBeNull();
    expect(host.querySelector('g.bd[data-lv-id="board:SMDB-GF"] line.bus.sel')).not.toBeNull();
    expect(host.querySelector('g.bd[data-lv-id="board:MDB-1"] line.bus.sel')).toBeNull();
  });
  it('a plain click, a click on the empty drawing and Esc clear the picks', () => {
    draw();
    three();
    click(fd('FF-LTG'));
    expect(rings()).toEqual([]);
    three();
    click(svg());
    expect(rings()).toEqual([]);
    three();
    key('Escape');
    expect(rings()).toEqual([]);
  });
  it('a right-click on a picked item opens the menu of all; on another item its own, ending the picks', () => {
    draw();
    three();
    rightClick(fd('FF-IT'));
    expect(title()).toBe('3 picked');
    expect(host.querySelector('.cad-menu-hd')!.textContent).toContain('3 loads on SMDB-FF');
    expect(rings()).toHaveLength(3);
    key('Escape'); // closes the menu first
    act(() => { window.dispatchEvent(new Event('blur')); });
    rightClick(fd('FF-LTG'));
    expect(title()).toBe('FF-LTG');
    expect(rings()).toEqual([]);
  });
  it('a menu row runs for all of them', () => {
    draw();
    three();
    rightClick(fd('FF-OFF'));
    pickRow('Edit together…');
    expect(menus).toEqual([[{ kind: 'several', items: [{ kind: 'feeder', id: 'FF-OFF' }, { kind: 'feeder', id: 'FF-IT' }, { kind: 'feeder', id: 'FF-LAB' }] }, 'together', undefined]]);
  });
  it('Delete with several asks for all and does not reach the single Delete; Z zooms; Ctrl+D duplicates; Ctrl+C copies', () => {
    draw();
    three();
    const reached = vi.fn();
    window.addEventListener('keydown', reached);
    key('Delete');
    expect(last(menus)![1]).toBe('delete');
    expect((last(menus)![0] as { items: unknown[] }).items).toHaveLength(3);
    key('c', { ctrlKey: true });
    expect(last(menus)![1]).toBe('copy');
    expect(reached).not.toHaveBeenCalled();
    key('d', { ctrlKey: true });
    expect(last(menus)![1]).toBe('duplicate');
    const before = svg().getAttribute('viewBox');
    key('z');
    expect(svg().getAttribute('viewBox')).not.toBe(before);
    window.removeEventListener('keydown', reached);
  });
  it('with one picked, the keys are the single item\'s', () => {
    draw({ selectedFeederId: 'FF-LAB' });
    key('d', { ctrlKey: true });
    expect(last(menus)![0]).toEqual({ kind: 'feeder', id: 'FF-LAB' });
  });
  it('Select similar picks the loads of the same type; Select everything below picks the branch', () => {
    draw();
    rightClick(fd('GF-HVAC'));
    pickRow('Select similar', 'Same load type on SMDB-GF');
    expect(rings().sort()).toEqual(['feeder:GF-HVAC', 'feeder:GF-VRF']);
    expect(last(statuses)).toContain('2 picked');
    expect(menus).toEqual([]); // a view action: the page is not asked
    click(svg());
    rightClick(bd('SMDB-GF'));
    pickRow('Select everything below');
    expect(rings().sort()).toEqual(['feeder:GF-HVAC', 'feeder:GF-LTG', 'feeder:GF-SKT', 'feeder:GF-VRF', 'feeder:INC-DBGF1']); // the end board DB-GF1 is the box on its way
  });
  it('Select on the empty drawing: failing circuits, and boards of one kind', () => {
    draw({ project: failing });
    rightClick(svg());
    pickRow('Select', 'Every failing circuit');
    expect(rings()).toContain('feeder:FF-LAB');
    rightClick(svg());
    pickRow('Select', 'Boards of one kind', 'SMDB');
    expect(rings()).toEqual([]);
    expect(host.querySelector('g.bd[data-lv-id="board:SMDB-FF"] line.bus.sel')).not.toBeNull();
    expect(host.querySelector('g.bd[data-lv-id="board:SMDB-GF"] line.bus.sel')).not.toBeNull();
  });
  it('Deselect all clears; Move to board… lists the boards and sends one choice for all', () => {
    draw();
    three();
    rightClick(fd('FF-IT'));
    pickRow('Move to board…');
    const list = host.querySelector('.tree-move')!;
    expect(list.getAttribute('aria-label')).toBe('Move 3 to');
    act(() => [...list.querySelectorAll('button')].find((b) => b.textContent?.startsWith('MCC-1'))!.click());
    expect(last(menus)![1]).toBe('moveto');
    expect(last(menus)![2]).toBe('MCC-1');
    rightClick(fd('FF-IT'));
    pickRow('Deselect all');
    expect(rings()).toEqual([]);
  });

  describe('the window', () => {
    // jsdom has no layout: the drawing's coordinates are the pointer's.
    const identity = () => {
      const s = svg() as unknown as Record<string, unknown>;
      s.getScreenCTM = () => ({ inverse: () => ({}) });
      s.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform(this: { x: number; y: number }) { return { x: this.x, y: this.y }; } });
    };
    const capture = () => { (svg() as unknown as Record<string, unknown>).setPointerCapture = () => {}; };
    const drag = (x0: number, y0: number, x1: number, y1: number, shift = true) => {
      const fire = (type: string, x: number, y: number) => act(() => { svg().dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, shiftKey: shift, button: 0 })); });
      fire('pointerdown', x0, y0); fire('pointermove', (x0 + x1) / 2, (y0 + y1) / 2); fire('pointermove', x1, y1);
      return () => fire('pointerup', x1, y1);
    };
    // Where a way hangs, from its first line (x and the busbar's height).
    const p = (id: string) => { const l = fd(id).querySelector('line')!; return { x: Number(l.getAttribute('x1')), y: Number(l.getAttribute('y1')) + 94 }; };
    it('Shift+drag draws the window with its tag; on release it picks what is inside', () => {
      draw();
      identity();
      capture();
      const a = p('FF-OFF'), b = p('FF-LAB');
      const up = drag(a.x - 30, a.y - 30, b.x + 30, b.y + 30);
      expect(host.querySelector('.sd-window')).not.toBeNull();
      expect(host.querySelector('.sd-window-tag')!.textContent).toBe('Window');
      up();
      expect(host.querySelector('.sd-window')).toBeNull();
      expect(rings()).toEqual(expect.arrayContaining(['feeder:FF-OFF', 'feeder:FF-IT', 'feeder:FF-LAB']));
      expect(rings()).not.toContain('feeder:FF-LTG');
      expect(last(statuses)).toContain('picked: a right-click');
      click(svg()); // the click that ends a drag is not a click on the empty drawing
      expect(rings().length).toBeGreaterThanOrEqual(3);
    });
    it('a plain drag still pans and picks nothing', () => {
      draw();
      identity();
      capture();
      const before = svg().getAttribute('viewBox');
      const up = drag(100, 100, 160, 140, false);
      up();
      expect(host.querySelector('.sd-window')).toBeNull();
      expect(rings()).toEqual([]);
      expect(svg().getAttribute('viewBox')).not.toBe(before);
    });
  });
});
