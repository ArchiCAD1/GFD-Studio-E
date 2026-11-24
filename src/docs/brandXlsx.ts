import JSZip from 'jszip';
import type ExcelJS from 'exceljs';
import { COMPANY_NAME, companyWatermarkPng } from '../model/companyBrand';

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const VML_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing';
const VML_NS = 'urn:schemas-microsoft-com:vml';

function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
}

function nextRid(xml: string): string {
  const ids = [...xml.matchAll(/\bId="rId(\d+)"/g)].map((m) => Number(m[1]));
  return `rId${Math.max(0, ...ids) + 1}`;
}

function ensureContentType(xml: string, extension: string, contentType: string): string {
  if (new RegExp(`<Default\\b[^>]*Extension="${extension}"`).test(xml)) return xml;
  return xml.replace('</Types>', `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`);
}

function watermarkShape(relId: string): string {
  return `<v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f"><v:stroke joinstyle="miter"/><v:formulas><v:f eqn="if lineDrawn pixelLineWidth 0"/><v:f eqn="sum @0 1 0"/><v:f eqn="sum 0 0 @1"/><v:f eqn="prod @2 1 2"/><v:f eqn="prod @3 21600 pixelWidth"/><v:f eqn="prod @3 21600 pixelHeight"/><v:f eqn="sum @0 0 1"/><v:f eqn="prod @6 1 2"/><v:f eqn="prod @7 21600 pixelWidth"/><v:f eqn="sum @8 21600 0"/><v:f eqn="prod @7 21600 pixelHeight"/><v:f eqn="sum @10 21600 0"/></v:formulas><v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/><o:lock v:ext="edit" aspectratio="t"/></v:shapetype><v:shape id="CH" o:spid="_x0000_s1025" type="#_x0000_t75" style="position:absolute;margin-left:0;margin-top:0;width:38pt;height:38pt;z-index:1"><v:imagedata o:relid="${relId}" o:title="Company logo"/><o:lock v:ext="edit" rotation="t"/></v:shape>`;
}

function brandVml(relId: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xml xmlns:v="${VML_NS}" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>${watermarkShape(relId)}</xml>`;
}

function headerFooterValue(xml: string, name: string): string {
  const value = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`).exec(xml)?.[1] ?? '';
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function brandedHeader(value: string): string {
  return value.includes('&G') ? value : `&C&G${value}`;
}

function brandedFooter(value: string): string {
  const right = value.includes('&R') ? value.slice(value.lastIndexOf('&R') + 2) : 'Page &P of &N';
  return `&L&"Arial,Bold"&8${COMPANY_NAME}&R${right}`;
}

function brandedHeaderFooter(xml: string): string {
  const oddHeader = headerFooterValue(xml, 'oddHeader');
  const oddFooter = headerFooterValue(xml, 'oddFooter');
  const header = (name: string) => brandedHeader(headerFooterValue(xml, name) || oddHeader);
  const footer = (name: string) => brandedFooter(headerFooterValue(xml, name) || oddFooter);
  const field = (name: string, value: string) => `<${name}>${xmlEscape(value)}</${name}>`;
  return `<headerFooter differentFirst="1" differentOddEven="1">${field('oddHeader', header('oddHeader'))}${field('evenHeader', header('evenHeader'))}${field('firstHeader', header('firstHeader'))}${field('oddFooter', footer('oddFooter'))}${field('evenFooter', footer('evenFooter'))}${field('firstFooter', footer('firstFooter'))}</headerFooter>`;
}

function replaceHeaderFooter(xml: string): string {
  const existing = /<headerFooter\b[^>]*>[\s\S]*?<\/headerFooter>/.exec(xml)?.[0] ?? /<headerFooter\b[^>]*\/>/.exec(xml)?.[0] ?? '';
  const headerFooter = brandedHeaderFooter(existing);
  if (existing) return xml.replace(existing, headerFooter);
  for (const tag of ['pageSetup', 'pageMargins', 'sheetPr', 'sheetFormatPr']) {
    const match = new RegExp(`<${tag}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tag}>)`).exec(xml);
    if (match) return xml.replace(match[0], `${match[0]}${headerFooter}`);
  }
  return xml.replace('</worksheet>', `${headerFooter}</worksheet>`);
}

async function setHeaderWatermark(zip: JSZip, sheetPath: string, sheetNo: number, mediaBytes: Uint8Array): Promise<void> {
  const sheet = zip.file(sheetPath);
  if (!sheet) return;
  let sheetXml = await sheet.async('string');
  if (sheetXml.includes('<!--gfde-company-brand-->')) return;
  const sheetRelPath = `${sheetPath.slice(0, sheetPath.lastIndexOf('/') + 1)}_rels/${sheetPath.slice(sheetPath.lastIndexOf('/') + 1)}.rels`;
  let sheetRels = await zip.file(sheetRelPath)?.async('string') ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"></Relationships>`;
  const rid = nextRid(sheetRels);
  const vmlName = `vmlDrawingHF${sheetNo}.vml`;
  const vmlPath = `xl/drawings/${vmlName}`;
  const vmlRelsPath = `xl/drawings/_rels/${vmlName}.rels`;
  const sheetRelation = `<Relationship Id="${rid}" Type="${VML_REL}" Target="../drawings/${vmlName}"/>`;
  sheetRels = sheetRels.replace('</Relationships>', `${sheetRelation}</Relationships>`);
  zip.file(sheetRelPath, sheetRels);

  const vmlRid = 'rId1';
  zip.file(vmlPath, brandVml(vmlRid));
  zip.file(vmlRelsPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="${vmlRid}" Type="${IMAGE_REL}" Target="../media/gfde-company-logo-watermark.png"/></Relationships>`);
  zip.file('xl/media/gfde-company-logo-watermark.png', mediaBytes);

  sheetXml = replaceHeaderFooter(sheetXml);
  if (!sheetXml.includes('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')) {
    sheetXml = sheetXml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  }
  sheetXml = sheetXml.replace(/<legacyDrawingHF\b[^>]*\/>/g, '');
  sheetXml = sheetXml.replace(/<legacyDrawingHF\b[^>]*>\s*<\/legacyDrawingHF>/g, '');
  const brandReference = `<legacyDrawingHF r:id="${rid}"/><!--gfde-company-brand-->`;
  if (/<\/headerFooter>/.test(sheetXml)) sheetXml = sheetXml.replace(/<\/headerFooter>/, `</headerFooter>${brandReference}`);
  else sheetXml = sheetXml.replace('</worksheet>', `${brandReference}</worksheet>`);
  zip.file(sheetPath, sheetXml);
}

/** Adds a fixed company header logo and company/page footer to every printed worksheet. */
export async function brandXlsxBytes(input: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(input);
  const sheetPaths = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetPaths.length) return input;
  const image = await companyWatermarkPng();
  let types = await zip.file('[Content_Types].xml')?.async('string');
  if (types) {
    types = ensureContentType(types, 'png', 'image/png');
    types = ensureContentType(types, 'vml', 'application/vnd.openxmlformats-officedocument.vmlDrawing');
    zip.file('[Content_Types].xml', types);
  }
  for (const [index, path] of sheetPaths.entries()) await setHeaderWatermark(zip, path, index + 1, image);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function brandWorkbook(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  return brandXlsxBytes(new Uint8Array(await workbook.xlsx.writeBuffer()));
}
