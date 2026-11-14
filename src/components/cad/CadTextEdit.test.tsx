// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CadTextEdit from './CadTextEdit';
import CadNoteEdit from './CadNoteEdit';
import { emPerCap, SCREEN_FONT } from '../../model/cadTextScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const noop = () => {};
const px = (v: string) => parseFloat(v);

/** The boxes a text or a note is typed in over the drawing: their letters as high as the drawing's (CAD gives a text's
 * height as its capitals, so the font is the drawing's em per capital times that). */
describe('typing over a text or a note', () => {
  it('sets the letters as the canvas does: 1 / 0.7 times the capitals before a canvas has measured its font', () => {
    act(() => root.render(<CadTextEdit left={10} top={20} h={20} w={100} rot={0} value="DB-1" onChange={noop} onCommit={noop} onCancel={noop} />));
    const input = host.querySelector('input[aria-label="Edit text"]') as HTMLInputElement;
    expect(px(input.style.fontSize)).toBeCloseTo(20 / 0.7, 6);
    expect(px(input.style.height)).toBeCloseTo(20 / 0.7, 6);
    expect(px(input.style.width)).toBe(100);
    act(() => root.render(<CadNoteEdit left={10} top={20} w={300} h={20} lineH={(20 * 5) / 3} rot={0} note={[{ runs: [{ s: 'NOTES' }] }]} heightMm={2.5} attach="TL" unitsPerPx={1}
      onHeightMm={noop} onAttach={noop} onWidth={noop} onCommit={noop} onCancel={noop} />));
    const box = host.querySelector('[aria-label="Note text"]') as HTMLDivElement;
    expect(px(box.style.fontSize)).toBeCloseTo(20 / 0.7, 6);
    expect(px(box.style.lineHeight)).toBeCloseTo((20 * 5) / 3, 6); // lines 5/3 of the height apart, as drawn
  });

  it('takes the font\'s em per capital the canvas measured, and keeps the font from 8 to 200 px', () => {
    // A canvas whose H is 72 px tall at 100 px: the font 100 / 72 times the capitals.
    const ctx = { font: '', textBaseline: 'alphabetic', measureText: () => ({ actualBoundingBoxAscent: 72 }) } as unknown as CanvasRenderingContext2D;
    expect(emPerCap(ctx, SCREEN_FONT)).toBeCloseTo(100 / 72, 9);
    act(() => root.render(<CadTextEdit left={0} top={0} h={36} w={100} rot={0} value="A" onChange={noop} onCommit={noop} onCancel={noop} />));
    const input = () => host.querySelector('input[aria-label="Edit text"]') as HTMLInputElement;
    expect(px(input().style.fontSize)).toBeCloseTo(50, 6);
    act(() => root.render(<CadTextEdit left={0} top={0} h={2} w={100} rot={0} value="A" onChange={noop} onCommit={noop} onCancel={noop} />));
    expect(px(input().style.fontSize)).toBe(8);
    act(() => root.render(<CadTextEdit left={0} top={0} h={500} w={100} rot={0} value="A" onChange={noop} onCommit={noop} onCancel={noop} />));
    expect(px(input().style.fontSize)).toBe(200);
  });
});
