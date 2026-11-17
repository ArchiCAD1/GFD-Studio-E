import { AlignmentType, BorderStyle, Bookmark, Document, ImportedXmlComponent, LeaderType, PageReference, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, PageOrientation, Paragraph, TabStopType, Table, TableCell, TableRow, TextRun, WidthType, type ParagraphChild } from 'docx';
import { revisionStamp } from '../model/revisions';
import { slotRuns, specAnchor, specContents, specFields, specRevisionRows, specSetup, specView, SPEC_PAPER_MM, type SpecDoc, type SpecLine, type SpecPage } from '../model/specDoc';
import type { Project } from '../types';
import { missingList, specInfoRows } from './specReport';
import { fmtDate } from '../util/format';

// Kept apart from specReport.ts so the docx library loads only when the Word file is exported.
/** The specification as a Word file in the built-in format: the cover page (or a title block), the contents with
 * page numbers, then each included section on a new page with numbered clauses on a hanging indent, and the paper, margins, header, footer, logo and
 * watermark of the page setup. Headings use Word's own heading styles, so the engineer can restyle the file or build a table of
 * contents from it. A value the project does not have is written as DATA REQUIRED in bold. */

const INDENT = 850; // twips: where clause text starts, the number hanging before it
const STEP = 480; // twips: one level of indent (items a), b) … and i), ii) …)
const runs = (l: SpecLine, more: { bold?: boolean; italics?: boolean } = {}) =>
  l.runs.map((r) => ('text' in r ? new TextRun({ text: r.text, ...more }) : r.value !== undefined ? new TextRun({ text: r.value, ...more }) : new TextRun({ text: `DATA REQUIRED: ${r.label}`, bold: true, underline: {} })));

const TWIP = 1440 / 25.4; // twips per mm
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
function logoRun(logo: string | undefined, width = 108, height = 36): ImageRun | undefined {
  const m = logo?.match(/^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return undefined;
  const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new ImageRun({ type: m[1] === 'png' ? 'png' : 'jpg', data: bytes, transformation: { width, height } });
}
/** A header or footer: its three slots as one row of a borderless table (left, centre, right). */
function slotRow(edge: 'header' | 'footer', slots: readonly string[], doc: SpecDoc, project: Project, s: SpecPage): Table {
  const logo = logoRun(s.logo);
  const cell = (text: string, i: number) => {
    const side = ['left', 'center', 'right'][i];
    const children: ParagraphChild[] = logo && s.logoPlace === `${edge}-${side}` ? [logo]
      : slotRuns(text, doc, project).map((r) => ('text' in r ? new TextRun({ text: r.text, size: 16 }) : new TextRun({ children: [r.page === 'page' ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES], size: 16 })));
    return new TableCell({ width: { size: 100 / 3, type: WidthType.PERCENTAGE }, borders: { top: NONE, bottom: NONE, left: NONE, right: NONE }, children: [new Paragraph({ alignment: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.RIGHT][i], children })] });
  };
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE }, rows: [new TableRow({ children: slots.map(cell) })] });
}
/** The watermark, written the way Word writes its own (Design > Watermark): word art across the middle of the
 * page in light grey, behind the text. It sits in the header, so it repeats on every page, and Word's own
 * watermark tools can change or remove it. */
const WORDART = '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>';
const xmlText = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
function watermark(text: string, n = 1): Paragraph {
  const wide = Math.min(460, Math.max(150, text.length * 62)); // points: about the page diagonal for a long word
  const run = ImportedXmlComponent.fromXmlString(`<w:r><w:rPr><w:noProof/></w:rPr><w:pict>${WORDART}<v:shape id="PowerPlusWaterMarkObject${n}" o:spid="_x0000_s205${n}" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:0;width:${wide}pt;height:${Math.round(wide / Math.max(2.4, text.length * 0.55))}pt;rotation:320;z-index:-251658752;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="silver" stroked="f"><v:fill opacity=".5"/><v:textpath style="font-family:&quot;Arial&quot;;font-size:1pt" string="${xmlText(text)}"/></v:shape></w:pict></w:r>`);
  return new Paragraph({ children: [run as unknown as ParagraphChild] }); // a ready-made run: the library has no watermark of its own
}

