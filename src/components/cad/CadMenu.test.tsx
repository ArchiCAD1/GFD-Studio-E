// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadMenu from './CadMenu';
import { CadPromptMenu } from './CadCommandLine';
import type { CtxEntry, CtxHead, CtxItem } from './cadContextMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items: CtxEntry[] = [
  { label: 'Repeat LINE', key: 'Enter', act: 'repeat', arg: '0', icon: 'repeat' },
  { label: 'Line tools', icon: 'tools', sub: [{ label: 'Trim', key: 'TR', act: 'sk', arg: 'trim', icon: 'trim' }, { label: 'Justify', sub: [{ label: 'Left', act: 'sk', arg: 'txjust|L' }, { label: 'Centre', act: 'sk', arg: 'txjust|C', now: true, off: true }] }, '-', { label: 'Offset', key: 'O', act: 'sk', arg: 'offset' }] },
  '-',
  { label: 'Paste', cmd: 'PASTECLIP', off: true, icon: 'paste' },
  { label: 'Erase', key: 'Del', cmd: 'ERASE', bad: true, icon: 'erase' },
  { label: 'Place device', key: 'DEV', cmd: 'DEV', lv: true },
  { label: 'Properties', key: 'Ctrl+1', act: 'properties', on: true, icon: 'properties' },
  { label: 'Ortho', key: 'F8', cmd: 'ORTHO', on: false }
];
const head: CtxHead = { icon: 'line', title: 'Line', detail: '2.34 m · A-WALL', second: '2 Line · 1 Circle' };

