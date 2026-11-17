import { AIR_METHODS } from '../calc/lightningProtection';
import type { Project } from '../types';
import { earthingSystemOf } from './earthingPlan';
import { fmtDate } from '../util/format';
import { currentRevision, revisionStamp } from './revisions';
import { mainBoards } from './transformers';

/** The project specification (Specification page): sections of numbered clauses whose values come from the
 * project. A clause's text holds fields as {{key}}; each is filled from the design when the specification is shown
 * or exported, so the specification follows the design. A field the project has no value for shows DATA REQUIRED.
 * The clause wording is the engineer's own: the starter set is plain wording to edit, not text of any standard. */

export type SpecKind = 'heading' | 'clause' | 'note' | 'table' | 'image';
/** A table in the text: its cells as text, the first row a header unless turned off. */
export interface SpecTable { rows: string[][]; header?: boolean }
/** A picture in the text: the picture itself (data: URL, PNG or JPEG), its size in pixels, and how wide it prints
 * as a share of the text width (60 % unless set). */
export interface SpecImage { src: string; w: number; h: number; widthPct?: number }
/** `level`: how far the line is indented under the one above. A heading at level 1 is a sub-heading (2.1.1); a
 * clause at level 1 is a lettered item a), b) … under its clause, at level 2 a numbered item i), ii) …; a note only
 * moves in. `breakBefore`: the line starts a new page. */
export interface SpecClause { id: string; kind: SpecKind; text: string; level?: number; breakBefore?: boolean; table?: SpecTable; image?: SpecImage } // a table's or picture's text is its caption
/** `appendix`: the section is an appendix — lettered A, B … and placed after the numbered sections. */
export interface SpecSection { id: string; title: string; included: boolean; clauses: SpecClause[]; appendix?: boolean }
/** The deepest level a line of this kind takes. */
export const maxLevel = (kind: SpecKind): number => (kind === 'heading' ? 1 : kind === 'table' || kind === 'image' ? 0 : 2);
/** A detail the engineer adds to the document's information (name and value), usable in a clause as a field. */
export interface SpecDetail { id: string; name: string; value: string }
/** The document's own information: its number and status, the parties, and any further details. A party left
 * blank is read from the project (Project information) where the project has it, so nothing is typed twice. */
export interface SpecInfo { number?: string; status?: string; client?: string; consultant?: string; mainContractor?: string; mepContractor?: string; details?: SpecDetail[] }
export type SpecPaper = 'A4' | 'A3';
/** Left, centre and right text of a header or footer; each may hold fields, and {{page}} and {{pages}}. */
export type SpecSlots = [string, string, string];
export type SpecLogoPlace = 'none' | 'header-left' | 'header-right' | 'footer-left' | 'footer-right';
export interface SpecMargins { top: number; right: number; bottom: number; left: number }
/** Page setup of the exported document. Anything left out takes the default (SPEC_SETUP). */
export interface SpecSetup {
  paper?: SpecPaper; landscape?: boolean; marginsMm?: SpecMargins; header?: SpecSlots; footer?: SpecSlots;
  logo?: string; // the document's own logo (data: URL); none: the project's company logo
  logoPlace?: SpecLogoPlace; // the logo takes the place of that slot's text
  watermark?: string; // e.g. DRAFT, behind the text of every page
  cover?: SpecCover; contents?: SpecContents;
}
/** The cover page: on unless turned off, with the logo, the parties, the engineer's own details and the revision
 * table (each on unless turned off) and an optional note at its foot. */
export interface SpecCover { on?: boolean; logo?: boolean; parties?: boolean; details?: boolean; revisions?: boolean; note?: string }
/** The contents page: on unless turned off; sections, and the clause headings under them when asked; page numbers
 * on unless turned off. */
export interface SpecContents { on?: boolean; headings?: boolean; pageNumbers?: boolean }
/** A line of the wording as it stood at a revision: enough to tell what has changed since (`sig`: a short mark of a
 * table's or picture's content). */
