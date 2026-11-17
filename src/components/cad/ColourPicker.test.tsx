// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColourPicker } from './ColourPicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks(); });

const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;
const click = (element: Element) => act(() => { (element as HTMLElement).click(); });
const input = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const change = (element: HTMLInputElement, value: string) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('ColourPicker', () => {
  it('keeps all 255 index colours in a compact dialog and applies one only with OK', () => {
    const onChange = vi.fn();
    act(() => root.render(<ColourPicker label="Layer colour" value="idx:8" onChange={onChange} />));
    click(host.querySelector('button')!);

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.style.position).toBe(''); // fixed positioning belongs to the shared CSS, not a ribbon panel's styles
    expect(document.querySelectorAll('[data-colour-index]')).toHaveLength(255);
    expect(document.querySelector('[data-colour-index="8"]')!.className).toContain('on');

    click(document.querySelector('[data-colour-index="42"]')!);
    expect(onChange).not.toHaveBeenCalled();
    expect(input('Layer colour index number').value).toBe('42');
    click(button('OK'));
    expect(onChange).toHaveBeenCalledWith('idx:42');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('edits a true colour as Hex or RGB and rejects an invalid value', () => {
    const onChange = vi.fn();
    act(() => root.render(<ColourPicker label="Object colour" value="#ff3b30" onChange={onChange} />));
    click(host.querySelector('button')!);
    expect(document.querySelector('[role="tab"][aria-selected="true"]')!.textContent).toBe('True colour');

    const hex = input('Object colour hex');
    change(hex, '#123456');
    expect(input('Object colour r').value).toBe('18');
    expect(input('Object colour g').value).toBe('52');
    expect(input('Object colour b').value).toBe('86');
    click(button('OK'));
    expect(onChange).toHaveBeenLastCalledWith('#123456');

    click(host.querySelector('button')!);
    change(input('Object colour hex'), '#oops');
    expect(button('OK').disabled).toBe(true);
    click(button('Cancel'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('cancels with Escape and keeps ByLayer as the blank index choice', () => {
    const onChange = vi.fn();
    act(() => root.render(<ColourPicker label="Colour" value={undefined} onChange={onChange} />));
    click(host.querySelector('button')!);
    expect(document.querySelector('.cad-colour-blank')!.className).toContain('on');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('moves left or above the field to stay inside the viewport', () => {
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('cad-colour-pop') ? rect(0, 0, 420, 680) : rect(980, 100, 20, 20);
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
    act(() => root.render(<ColourPicker label="Colour" value="idx:1" onChange={vi.fn()} />));
    click(host.querySelector('button')!);
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect([dialog.style.left, dialog.style.top, dialog.style.visibility]).toEqual(['572px', '8px', 'visible']);
  });
});
