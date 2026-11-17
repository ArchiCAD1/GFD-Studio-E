import { TABLE_MAX_COLS, TABLE_MAX_ROWS } from '../model/specBlocks';
import type { SpecClause, SpecDoc, SpecSection } from '../model/specDoc';

/**
 * Reads a Word document (.docx) into a specification: its headings become sections and clause headings, its
 * paragraphs clauses, its lists lettered items, its tables tables. The wording is the user's own document — nothing
 * is added to it. Numbers typed at the start of a line are dropped, because the app numbers clauses itself.
 *
 * The document's own contents page is skipped (the app makes its own); what stands before the first heading is kept
 * in a section of its own, for the engineer to keep or delete.
 *
 * Not read: pictures, text boxes, headers and footers, footnotes, tracked changes, and character formatting.
 */

export interface WordReadReport { sections: number; lines: number; tables: number; pictures: number; title?: string }

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const kids = (el: Element, name: string): Element[] => [...el.children].filter((c) => c.namespaceURI === W && c.localName === name);
const kid = (el: Element | undefined, name: string): Element | undefined => (el ? kids(el, name)[0] : undefined);
const val = (el: Element | undefined): string | undefined => el?.getAttributeNS(W, 'val') ?? el?.getAttribute('w:val') ?? undefined;

/** The text of a paragraph: its runs in order, a tab as a space, a line break as a space; deleted text left out. */
function paraText(p: Element): { text: string; pictures: number } {
  let text = '', pictures = 0;
  const walk = (el: Element) => {
    for (const c of el.children) {
      if (c.namespaceURI !== W) { if (c.localName === 'drawing' || c.localName === 'pict') pictures++; else walk(c); continue; }
      if (c.localName === 't') text += c.textContent ?? '';
      else if (c.localName === 'tab' || c.localName === 'br' || c.localName === 'cr') text += ' ';
      else if (c.localName === 'noBreakHyphen') text += '-';
      else if (c.localName === 'drawing' || c.localName === 'pict') pictures++;
      else if (c.localName === 'del' || c.localName === 'pPr' || c.localName === 'rPr' || c.localName === 'instrText') continue;
      else walk(c);
    }
  };
  walk(p);
  return { text: text.replace(/\s+/g, ' ').trim(), pictures };
}

interface Style { name: string; outline?: number; basedOn?: string }
/** The paragraph styles of the document: each one's name, heading level (0 = Heading 1) and parent. */
function readStyles(stylesXml: string | undefined): Map<string, Style> {
  const out = new Map<string, Style>();
  if (!stylesXml) return out;
  const root = new DOMParser().parseFromString(stylesXml, 'application/xml').documentElement;
  for (const s of kids(root, 'style')) {
    const id = s.getAttributeNS(W, 'styleId') ?? s.getAttribute('w:styleId');
    if (!id) continue;
    const lvl = val(kid(kid(s, 'pPr'), 'outlineLvl'));
    out.set(id, { name: (val(kid(s, 'name')) ?? id).toLowerCase(), outline: lvl !== undefined ? Number(lvl) : undefined, basedOn: val(kid(s, 'basedOn')) });
  }
  return out;
}
/** The heading level a style gives (0 = Heading 1), following its parents; 'title' for the document title. */
function styleLevel(id: string | undefined, styles: Map<string, Style>): number | 'title' | undefined {
  for (let s = id, n = 0; s && n < 12; n++) {
    const st = styles.get(s), name = st?.name ?? s.toLowerCase();
    if (name === 'title') return 'title';
    const m = /^heading\s*(\d)$/.exec(name);
    if (m) return Number(m[1]) - 1;
    if (st?.outline !== undefined && st.outline < 9) return st.outline;
    s = st?.basedOn;
  }
  return undefined;
}

/** The section that takes what stands before the first heading (a cover's lines, an introduction). */
export const FRONT = 'Before the first heading';
const NUMBER = /^(?:(?:section|clause|part)\s+)?(\d+(?:\.\d+)*)\.?\s+(?=\S)/i;
const ITEM = /^\(?([a-z]|[ivx]{1,4})[).]\s+(?=\S)/;
const BULLET = /^[•·▪■□○●◦–—-]\s+(?=\S)/;