export interface SpecSnapLine { id: string; kind: SpecKind; text: string; level?: number; sig?: string }
export interface SpecSnapSection { id: string; title: string; appendix?: boolean; lines: SpecSnapLine[] }
/** An issued revision of the specification — its own, apart from the project's: the wording of the included
 * sections as issued. */
export interface SpecRevision { id: string; date: string; description: string; by?: string; title: string; sections: SpecSnapSection[] } // date: yyyy-mm-dd
/** How the changes of a revision show in the document. `against`: the revision the wording is compared with (none:
 * the one before the current revision). */
export interface SpecMarks { highlight?: boolean; cloud?: boolean; triangle?: boolean; deleted?: boolean; list?: boolean; against?: string }
export interface SpecDoc { title: string; sections: SpecSection[]; info?: SpecInfo; setup?: SpecSetup; revisions?: SpecRevision[]; marks?: SpecMarks }

// ---- fields from the project

/** The revision and date printed on the document: the specification's own last revision once it has one, else the
 * project's. */
export function specStamp(doc: SpecDoc | undefined, p: Project): string {
  const last = doc?.revisions?.[doc.revisions.length - 1];
  return last ? `REV ${last.id} · ${fmtDate(last.date)}` : revisionStamp(p);
}

export type SpecPartyKey = 'client' | 'consultant' | 'mainContractor' | 'mepContractor';
/** The parties of the document, and where the project already holds each (Project information). */
export const SPEC_PARTIES: { key: SpecPartyKey; label: string; from: (p: Project) => string | undefined }[] = [
  { key: 'client', label: 'Client', from: (p) => p.info?.owner },
  { key: 'consultant', label: 'Consultant', from: (p) => p.info?.consultant?.trim() || p.drawing?.company },
  { key: 'mainContractor', label: 'Main contractor', from: (p) => p.info?.contractor },
  { key: 'mepContractor', label: 'MEP contractor', from: () => undefined }
];

export interface SpecField { key: string; label: string; group: string; value?: string }
const n = (v: number | undefined, unit: string) => (v !== undefined && Number.isFinite(v) && v > 0 ? `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`.trim() : undefined);
const t = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

