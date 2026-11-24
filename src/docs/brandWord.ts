import { AlignmentType, Footer, Header, ImageRun, PageNumber, Paragraph, TextRun } from 'docx';
import { COMPANY_NAME } from '../model/companyBrand';

export function companyLogoRun(watermark: Uint8Array, width = 42, height = 42): ImageRun {
  return new ImageRun({
    type: 'png', data: watermark, transformation: { width, height }, decorative: true
  });
}

export function companyLogoParagraph(watermark: Uint8Array): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, children: [companyLogoRun(watermark)] });
}

export function companyPageHeader(children: Paragraph[] = [], watermark?: Uint8Array): Header {
  return new Header({ children: [...children, ...(watermark ? [companyLogoParagraph(watermark)] : [])] });
}

export function companyFooterParagraph(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: COMPANY_NAME, size: 12, color: '555555' })]
  });
}

export function companyPageFooter(): Footer {
  return new Footer({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: COMPANY_NAME, size: 12, color: '555555' }),
      new TextRun({ text: '  ·  Page ', size: 12, color: '555555' }),
      new TextRun({ children: [PageNumber.CURRENT], size: 12, color: '555555' }),
      new TextRun({ text: ' of ', size: 12, color: '555555' }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 12, color: '555555' })
    ]
  })] });
}
