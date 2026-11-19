// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SingleLineDiagram from './SingleLineDiagram';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import { DEFAULT_LAYERS } from '../diagram/annotations';
import { setArmedItem } from '../diagram/dragItem';
import { sldMenu, type SldTarget } from '../model/sldMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project = sampleProject;
const all = evaluateProject(project);
const board = project.boards.find((b) => b.id === 'MDB-1')!;
const own = all.filter((r) => r.feeder.boardId === board.id);

describe('<SingleLineDiagram menuFor> (the Board tab menus)', () => {
  let host: HTMLDivElement, root: Root;
  let selected: string[], menus: [SldTarget, string, string | undefined][];
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); selected = []; menus = []; });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; setArmedItem(null); });

  const draw = (sel: string | null = null, withMenu = true) => act(() => root.render(
    <SingleLineDiagram board={board} project={project} results={own} selected={sel} onSelect={(id) => selected.push(id)} onDropItem={() => {}}
      menuFor={withMenu ? (t) => sldMenu({ project, calcProject: project, results: all, canUndo: false, canRedo: false, layers: DEFAULT_LAYERS, colorBy: 'none', supply: 'normal', hasGenerator: false, outages: [], grid: 'lines', detail: 'auto' }, t, 'board', board.id) : undefined}
      onMenu={(t, a, v) => menus.push([t, a, v])} />
  ));
  const rightClick = (el: Element) => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 90 });
    act(() => { el.dispatchEvent(e); });
    return e;
  };
  const way = (id: string) => host.querySelector(`svg g[data-way="${id}"]`)!;
  const title = () => host.querySelector('.cad-menu-hd b')?.textContent;
  const menu = () => host.querySelector('.cad-menu');
  const labels = () => [...host.querySelectorAll('.cad-menu button .lb')].map((x) => x.textContent);

  it('a way opens its load menu without the system-only rows, and selects the way', () => {
    draw();
    const e = rightClick(way('DB-EV').querySelector('text')!);
    expect(e.defaultPrevented).toBe(true);
    expect(title()).toBe('DB-EV');
    expect(selected).toEqual(['DB-EV']);
    expect(labels()).toContain('Edit DB-EV…');
    for (const x of ['Edit cable…', 'Move', 'Move to board…', 'Zoom to DB-EV', 'Select similar']) expect(labels()).not.toContain(x);
    expect(menu()!.parentElement).toBe(host.firstElementChild);
  });

  it('a way feeding a sub-board opens that board menu; nothing is selected', () => {
    draw();
    rightClick(way('INC-FF'));
    expect(title()).toBe('SMDB-FF');
    expect(selected).toEqual([]);
    expect(labels()).toContain('Board diagram');
    expect(labels()).not.toContain('Add');
  });

  it('the busbar opens this board menu, without its own Board diagram row', () => {
    draw();
    rightClick(host.querySelector('.bus-hit')!);
    expect(title()).toBe('MDB-1');
    expect(selected).toEqual([]);
    expect(labels()).toContain('Add');
    expect(labels()).not.toContain('Board diagram');
  });

  it('elsewhere there is no menu and the default is kept', () => {
    draw();
    const e = rightClick(host.querySelector('svg')!);
    expect(e.defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
  });

  it('without menuFor nothing opens and the drawing is not wrapped', () => {
    draw(null, false);
    const e = rightClick(way('DB-EV'));
    expect(e.defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
    expect(host.firstElementChild!.tagName.toLowerCase()).toBe('svg');
  });

  it('Shift+F10 opens the menu of the selected way, else this board', () => {
    draw('DB-EV');
    act(() => { way('DB-EV').dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })); });
    expect(title()).toBe('DB-EV');
    act(() => root.render(<div />));
    draw(null);
    act(() => { way('DB-EV').dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true })); });
    expect(title()).toBe('MDB-1');
  });

  it('a pick calls onMenu and closes; Esc and a click elsewhere close', () => {
    draw();
    rightClick(way('DB-EV'));
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.cad-menu button')].find((b) => b.querySelector('.lb')?.textContent === 'Properties')!.click());
    expect(menus).toEqual([[{ kind: 'feeder', id: 'DB-EV' }, 'properties', undefined]]);
    expect(menu()).toBeNull();
    rightClick(way('DB-EV'));
    act(() => { menu()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    expect(menu()).toBeNull();
    rightClick(way('DB-EV'));
    act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(menu()).toBeNull();
  });
});