/** Every field a clause can use, with its value from this project (none: the project does not have it yet). */
export function specFields(p: Project, doc: SpecDoc | undefined = p.spec): SpecField[] {
  const main = mainBoards(p)[0];
  const lp = p.lightning;
  const info = doc?.info;
  return [
    { key: 'doc.title', label: 'Document title', group: 'Document', value: t(doc?.title) },
    { key: 'doc.number', label: 'Document number', group: 'Document', value: t(info?.number) },
    { key: 'doc.status', label: 'Document status', group: 'Document', value: t(info?.status) },
    ...SPEC_PARTIES.map((x) => ({ key: `party.${x.key}`, label: x.label, group: 'Parties', value: t(info?.[x.key]) ?? t(x.from(p)) })),
    ...(info?.details ?? []).filter((d) => d.name.trim()).map((d) => ({ key: `detail.${d.id}`, label: d.name.trim(), group: 'Additional details', value: t(d.value) })),
    { key: 'project.issue', label: 'Revision and date', group: 'Project', value: t(specStamp(doc, p)) },
    { key: 'project.name', label: 'Project name', group: 'Project', value: t(p.name) },
    { key: 'project.revision', label: 'Revision', group: 'Project', value: t(currentRevision(p)?.id) },
    { key: 'project.voltage', label: 'System voltage', group: 'Project', value: n(p.voltageV, 'V') },
    { key: 'project.frequency', label: 'Frequency', group: 'Project', value: n(p.frequencyHz, 'Hz') },
    { key: 'main.id', label: 'Main board', group: 'Main switchboard', value: t(main?.id) },
    { key: 'main.rated', label: 'Rated current', group: 'Main switchboard', value: n(main?.ratedCurrentA, 'A') },
    { key: 'main.icw', label: 'Short-time withstand (1 s)', group: 'Main switchboard', value: n(main?.busbarIcwKa, 'kA') },
    { key: 'main.busbar', label: 'Busbar material', group: 'Main switchboard', value: t(main?.busbarMaterial) },
    { key: 'main.ip', label: 'Degree of protection', group: 'Main switchboard', value: t(main?.ipRating) },
    { key: 'main.location', label: 'Location', group: 'Main switchboard', value: t(main?.location) },
    { key: 'main.transformer', label: 'Transformer rating', group: 'Main switchboard', value: n(main?.sourceKva, 'kVA') },
    { key: 'boards.count', label: 'Number of boards', group: 'Distribution', value: p.boards.length ? String(p.boards.length) : undefined },
    { key: 'earthing.system', label: 'Earthing system', group: 'Earthing', value: p.earthingPlan ? earthingSystemOf(p.earthingPlan.system).name : undefined },
    { key: 'earthing.conductor', label: 'Earth conductor', group: 'Earthing', value: p.earthingPlan ? n(p.earthingPlan.conductorMm2 ?? 70, 'mm²') : undefined }, // 70: the schematic's own default
    { key: 'lightning.class', label: 'Lightning protection class', group: 'Lightning protection', value: lp?.lpsClass ? `Class ${lp.lpsClass}` : undefined },
    { key: 'lightning.method', label: 'Air termination method', group: 'Lightning protection', value: lp ? AIR_METHODS.find((m) => m.id === lp.method)?.label : undefined }
  ];
}

// ---- showing the specification

export type SpecRun = { text: string } | { field: string; label: string; value?: string };
/** `no`: the number printed on the line; `ref`: how the line is named elsewhere (an item is "2.1.1 a)"). */
/** `label`: "Table 1" or "Figure 2" for a table or picture, numbered through the document; its `runs` are the caption. */
export interface SpecLine { id: string; kind: SpecKind; no: string; ref: string; level: number; breakBefore: boolean; runs: SpecRun[]; label?: string; table?: Required<SpecTable>; image?: SpecImage & { widthPct: number } }
/** `heading`: the block's title as printed ("2 Switchboards", "Appendix A — Schedules"). */
export interface SpecBlock { id: string; no: string; title: string; heading: string; appendix: boolean; lines: SpecLine[] }
export interface SpecMissing { sectionNo: string; clauseNo: string; key: string; label: string }
export interface SpecView { blocks: SpecBlock[]; missing: SpecMissing[] }

const FIELD = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
/** The field keys a text uses, in order. */
export const fieldKeys = (text: string): string[] => [...text.matchAll(FIELD)].map((m) => m[1]);

function runsOf(text: string, fields: Map<string, SpecField>): SpecRun[] {
  const out: SpecRun[] = [];
  let at = 0;
  for (const m of text.matchAll(FIELD)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index) });
    const f = fields.get(m[1]);
    // A field the app does not know stays in the text as the engineer wrote it, marked as missing.
    out.push({ field: m[1], label: f?.label ?? m[1], ...(f?.value !== undefined ? { value: f.value } : {}) });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

const letters = (n: number): string => { let out = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(97 + ((n - 1) % 26)) + out; return out; };
const roman = (n: number): string => [['m', 1000], ['cm', 900], ['d', 500], ['cd', 400], ['c', 100], ['xc', 90], ['l', 50], ['xl', 40], ['x', 10], ['ix', 9], ['v', 5], ['iv', 4], ['i', 1]].reduce((out, [r, v]) => { while (n >= (v as number)) { out += r; n -= v as number; } return out; }, '');
/** A clause's level as used: within what its kind allows, and never deeper than one step under the line above. */
const levelOf = (c: SpecClause): number => Math.min(maxLevel(c.kind), Math.max(0, Math.round(c.level ?? 0)));

