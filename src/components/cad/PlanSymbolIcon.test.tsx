// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PlanSymbolIcon from './PlanSymbolIcon';

describe('PlanSymbolIcon', () => {
  it('draws the symbol at 4 px per paper mm, hidden from the button\'s name', () => {
    const html = renderToStaticMarkup(<PlanSymbolIcon id="junction-box" />);
    // A 3.5 mm circle with 0.3 mm round it: 4.1 mm = 16.4 px.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/width="16.4\d*" height="16.4\d*"/);
    expect(html).toContain('<circle cx="0" cy="0" r="1.75"');
    expect(html).toContain('>J</text>');
  });
  it('takes a tag, and draws nothing for a symbol that does not exist', () => {
    expect(renderToStaticMarkup(<PlanSymbolIcon id="power-outlet" tag="15 A" />)).toContain('>15 A</text>');
    expect(renderToStaticMarkup(<PlanSymbolIcon id="nothing" />)).toBe('');
  });
  it('keeps its letters at symbol size under the app\'s svg text rule', () => {
    // The palette showed F, EF, FL, C and 15 at 11 mm, over the buttons: the app's `svg text` font beat the attribute.
    const rule = readFileSync('src/styles.css', 'utf8').match(/(?:^|\n)svg text\{[^}]*\}/)?.[0];
    expect(rule).toContain('font:11px');
    document.head.innerHTML = `<style>${rule}</style>`;
    document.body.innerHTML = renderToStaticMarkup(<PlanSymbolIcon id="exhaust-fan" />);
    const text = document.querySelector('text')!;
    expect(text.textContent).toBe('EF');
    // 1.8 mm capitals / 0.716 cap height = 2.51 mm.
    expect(parseFloat(getComputedStyle(text).fontSize)).toBeCloseTo(2.51, 2);
  });
});
