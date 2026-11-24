import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { withCompanyPrintBrand } = require('../../electron/companyPrint.cjs') as { withCompanyPrintBrand: (html: string) => string };

describe('fixed company print brand', () => {
  it('adds the 10% company watermark and legal name to every printed HTML document', () => {
    const html = withCompanyPrintBrand('<!doctype html><html><head></head><body><main>Report</main></body></html>');
    expect(html).toContain('id="gfde-company-watermark"');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('position: fixed');
    expect(html).toContain('opacity: 0.1');
    expect(html).toContain('filter: grayscale(1)');
    expect(html).toContain('bottom: 2mm');
    expect(html).toContain('Gerardo Faustin Designs Limited');
    expect(html.indexOf('gfde-company-watermark')).toBeLessThan(html.indexOf('<main>Report</main>'));
  });

  it('does not duplicate a brand already present in the HTML', () => {
    const once = withCompanyPrintBrand('<html><head></head><body><p>Report</p></body></html>');
    const twice = withCompanyPrintBrand(once);
    expect(twice).toBe(once);
  });
});