/** The included sections, numbered — sections 1, 2 …, headings 2.1, 2.2 …, clauses under the heading above them
 * (2.1.1, or 2.1 before any heading), sub-headings in the same run as those clauses (2.1.3, its clauses 2.1.3.1),
 * items a), b) … and i), ii) … — then the appendices A, B …
 * numbered the same way (A.1, A.1.1); every field filled from the project, and the list of fields that have no value. */
export function specView(doc: SpecDoc, p: Project): SpecView {
  const fields = new Map(specFields(p, doc).map((f) => [f.key, f]));
  const blocks: SpecBlock[] = [], missing: SpecMissing[] = [];
  let s = 0, ap = 0, tn = 0, fn = 0;
  const included = doc.sections.filter((x) => x.included);
  for (const sec of [...included.filter((x) => !x.appendix), ...included.filter((x) => x.appendix)]) {
    const no = sec.appendix ? letters(++ap).toUpperCase() : String(++s);
    // h: the heading the line is under (0: none yet); h2: its sub-heading (0: none). A heading and a clause that
    // stand side by side share one run of numbers (t under the section, k under a heading), so no number is used twice.
    let h = 0, h2 = 0, t = 0, k = 0, c = 0, a = 0, r = 0, clauseNo = '';
    const lines: SpecLine[] = sec.clauses.map((cl) => {
      const level = levelOf(cl);
      let num = '', ref = '';
      if (cl.kind === 'heading') {
        if (level === 1 && h) { h2 = ++k; num = `${no}.${h}.${h2}`; } else { h = ++t; h2 = 0; k = 0; num = `${no}.${h}`; }
        c = 0; a = 0; r = 0; clauseNo = ''; ref = num;
      } else if (cl.kind === 'clause') {
        if (level === 0) { clauseNo = num = h2 ? `${no}.${h}.${h2}.${++c}` : h ? `${no}.${h}.${++k}` : `${no}.${++t}`; a = 0; r = 0; ref = num; }
        else if (level === 1) { num = `${letters(++a)})`; r = 0; ref = `${clauseNo} ${num}`.trim(); }
        else { num = `${roman(++r)})`; ref = `${clauseNo}${a ? ` ${letters(a)})` : ''} ${num}`.trim(); }
      } else ref = cl.kind === 'table' && cl.table ? `Table ${tn + 1}` : cl.kind === 'image' && cl.image ? `Figure ${fn + 1}` : clauseNo;
      const runs = runsOf(cl.text, fields);
      for (const x of runs) if ('field' in x && x.value === undefined) missing.push({ sectionNo: no, clauseNo: ref, key: x.field, label: x.label });
      const block = cl.kind === 'table' && cl.table ? { label: `Table ${++tn}`, table: { rows: cl.table.rows, header: cl.table.header ?? true } }
        : cl.kind === 'image' && cl.image ? { label: `Figure ${++fn}`, image: { ...cl.image, widthPct: Math.min(100, Math.max(10, cl.image.widthPct ?? 60)) } } : {};
      return { id: cl.id, kind: cl.kind, no: num, ref, level, breakBefore: !!cl.breakBefore, runs, ...block };
    });
    blocks.push({ id: sec.id, no, title: sec.title, heading: sec.appendix ? `Appendix ${no} — ${sec.title}` : `${no} ${sec.title}`, appendix: !!sec.appendix, lines });
  }
  return { blocks, missing };
}
/** The caption of a table or picture as printed: "Table 1 — caption", or the label alone. */
export const captionText = (l: SpecLine): string => { const c = lineText(l).trim(); return c ? `${l.label} — ${c}` : l.label ?? ''; };
/** A line as plain text, fields filled in (DATA REQUIRED where the project has no value). */
export const lineText = (l: Pick<SpecLine, 'runs'>): string => l.runs.map((r) => ('text' in r ? r.text : r.value ?? `DATA REQUIRED: ${r.label}`)).join('');

