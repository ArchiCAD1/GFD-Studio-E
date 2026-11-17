import { revisionStamp } from '../model/revisions';
import { captionText, lineText, slotRuns, specAnchor, specContents, specFields, specRevisionRows, specSetup, specView, SPEC_PAPER_MM, SPEC_PARTIES, type SpecDoc, type SpecLine, type SpecPage, type SpecView } from '../model/specDoc';
import type { Project } from '../types';
import { cssImage, cssStr } from './printDoc';
import { destMarker } from './outline';
import { esc } from './report';
import { fmtDate } from '../util/format';
import type { PdfPage } from '../util/files';

/** The specification as a printable document (black-and-white) on the paper, margins, header, footer, logo and
 * watermark of its page setup: the cover page (or, without one, a title block with the document information),
 * the contents page with page numbers, then every included section with its numbered clauses. Values from the project are printed as plain
 * text; a value the project does not have prints as DATA REQUIRED in bold, so it cannot be missed. */

const CSS = `
  body { font: 10.5pt/1.5 Arial, sans-serif; color: #000; margin: 0; }
  header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
  h1 { font-size: 18pt; margin: 0 0 2px; } h2 { font-size: 13pt; margin: 18px 0 6px; break-after: avoid; } h3 { font-size: 10.5pt; margin: 10px 0 2px; break-after: avoid; }
  .meta { font-size: 9pt; }
  ol.contents { list-style: none; padding: 0; margin: 6px 0 0; } ol.contents li { display: grid; grid-template-columns: 34px 1fr auto; gap: 6px; padding: 2px 0; }
  ol.contents li.l2 { padding-left: 34px; grid-template-columns: 40px 1fr auto; font-size: 9.5pt; }
  ol.contents .dots { border-bottom: 0.5pt dotted #000; margin-bottom: 3px; } ol.contents li > span:nth-child(2) { display: flex; gap: 6px; } ol.contents li > span:nth-child(2) i { flex: 1; font-style: normal; }
  a.dest { display: block; height: 0; }
  figure.blk { margin: 8px 0 10px 46px; } figure.blk.brk { break-before: page; } figure.blk.pic { break-inside: avoid; }
  figure.blk figcaption { font-size: 9pt; font-weight: 700; margin: 0 0 3px; } figure.blk.pic figcaption { margin: 3px 0 0; }
  figure.blk img { display: block; height: auto; }
  table.tb { border-collapse: collapse; width: 100%; font-size: 9pt; } table.tb th, table.tb td { border: 0.4pt solid #000; padding: 1.2mm 1.8mm; text-align: left; vertical-align: top; }
  table.tb thead { display: table-header-group; } table.tb tr { break-inside: avoid; }
  @page cover { margin: 18mm; @top-left { content: none; } @top-center { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-center { content: none; } @bottom-right { content: none; } }
  .cover { page: cover; display: flex; flex-direction: column; }
  .cover .ctop { display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; border-bottom: 1.2pt solid #000; padding-bottom: 4mm; min-height: 20mm; font-size: 11pt; font-weight: 700; }
  .cover .ctop img { height: 18mm; width: auto; max-width: 70mm; object-fit: contain; object-position: left bottom; }
  .cover .cmid { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .cover .k { font-size: 9pt; letter-spacing: .2em; text-transform: uppercase; }
  .cover h1 { font-size: 26pt; margin: 3mm 0 2mm; } .cover .pn { font-size: 14pt; margin-bottom: 3mm; }
  table.rev { border-collapse: collapse; width: 100%; font-size: 9pt; margin-top: 6mm; } table.rev th, table.rev td { border: 0.4pt solid #000; padding: 1.4mm 2mm; text-align: left; vertical-align: top; }
  .cnote { font-size: 9pt; margin-top: 5mm; }
  .cl { display: grid; grid-template-columns: 46px 1fr; gap: 4px; margin: 3px 0; break-inside: avoid; }
  .cl.h { font-weight: 700; margin-top: 10px; break-after: avoid; } .cl.n { font-style: italic; }
  .cl.l1 { margin-left: 46px; grid-template-columns: 28px 1fr; } .cl.l2 { margin-left: 74px; grid-template-columns: 28px 1fr; }
  .cl.h.l1 { margin-left: 0; grid-template-columns: 46px 1fr; font-size: 10pt; margin-top: 6px; } .cl.brk { break-before: page; }
  .req { font-weight: 700; text-decoration: underline; }
  .missing { border: 1px solid #000; padding: 6px 8px; margin: 10px 0; font-size: 9pt; }
  section { break-before: page; } section.first { break-before: auto; }
  table.info { border-collapse: collapse; margin: 8px 0 4px; font-size: 9.5pt; } table.info td { padding: 2px 14px 2px 0; vertical-align: top; } table.info td:first-child { font-weight: 700; }
  .wm { position: fixed; top: 0; bottom: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: center; z-index: -1; }
  .wm span { transform: rotate(-40deg); font-size: 84pt; font-weight: 700; letter-spacing: .08em; white-space: nowrap; opacity: 0.1; }`;

