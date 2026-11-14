// @vitest-environment jsdom
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
  it('draws its texts with their capitals at their height', () => {
    const def: CadBlockDef = { name: 'DB', items: [{ id: 'l', kind: 'line', layer: '0', pts: [[0, -100], [400, -100]] }, { id: 't', kind: 'text', layer: '0', pts: [[0, 0]], text: 'DB-1', h: 100 }] };
    act(() => root.render(<BlockThumb def={def} defs={[]} />));
    const text = host.querySelector('svg.cad-bk-thumb text')!;
    expect(text.textContent).toBe('DB-1');
    // The font 2048 / 1467 times the capitals (Arial's em per capital).
    expect(Number(text.getAttribute('font-size'))).toBeCloseTo((blockThumb(def).texts[0].h * 2048) / 1467, 9);
  });
});
