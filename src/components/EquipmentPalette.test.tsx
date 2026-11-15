// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EquipmentPalette from './EquipmentPalette';
import SystemDiagram from './SystemDiagram';
import { getArmedItem, setArmedItem, subscribeArmedItem } from '../diagram/dragItem';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';
import { canDrop, dropsOn, itemKey, PALETTE, type DropTarget, type PaletteItem } from '../model/sldEdit';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement;
beforeEach(() => { localStorage.clear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; setArmedItem(null); });

const row = (name: string) => [...document.querySelectorAll<HTMLElement>('.eq-row')].find((t) => t.querySelector('.eq-rname')?.textContent === name)!;
const catLabel = (b: Element) => b.getAttribute('aria-label')!.replace(/ \(\d+\)$/, '');
const cat = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('.eq-cat')].find((b) => catLabel(b) === name)!;
const byLabel = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const rowNames = () => [...document.querySelectorAll('.eq-rname')].map((t) => t.textContent);
const click = (el: Element, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })); });

describe('dropsOn', () => {
  it('covers every target canDrop allows in the sample project', () => {
    const targets: DropTarget[] = [
      { type: 'canvas' },
      ...sampleProject.boards.map((b) => ({ type: 'bus' as const, boardId: b.id })),
      ...sampleProject.feeders.map((f) => ({ type: 'feeder' as const, feederId: f.id }))
    ];
    for (const { entries } of PALETTE) {
      for (const { item } of entries) {
        const where = dropsOn(item);
        expect(where.length, itemKey(item)).toBeGreaterThan(0);
        for (const t of targets) if (canDrop(sampleProject, item, t)) expect(where, `${itemKey(item)} on ${t.type}`).toContain(t.type);
      }
    }
  });
});

describe('armed item store', () => {
  it('notifies on change only', () => {
    const l = vi.fn();
    const off = subscribeArmedItem(l);
    const item: PaletteItem = { kind: 'cable' };
    setArmedItem(item);
    setArmedItem(item);
    setArmedItem(null);
    off();
    setArmedItem(item);
    expect(l).toHaveBeenCalledTimes(2);
  });
});