/** The @page rule: paper, margins, and the three header and three footer boxes (text, page numbers or the logo). */
function pageCss(doc: SpecDoc, project: Project, s: SpecPage): string {
  const logo = cssImage(s.logo);
  const box = (where: 'top' | 'bottom', i: number, text: string) => {
    const side = ['left', 'center', 'right'][i], edge = where === 'top' ? 'header' : 'footer';
    const line = where === 'top' ? 'vertical-align: bottom; padding-bottom: 2mm; border-bottom: 0.4pt solid #000;' : 'vertical-align: top; padding-top: 2mm; border-top: 0.4pt solid #000;';
    if (logo && s.logoPlace === `${edge}-${side}`) return `@${where}-${side} { content: ""; width: 45mm; background: url("${logo}") no-repeat ${side} ${where === 'top' ? 'bottom 2mm' : 'top 2mm'} / auto 9mm; ${line} }`;
    const content = slotRuns(text, doc, project).map((r) => ('text' in r ? cssStr(r.text) : `counter(${r.page})`)).join(' ') || '""';
    return `@${where}-${side} { content: ${content}; font: 8pt Arial, sans-serif; color: #000; ${line} }`;
  };
  const m = s.marginsMm;
  return `@page { size: ${s.paper} ${s.landscape ? 'landscape' : 'portrait'}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
  ${s.header.map((x, i) => box('top', i, x)).join('\n  ')}
  ${s.footer.map((x, i) => box('bottom', i, x)).join('\n  ')}
}`;
}
/** How the PDF is printed: the paper of the page setup, the document's own header, footer and page numbers. */
export function specPdfPage(project: Project, doc: SpecDoc): PdfPage {
  const s = specSetup(doc, project);
  return {
    pageSize: s.paper === 'A3' ? (s.landscape ? 'A3' : 'A3 portrait') : 'A4', landscape: s.landscape, cssPages: true, selfNumbered: true,
    // The contents page numbers: printed once to see where each section lands, then again with the numbers.
    ...(s.contents.on && s.contents.pageNumbers ? { paginate: (pages: Record<string, number>) => buildSpecHtml(project, doc, pages) } : {})
  };
}
/** The document information that has a value: number, status, the parties and the engineer's own details. */
export function specInfoRows(doc: SpecDoc, project: Project, show: { number?: boolean; parties?: boolean; details?: boolean } = {}): [string, string][] {
  const keys = new Set([...(show.number === false ? [] : ['doc.number', 'doc.status']), ...(show.parties === false ? [] : SPEC_PARTIES.map((x) => `party.${x.key}`))]);
  return specFields(project, doc).filter((f) => f.value !== undefined && (keys.has(f.key) || (show.details !== false && f.key.startsWith('detail.')))).map((f) => [f.label, f.value!]);
}

const lineHtml = (l: SpecLine) => l.runs.map((r) => ('text' in r ? esc(r.text) : r.value !== undefined ? esc(r.value) : `<span class="req">DATA REQUIRED: ${esc(r.label)}</span>`)).join('');
/** Fields with no value, each once, with the clauses that use it. */
export function missingList(v: SpecView): { label: string; clauses: string[] }[] {
  const by = new Map<string, string[]>();
  for (const m of v.missing) by.set(m.label, [...(by.get(m.label) ?? []), m.clauseNo || `section ${m.sectionNo}`]);
  return [...by].map(([label, clauses]) => ({ label, clauses }));
}
/** A table or a picture of the text, with its numbered caption (above a table, under a picture). A picture that is
 * not a plain PNG or JPEG is left out, its caption kept. */
function blockHtml(l: SpecLine): string {
  const cap = lineHtml(l), caption = `<figcaption>${esc(l.label ?? '')}${cap.trim() ? ` — ${cap}` : ''}</figcaption>`, brk = l.breakBefore ? ' brk' : '';
  if (l.table) {
    const row = (cells: string[], tag: 'th' | 'td') => `<tr>${cells.map((c) => `<${tag}>${esc(c)}</${tag}>`).join('')}</tr>`;
    const [head, ...rest] = l.table.rows;
    return `<figure class="blk${brk}">${caption}<table class="tb">${l.table.header ? `<thead>${row(head, 'th')}</thead>` : ''}<tbody>${(l.table.header ? rest : l.table.rows).map((x) => row(x, 'td')).join('')}</tbody></table></figure>`;
  }
  const ok = l.image && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(l.image.src);
  return `<figure class="blk pic${brk}">${ok ? `<img src="${l.image!.src}" style="width: ${l.image!.widthPct}%" alt="">` : ''}${caption}</figure>`;
}

