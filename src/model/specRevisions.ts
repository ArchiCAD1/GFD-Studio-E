import { captionText, lineText, type SpecClause, type SpecDoc, type SpecMarks, type SpecRevision, type SpecSnapLine, type SpecSnapSection, type SpecView } from './specDoc';

/**
 * The specification's own revisions — apart from the project's, because a specification is revised on its own. A
 * revision keeps the wording as issued; what differs from the revision before is a change, shown by a highlight, a
 * revision cloud, a revision mark, or the deleted words struck through, as the engineer chooses.
 */

const hash = (v: string): string => { let h = 2166136261; for (let i = 0; i < v.length; i++) { h ^= v.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const sigOf = (c: SpecClause): string | undefined =>
  c.kind === 'table' && c.table ? hash(JSON.stringify([c.table.rows, c.table.header ?? true])) : c.kind === 'image' && c.image ? `${c.image.w}x${c.image.h}:${c.image.widthPct ?? 60}:${hash(c.image.src)}` : undefined;
const snapLine = (c: SpecClause): SpecSnapLine => { const sig = sigOf(c); return { id: c.id, kind: c.kind, text: c.text, ...(c.level ? { level: c.level } : {}), ...(sig ? { sig } : {}) }; };
/** The wording as it stands: the included sections and their lines. */
export const snapshot = (doc: SpecDoc): SpecSnapSection[] => doc.sections.filter((s) => s.included).map((s) => ({ id: s.id, title: s.title, ...(s.appendix ? { appendix: true } : {}), lines: s.clauses.map(snapLine) }));
const same = (a: SpecSnapLine, b: SpecSnapLine) => a.kind === b.kind && a.text === b.text && (a.level ?? 0) === (b.level ?? 0) && a.sig === b.sig;

export const SPEC_MARKS: Required<Omit<SpecMarks, 'against'>> = { highlight: true, cloud: false, triangle: true, deleted: false, list: false };
export const marksOf = (doc: SpecDoc): Required<Omit<SpecMarks, 'against'>> => ({ ...SPEC_MARKS, ...Object.fromEntries(Object.entries(doc.marks ?? {}).filter(([k, v]) => k !== 'against' && typeof v === 'boolean')) });
export const withMarks = (doc: SpecDoc, patch: Partial<SpecMarks>): SpecDoc => ({ ...doc, marks: { ...doc.marks, ...patch } });

/** The id the next revision would take: A, B … after letters; 0, 1 … after numbers; P1, P2 … after a prefix. */
export function nextRevisionId(revs: SpecRevision[] = []): string {
  const last = revs[revs.length - 1]?.id.trim();
  if (!last) return 'A';
  const num = /^(.*?)(\d+)$/.exec(last);
  if (num) return `${num[1]}${String(Number(num[2]) + 1).padStart(num[2].length, '0')}`;
  if (/^[A-Y]$/.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1);
  if (/^[a-y]$/.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1);
  return `${last}1`;
}
/** Why a revision id is not accepted. */
export function revisionIdError(doc: SpecDoc, id: string): string | undefined {
  const t = id.trim();
  if (!t) return 'Give the revision an id (A, B … or 0, 1 …).';
  if (t.length > 8) return 'Keep the revision id to 8 characters.';
  if ((doc.revisions ?? []).some((r) => r.id.trim().toLowerCase() === t.toLowerCase())) return `Revision ${t} is already issued.`;
  return undefined;
}
/** Whether the wording differs from the last issued revision (true before the first issue). */
export function changedSinceIssue(doc: SpecDoc): boolean {
  const last = doc.revisions?.[doc.revisions.length - 1];
  return !last || last.title !== doc.title || JSON.stringify(last.sections) !== JSON.stringify(snapshot(doc));
}
/** Issues the wording as it stands as a revision. */
export function issueRevision(doc: SpecDoc, rev: { id: string; description: string; by?: string }, when = new Date()): SpecDoc {
  const by = rev.by?.trim();
  const { against: _reset, ...marks } = doc.marks ?? {}; // a new issue is compared with the one before it again
  return {
    ...doc, ...(doc.marks ? { marks } : {}),
    revisions: [...(doc.revisions ?? []), { id: rev.id.trim(), date: when.toISOString().slice(0, 10), description: rev.description.trim(), ...(by ? { by } : {}), title: doc.title, sections: snapshot(doc) }]
  };
}
/** Takes back the last issued revision (issued by mistake); the wording stays. */
export const withdrawLast = (doc: SpecDoc): SpecDoc => ({ ...doc, revisions: (doc.revisions ?? []).slice(0, -1) });

export type LineChange = 'new' | 'changed';
/** A line that stood at the baseline and is gone: where it stood (after which line of which section still there). */
export interface DeletedLine { sectionId: string; sectionTitle: string; after?: string; line: SpecSnapLine }
export interface SpecChanges {
  /** The revision the marks belong to: the last issued when the wording is as issued, else the next one. */
  rev: string; issued: boolean;
  /** The revision compared with; none when there is nothing to compare with (no marks then). */
  base?: string;
  lines: Map<string, LineChange>; titles: Set<string>; newSections: Set<string>;
  deleted: DeletedLine[]; removedSections: string[];
  count: number;
}

/** What has changed. The wording is compared with the revision before the current one: while it is as issued, the
 * changes are those of that issue (B against A); once it is edited, those since the issue (the next revision against
 * B). `marks.against` compares with a chosen revision instead. */
export function specChanges(doc: SpecDoc): SpecChanges {
  const revs = doc.revisions ?? [], issued = revs.length > 0 && !changedSinceIssue(doc);
  const out: SpecChanges = { rev: issued ? revs[revs.length - 1].id : nextRevisionId(revs), issued, lines: new Map(), titles: new Set(), newSections: new Set(), deleted: [], removedSections: [], count: 0 };
  const chosen = revs.find((r) => r.id === doc.marks?.against && !(issued && r === revs[revs.length - 1]));
  const base = chosen ?? (issued ? revs[revs.length - 2] : revs[revs.length - 1]);
  if (!base) return out;
  out.base = base.id;
  const now = snapshot(doc), was = new Map(base.sections.map((s) => [s.id, s]));
  const wasLines = new Map(base.sections.flatMap((s) => s.lines.map((l) => [l.id, l] as const)));
  const nowLines = new Set(now.flatMap((s) => s.lines.map((l) => l.id)));
  for (const s of now) {
    const old = was.get(s.id);
    if (!old) out.newSections.add(s.id); else if (old.title !== s.title || !!old.appendix !== !!s.appendix) out.titles.add(s.id);
    for (const l of s.lines) { const o = wasLines.get(l.id); if (!o) out.lines.set(l.id, 'new'); else if (!same(o, l)) out.lines.set(l.id, 'changed'); }
  }
  const nowIds = new Set(now.map((s) => s.id));
  for (const s of base.sections) {
    if (!nowIds.has(s.id) && s.lines.every((l) => !nowLines.has(l.id))) { out.removedSections.push(s.title); continue; }
    let after: string | undefined;
    for (const l of s.lines) {
      if (nowLines.has(l.id)) { after = l.id; continue; }
      // It stood in this section; if the section is gone but some of its lines moved elsewhere, list it under the old title.
      out.deleted.push({ sectionId: s.id, sectionTitle: s.title, ...(after ? { after } : {}), line: l });
    }
  }
  out.count = out.lines.size + out.titles.size + out.deleted.length + out.removedSections.length + [...out.newSections].filter((id) => !now.find((s) => s.id === id)!.lines.length).length;
  return out;
}

export type ChangeKind = 'New' | 'Changed' | 'Deleted' | 'Section added' | 'Section removed' | 'Title changed';
export interface ChangeRow { ref: string; what: ChangeKind; text: string; sectionId?: string }
const brief = (t: string) => { const x = t.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, '[$1]').replace(/\s+/g, ' ').trim(); return x.length > 110 ? `${x.slice(0, 107)}…` : x; };
/** The deleted lines of a section, by the line each stood after ('' for the top of the section). */
export function deletedBySection(ch: SpecChanges): Map<string, Map<string, SpecSnapLine[]>> {
  const out = new Map<string, Map<string, SpecSnapLine[]>>();
  for (const d of ch.deleted) {
    const sec = out.get(d.sectionId) ?? new Map<string, SpecSnapLine[]>();
    sec.set(d.after ?? '', [...(sec.get(d.after ?? '') ?? []), d.line]);
    out.set(d.sectionId, sec);
  }
  return out;
}
/** The change list in document order: each changed, new or deleted line by its clause number, and the sections
 * added, renamed or removed. */
export function changeRows(doc: SpecDoc, v: SpecView, ch: SpecChanges = specChanges(doc)): ChangeRow[] {
  if (!ch.base) return [];
  const rows: ChangeRow[] = [], gone = deletedBySection(ch);
  const deleted = (sectionId: string, after: string, where: string) => { for (const l of gone.get(sectionId)?.get(after) ?? []) rows.push({ ref: where, what: 'Deleted', text: brief(l.text) || (l.kind === 'table' ? 'Table' : l.kind === 'image' ? 'Picture' : ''), sectionId }); };
  const shown = new Set(v.blocks.map((b) => b.id));
  for (const b of v.blocks) {
    if (ch.newSections.has(b.id)) rows.push({ ref: b.no, what: 'Section added', text: b.title, sectionId: b.id });
    else if (ch.titles.has(b.id)) rows.push({ ref: b.no, what: 'Title changed', text: b.heading, sectionId: b.id });
    deleted(b.id, '', `${b.no}, at the top`);
    for (const l of b.lines) {
      const c = ch.newSections.has(b.id) ? undefined : ch.lines.get(l.id);
      if (c) rows.push({ ref: l.label ?? (l.ref || b.no), what: c === 'new' ? 'New' : 'Changed', text: brief(l.label ? captionText(l) : lineText(l)), sectionId: b.id });
      deleted(b.id, l.id, `after ${l.label ?? (l.ref || b.no)}`);
    }
  }
  // Lines of a section that is no longer shown, but not wholly gone (some of its lines live on elsewhere).
  for (const d of ch.deleted) if (!shown.has(d.sectionId)) rows.push({ ref: d.sectionTitle, what: 'Deleted', text: brief(d.line.text) });
  for (const t of ch.removedSections) rows.push({ ref: '—', what: 'Section removed', text: t });
  return rows;
}
