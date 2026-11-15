// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SingleLineDiagram from './SingleLineDiagram';
import { getArmedItem, setArmedItem } from '../diagram/dragItem';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; setArmedItem(null); });

const board = sampleProject.boards.find((b) => b.id === 'SMDB-FF')!;
const results = evaluateProject(sampleProject).filter((r) => r.feeder.boardId === board.id);
const props = { board, project: sampleProject, results, selected: null, onSelect: () => {} };
const under = (el: Element | null) => { document.elementFromPoint = () => el; };
const click = (el: Element, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })); });
const draw = (onDropItem: () => void, onSelect = () => {}) => {
  act(() => root.render(<SingleLineDiagram {...props} onSelect={onSelect} onDropItem={onDropItem} />));
  return host.querySelector('svg')!;
};
const viewW = (svg: SVGSVGElement) => Number(svg.getAttribute('viewBox')!.split(' ')[2]);

describe('<SingleLineDiagram onDropItem> (the Board tab)', () => {
  it('draws no drop targets without onDropItem, as on printed sheets', () => {
    const html = renderToStaticMarkup(<SingleLineDiagram {...props} />);
    expect(html).not.toContain('bus-hit');
    expect(html).not.toContain('data-drop');
  });

  it('places an armed load on the busbar; shift-click keeps it armed', () => {
    const drop = vi.fn();
    const svg = draw(drop);
    const bus = svg.querySelector('.bus-hit')!;
    act(() => setArmedItem({ kind: 'load', preset: 'ahu' }));
    under(bus);
    click(bus);
    expect(drop).toHaveBeenCalledWith({ kind: 'load', preset: 'ahu' }, { type: 'bus', boardId: board.id });
    expect(getArmedItem()).toBeNull();
    act(() => setArmedItem({ kind: 'load', preset: 'ahu' }));
    click(bus, { shiftKey: true });
    expect(drop).toHaveBeenCalledTimes(2);
    expect(getArmedItem()).not.toBeNull();
  });

  it('passes the way it goes in front of when the click is between two ways', () => {
    const drop = vi.fn();
    const svg = draw(drop);
    const w = viewW(svg);
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: w, bottom: 400, width: w, height: 400, x: 0, y: 0, toJSON: () => ({}) });
    const ways = [...svg.querySelectorAll('[data-drop^="fd:"]')];
    const n = ways.length + 1;
    const cx = w / 2, x1 = cx + (1 - (n - 1) / 2) * 172; // second way
    const bus = svg.querySelector('.bus-hit')!;
    act(() => setArmedItem({ kind: 'load', preset: 'ahu' }));
    under(bus);
    click(bus, { clientX: x1 - 10 });
    expect(drop).toHaveBeenCalledWith({ kind: 'load', preset: 'ahu' }, { type: 'bus', boardId: board.id, before: results[1].feeder.id });
  });

  it('puts an armed RCD on the way under the pointer', () => {
    const drop = vi.fn();
    const svg = draw(drop);
    const way = svg.querySelector(`[data-drop="fd:${results[0].feeder.id}"]`)!;
    act(() => setArmedItem({ kind: 'accessory', accessory: 'rcd' }));
    under(way);
    click(way);
    expect(drop).toHaveBeenCalledWith({ kind: 'accessory', accessory: 'rcd' }, { type: 'feeder', feederId: results[0].feeder.id });
  });

  it('an item that cannot go there places nothing, and the click selects the way', () => {
    const drop = vi.fn(), select = vi.fn();
    const svg = draw(drop, select);
    const way = svg.querySelector(`[data-drop="fd:${results[0].feeder.id}"]`)!;
    act(() => setArmedItem({ kind: 'load', preset: 'ahu' })); // a load goes on a busbar, not a way
    under(way);
    click(way);
    expect(drop).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith(results[0].feeder.id);
    expect(getArmedItem()).not.toBeNull();
  });
});
