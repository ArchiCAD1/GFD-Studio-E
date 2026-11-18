// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SystemDiagram from './SystemDiagram';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import { setArmedItem } from '../diagram/dragItem';
import { sldMenu, type SldTarget } from '../model/sldMenu';
import type { DropTarget, MoveItem } from '../model/sldEdit';
import { DEFAULT_LAYERS } from '../diagram/annotations';
import type { Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

describe('SLD Move tool, Supply from… and the len? mark', () => {
  let host: HTMLDivElement, root: Root;
  let moves: [MoveItem, DropTarget][], statuses: string[], menus: [SldTarget, string, string | undefined][];
  const originalFromPoint = document.elementFromPoint;
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    localStorage.clear();
    moves = []; statuses = []; menus = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); setArmedItem(null); document.elementFromPoint = originalFromPoint; });

  const draw = (extra: { project?: Project; selectedBoardId?: string | null; selectedFeederId?: string | null; screenMarks?: boolean } = {}) => {
    const project = extra.project ?? { ...sampleProject, id: 'move' };
    const results = evaluateProject(project);
    act(() => root.render(
      <SystemDiagram project={project} calcProject={project} results={results} selectedFeederId={extra.selectedFeederId ?? null} selectedBoardId={extra.selectedBoardId ?? null}
        onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} onPatchFeeder={noop} onMoveItem={(i, t) => moves.push([i, t])} onStatus={(s) => statuses.push(s)} screenMarks={extra.screenMarks}
        menuFor={(t, v) => sldMenu({ project, calcProject: project, results, canUndo: false, canRedo: false, layers: DEFAULT_LAYERS, colorBy: 'none', supply: 'normal', hasGenerator: false, outages: [], grid: v.grid, detail: v.detail }, t)}
        onMenu={(t, a, v) => menus.push([t, a, v])} />
    ));
  };
  const key = (k: string, init: KeyboardEventInit = {}) => act(() => { host.querySelector('.sysdiag')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
  const under = (el: Element | null) => { document.elementFromPoint = () => el; };
  const drop = (id: string) => host.querySelector(`.sysdiag > svg [data-drop="${id}"]`)!;
  const moveOver = (el: Element | null) => { under(el); act(() => { host.querySelector('.sysdiag > svg')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 80 })); }); };
  const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 100, clientY: 80 })); });
  const rightClick = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 90 })); });
  const ghost = () => host.querySelector('.move-ghost')?.textContent;
  const why = () => host.querySelector('.move-why')?.textContent;
  const menuRow = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.cad-menu button')].find((b) => b.querySelector('.lb')?.textContent === label)!;

  it('M starts the tool with a hint; a place that takes it lights up, and a click moves there and ends the tool', () => {
    draw({ selectedBoardId: 'SMDB-GF' });
    key('m');
    expect(statuses).toEqual(['Click a busbar to supply SMDB-GF from it, or a load to place it before that one. Esc or a right-click cancels.']);
    moveOver(drop('bus:SMDB-FF'));
    expect(host.querySelector('.drop-ok')).not.toBeNull();
    expect(ghost()).toBe('Move SMDB-GF');
    expect(why()).toBeUndefined();
    click(drop('bus:SMDB-FF'));
    expect(moves).toEqual([[{ kind: 'board', id: 'SMDB-GF' }, { type: 'bus', boardId: 'SMDB-FF' }]]);
    expect(ghost()).toBeUndefined();
    moveOver(drop('bus:SMDB-FF'));
    expect(ghost()).toBeUndefined();
  });

  it('a place that can not take it is not lit and says why; a click there does nothing and keeps the tool', () => {
    draw({ selectedBoardId: 'SMDB-GF' });
    key('M');
    moveOver(drop('bus:SMDB-GF'));
    expect(host.querySelector('.drop-ok')).toBeNull();
    expect(ghost()).toBe('Move SMDB-GF');
    expect(why()).toBe("SMDB-GF can't supply itself");
    click(drop('bus:SMDB-GF'));
    expect(moves).toEqual([]);
    expect(ghost()).toBe('Move SMDB-GF');
    moveOver(host.querySelector('.sysdiag > svg'));
    expect(ghost()).toBe('Move SMDB-GF');
    expect(why()).toBeUndefined();
  });

  it('a load: its own hint, and a click on another load places it before that one', () => {
    draw({ selectedFeederId: 'FF-IT' });
    key('m');
    expect(statuses[0]).toBe('Click a busbar to put FF-IT on it, or a load to place it before that one. Esc or a right-click cancels.');
    moveOver(drop('fd:GF-LTG'));
    click(drop('fd:GF-LTG'));
    expect(moves).toEqual([[{ kind: 'feeder', id: 'FF-IT' }, { type: 'feeder', feederId: 'GF-LTG' }]]);
  });

  it('a main board has no incomer: a status, no tool', () => {
    draw({ selectedBoardId: 'MDB-1' });
    key('m');
    expect(statuses).toEqual(['A main board has no incomer to move']);
    moveOver(drop('bus:SMDB-FF'));
    expect(ghost()).toBeUndefined();
  });

  it('Esc ends it with Move cancelled', () => {
    draw({ selectedBoardId: 'SMDB-GF' });
    key('m');
    moveOver(drop('bus:SMDB-FF'));
    key('Escape');
    expect(statuses[statuses.length - 1]).toBe('Move cancelled');
    expect(ghost()).toBeUndefined();
    click(drop('bus:SMDB-FF'));
    expect(moves).toEqual([]);
  });

  it('a right-click ends it and opens no menu', () => {
    draw({ selectedBoardId: 'SMDB-GF' });
    key('m');
    rightClick(drop('bus:SMDB-FF'));
    expect(statuses[statuses.length - 1]).toBe('Move cancelled');
    expect(host.querySelector('.cad-menu')).toBeNull();
  });

  it('the menu\'s Move row starts it too', () => {
    draw();
    rightClick(host.querySelector('.sysdiag > svg g.bd[data-lv-id="board:SMDB-FF"]')!);
    act(() => menuRow('Move').click());
    expect(host.querySelector('.cad-menu')).toBeNull();
    expect(statuses[0]).toContain('supply SMDB-FF from it');
    expect(menus).toEqual([]);
    moveOver(drop('bus:SMDB-GF'));
    expect(ghost()).toBe('Move SMDB-FF');
  });

  it('Supply from… lists the boards, the current source disabled, and a pick moves to the end of that busbar', () => {
    draw();
    rightClick(host.querySelector('.sysdiag > svg g.bd[data-lv-id="board:SMDB-GF"]')!);
    act(() => menuRow('Supply from…').click());
    const list = host.querySelector('.tree-move')!;
    expect(list.querySelector('.tree-menu-h')!.textContent).toContain('Supply SMDB-GF from…');
    const btn = (id: string) => [...list.querySelectorAll<HTMLButtonElement>('.tree-move-list button')].find((b) => b.querySelector('b')!.textContent === id)!;
    expect(btn('MDB-1').disabled).toBe(true);
    expect(btn('MDB-1').textContent).toContain('current source');
    expect(btn('DB-GF1').disabled).toBe(true);
    expect(btn('DB-GF1').textContent).toContain('below it');
    expect(btn('SMDB-FF').disabled).toBe(false);
    act(() => btn('SMDB-FF').click());
    expect(moves).toEqual([[{ kind: 'board', id: 'SMDB-GF' }, { type: 'bus', boardId: 'SMDB-FF' }]]);
    expect(host.querySelector('.tree-move')).toBeNull();
    expect(menus).toEqual([]);
  });

  it('Move to board… for a load disables its own board; Esc and a click outside close the list', () => {
    draw();
    rightClick(host.querySelector('.sysdiag > svg g.fd[data-lv-id="feeder:FF-LAB"]')!);
    act(() => menuRow('Move to board…').click());
    const list = host.querySelector('.tree-move')!;
    expect(list.querySelector('.tree-menu-h')!.textContent).toContain('Move FF-LAB to…');
    const btns = [...list.querySelectorAll<HTMLButtonElement>('.tree-move-list button')];
    expect(btns.filter((b) => b.disabled).map((b) => b.querySelector('b')!.textContent)).toEqual(['SMDB-FF']);
    expect(btns.find((b) => b.disabled)!.textContent).toContain('current board');
    act(() => { list.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(host.querySelector('.tree-move')).toBeNull();
    rightClick(host.querySelector('.sysdiag > svg g.fd[data-lv-id="feeder:FF-LAB"]')!);
    act(() => menuRow('Move to board…').click());
    expect(host.querySelector('.tree-move')).not.toBeNull();
    act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(host.querySelector('.tree-move')).toBeNull();
  });

  it('len? shows on a flagged incomer only with screenMarks', () => {
    const flagged: Project = { ...sampleProject, id: 'flag', feeders: sampleProject.feeders.map((f) => (f.id === 'INC-FF' ? { ...f, lengthToCheck: true } : f)) };
    draw({ project: flagged });
    expect(host.querySelector('.len-check')).toBeNull();
    draw({ project: flagged, screenMarks: true });
    expect(host.querySelectorAll('.len-check')).toHaveLength(1);
    expect(host.querySelector('g.fd[data-lv-id="feeder:INC-FF"] .len-check text')!.textContent).toBe('len?');
    draw({ screenMarks: true });
    expect(host.querySelector('.len-check')).toBeNull();
  });
});