// ---- document information and page setup

export const SPEC_SETUP: Required<Omit<SpecSetup, 'logo' | 'watermark' | 'cover' | 'contents'>> = {
  paper: 'A4', landscape: false, marginsMm: { top: 22, right: 16, bottom: 20, left: 18 },
  header: ['{{project.name}}', '', '{{doc.title}}'], footer: ['{{project.issue}}', '', 'Page {{page}} of {{pages}}'], logoPlace: 'none'
};
export const SPEC_PAPER_MM: Record<SpecPaper, [number, number]> = { A4: [210, 297], A3: [297, 420] };
export interface SpecPage extends Required<Omit<SpecSetup, 'logo' | 'watermark' | 'cover' | 'contents'>> { logo?: string; watermark?: string; cover: Required<Omit<SpecCover, 'note'>> & { note?: string }; contents: Required<SpecContents> }
/** The page setup in full: the document's own choices over the defaults, the logo the document's own or else the
 * project's company logo. Margins are kept between 5 and 60 mm so a page always has room for text. */
export function specSetup(doc: SpecDoc, p: Project): SpecPage {
  const s = doc.setup ?? {}, m = s.marginsMm ?? SPEC_SETUP.marginsMm;
  const mm = (v: number, d: number) => (Number.isFinite(v) ? Math.min(60, Math.max(5, v)) : d);
  const d = SPEC_SETUP.marginsMm;
  return {
    paper: s.paper ?? SPEC_SETUP.paper, landscape: s.landscape ?? false,
    marginsMm: { top: mm(m.top, d.top), right: mm(m.right, d.right), bottom: mm(m.bottom, d.bottom), left: mm(m.left, d.left) },
    header: s.header ?? SPEC_SETUP.header, footer: s.footer ?? SPEC_SETUP.footer, logoPlace: s.logoPlace ?? 'none',
    logo: t(s.logo) ?? t(p.drawing?.logo), watermark: t(s.watermark),
    cover: { on: s.cover?.on ?? true, logo: s.cover?.logo ?? true, parties: s.cover?.parties ?? true, details: s.cover?.details ?? true, revisions: s.cover?.revisions ?? true, note: t(s.cover?.note) },
    contents: { on: s.contents?.on ?? true, headings: s.contents?.headings ?? false, pageNumbers: s.contents?.pageNumbers ?? true }
  };
}
export type SlotRun = { text: string } | { page: 'page' | 'pages' };
/** A header or footer slot as text and page numbers, fields filled in (DATA REQUIRED where there is no value). */
export function slotRuns(text: string, doc: SpecDoc, p: Project): SlotRun[] {
  const fields = new Map(specFields(p, doc).map((f) => [f.key, f]));
  const out: SlotRun[] = [];
  const say = (v: string) => { const last = out[out.length - 1]; if (last && 'text' in last) last.text += v; else if (v) out.push({ text: v }); };
  let at = 0;
  for (const m of text.matchAll(FIELD)) {
    say(text.slice(at, m.index));
    if (m[1] === 'page' || m[1] === 'pages') out.push({ page: m[1] });
    else { const f = fields.get(m[1]); say(f?.value ?? `DATA REQUIRED: ${f?.label ?? m[1]}`); }
    at = m.index! + m[0].length;
  }
  say(text.slice(at));
  return out;
}
/** A slot as it reads on page 1 of 1, for showing on screen. */
export const slotText = (text: string, doc: SpecDoc, p: Project, page = '1', pages = '1'): string =>
  slotRuns(text, doc, p).map((r) => ('text' in r ? r.text : r.page === 'page' ? page : pages)).join('');