/** The specification in a Word document's main part (word/document.xml) and its styles (word/styles.xml). */
export function specFromWordXml(documentXml: string, stylesXml?: string): { doc: SpecDoc; report: WordReadReport } {
  const xml = new DOMParser().parseFromString(documentXml, 'application/xml');
  const body = kid(xml.documentElement, 'body');
  if (!body || xml.getElementsByTagName('parsererror').length) throw new Error('The file is not a Word document this app can read.');
  const styles = readStyles(stylesXml);
  const sections: SpecSection[] = [];
  const report: WordReadReport = { sections: 0, lines: 0, tables: 0, pictures: 0 };
  let n = 0, lastLevel = -1; // the level of the clause above (−1: none since the last heading)
  let lastMark: string | undefined; // the letter of the lettered item above
  const section = (title: string): SpecSection => { const s: SpecSection = { id: `S${sections.length + 1}`, title, included: true, clauses: [] }; sections.push(s); return s; };
  const current = () => sections[sections.length - 1] ?? section(FRONT);
  const add = (c: Omit<SpecClause, 'id'>) => { current().clauses.push({ id: `C${++n}`, ...c }); };

  const blocks = (el: Element): Element[] => [...el.children].flatMap((c) => (c.namespaceURI === W && (c.localName === 'sdt' || c.localName === 'sdtContent' || c.localName === 'ins' || c.localName === 'customXml' || c.localName === 'smartTag') ? blocks(c) : [c]));
  for (const el of blocks(body)) {
    if (el.namespaceURI !== W) continue;
    if (el.localName === 'tbl') {
      const rows = kids(el, 'tr').slice(0, TABLE_MAX_ROWS).map((tr) => blocks(tr).filter((c) => c.localName === 'tc').slice(0, TABLE_MAX_COLS).map((tc) => {
        const parts = [...tc.getElementsByTagNameNS(W, 'p')].map((p) => { const t = paraText(p); report.pictures += t.pictures; return t.text; });
        return parts.filter(Boolean).join(' ');
      }));
      const cols = Math.max(0, ...rows.map((r) => r.length));
      if (!cols || rows.every((r) => r.every((c) => !c))) continue;
      add({ kind: 'table', text: '', table: { rows: rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? '')) } });
      report.tables++;
      continue;
    }
    if (el.localName !== 'p') continue;
    const pPr = kid(el, 'pPr'), raw = paraText(el);
    report.pictures += raw.pictures;
    if (!raw.text) continue;
    // A contents page is not wording: its lines carry page fields or a contents style, and the app makes its own.
    const fieldCode = [...el.getElementsByTagNameNS(W, 'instrText')].map((x) => x.textContent ?? '').join(' ') + [...el.getElementsByTagNameNS(W, 'fldSimple')].map((x) => x.getAttributeNS(W, 'instr') ?? '').join(' ');
    const styleName = styles.get(val(kid(pPr, 'pStyle')) ?? '')?.name ?? (val(kid(pPr, 'pStyle')) ?? '').toLowerCase();
    if (/\b(PAGEREF|TOC)\b/.test(fieldCode) || /^(toc|contents)\s*\d|^toc heading$|^table of figures$/.test(styleName) || /^(table of )?contents$/i.test(raw.text)) continue;
    const styled = styleLevel(val(kid(pPr, 'pStyle')), styles), own = val(kid(pPr, 'outlineLvl'));
    const listLevel = kid(pPr, 'numPr') ? Number(val(kid(kid(pPr, 'numPr'), 'ilvl')) ?? 0) : undefined;
    let level: number | 'title' | undefined = styled ?? (own !== undefined && Number(own) < 9 ? Number(own) : undefined);
    // A typed number tells the depth when the document has no heading styles: "3 CABLES" a section, "3.1 General" a
    // heading — but only for a short line that does not end as a sentence.
    const num = NUMBER.exec(raw.text), text = num ? raw.text.slice(num[0].length) : raw.text;
    const short = text.length <= 90 && !/[.;:,]$/.test(text);
    if (level === undefined && num && short) { const depth = num[1].replace(/\.0$/, '').split('.').length; if (depth <= 2) level = depth - 1; }

    if (level !== undefined) { lastLevel = -1; lastMark = undefined; }
    if (level === 'title') { if (!report.title) report.title = text; else add({ kind: 'heading', text }); continue; }
    if (level === 0) { section(text); continue; }
    if (level !== undefined) { add({ kind: 'heading', text, ...(level >= 2 ? { level: 1 } : {}) }); continue; }
    // A lettered item a), b) … goes in one level, a numbered item i), ii) … two. A lone "i)" is the letter after
    // "h)", else the first numbered item under a lettered one.
    const item = ITEM.exec(text), bullet = BULLET.exec(text), mark = item?.[1];
    const rest = item ? text.slice(item[0].length) : bullet ? text.slice(bullet[0].length) : text;
    const roman = !!mark && (mark.length > 1 || (/^[ivx]$/.test(mark) && lastLevel >= 1 && !(mark === 'i' && lastMark === 'h')));
    // Word's own list numbering carries its depth; under a clause the first depth is an item.
    const listed = !item && !bullet && !num && listLevel !== undefined ? Math.min(2, listLevel + (lastLevel >= 0 ? 1 : 0)) : 0;
    const indent = item ? (roman ? 2 : 1) : bullet ? 1 : listed;
    add({ kind: /^notes?\s*[:—-]/i.test(rest) ? 'note' : 'clause', text: rest, ...(indent ? { level: indent } : {}) });
    lastLevel = indent; lastMark = roman ? lastMark : mark;
  }
  const kept = sections.filter((s) => s.clauses.length || s.title !== FRONT);
  if (!kept.length) throw new Error('No text was found in the Word document.');
  report.sections = kept.length;
  report.lines = kept.reduce((k, s) => k + s.clauses.filter((c) => c.kind !== 'table').length, 0);
  return { doc: { title: report.title?.slice(0, 120) || 'Specification', sections: kept }, report };
}

/** Reads a .docx file's bytes. Throws with a plain message when the file is not a Word document. */
export async function readSpecDocx(bytes: ArrayBuffer | Uint8Array): Promise<{ doc: SpecDoc; report: WordReadReport }> {
  const JSZip = (await import('jszip')).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error('The file is not a Word document (.docx). An older .doc file must first be saved as .docx in Word.'); }
  const main = zip.file('word/document.xml');
  if (!main) throw new Error('The file is not a Word document (.docx).');
  return specFromWordXml(await main.async('string'), await zip.file('word/styles.xml')?.async('string'));
}

/** What was read, in a sentence. */
export const wordReadText = (r: WordReadReport): string =>
  `${r.sections} section${r.sections === 1 ? '' : 's'}, ${r.lines} line${r.lines === 1 ? '' : 's'}${r.tables ? `, ${r.tables} table${r.tables === 1 ? '' : 's'}` : ''}${r.pictures ? `; ${r.pictures} picture${r.pictures === 1 ? '' : 's'} not brought in — add ${r.pictures === 1 ? 'it' : 'them'} with Add picture` : ''}`;
