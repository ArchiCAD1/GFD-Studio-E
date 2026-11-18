// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MleaderStyleDialog } from './CadDialogs';
import { mleaderStylesOf, type CadMleaderStyle, type CadStyles } from '../../model/cadStyles';
import { sampleProject } from '../../data/sampleProject';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const set = (label: string, v: string | boolean) => act(() => {
  const el = q<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
  if (typeof v === 'boolean') { (el as HTMLInputElement).click(); return; }
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
});
const tab = (name: string) => act(() => { [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === name)!.click(); });
const button = (name: string) => act(() => { [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name)!.click(); });
const ok = () => act(() => { q<HTMLButtonElement>('.cad-dlg-ft .p')!.click(); });

function render(styles = mleaderStylesOf(sampleProject)) {
  const onSave = vi.fn<(s: CadStyles<CadMleaderStyle>) => void>();
  act(() => root.render(<MleaderStyleDialog styles={styles} annoMm={2.5} onSave={onSave} onClose={() => {}} />));
  return onSave;
}

describe('Multileader style dialog', () => {
  it('has its three tabs and sets the arrowhead, landing and content on them', () => {
    const onSave = render();
    expect([...document.querySelectorAll('[role="tab"]')].map((b) => b.textContent)).toEqual(['Leader format', 'Leader structure', 'Content']);
    set('Arrowhead', 'dot'); set('Arrow size', '4');
    tab('Leader structure');
    set('Landing length', '5'); set('Landing', false);
    tab('Content');
    set('Content', 'none'); set('Text height (0 = annotation height)', '3.5'); set('Gap', '2'); set('Frame', true); set('Fill in the circuit of the device at the arrowhead', true);
    ok();
    expect(onSave.mock.calls[0][0].styles[0]).toMatchObject({ name: 'Standard', arrow: 'dot', arrowMm: 4, landing: false, landingMm: 5, content: 'none', textMm: 3.5, gapMm: 2, frame: true, circuit: true });
  });

  it('draws the preview black on white: two leaders to a landing and the words L1-03, with the frame when on, and no words for a style with none', () => {
    render();
    const prev = () => q('[aria-label="Preview"] svg')!;
    expect(prev().getAttribute('style')).toContain('background: white');
    expect(prev().querySelector('path')!.getAttribute('stroke')).toBe('black');
    expect(prev().querySelector('text')!.textContent).toBe('L1-03');
    const d = () => prev().querySelector('path')!.getAttribute('d')!;
    const plain = d();
    tab('Content');
    set('Frame', true);
    expect(d().length).toBeGreaterThan(plain.length);
    expect(d().endsWith('Z')).toBe(true);
    set('Content', 'none');
    expect(prev().querySelector('text')).toBeNull();
  });

  it('makes a new style from the one selected, sets another current, and keeps Standard', () => {
    const onSave = render();
    button('New');
    expect([...document.querySelectorAll('[role="option"] span')].map((b) => b.textContent)).toEqual(['Standard', 'Style 1']);
    tab('Content');
    set('Fill in the circuit of the device at the arrowhead', true);
    button('Set current');
    button('Delete'); // the current one cannot be deleted
    expect(q('[role="alert"]')!.textContent).toBe('Set another style current first.');
    ok();
    const saved = onSave.mock.calls[0][0];
    expect(saved.current).toBe('Style 1');
    expect(saved.styles.map((x) => [x.name, x.circuit])).toEqual([['Standard', false], ['Style 1', true]]);
  });

  it('refuses to delete Standard', () => {
    render();
    button('Delete');
    expect(q('[role="alert"]')!.textContent).toBe('Standard cannot be deleted.');
  });
});
