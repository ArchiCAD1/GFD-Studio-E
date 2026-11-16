// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_GAP, placeList, placeMenu } from './cadMenuPlace';
import { CadPromptMenu } from './CadCommandLine';
import type { CtxEntry } from './cadContextMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const area = { width: 800, height: 600 };
const menu = { width: 200, height: 300 };

describe('placeMenu', () => {
  it('opens right and down from the cursor when it fits', () => {
    expect(placeMenu([100, 100], menu, area)).toEqual({ left: 104, top: 104 });
  });
  it('opens above the cursor near the bottom edge, so its last rows can be reached', () => {
    expect(placeMenu([100, 500], menu, area)).toEqual({ left: 104, top: 500 - MENU_GAP - 300 });
  });
  it('opens to the left of the cursor near the right edge', () => {
    expect(placeMenu([700, 100], menu, area)).toEqual({ left: 700 - MENU_GAP - 200, top: 104 });
  });
  it('opens up and to the left in the bottom-right corner', () => {
    expect(placeMenu([790, 590], menu, area)).toEqual({ left: 586, top: 286 });
  });
  it('stays inside when neither side has room: against the nearer edge', () => {
    // 250 px high in a 300 px area, cursor in the middle: below would run out, above too.
    expect(placeMenu([50, 150], { width: 200, height: 250 }, { width: 800, height: 300 })).toEqual({ left: 54, top: 46 });
  });
  it('is capped at the area\'s height (then it scrolls) when it is taller than the drawing', () => {
    expect(placeMenu([100, 400], { width: 200, height: 716 }, area)).toEqual({ left: 104, top: MENU_GAP, maxHeight: 600 - 2 * MENU_GAP });
  });
  it('starts at the left edge when it is wider than the drawing', () => {
    expect(placeMenu([100, 100], { width: 900, height: 100 }, area).left).toBe(MENU_GAP);
  });
});

describe('placeList', () => {
  const a = { left: 0, top: 0, width: 800, height: 600 };
  const m = { left: 100, top: 100, width: 200, height: 300 };
  const row = (top: number) => ({ left: 100, top, width: 200, height: 24 });
  it('opens right of the menu, its first entry level with the row', () => {
    expect(placeList(m, row(160), { width: 150, height: 100 }, a)).toEqual({ left: 304, top: 156 });
  });
  it('opens left of the menu when there is no room on the right', () => {
    const right = { ...m, left: 600 };
    expect(placeList(right, row(160), { width: 150, height: 100 }, a)).toEqual({ left: 600 - MENU_GAP - 150, top: 156 });
  });
  it('lies over the menu at the right edge when there is room on neither side', () => {
    const wide = { left: 10, top: 0, width: 780, height: 300 };
    expect(placeList(wide, row(50), { width: 150, height: 100 }, a).left).toBe(800 - MENU_GAP - 150);
  });
  it('moves up to stay inside near the bottom edge', () => {
    expect(placeList(m, row(560), { width: 150, height: 100 }, a).top).toBe(600 - MENU_GAP - 100);
  });
  it('works in the window\'s frame (the drawing area offset on the page)', () => {
    const page = { left: 260, top: 120, width: 800, height: 600 };
    const pm = { left: 900, top: 300, width: 200, height: 300 };
    expect(placeList(pm, { left: 900, top: 680, width: 200, height: 24 }, { width: 150, height: 100 }, page)).toEqual({ left: 900 - MENU_GAP - 150, top: 120 + 600 - MENU_GAP - 100 });
  });
});

// The menu component in a 400 × 300 drawing area, with the browser's layout stood in for (jsdom has none).
describe('CadPromptMenu kept inside the drawing', () => {
  let root: Root, areaEl: HTMLDivElement;
  let menuH = 250;
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  const isMenu = (el: HTMLElement) => el.classList.contains('cad-ctx');
  const isList = (el: HTMLElement) => el.classList.contains('cad-ctx-list');
  beforeEach(() => {
    menuH = 250;
    areaEl = document.createElement('div'); areaEl.className = 'area'; document.body.appendChild(areaEl); root = createRoot(areaEl);
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) { return isMenu(this) ? this.parentElement : null; });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return isMenu(this) ? 200 : isList(this) ? 150 : 0; });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return isMenu(this) ? menuH : isList(this) ? 100 : 0; });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return isMenu(this) ? menuH : 0; });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this === areaEl ? 400 : isMenu(this) ? 200 : 0; });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this === areaEl ? 300 : isMenu(this) ? menuH : 0; });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === areaEl) return rect(0, 0, 400, 300);
      if (isMenu(this)) return rect(parseFloat(this.style.left) || 0, parseFloat(this.style.top) || 0, 200, menuH);
      const m = this.closest('.cad-ctx') as HTMLElement | null;
      const i = m ? [...m.children].indexOf(this) : 0;
      return rect(parseFloat(m?.style.left ?? '0') || 0, (parseFloat(m?.style.top ?? '0') || 0) + 4 + 24 * i, 200, 24);
    });
  });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); });

  const items: CtxEntry[] = [
    { label: 'Repeat LINE', key: 'Enter', act: 'repeat', arg: '0' },
    { label: 'Recent commands', sub: [{ label: 'MOVE', act: 'repeat', arg: '1' }, { label: 'TRIM', act: 'repeat', arg: '2' }] },
    '-',
    { label: 'Properties', key: 'Ctrl+1', act: 'properties' }
  ];
  const menuEl = () => document.querySelector('[aria-label="Command menu"]') as HTMLElement;

  it('opens up and to the left after a right-click in the bottom-right corner', () => {
    act(() => root.render(<CadPromptMenu left={380 + 4} top={280 + 4} items={items} onPick={() => {}} />));
    expect(menuEl().style.left).toBe(`${380 - 4 - 200}px`);
    expect(menuEl().style.top).toBe(`${280 - 4 - 250}px`);
    expect(menuEl().style.maxHeight).toBe('');
  });

  it('stays where it opened when it fits', () => {
    act(() => root.render(<CadPromptMenu left={24} top={24} items={items} onPick={() => {}} />));
    expect([menuEl().style.left, menuEl().style.top]).toEqual(['24px', '24px']);
  });

  it('scrolls when it is taller than the drawing, from the top edge', () => {
    menuH = 716;
    act(() => root.render(<CadPromptMenu left={104} top={204} items={items} onPick={() => {}} />));
    expect(menuEl().style.top).toBe('4px');
    expect(menuEl().style.maxHeight).toBe('292px');
    expect(menuEl().style.overflowY).toBe('auto');
  });

  it('opens a list beside its row, to the left when the menu is at the right edge', () => {
    act(() => root.render(<CadPromptMenu left={384} top={30} items={items} onPick={() => {}} />));
    const row = [...menuEl().querySelectorAll('button')].find((b) => b.textContent?.startsWith('Recent commands'))!;
    act(() => { row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    const list = document.querySelector('[aria-label="Recent commands"]') as HTMLElement;
    expect(list).not.toBeNull();
    expect(list.style.position).toBe('fixed');
    // The menu went left of the cursor (176), so the list goes left of the menu: 176 − 4 − 150.
    expect(list.style.left).toBe(`${176 - 4 - 150}px`);
    // Level with its row (the menu's second child: menu top 30 + 4 + 24), less the list's own inset.
    expect(list.style.top).toBe(`${30 + 4 + 24 - 4}px`);
  });
});
