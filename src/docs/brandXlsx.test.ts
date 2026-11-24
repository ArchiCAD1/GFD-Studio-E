import { PNG } from 'pngjs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { brandWorkbook, brandXlsxBytes } from './brandXlsx';

describe('fixed branding in Excel exports', () => {
  it('places the watermarked logo and company/page footer in every printed worksheet', async () => {
    const workbook = new ExcelJS.Workbook();
    const first = workbook.addWorksheet('Schedule');
    first.getCell('A1').value = 'Load schedule';
    const second = workbook.addWorksheet('Summary');
    second.getCell('A1').value = 'Project summary';

    const bytes = await brandWorkbook(workbook);
    const zip = await JSZip.loadAsync(bytes);
    const sheets = ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'];
    for (const path of sheets) {
      const xml = await zip.file(path)!.async('string');
      expect(xml).toContain('&amp;C&amp;G');
      expect(xml).toContain('Gerardo Faustin Designs Limited');
      expect(xml).toContain('Page &amp;P of &amp;N');
      expect(xml).toContain('legacyDrawingHF');
      expect(xml).toContain('gfde-company-brand');
    }
    const vml = Object.keys(zip.files).filter((path) => /^xl\/drawings\/vmlDrawingHF\d+\.vml$/.test(path));
    expect(vml).toHaveLength(2);
    const image = PNG.sync.read(Buffer.from(await zip.file('xl/media/gfde-company-logo-watermark.png')!.async('uint8array')));
    const maxAlpha = image.data.reduce((max, value, index) => index % 4 === 3 ? Math.max(max, value) : max, 0);
    expect(maxAlpha).toBe(26);

    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof reopened.xlsx.load>[0]);
    expect(reopened.getWorksheet('Schedule')!.getCell('A1').value).toBe('Load schedule');
    expect(reopened.getWorksheet('Summary')!.getCell('A1').value).toBe('Project summary');

    const again = await brandXlsxBytes(bytes);
    const repeated = await JSZip.loadAsync(again);
    expect(Object.keys(repeated.files).filter((path) => /^xl\/drawings\/vmlDrawingHF\d+\.vml$/.test(path))).toHaveLength(2);
  });
});