describe('CadMenu', () => {
  let root: Root, host: HTMLDivElement, picked: CtxItem[], closed: number;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); picked = []; closed = 0; });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); });
  const show = (h: CtxHead | undefined = head, list: CtxEntry[] = items) => act(() => root.render(<CadMenu left={10} top={10} head={h} items={list} label="Edit drawn objects" onPick={(x) => picked.push(x)} onClose={() => { closed += 1; }} />));
  const menu = () => document.querySelector('[role="menu"][aria-label="Edit drawn objects"]') as HTMLElement;
  const row = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.querySelector('.lb')?.textContent === label)!;
  const press = (key: string, el: Element | null = document.activeElement) => act(() => { el!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
  const focused = () => document.activeElement?.querySelector('.lb')?.textContent;

  it('has the header, the rows as direct children, and takes the focus', () => {
    show();
    expect(menu().querySelector('.cad-menu-hd')!.textContent).toBe('Line · 2.34 m · A-WALL');
    expect(menu().querySelector('.cad-menu-hd svg')).not.toBeNull();
    expect(menu().querySelector('.cad-menu-hd2')!.textContent).toBe('2 Line · 1 Circle');
    expect(menu().querySelector('.cad-menu-hd')!.tagName).toBe('DIV');
    expect([...menu().querySelectorAll(':scope > button')]).toHaveLength(7);
    expect(document.activeElement).toBe(menu());
    expect(menu().classList.contains('cad-menu')).toBe(true);
  });

  it('a row: its icon in the slot (an empty one keeps the labels level), the key on the right, a check for a switch that is on, a chevron for a list', () => {
    show();
    expect(row('Repeat LINE').querySelector('.ic svg')).not.toBeNull();
    expect(row('Place device').querySelector('.ic')!.children).toHaveLength(0);
    expect(row('Repeat LINE').querySelector('.k')!.textContent).toBe('Enter');
    expect(row('Properties').getAttribute('role')).toBe('menuitemcheckbox');
    expect(row('Properties').getAttribute('aria-checked')).toBe('true');
    expect(row('Properties').querySelector('.ck svg')).not.toBeNull();
    // A switch that is off: an empty check slot (keys stay level), no check.
    expect([row('Ortho').getAttribute('aria-checked'), !!row('Ortho').querySelector('.ck'), row('Ortho').querySelector('.ck svg')]).toEqual(['false', true, null]);
    expect(row('Repeat LINE').getAttribute('role')).toBe('menuitem');
    expect(row('Line tools').querySelector('.ch svg')).not.toBeNull();
    expect([row('Line tools').getAttribute('aria-haspopup'), row('Line tools').getAttribute('aria-expanded')]).toEqual(['menu', 'false']);
    expect([row('Erase').className, row('Place device').className, row('Paste').disabled]).toEqual(['bad', 'lv', true]);
    expect(row('Repeat LINE').textContent!.startsWith('Repeat LINE')).toBe(true);
  });

  it('a click runs the entry; a list opens on a click and on hover, and its entries run too; a disabled row does not run', () => {
    show();
    act(() => row('Erase').click());
    act(() => row('Paste').click());
    expect(picked.map((x) => x.label)).toEqual(['Erase']);
    act(() => row('Line tools').click());
    expect(document.querySelector('[role="menu"][aria-label="Line tools"]')).not.toBeNull();
    expect(row('Line tools').getAttribute('aria-expanded')).toBe('true');
    act(() => row('Trim').click());
    expect(picked.map((x) => x.label)).toEqual(['Erase', 'Trim']);
    act(() => row('Line tools').click());
    expect(document.querySelector('[aria-label="Line tools"]')).toBeNull();
    act(() => { row('Line tools').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(document.querySelector('[aria-label="Line tools"]')).not.toBeNull();
  });

  it('a list inside a list opens beside its row; the current choice shows a check and the word now', () => {
    show();
    act(() => row('Line tools').click());
    act(() => row('Justify').click());
    const inner = document.querySelector('[role="menu"][aria-label="Justify"]') as HTMLElement;
    expect(inner).not.toBeNull();
    const now = [...inner.querySelectorAll('button')].find((b) => b.textContent!.startsWith('Centre'))!;
    expect(now.querySelector('.ic.now svg')).not.toBeNull();
    expect(now.querySelector('.k')!.textContent).toBe('now');
    expect(now.disabled).toBe(true);
    act(() => [...inner.querySelectorAll('button')].find((b) => b.textContent!.startsWith('Left'))!.click());
    expect(picked.map((x) => x.arg)).toEqual(['txjust|L']);
  });

  it('Down and Up move over the rows, skipping separators and disabled rows, and wrap; Home and End go to the ends', () => {
    show();
    press('ArrowDown');
    expect(focused()).toBe('Repeat LINE');
    press('ArrowDown');
    expect(focused()).toBe('Line tools');
    press('ArrowDown'); // past the separator and the disabled Paste
    expect(focused()).toBe('Erase');
    press('End');
    expect(focused()).toBe('Ortho');
    press('ArrowDown');
    expect(focused()).toBe('Repeat LINE');
    press('ArrowUp');
    expect(focused()).toBe('Ortho');
    press('Home');
    expect(focused()).toBe('Repeat LINE');
  });

  it('Right opens the list of the focused row and focuses its first row; Left closes it and goes back to the row', () => {
    show();
    press('ArrowDown'); press('ArrowDown');
    press('ArrowRight');
    expect(document.querySelector('[aria-label="Line tools"]')).not.toBeNull();
    expect(focused()).toBe('Trim');
    press('ArrowDown'); // Justify
    press('ArrowRight');
    expect(focused()).toBe('Left');
    press('ArrowLeft');
    expect(document.querySelector('[aria-label="Justify"]')).toBeNull();
    expect(focused()).toBe('Justify');
    press('ArrowDown');
    expect(focused()).toBe('Offset');
    press('ArrowLeft');
    expect(document.querySelector('[aria-label="Line tools"]')).toBeNull();
    expect(focused()).toBe('Line tools');
  });

  it('Enter and Space run the focused row, or open its list; the page\'s key handler does not also see them', () => {
    const seen: string[] = [];
    const spy = (e: KeyboardEvent) => seen.push(e.key);
    window.addEventListener('keydown', spy);
    show();
    press('ArrowDown');
    press('Enter');
    expect(picked.map((x) => x.label)).toEqual(['Repeat LINE']);
    press('ArrowDown');
    press(' ');
    expect(focused()).toBe('Trim');
    press('Enter');
    expect(picked.map((x) => x.arg)).toEqual(['0', 'trim']);
    press('ArrowDown');
    expect(seen).toEqual([]);
    window.removeEventListener('keydown', spy);
  });

  it('Esc closes the innermost list first, then the menu is closed with onClose', () => {
    show();
    press('ArrowDown'); press('ArrowDown'); press('ArrowRight'); press('ArrowDown'); press('ArrowRight');
    expect(document.querySelector('[aria-label="Justify"]')).not.toBeNull();
    press('Escape');
    expect([document.querySelector('[aria-label="Justify"]'), closed]).toEqual([null, 0]);
    expect(focused()).toBe('Justify');
    press('Escape');
    expect([document.querySelector('[aria-label="Line tools"]'), closed, focused()]).toEqual([null, 0, 'Line tools']);
    press('Escape');
    expect(closed).toBe(1);
  });

  it('a letter moves to the next enabled row that starts with it, wrapping', () => {
    show();
    press('p'); // Paste is off, so Place device
    expect(focused()).toBe('Place device');
    press('p');
    expect(focused()).toBe('Properties');
    press('P');
    expect(focused()).toBe('Place device');
    press('r');
    expect(focused()).toBe('Repeat LINE');
    press('z');
    expect(focused()).toBe('Repeat LINE');
  });

  it('keys the menu handles are not left to the page', () => {
    show();
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    act(() => { menu().dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
  });

  it('works without a header, and CadPromptMenu is the same menu labelled Command menu', () => {
    act(() => root.render(<CadPromptMenu left={4} top={4} items={items} onPick={() => {}} />));
    expect(document.querySelector('[role="menu"][aria-label="Command menu"]')).not.toBeNull();
    expect(document.querySelector('.cad-menu-hd')).toBeNull();
    expect([...document.querySelectorAll('[aria-label="Command menu"] > button')]).toHaveLength(7);
  });
});
