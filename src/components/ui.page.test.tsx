// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Page } from './ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => { root = createRoot(document.body.appendChild(document.createElement('div'))); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

describe('Page', () => {
  it('without info or head keeps the title directly in the head, and the intro paragraph', () => {
    act(() => root.render(<Page title="Study" intro="About it"><p>body</p></Page>));
    expect(document.querySelector('.stage-head > h3')!.textContent).toBe('Study');
    expect(document.querySelector('.stage-title')).toBeNull();
    expect(document.querySelector('p.intro')!.textContent).toBe('About it');
    expect(document.querySelector('.info-btn')).toBeNull();
  });

  it('with info shows an i button and the help in a popover, not as an intro', () => {
    act(() => root.render(<Page title="Study" info={<p>Help text</p>} head={<span className="x">Extra</span>}><p>body</p></Page>));
    expect(document.querySelector('p.intro')).toBeNull();
    expect(document.querySelector('.stage-head .stage-title > h3')!.textContent).toBe('Study');
    expect(document.querySelector('.stage-title .x')!.textContent).toBe('Extra');
    expect(document.querySelector('.info-pop')).toBeNull();
    act(() => { document.querySelector<HTMLButtonElement>('.info-btn')!.click(); });
    expect(document.querySelector('.info-pop')!.textContent).toBe('Help text');
    expect(document.querySelector('.info-pop')!.closest('.stage')).toBeNull(); // on the body, so the header's scroll box cannot clip it
    act(() => { document.querySelector('.info-pop p')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(document.querySelector('.info-pop')).not.toBeNull(); // a click inside keeps it open
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(document.querySelector('.info-pop')).toBeNull();
  });
});
