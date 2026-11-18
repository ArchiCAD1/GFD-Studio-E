// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlockThumb } from './BlocksPalette';
import { blockThumb } from '../../model/cadBlockLibrary';
import type { CadBlockDef } from '../../model/cadBlocks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('a block\'s preview in the Blocks palette', () => {
  it('draws its texts with their capitals at their height, black, under the app\'s svg text rule', () => {
    // The app's `svg text` rule (11 px, the theme's text colour) beat the size and colour attributes: near-white text
    // far larger than the 1.33 × 1 picture.
    const style = document.head.appendChild(document.createElement('style'));
    style.textContent = readFileSync('src/styles.css', 'utf8').match(/(?:^|\n)svg text\{[^}]*\}/)![0];
    const def: CadBlockDef = { name: 'DB', items: [{ id: 'l', kind: 'line', layer: '0', pts: [[0, -100], [400, -100]] }, { id: 't', kind: 'text', layer: '0', pts: [[0, 0]], text: 'DB-1', h: 100 }] };
    act(() => root.render(<BlockThumb def={def} defs={[]} />));
    const text = host.querySelector('svg.cad-bk-thumb text')!, cs = getComputedStyle(text);
    expect(text.textContent).toBe('DB-1');
    // The font 2048 / 1467 times the capitals (Arial's em per capital).
    expect(parseFloat(cs.fontSize)).toBeCloseTo((blockThumb(def).texts[0].h * 2048) / 1467, 4);
    expect(cs.fontFamily).toBe('system-ui, sans-serif');
    expect(cs.fill).toBe('rgb(0, 0, 0)');
    style.remove();
  });
});
