import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { hasSymbol, PaletteSymbol } from './paletteSymbols';
import { itemKey, PALETTE } from '../model/sldEdit';

const boardItems = PALETTE.flatMap((c) => c.entries.map((e) => e.item)).filter((i) => i.kind === 'board');

describe('equipment strip board icons', () => {
  it('has an icon for each of the 13 board items', () => {
    expect(boardItems.map(itemKey).sort()).toEqual(
      ['MC', 'MDB', 'LV-MDB', 'LV-ACB', 'SMDB', 'DB', 'EDB', 'EMDB', 'LV-EMDB', 'UPS', 'MCC', 'EMCC', 'FP'].map((k) => `board:${k}`).sort());
    for (const i of boardItems) expect(hasSymbol(itemKey(i)), itemKey(i)).toBe(true);
  });

  it('draws each board on the 20 × 10 rectangle, fills solid', () => {
    for (const i of boardItems) {
      const svg = renderToStaticMarkup(<PaletteSymbol k={itemKey(i)} />);
      expect(svg, itemKey(i)).toContain('<rect x="2" y="7" width="20" height="10"');
      expect(svg).not.toMatch(/NaN|undefined/);
    }
    expect(renderToStaticMarkup(<PaletteSymbol k="board:SMDB" />)).toContain('fill="currentColor" stroke="none"');
    expect(renderToStaticMarkup(<PaletteSymbol k="board:DB" />)).not.toContain('fill="currentColor" stroke="none"');
    expect(renderToStaticMarkup(<PaletteSymbol k="board:MDB" />)).toContain('<rect x="4" y="9" width="16" height="6"'); // the main board's inner frame
    expect(renderToStaticMarkup(<PaletteSymbol k="board:UPS" />)).toContain('>UPS</text>');
    expect(renderToStaticMarkup(<PaletteSymbol k="board:MC" />)).toContain('>MC</text>');
  });
});