export const withInfo = (doc: SpecDoc, patch: Partial<SpecInfo>): SpecDoc => ({ ...doc, info: { ...doc.info, ...patch } });
export const withSetup = (doc: SpecDoc, patch: Partial<SpecSetup>): SpecDoc => ({ ...doc, setup: { ...doc.setup, ...patch } });
export const withCover = (doc: SpecDoc, patch: Partial<SpecCover>): SpecDoc => withSetup(doc, { cover: { ...doc.setup?.cover, ...patch } });
export const withContents = (doc: SpecDoc, patch: Partial<SpecContents>): SpecDoc => withSetup(doc, { contents: { ...doc.setup?.contents, ...patch } });
/** The entries of the contents page: each included section, and its clause headings when the setup asks for them.
 * `id` is where the entry points (the anchor in the PDF, the bookmark in the Word file). */
export interface SpecEntry { id: string; no: string; title: string; level: 1 | 2 }
export const specAnchor = (id: string, clause?: string): string => `spec_${id}${clause ? `_${clause}` : ''}`;
export function specContents(v: SpecView, headings: boolean): SpecEntry[] {
  return v.blocks.flatMap((b) => [
    { id: specAnchor(b.id), no: b.no, title: b.appendix ? `Appendix — ${b.title}` : b.title, level: 1 as const },
    ...(headings ? b.lines.filter((l) => l.kind === 'heading').map((l) => ({ id: specAnchor(b.id, l.id), no: l.no, title: lineText(l), level: 2 as const })) : [])
  ]);
}
/** The revision table of the cover, oldest first: the specification's own revisions, or — while it has none — the
 * project's issued revisions. */
export const specRevisionRows = (p: Project, doc?: SpecDoc): { id: string; date: string; description: string; by: string }[] =>
  (doc?.revisions?.length ? doc.revisions : p.revisions ?? []).map((r) => ({ id: r.id, date: r.date, description: r.description, by: r.by ?? '' }));
export const withTitle = (doc: SpecDoc, title: string): SpecDoc => (title.trim() ? { ...doc, title: title.trim() } : doc);
/** Adds a detail (name and value) to the document's information; its field is detail.<id>. */
export function addDetail(doc: SpecDoc, name = '', value = ''): SpecDoc {
  const details = doc.info?.details ?? [];
  let i = details.length + 1;
  while (details.some((d) => d.id === `D${i}`)) i++;
  return withInfo(doc, { details: [...details, { id: `D${i}`, name, value }] });
}
export const withDetail = (doc: SpecDoc, id: string, patch: Partial<Omit<SpecDetail, 'id'>>): SpecDoc => withInfo(doc, { details: (doc.info?.details ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)) });
export const removeDetail = (doc: SpecDoc, id: string): SpecDoc => withInfo(doc, { details: (doc.info?.details ?? []).filter((d) => d.id !== id) });
/** How many times the clauses use a field (a detail in use is not deleted without saying so). */
export const fieldUses = (doc: SpecDoc, key: string): number => doc.sections.reduce((n, s) => n + s.clauses.reduce((m, c) => m + fieldKeys(c.text).filter((k) => k === key).length, 0), 0);

// ---- editing: every edit returns a new document, so one edit is one undo step

const nextId = (doc: SpecDoc, prefix: string): string => {
  const used = new Set(doc.sections.flatMap((s) => [s.id, ...s.clauses.map((c) => c.id)]));
  let i = used.size + 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
};
const mapSection = (doc: SpecDoc, id: string, fn: (s: SpecSection) => SpecSection): SpecDoc => ({ ...doc, sections: doc.sections.map((s) => (s.id === id ? fn(s) : s)) });