describe('<EquipmentPalette>', () => {
  const render = (props: Partial<Parameters<typeof EquipmentPalette>[0]> = {}) => {
    const onHint = vi.fn(), onQty = vi.fn();
    act(() => root.render(<EquipmentPalette onHint={onHint} onQty={onQty} {...props} />));
    return { onHint, onQty };
  };
  const type = (input: HTMLInputElement, value: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });

  it('has one button per category; each opens its list, another switches, a second click closes', () => {
    render();
    expect([...document.querySelectorAll('.eq-cat')].map(catLabel)).toEqual(['Supply', 'Boards', 'Protection', 'Metering', 'Cable', 'Starters', 'Loads', 'Presets', 'My presets', 'Components']);
    expect(document.querySelector('.eq-list')).toBeNull();
    click(cat('Loads'));
    expect(cat('Loads').getAttribute('aria-expanded')).toBe('true');
    expect(row('Fire pump')).toBeTruthy();
    click(cat('Boards'));
    expect(cat('Loads').getAttribute('aria-expanded')).toBe('false');
    const names = rowNames();
    expect(names).toEqual(expect.arrayContaining(['MDB', 'SMDB', 'DB', 'MCC panel'])); // boards and package panels together
    expect(names).not.toContain('Fire pump');
    expect(row('MDB').querySelectorAll('.palette-dots i')).toHaveLength(2); // busbar (under a meter cabinet) or canvas
    click(cat('Boards'));
    expect(document.querySelector('.eq-list')).toBeNull();
  });

  it('click arms an item and closes the list; the lit recent item or Esc disarms; shift-click arms × 3', () => {
    const { onHint, onQty } = render();
    click(cat('Loads'));
    click(row('AHU'));
    expect(getArmedItem()).toEqual({ kind: 'load', preset: 'ahu' });
    expect(document.querySelector('.eq-list')).toBeNull();
    expect(document.querySelector('.eq-placing')?.textContent).toContain('AHU');
    expect(onQty).toHaveBeenLastCalledWith(1);
    expect(onHint).toHaveBeenLastCalledWith(expect.stringContaining('click a busbar'));
    click(document.querySelector('.eq-recent .eq-mini.armed')!);
    expect(getArmedItem()).toBeNull();
    click(cat('Loads'));
    click(row('Chiller'), { shiftKey: true });
    expect(onQty).toHaveBeenLastCalledWith(3);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(getArmedItem()).toBeNull();
    expect(onQty).toHaveBeenLastCalledWith(1);
  });

  it('keeps the list open after a pick when pinned', () => {
    render();
    click(cat('Loads'));
    click(document.querySelector('.eq-lhead button[aria-pressed]')!);
    expect(localStorage.getItem('palette.pin')).toBe('true');
    click(row('AHU'));
    expect(getArmedItem()).not.toBeNull();
    expect(document.querySelector('.eq-list')).not.toBeNull();
  });

  it('a pick clears the hover card; Esc on a category button closes its list', () => {
    render();
    click(cat('Loads'));
    act(() => { row('AHU').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(document.querySelector('.palette-tipcard')).not.toBeNull();
    click(row('AHU'));
    expect(document.querySelector('.palette-tipcard')).toBeNull(); // the row is gone before it could see the mouse leave
    act(() => setArmedItem(null));
    click(cat('Boards'));
    key(cat('Boards'), 'Escape');
    expect(document.querySelector('.eq-list')).toBeNull();
  });

  it('pins favourites and recently used items in the strip', () => {
    render();
    expect(document.querySelector('.eq-recent')).toBeNull();
    click(cat('Loads'));
    click(row('EV charger').querySelector('.fav')!);
    click(row('Lighting'));
    expect(document.querySelectorAll('.eq-recent .eq-mini')).toHaveLength(2);
    expect(document.querySelectorAll('.eq-recent .eq-mini-fav')).toHaveLength(1);
  });

  it('search lists matches from every category; Esc clears the query, then closes', () => {
    render();
    click(byLabel('Search the equipment library'));
    const input = document.querySelector<HTMLInputElement>('.eq-list .palette-search')!;
    expect(input).toBeTruthy();
    type(input, 'rcd');
    expect(rowNames()).toContain('Earth leakage (RCD)');
    key(input, 'Escape');
    expect(document.querySelector<HTMLInputElement>('.eq-list .palette-search')!.value).toBe('');
    key(document.querySelector('.eq-list .palette-search')!, 'Escape');
    expect(document.querySelector('.eq-list')).toBeNull();
  });

  it('moves to the other side, hides and shows again', () => {
    render();
    expect(document.querySelector('.eq-strip.right')).toBeNull();
    click(byLabel('Move the strip to the right of the drawing'));
    expect(document.querySelector('.eq-strip.right')).not.toBeNull();
    expect(localStorage.getItem('palette.side')).toBe('"right"');
    click(byLabel('Hide the equipment strip'));
    expect(document.querySelector('.eq-rail')).toBeNull();
    click(byLabel('Show the equipment strip'));
    expect(document.querySelector('.eq-rail')).not.toBeNull();
  });

  it('closes an unpinned list on a click outside, but not a pinned one', () => {
    render();
    const outside = () => act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    click(cat('Loads'));
    outside();
    expect(document.querySelector('.eq-list')).toBeNull();
    click(cat('Loads'));
    click(document.querySelector('.eq-lhead button[aria-pressed]')!);
    outside();
    expect(document.querySelector('.eq-list')).not.toBeNull();
  });
});

describe('click to place on the drawing', () => {
  const draw = (onDropItem: (i: PaletteItem, t: DropTarget) => void) => {
    const p = sampleProject;
    act(() => root.render(<SystemDiagram project={p} calcProject={p} results={evaluateProject(p)} selectedFeederId={null} selectedBoardId={null} onSelectFeeder={() => {}} onSelectBoard={() => {}} onDropItem={onDropItem} />));
    return host.querySelector<SVGSVGElement>('.sysdiag > svg')!;
  };
  const under = (el: Element | null) => { document.elementFromPoint = () => el; };
  (SVGElement.prototype as unknown as { getScreenCTM: () => null }).getScreenCTM = () => null; // not in jsdom

  it('places the armed item where the drawing is clicked, then disarms', () => {
    const drop = vi.fn();
    const svg = draw(drop);
    under(null);
    setArmedItem({ kind: 'transformer' });
    click(svg);
    expect(drop).toHaveBeenCalledWith({ kind: 'transformer' }, { type: 'canvas' });
    expect(getArmedItem()).toBeNull();
  });

  it('places on a busbar; shift-click keeps it armed; nowhere valid places nothing', () => {
    const drop = vi.fn();
    const svg = draw(drop);
    const bus = svg.querySelector('[data-drop^="bus:"]')!;
    const boardId = bus.getAttribute('data-drop')!.slice(4);
    act(() => setArmedItem({ kind: 'load', preset: 'ahu' }));
    under(null);
    click(svg); // a load can't go on the empty canvas
    expect(drop).not.toHaveBeenCalled();
    expect(getArmedItem()).not.toBeNull();
    under(bus);
    click(bus, { shiftKey: true });
    expect(drop).toHaveBeenCalledWith({ kind: 'load', preset: 'ahu' }, { type: 'bus', boardId });
    expect(getArmedItem()).not.toBeNull();
  });

  it('selects as usual when nothing is armed', () => {
    const drop = vi.fn();
    const svg = draw(drop);
    under(null);
    click(svg);
    expect(drop).not.toHaveBeenCalled();
  });
});

describe('<EquipmentPalette accepts> (the Board tab)', () => {
  const noXfmrOrStarter = (i: PaletteItem) => i.kind !== 'transformer' && i.kind !== 'starter';
  const show = (accepts?: (i: PaletteItem) => boolean) => act(() => root.render(<EquipmentPalette onHint={() => {}} accepts={accepts} />));

  it('lists only what the board takes; a category with none leaves, My presets and Components stay', () => {
    show(noXfmrOrStarter);
    const labels = [...document.querySelectorAll('.eq-cat')].map(catLabel);
    expect(labels).not.toContain('Starters');
    expect(labels).toEqual(expect.arrayContaining(['Supply', 'My presets', 'Components']));
    click(cat('Supply'));
    expect(rowNames()).not.toContain('Transformer');
    expect(rowNames().length).toBeGreaterThan(0);
  });

  it('closes a list whose category has left the strip', () => {
    show();
    click(cat('Starters'));
    expect(document.querySelector('.eq-list')).not.toBeNull();
    show(noXfmrOrStarter);
    expect(document.querySelector('.eq-list')).toBeNull();
  });
});