export function buildSpecDocx(project: Project, doc: SpecDoc): Document {
  const v = specView(doc, project), missing = missingList(v), setup = specSetup(doc, project);
  const [w, h] = SPEC_PAPER_MM[setup.paper], m = setup.marginsMm;
  const fields = new Map(specFields(project, doc).map((f) => [f.key, f.value]));
  const textWide = Math.round(((setup.landscape ? h : w) - m.left - m.right) * TWIP);
  const infoLines = (rows: [string, string][], after: number) => rows.map(([k, x], i) => new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: 2600 }], spacing: { after: i === rows.length - 1 ? after : 0 }, children: [new TextRun({ text: `${k}\t`, bold: true }), new TextRun(x)] }));
  const body: (Paragraph | Table)[] = [];
  if (setup.cover.on) {
    const c = setup.cover, logo = c.logo ? logoRun(setup.logo, 180, 60) : undefined;
    const revs = c.revisions ? specRevisionRows(project) : [];
    const line = { style: BorderStyle.SINGLE, size: 4, color: '000000' }, box = { top: line, bottom: line, left: line, right: line };
    const cell = (text: string, bold = false) => new TableCell({ borders: box, children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })] });
    body.push(
      new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: textWide }], border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 6 } }, children: [...(logo ? [logo] : []), new TextRun({ text: `\t${fields.get('party.consultant') ?? ''}`, bold: true, size: 22 })] }),
      new Paragraph({ spacing: { before: 3600 }, children: [new TextRun({ text: (fields.get('doc.status') ?? '').toUpperCase(), size: 18, characterSpacing: 40 })] }),
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(doc.title)] }),
      new Paragraph({ children: [new TextRun({ text: project.name, size: 28 })] }),
      new Paragraph({ spacing: { after: 1800 }, children: [new TextRun([fields.get('doc.number'), revisionStamp(project)].filter(Boolean).join(' · '))] }),
      ...infoLines(specInfoRows(doc, project, { number: false, parties: c.parties, details: c.details }), 300)
    );
    if (revs.length) body.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      new TableRow({ tableHeader: true, children: ['Rev', 'Date', 'Description', 'By'].map((x) => cell(x, true)) }),
      ...revs.map((r) => new TableRow({ children: [cell(r.id), cell(fmtDate(r.date)), cell(r.description), cell(r.by)] }))
    ] }));
    if (c.note) body.push(new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: c.note, size: 18 })] }));
  } else {
    const info = specInfoRows(doc, project);
    body.push(
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(doc.title)] }),
      new Paragraph({ children: [new TextRun({ text: `${project.name} · ${revisionStamp(project)}` })], spacing: { after: info.length ? 120 : 300 } }),
      ...infoLines(info, 300)
    );
  }
  const entries = setup.contents.on ? specContents(v, setup.contents.headings) : [];
  if (entries.length) {
    body.push(new Paragraph({ pageBreakBefore: setup.cover.on, children: [new TextRun({ text: 'Contents', bold: true, size: 26 })], spacing: { after: 120 } }));
    // The page number is a Word field: Word fills it in when the file is opened (it asks to update the fields).
    for (const e of entries) body.push(new Paragraph({
      indent: { left: e.level === 2 ? INDENT : 0 }, tabStops: [{ type: TabStopType.LEFT, position: INDENT + (e.level === 2 ? INDENT : 0) }, { type: TabStopType.RIGHT, position: textWide, leader: LeaderType.DOT }],
      children: [new TextRun({ text: `${e.no}\t${e.title}`, size: e.level === 2 ? 19 : 21 }), ...(setup.contents.pageNumbers ? [new TextRun('\t'), new PageReference(e.id)] : [])]
    }));
  }
  if (missing.length) {
    body.push(new Paragraph({ pageBreakBefore: setup.cover.on && !entries.length, spacing: { before: 300 }, children: [new TextRun({ text: 'DATA REQUIRED', bold: true }), new TextRun(` — the project has no value for: ${missing.map((x) => `${x.label} (${x.clauses.join(', ')})`).join('; ')}.`)] }));
  }
  const marked = setup.contents.on && setup.contents.headings;
  for (const b of v.blocks) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new Bookmark({ id: specAnchor(b.id), children: [new TextRun(b.heading)] })] }));
    for (const l of b.lines) {
      const brk = l.breakBefore ? { pageBreakBefore: true } : {};
      const left = INDENT + (l.kind === 'heading' ? 0 : l.level * STEP), hang = l.level ? STEP : INDENT; // an item's letter hangs in a narrower column
      if (l.kind === 'heading') body.push(new Paragraph({ ...brk, heading: l.level ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2, tabStops: [{ type: TabStopType.LEFT, position: INDENT }], children: marked ? [new Bookmark({ id: specAnchor(b.id, l.id), children: [new TextRun(`${l.no}\t`), ...runs(l)] })] : [new TextRun(`${l.no}\t`), ...runs(l)] }));
      else if (l.kind === 'note') body.push(new Paragraph({ ...brk, indent: { left }, spacing: { after: 100 }, children: runs(l, { italics: true }) }));
      else body.push(new Paragraph({ ...brk, indent: { left, hanging: hang }, tabStops: [{ type: TabStopType.LEFT, position: left }], spacing: { after: 100 }, alignment: AlignmentType.LEFT, children: [new TextRun(`${l.no}\t`), ...runs(l)] }));
    }
  }
  const mark = (n: number) => (setup.watermark ? [watermark(setup.watermark, n)] : []); // one shape per header, as Word numbers its own
  return new Document({
    features: { updateFields: setup.contents.on && setup.contents.pageNumbers }, // Word then fills in the contents page numbers
    creator: 'LV Design Studio', title: `${project.name} — ${doc.title}`,
    // Black headings (Word's own are blue): the specification prints black-and-white.
    styles: {
      default: { document: { run: { font: 'Arial', size: 21 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 40, bold: true, color: '000000' }, paragraph: { spacing: { after: 80 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: '000000' }, paragraph: { spacing: { after: 160 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 21, bold: true, color: '000000' }, paragraph: { spacing: { before: 140, after: 60 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, color: '000000' }, paragraph: { spacing: { before: 200, after: 80 } } }
      ]
    },
    sections: [{
      // Word swaps width and height itself for landscape.
      properties: { titlePage: setup.cover.on, page: { size: { width: Math.round(w * TWIP), height: Math.round(h * TWIP), orientation: setup.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: Math.round(m.top * TWIP), right: Math.round(m.right * TWIP), bottom: Math.round(m.bottom * TWIP), left: Math.round(m.left * TWIP) } } },
      // The cover carries no header or footer (only the watermark).
      headers: { default: new Header({ children: [slotRow('header', setup.header, doc, project, setup), ...mark(1)] }), ...(setup.cover.on ? { first: new Header({ children: [new Paragraph({}), ...mark(2)] }) } : {}) },
      footers: { default: new Footer({ children: [slotRow('footer', setup.footer, doc, project, setup)] }), ...(setup.cover.on ? { first: new Footer({ children: [new Paragraph({})] }) } : {}) },
      children: body
    }]
  });
}

export async function specDocxBytes(project: Project, doc: SpecDoc): Promise<Uint8Array> {
  return new Uint8Array(await (await Packer.toBlob(buildSpecDocx(project, doc))).arrayBuffer());
}