export const withSectionIncluded = (doc: SpecDoc, id: string, included: boolean): SpecDoc => mapSection(doc, id, (s) => ({ ...s, included }));
export const withSectionTitle = (doc: SpecDoc, id: string, title: string): SpecDoc => (title.trim() ? mapSection(doc, id, (s) => ({ ...s, title: title.trim() })) : doc);
export function addSection(doc: SpecDoc, title: string): SpecDoc {
  return title.trim() ? { ...doc, sections: [...doc.sections, { id: nextId(doc, 'S'), title: title.trim(), included: true, clauses: [] }] } : doc;
}
export const removeSection = (doc: SpecDoc, id: string): SpecDoc => ({ ...doc, sections: doc.sections.filter((s) => s.id !== id) });
/** Moves a section up (−1) or down (+1) the list. */
export function moveSection(doc: SpecDoc, id: string, by: -1 | 1): SpecDoc {
  const i = doc.sections.findIndex((s) => s.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= doc.sections.length) return doc;
  const sections = [...doc.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return { ...doc, sections };
}

/** Adds a clause to a section: after the clause `after`, or at the end. */
export function addClause(doc: SpecDoc, sectionId: string, kind: SpecKind, text: string, after?: string, block: Pick<SpecClause, 'table' | 'image'> = {}): SpecDoc {
  const id = nextId(doc, 'C');
  return mapSection(doc, sectionId, (s) => {
    const i = after ? s.clauses.findIndex((c) => c.id === after) : -1;
    const clauses = [...s.clauses];
    // A line added under an indented line of its kind starts at that level (the next item of the list).
    const level = i >= 0 && s.clauses[i].kind === kind && s.clauses[i].level ? { level: s.clauses[i].level } : {};
    clauses.splice(i < 0 ? clauses.length : i + 1, 0, { id, kind, text, ...level, ...block });
    return { ...s, clauses };
  });
}
export const withClause = (doc: SpecDoc, sectionId: string, clauseId: string, change: Partial<Pick<SpecClause, 'text' | 'kind' | 'breakBefore' | 'table' | 'image'>>): SpecDoc =>
  mapSection(doc, sectionId, (s) => ({ ...s, clauses: s.clauses.map((c) => (c.id === clauseId ? { ...c, ...change } : c)) }));
/** Moves a line in (+1) or out (−1) one level, within what its kind allows. */
export const indentClause = (doc: SpecDoc, sectionId: string, clauseId: string, by: -1 | 1): SpecDoc =>
  mapSection(doc, sectionId, (s) => ({ ...s, clauses: s.clauses.map((c) => (c.id === clauseId ? { ...c, level: Math.min(maxLevel(c.kind), Math.max(0, (c.level ?? 0) + by)) } : c)) }));
/** Makes a section an appendix, or a numbered section again. */
export const withAppendix = (doc: SpecDoc, id: string, appendix: boolean): SpecDoc => mapSection(doc, id, (s) => ({ ...s, appendix }));
export const removeClause = (doc: SpecDoc, sectionId: string, clauseId: string): SpecDoc => mapSection(doc, sectionId, (s) => ({ ...s, clauses: s.clauses.filter((c) => c.id !== clauseId) }));
export function moveClause(doc: SpecDoc, sectionId: string, clauseId: string, by: -1 | 1): SpecDoc {
  return mapSection(doc, sectionId, (s) => {
    const i = s.clauses.findIndex((c) => c.id === clauseId), j = i + by;
    if (i < 0 || j < 0 || j >= s.clauses.length) return s;
    const clauses = [...s.clauses];
    [clauses[i], clauses[j]] = [clauses[j], clauses[i]];
    return { ...s, clauses };
  });
}

// ---- the starter specification

type Starter = [title: string, included: boolean, lines: [SpecKind, string][]];
/** Plain starter wording for the engineer to edit into the office's own. Written for this app; not text of a standard. */
const STARTER: Starter[] = [
  ['General requirements', true, [
    ['heading', 'Scope'],
    ['clause', 'This specification covers the electrical installation for {{project.name}}. It is to be read with the drawings, the schedules and the other sections of the contract documents.'],
    ['clause', 'The installation shall be complete and working. Anything needed for that, whether or not it is named here, shall be included.'],
    ['heading', 'System'],
    ['clause', 'The supply is {{project.voltage}}, three phase and neutral, {{project.frequency}}.'],
    ['clause', 'Equipment and materials shall be new, of a current design, and suitable for the conditions on site.'],
    ['heading', 'Submissions'],
    ['clause', 'Before ordering, the contractor shall submit for review the technical data, shop drawings and calculations for each item in this specification.']
  ]],
  ['LV switchboards', true, [
    ['heading', 'Scope'],
    ['clause', 'This section covers the design, manufacture, testing, delivery and installation of the main LV switchboard {{main.id}} and the other switchboards in the board schedule.'],
    ['heading', 'Ratings'],
    ['clause', 'The main switchboard shall be rated {{main.rated}} at {{project.voltage}}, {{project.frequency}}.'],
    ['clause', 'The rated short-time withstand current shall be not less than {{main.icw}} for 1 s, to suit the fault level at the board.'],
    ['clause', 'The degree of protection shall be {{main.ip}} and the busbars shall be {{main.busbar}}.'],
    ['heading', 'Testing'],
    ['clause', 'Each switchboard shall be tested at the works before delivery and again on site after installation. Test records shall be submitted.']
  ]],
  ['Distribution boards', true, [
    ['clause', 'Distribution boards shall be as the board schedule and the load schedules, {{boards.count}} boards in all including the main switchboard.'],
    ['clause', 'Each board shall have a circuit chart fixed inside the door, typed, and matching the as-built load schedule.']
  ]],
  ['Cables and wiring', true, [
    ['clause', 'Cables shall be of the types and sizes in the cable schedule. Sizes are the minimum; the contractor shall confirm them for the routes and installation methods used.'],
    ['clause', 'Each cable shall be in one length between its terminations, with no joints unless agreed in writing.'],
    ['clause', 'Every cable shall be labelled at both ends with the reference in the cable schedule.']
  ]],
  ['Cable containment', true, [
    ['clause', 'Cable trays, ladders and trunking shall be as the containment drawings and the tray schedule, with spare capacity as shown.'],
    ['clause', 'Containment shall be earthed and electrically continuous along its length.']
  ]],
  ['Earthing and lightning protection', true, [
    ['heading', 'Earthing'],
    ['clause', 'The earthing system shall be as the earthing schematic: {{earthing.system}}. Main earth conductors shall be {{earthing.conductor}} copper.'],
    ['clause', 'Each earth pit shall be tested, and its measured resistance recorded against its reference on the earthing schematic.'],
    ['heading', 'Lightning protection'],
    ['clause', 'The lightning protection system shall be {{lightning.class}}, with an air termination of this type: {{lightning.method}}.'],
    ['clause', 'Down conductors, test joints and earth pits shall be as the lightning protection layout.']
  ]],
  ['Lighting and emergency lighting', true, [
    ['clause', 'Luminaires shall be as the luminaire schedule. Samples shall be submitted for review before ordering.'],
    ['clause', 'Emergency lighting shall light the escape routes, open areas and exit signs shown on the drawings, and shall be tested for its full rated duration.']
  ]],
  ['Fire alarm', false, [
    ['clause', 'The fire alarm system shall be as the fire alarm schematic and device schedule, and shall be approved by the authority before handover.']
  ]],
  ['CCTV and access control', false, [
    ['clause', 'CCTV cameras, recorders and access control devices shall be as the ELV schedules.']
  ]],
  ['Structured cabling', false, [
    ['clause', 'Structured cabling shall be as the ELV schedules, tested end to end, with test results submitted.']
  ]]
];
export function starterSpec(): SpecDoc {
  let c = 0;
  return {
    title: 'Electrical specification',
    sections: STARTER.map(([title, included, lines], i) => ({ id: `S${i + 1}`, title, included, clauses: lines.map(([kind, text]) => ({ id: `C${++c}`, kind, text })) }))
  };
}
