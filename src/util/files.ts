import type { Project } from '../types';
import { choiceAfterSave, outputRole, saveTarget, type OutputKey, type SaveValues } from '../model/outputRoles';
import { rememberChoice, rememberedChoice, rememberedFolder } from '../model/projectFolderPlan';
import { COMPANY_NAME, companyWatermarkPng } from '../model/companyBrand';

const hasBridge = () => typeof window !== 'undefined' && !!window.gfde?.files;

export const safeFileName = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '') || 'export';

export async function brandSvg(content: string): Promise<string> {
  if (!/<svg\b/i.test(content) || content.includes('gfde-company-brand')) return content;
  const box = /\bviewBox=["']\s*(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)["']/i.exec(content);
  const width = box ? Number(box[3]) : Number(/\bwidth=["']([\d.]+)/i.exec(content)?.[1]) || 1000;
  const height = box ? Number(box[4]) : Number(/\bheight=["']([\d.]+)/i.exec(content)?.[1]) || 700;
  const x0 = box ? Number(box[1]) : 0, y0 = box ? Number(box[2]) : 0;
  const size = Math.min(width, height) * 0.36;
  const x = x0 + (width - size) / 2, y = y0 + (height - size) / 2;
  const png = await companyWatermarkPng();
  let binary = '';
  for (let i = 0; i < png.length; i += 0x8000) binary += String.fromCharCode(...png.subarray(i, i + 0x8000));
  const logo = btoa(binary);
  const fontSize = Math.max(7, height * 0.018);
  const footerY = y0 + height - fontSize;
  const escaped = COMPANY_NAME.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
  const mark = `<g id="gfde-company-brand" pointer-events="none"><image href="data:image/png;base64,${logo}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/><text x="${x0 + width / 2}" y="${footerY}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" fill="#444">${escaped}</text></g>`;
  return content.replace(/<\/svg\s*>/i, `${mark}</svg>`);
}

async function brandRaster(bytes: Uint8Array, ext: string): Promise<Uint8Array> {
  const type = ext.toLowerCase() === 'jpg' || ext.toLowerCase() === 'jpeg' ? 'image/jpeg' : 'image/png';
  const source = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
  const sourceHeight = source.height;
  const canvas = document.createElement('canvas');
  const footerHeight = Math.max(28, Math.round(source.width / 60));
  canvas.width = source.width;
  canvas.height = sourceHeight + footerHeight;
  const context = canvas.getContext('2d');
  if (!context) { source.close(); throw new Error('Could not prepare the branded image export.'); }
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0);
  source.close();
  const watermark = await companyWatermarkPng();
  const mark = await createImageBitmap(new Blob([watermark as BlobPart], { type: 'image/png' }));
  const size = Math.min(canvas.width, sourceHeight) * 0.34;
  context.drawImage(mark, (canvas.width - size) / 2, (sourceHeight - size) / 2, size, size);
  mark.close();
  context.strokeStyle = '#999';
  context.beginPath();
  context.moveTo(0, sourceHeight + 1);
  context.lineTo(canvas.width, sourceHeight + 1);
  context.stroke();
  context.fillStyle = '#333';
  context.font = `${Math.max(8, Math.min(13, Math.round(canvas.width / 90)))}px Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(COMPANY_NAME, canvas.width / 2, sourceHeight + footerHeight / 2);
  const output = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the branded image export.')), type, 0.92));
  return new Uint8Array(await output.arrayBuffer());
}

// Text a spreadsheet may run as a formula (CSV injection): = + - or @ first, also after spaces or control characters
// (some programs skip them), their full-width forms, or a tab or carriage return first.
const FORMULA_START = /^[\s\p{Cc}]*[=+\-@\uff1d\uff0b\uff0d\uff20]|^[\t\r]/u;
// Left as they are: plain numbers (-0.5, +3, 1e-7), and signs or dashes alone ("-", "--"), which hold nothing to run.
const PLAIN_NUMBER = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?\s*$/i;
const HAS_CONTENT = /[^\s\p{Cc}=+\-@\uff1d\uff0b\uff0d\uff20]/u;

/** One CSV cell: quoted when it contains a comma, quote or newline, or a semicolon or tab (which start a new cell in
 * some spreadsheets, e.g. Excel in many European languages). Text that would start a formula gets a leading
 * apostrophe, so Excel and other spreadsheets show it as text instead of running it. */
function cell(v: unknown): string {
  let s = v === undefined || v === null ? '' : String(v);
  if (typeof v !== 'number' && FORMULA_START.test(s) && HAS_CONTENT.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",;\t\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 (mm², Ω, ≤) correctly.
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

function browserDownload(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** What a save is: its output key (model/outputRoles.ts), the project, and values the caller knows for the
 * file name (revision, board, sequence). With a project folder on this computer the save dialog opens in the
 * output's folder with a name from the naming rule (spec F2); otherwise as before. */
export interface SaveContext { output: OutputKey; project?: Pick<Project, 'id' | 'name' | 'info' | 'studyReport' | 'stage' | 'revisions' | 'folder'> | null; values?: SaveValues }

interface Place { name: string; defaultDir?: string; after: (saved: string | null | undefined) => void }

/** Makes a missing folder inside the project folder (new, empty folders only); false when it cannot be there. */
async function ensureFolder(root: string, rel: string): Promise<boolean> {
  const disk = typeof window !== 'undefined' ? window.gfde?.projectFolders : undefined;
  if (!disk) return false;
  try {
    const st = await disk.status(root, [rel]);
    if (!st.exists) return false; // the project folder itself is not there: never made again from here
    if (st.present.includes(rel)) return true;
    return (await disk.create(root, [rel])).failed.length === 0;
  } catch { return false; }
}

/** The starting folder and file name for a save, and what to remember once the user chose where it went. */
export async function placeFor(defaultName: string, ext: string, ctx: SaveContext | undefined, web = !hasBridge()): Promise<Place> {
  const plain: Place = { name: defaultName, after: () => undefined };
  const p = ctx?.project;
  if (!ctx || !p?.folder) return plain;
  try {
    const role = outputRole(ctx.output).role;
    const remembered = web ? undefined : rememberedFolder(p.id);
    const choice = role && !web ? rememberedChoice(p.id, role) : undefined;
    const t = saveTarget({ project: p, output: ctx.output, defaultName, ext, values: ctx.values, remembered, choice, web });
    const dir = t.dir && t.root && t.relDir ? ((await ensureFolder(t.root, t.relDir)) ? t.dir : undefined) : t.dir;
    return {
      name: t.name,
      ...(dir ? { defaultDir: dir } : {}),
      after: (saved) => {
        if (!saved || !t.role) return;
        const c = choiceAfterSave(t, saved);
        if (c !== undefined) rememberChoice(p.id, t.role, c);
      }
    };
  } catch { return plain; }
}

/** Saves text through the desktop save dialog, or downloads it in a plain
 * browser. Resolves to a short status message, or null if cancelled. */
export async function saveText(defaultName: string, content: string, filterName: string, ext: string, ctx?: SaveContext): Promise<string | null> {
  if (ext.toLowerCase() === 'svg') content = await brandSvg(content);
  const place = await placeFor(defaultName, ext, ctx);
  if (!hasBridge()) {
    browserDownload(place.name, content, 'text/plain;charset=utf-8');
    return `Downloaded ${place.name}`;
  }
  const saved = await window.gfde.files.saveText({ defaultName: place.name, content, filterName, extensions: [ext], ...(place.defaultDir ? { defaultDir: place.defaultDir } : {}) });
  place.after(saved);
  return saved ? `Saved ${saved.split(/[\\/]/).pop()}` : null;
}

/** Saves binary content (e.g. an .xlsx workbook) through the desktop save
 * dialog, or downloads it in a plain browser. */
export async function saveBinary(defaultName: string, bytes: Uint8Array, filterName: string, ext: string, mime: string, ctx?: SaveContext): Promise<string | null> {
  return (await saveBinaryAt(defaultName, bytes, filterName, ext, mime, ctx))?.message ?? null;
}
/** As saveBinary, with where it went: the path chosen (desktop), or none (a browser download); null when cancelled. */
export async function saveBinaryAt(defaultName: string, bytes: Uint8Array, filterName: string, ext: string, mime: string, ctx?: SaveContext): Promise<{ message: string; path?: string; name: string } | null> {
  if (ext.toLowerCase() === 'xlsx') {
    const { brandXlsxBytes } = await import('../docs/brandXlsx');
    bytes = await brandXlsxBytes(bytes);
  }
  if (['png', 'jpg', 'jpeg'].includes(ext.toLowerCase())) bytes = await brandRaster(bytes, ext);
  const save = typeof window !== 'undefined' ? window.gfde?.files?.saveBinary : undefined;
  const place = await placeFor(defaultName, ext, ctx, !save);
  if (!save) {
    browserDownload(place.name, bytes as BlobPart, mime);
    return { message: `Downloaded ${place.name}`, name: place.name };
  }
  const saved = await save({ defaultName: place.name, bytes, filterName, extensions: [ext], ...(place.defaultDir ? { defaultDir: place.defaultDir } : {}) });
  place.after(saved);
  if (!saved) return null;
  const name = saved.split(/[\\/]/).pop() ?? place.name;
  return { message: `Saved ${name}`, path: saved, name };
}

export const saveCsv = (baseName: string, headers: string[], rows: unknown[][], ctx?: SaveContext) =>
  saveText(`${safeFileName(baseName)}.csv`, toCsv(headers, rows), 'CSV (Excel)', 'csv', ctx);

type Bookmarks = { title: string; page: number }[];
export type PdfPage = { pageSize?: 'A4' | 'A3' | 'A3 portrait' | 'A2' | 'A1'; landscape?: boolean; cssPages?: boolean; frame?: { headerLeft: string; headerRight: string; footerLeft: string };
  /** Fixed, or from the page (1-based) each anchor landed on. */
  bookmarks?: Bookmarks | ((pages: Record<string, number>) => Bookmarks);
  /** The document prints its own running header, footer and page numbers (CSS @page boxes): no stamped page foot. */
  selfNumbered?: boolean;
  /** Print, read the page of each anchor, and print the HTML this returns (e.g. contents with page numbers) until the pages settle. */
  paginate?: (pages: Record<string, number>) => string;
  /** An anonymized sample: the PDF information names no author (not the profile's name). Normal reports leave this off. */
  anonymous?: boolean };

/** Keep Chromium's paper setting and the document's layout in the same orientation. CSS-sized
 * documents may contain mixed paper sizes, so their own @page rules remain authoritative. */
export function pdfPageSetup(html: string, page: PdfPage = {}): { html: string; page: PdfPage } {
  if (page.cssPages) return { html, page };
  const cssPage = /@page(?:\s+[\w-]+)?\s*\{[^}]*\bsize\s*:\s*(A[1-4])(?:\s+(landscape|portrait))?/i.exec(html);
  const pageSize = page.pageSize ?? cssPage?.[1]?.toUpperCase() as PdfPage['pageSize'] ?? 'A4';
  const landscape = page.landscape ?? cssPage?.[2]?.toLowerCase() === 'landscape';
  const rule = `<style data-pdf-page>@page { size: ${pageSize} ${landscape ? 'landscape' : 'portrait'}; }</style>`;
  const styled = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${rule}</head>`) : `${rule}${html}`;
  return { html: styled, page: { ...page, pageSize, landscape } };
}

/** The PDF Author: the name in your profile (Preferences), unless the document is an anonymized sample. */
export function pdfAuthor(page: Pick<PdfPage, 'anonymous'> = {}): string | undefined {
  if (page.anonymous) return undefined;
  try { return JSON.parse(localStorage.getItem('gfde.preferences') ?? '{}').profile?.name || undefined; } catch { return undefined; }
}

/** The finished PDF of an HTML document — layout by Chrome, then contents page numbers, the report
 * frame (header and footer), document information and bookmarks — the same for a saved PDF and a PDF
 * placed in an issue package. Undefined outside the desktop app. */
export async function renderPdf(html: string, page: PdfPage = {}, fallbackTitle = ''): Promise<Uint8Array | undefined> {
  const toBytes = hasBridge() ? window.gfde.files.pdfBytes : undefined;
  if (!toBytes) return undefined;
  ({ html, page } = pdfPageSetup(html, page));
  const { PDFDocument } = await import('pdf-lib');
  const { destinationPages, finishPdf, htmlTitle, paginatePdf } = await import('../docs/pdfTools');
  const { pageSize, landscape, cssPages, frame, paginate, selfNumbered } = page;
  const render = async (h: string) => PDFDocument.load(await toBytes({ html: h, pageSize, landscape, cssPages }));
  const doc = paginate ? await paginatePdf(render, html, paginate) : await render(html);
  const { markerBookmarks } = await import('../docs/outline');
  const author = pdfAuthor(page);
  // Explicit bookmarks, else one per section marker in the document (docs/outline.ts).
  const bookmarks = typeof page.bookmarks === 'function' ? page.bookmarks(destinationPages(doc)) : page.bookmarks ?? markerBookmarks(html, destinationPages(doc));
  return finishPdf(doc, { title: htmlTitle(html) || fallbackTitle, author, bookmarks, frame, stamp: selfNumbered ? false : undefined });
}

/** Prints an HTML document from a hidden frame (the browser's print dialog, where
 * "Save as PDF" is offered). A frame, not a new window: exports finish after async
 * work, when the browser no longer counts the click and blocks pop-ups. */
function printInFrame(html: string): string {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) return;
    const remove = () => setTimeout(() => frame.remove(), 1000);
    w.addEventListener('afterprint', remove);
    w.focus();
    w.print();
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
  return 'Opened the print dialog — choose “Save as PDF”';
}

/** Renders a self-contained HTML document to PDF. In the desktop app this
 * uses Electron's printToPDF; in a browser it opens the print dialog. */
export async function savePdf(defaultName: string, html: string, page?: PdfPage, ctx?: SaveContext): Promise<string | null> {
  if (!hasBridge()) return printInFrame(pdfPageSetup(html, page).html);
  const bytes = await renderPdf(html, page, defaultName.replace(/[.]pdf$/i, ''));
  if (bytes) return saveBinary(defaultName, bytes, 'PDF', 'pdf', 'application/pdf', ctx);
  const place = await placeFor(defaultName, 'pdf', ctx);
  const saved = await window.gfde.files.savePdf({ defaultName: place.name, html, ...page, ...(place.defaultDir ? { defaultDir: place.defaultDir } : {}) });
  place.after(saved);
  return saved ? `Saved ${saved.split(/[\\/]/).pop()}` : null;
}
