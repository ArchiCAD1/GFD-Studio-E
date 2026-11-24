import { Document, Packer, Paragraph } from 'docx';
import JSZip from 'jszip';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { companyWatermarkPng } from '../model/companyBrand';
import { companyPageFooter, companyPageHeader } from './brandWord';

describe('fixed company branding in Word exports', () => {
  it('puts the 10% logo in every page header and the company name in the footer', async () => {
    const watermarkBytes = await companyWatermarkPng();
    const doc = new Document({ sections: [{
      headers: { default: companyPageHeader([], watermarkBytes), first: companyPageHeader([], watermarkBytes) },
      footers: { default: companyPageFooter(), first: companyPageFooter() },
      children: [new Paragraph('Report')]
    }] });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
    const header = await zip.file('word/header1.xml')!.async('string');
    const headerRels = await zip.file('word/_rels/header1.xml.rels')!.async('string');
    const footer = await zip.file('word/footer1.xml')!.async('string');
    expect(header).toContain('<w:drawing>');
    expect(headerRels).toContain('image');
    expect(footer).toContain('Gerardo Faustin Designs Limited');
    const mediaPath = Object.keys(zip.files).find((path) => path.startsWith('word/media/') && path.endsWith('.png'))!;
    const watermarkImage = PNG.sync.read(Buffer.from(await zip.file(mediaPath)!.async('uint8array')));
    const maxAlpha = watermarkImage.data.reduce((max, value, index) => index % 4 === 3 ? Math.max(max, value) : max, 0);
    expect(maxAlpha).toBe(26);
  });
});