/** `pages`: the page each contents entry landed on, from a first print (see specPdfPage); none: no numbers yet. */
export function buildSpecHtml(project: Project, doc: SpecDoc, pages: Record<string, number> = {}): string {
  const v = specView(doc, project), missing = missingList(v), setup = specSetup(doc, project);
  const fields = new Map(specFields(project, doc).map((f) => [f.key, f.value]));
  const infoTable = (rows: [string, string][]) => (rows.length ? `<table class="info">${rows.map(([k, x]) => `<tr><td>${esc(k)}</td><td>${esc(x)}</td></tr>`).join('')}</table>` : '');
  const stamp = esc(revisionStamp(project));
  const mark = setup.watermark ? `<div class="wm"><span>${esc(setup.watermark)}</span></div>` : '';
  const warn = missing.length ? `<div class="missing"><b>DATA REQUIRED</b> — the project has no value for: ${missing.map((m) => `${esc(m.label)} (${esc(m.clauses.join(', '))})`).join('; ')}.</div>` : '';
  const entries = setup.contents.on ? specContents(v, setup.contents.headings) : [];
  const page = (id: string) => (setup.contents.pageNumbers && pages[id] ? String(pages[id]) : '');
  const contents = entries.length ? `<h2>Contents</h2><ol class="contents">${entries.map((e) => `<li${e.level === 2 ? ' class="l2"' : ''}><span>${esc(e.no)}</span><span>${esc(e.title)}${setup.contents.pageNumbers ? '<i class="dots"></i>' : ''}</span><span>${page(e.id)}</span></li>`).join('')}</ol>` : '';

  let front: string;
  if (setup.cover.on) {
    const c = setup.cover, logo = c.logo ? cssImage(setup.logo) : undefined;
    const revs = c.revisions ? specRevisionRows(project) : [];
    const sub = [fields.get('doc.number'), stamp].filter(Boolean).join(' · ');
    const [pw, ph] = SPEC_PAPER_MM[setup.paper];
    const cover = `<section class="cover first" style="height: ${(setup.landscape ? pw : ph) - 39}mm"><div class="ctop">${logo ? `<img src="${logo}" alt="">` : '<span></span>'}<span>${esc(fields.get('party.consultant') ?? '')}</span></div>
<div class="cmid">${fields.get('doc.status') ? `<div class="k">${esc(fields.get('doc.status')!)}</div>` : ''}<h1>${esc(doc.title)}</h1><div class="pn">${esc(project.name)}</div><div class="meta">${sub}</div></div>
${infoTable(specInfoRows(doc, project, { number: false, parties: c.parties, details: c.details }))}
${revs.length ? `<table class="rev"><tr><th>Rev</th><th>Date</th><th>Description</th><th>By</th></tr>${revs.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(fmtDate(r.date))}</td><td>${esc(r.description)}</td><td>${esc(r.by)}</td></tr>`).join('')}</table>` : ''}
${c.note ? `<div class="cnote">${esc(c.note)}</div>` : ''}</section>`;
    front = `${cover}${contents || warn ? `<section>${contents}${warn}</section>` : ''}`;
  } else {
    front = `<section class="first"><header><h1>${esc(doc.title)}</h1><div class="meta">${esc(project.name)} · ${stamp}</div></header>${infoTable(specInfoRows(doc, project))}${contents}${warn}</section>`;
  }
  const sections = v.blocks.map((b) => `<section id="${specAnchor(b.id)}">${destMarker(specAnchor(b.id), b.heading)}<h2>${esc(b.heading)}</h2>${b.lines.map((l) => {
    if (l.table || l.image) return blockHtml(l);
    const id = specAnchor(b.id, l.id), anchored = l.kind === 'heading' && setup.contents.on && setup.contents.headings;
    return `<div${anchored ? ` id="${id}"` : ''} class="cl ${l.kind === 'heading' ? 'h' : l.kind === 'note' ? 'n' : ''}${l.level ? ` l${l.level}` : ''}${l.breakBefore ? ' brk' : ''}"><span>${anchored ? `<a class="dest" href="#${id}"></a>` : ''}${esc(l.no)}</span><span>${lineHtml(l)}</span></div>`;
  }).join('')}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(project.name)} — ${esc(doc.title)}</title><style>${pageCss(doc, project, setup)}${CSS}</style></head><body>${mark}${front}${sections}</body></html>`;
}

/** The specification as plain text lines (number, tab, text), for a quick copy or a check. */
export const specPlainText = (project: Project, doc: SpecDoc): string =>
  specView(doc, project).blocks.map((b) => [b.appendix ? b.heading : `${b.no}\t${b.title}`, ...b.lines.flatMap((l) => (l.table ? [captionText(l), ...l.table.rows.map((r) => r.join('\t'))] : l.image ? [captionText(l)] : [`${'\t'.repeat(l.kind === 'heading' ? 0 : l.level)}${l.no}\t${lineText(l)}`]))].join('\n')).join('\n\n');
