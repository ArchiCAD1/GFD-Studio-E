import { pushLibrary } from '../database/librarySync';
import type { SpecClause, SpecDetail, SpecDoc, SpecSection, SpecSetup } from './specDoc';

/**
 * Your office's specification templates: wording saved once and used again in other projects — a heading with its
 * clauses (a product specification), a whole section, or a whole specification. Fields in the wording stay fields,
 * so a template fills in from whichever project it is used in. Kept like the other libraries: a working copy in
 * this computer's storage, synced through GFD Studio E Database/Library.json.
 *
 * Also the specification as a file of its own (Save as / Open), to carry one to another project or computer.
 */

export const SPEC_TEMPLATES_KEY = 'gfde.specTemplates';
/** The library is kept in the computer's own storage, which is small: a template over this size (pictures) is refused. */
export const TEMPLATE_MAX_CHARS = 1_500_000;

export type SpecTemplateKind = 'clauses' | 'section' | 'spec';
export const TEMPLATE_KINDS: Record<SpecTemplateKind, string> = { clauses: 'Clauses', section: 'Section', spec: 'Whole specification' };
/** `sections`: the wording (for `clauses`, one unnamed section holding them). `details`: the engineer's own details
 * the wording uses, by name, so they can be matched or added where the template is used. `title`, `setup`: of a whole
 * specification. */
export interface SpecTemplate { id: string; name: string; kind: SpecTemplateKind; sections: SpecSection[]; details?: Pick<SpecDetail, 'id' | 'name'>[]; title?: string; setup?: SpecSetup; updatedAt: string } // updatedAt: yyyy-mm-dd

const KINDS = new Set(['heading', 'clause', 'note', 'table', 'image']);
const isClause = (c: unknown): c is SpecClause => {
  const x = c as SpecClause;
  return !!x && typeof x === 'object' && typeof x.id === 'string' && !!x.id && KINDS.has(x.kind) && typeof x.text === 'string'
    && (x.kind !== 'table' || (Array.isArray(x.table?.rows) && x.table.rows.every((r) => Array.isArray(r) && r.every((v) => typeof v === 'string'))))
    && (x.kind !== 'image' || (typeof x.image?.src === 'string' && x.image.w > 0 && x.image.h > 0));
};
const isSection = (s: unknown): s is SpecSection => {
  const x = s as SpecSection;
  return !!x && typeof x === 'object' && typeof x.id === 'string' && !!x.id && typeof x.title === 'string' && Array.isArray(x.clauses) && x.clauses.every(isClause);
};
/** Whether a value read from a file or from storage is a specification the app can use. */
export const isSpecDoc = (d: unknown): d is SpecDoc => {
  const x = d as SpecDoc;
  return !!x && typeof x === 'object' && typeof x.title === 'string' && Array.isArray(x.sections) && x.sections.length > 0 && x.sections.every(isSection);
};
const isTemplate = (t: unknown): t is SpecTemplate => {
  const x = t as SpecTemplate;
  return !!x && typeof x === 'object' && typeof x.id === 'string' && !!x.id && typeof x.name === 'string' && !!x.name && x.kind in TEMPLATE_KINDS && Array.isArray(x.sections) && x.sections.length > 0 && x.sections.every(isSection);
};

/** Your templates on this computer (synced from Library.json). */
export function loadTemplates(): SpecTemplate[] {
  try {
    const v = JSON.parse(localStorage.getItem(SPEC_TEMPLATES_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(isTemplate) : [];
  } catch { return []; }
}
/** Saves the library; false when the computer's storage did not take it (full or blocked). */
export function saveTemplates(list: SpecTemplate[]): boolean {
  try { localStorage.setItem(SPEC_TEMPLATES_KEY, JSON.stringify(list)); void pushLibrary(); return true; } catch { return false; }
}

/** Why a template name is not accepted. */
export function templateNameError(name: string): string | undefined {
  const t = name.trim();
  if (!t) return 'Give the template a name.';
  if (t.length > 80) return 'Keep the name to 80 characters.';
  return undefined;
}

const newId = () => `spt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DETAIL = /\{\{\s*detail\.([A-Za-z0-9_-]+)\s*\}\}/g;
const detailIds = (sections: SpecSection[]): Set<string> => new Set(sections.flatMap((s) => s.clauses.flatMap((c) => [...c.text.matchAll(DETAIL)].map((m) => m[1]))));

/** A heading with everything under it, up to the next heading of its level or above; any other line alone. */
export function clauseGroup(section: SpecSection, clauseId: string): SpecClause[] {
  const i = section.clauses.findIndex((c) => c.id === clauseId);
  if (i < 0) return [];
  const first = section.clauses[i];
  if (first.kind !== 'heading') return [first];
  let j = i + 1;
  while (j < section.clauses.length && !(section.clauses[j].kind === 'heading' && (section.clauses[j].level ?? 0) <= (first.level ?? 0))) j++;
  return section.clauses.slice(i, j);
}

/** A template made from the document: the chosen clause (a heading with its clauses), the chosen section, or the whole
 * specification (its title and page setup too; the document's number, status and parties stay behind). None: there is
 * nothing to save (no such section or clause). */
export function templateOf(doc: SpecDoc, kind: SpecTemplateKind, name: string, at: { sectionId?: string; clauseId?: string } = {}, when = new Date()): SpecTemplate | undefined {
  const section = doc.sections.find((s) => s.id === at.sectionId);
  let sections: SpecSection[];
  if (kind === 'spec') sections = doc.sections;
  else if (!section) return undefined;
  else if (kind === 'section') sections = [section];
  else {
    const clauses = at.clauseId ? clauseGroup(section, at.clauseId) : [];
    if (!clauses.length) return undefined;
    sections = [{ id: 'T', title: '', included: true, clauses }];
  }
  const used = detailIds(sections), details = (doc.info?.details ?? []).filter((d) => used.has(d.id) && d.name.trim()).map((d) => ({ id: d.id, name: d.name.trim() }));
  return {
    id: newId(), name: name.trim(), kind, sections, updatedAt: when.toISOString().slice(0, 10),
    ...(details.length ? { details } : {}), ...(kind === 'spec' ? { title: doc.title, ...(doc.setup ? { setup: doc.setup } : {}) } : {})
  };
}

/** The list with the template saved: one of that name and kind (case ignored) is replaced, else it is added. */
export function withTemplate(list: SpecTemplate[], t: SpecTemplate): { list: SpecTemplate[]; updated: boolean } {
  const same = list.find((x) => x.kind === t.kind && x.name.trim().toLowerCase() === t.name.trim().toLowerCase());
  return same ? { list: list.map((x) => (x === same ? { ...t, id: same.id } : x)), updated: true } : { list: [...list, t], updated: false };
}
export const removeTemplate = (list: SpecTemplate[], id: string): SpecTemplate[] => list.filter((t) => t.id !== id);
/** What a template holds, in words. */
export function templateSummary(t: SpecTemplate): string {
  const n = t.sections.reduce((k, s) => k + s.clauses.length, 0), lines = `${n} line${n === 1 ? '' : 's'}`;
  return t.kind === 'clauses' ? lines : `${t.sections.length} section${t.sections.length === 1 ? '' : 's'}, ${lines}`;
}

/** Puts a template into the document. Clauses go after the clause `clauseId` of the section `sectionId` (at its end
 * when none); a section goes after that section; a whole specification replaces the sections, title and page setup
 * (the document's number, status, parties and details stay). Every line gets an id of its own, and a detail the
 * wording uses is matched to the document's detail of that name, or added with no value (DATA REQUIRED until filled).
 * `added`: the ids of what came in, first to last. */
export function applyTemplate(doc: SpecDoc, t: SpecTemplate, at: { sectionId?: string; clauseId?: string } = {}): { doc: SpecDoc; added: string[] } {
  // details: by name
  const details = [...(doc.info?.details ?? [])], map = new Map<string, string>();
  for (const d of t.details ?? []) {
    const same = details.find((x) => x.name.trim().toLowerCase() === d.name.toLowerCase());
    if (same) { map.set(d.id, same.id); continue; }
    let i = details.length + 1;
    while (details.some((x) => x.id === `D${i}`)) i++;
    details.push({ id: `D${i}`, name: d.name, value: '' });
    map.set(d.id, `D${i}`);
  }
  const text = (v: string) => v.replace(DETAIL, (whole, id: string) => (map.has(id) ? `{{detail.${map.get(id)}}}` : whole));
  // ids: none already in the document (a whole specification starts afresh)
  const used = new Set(t.kind === 'spec' ? [] : doc.sections.flatMap((s) => [s.id, ...s.clauses.map((c) => c.id)]));
  const fresh = (prefix: string) => { let i = used.size + 1; while (used.has(`${prefix}${i}`)) i++; used.add(`${prefix}${i}`); return `${prefix}${i}`; };
  const clause = (c: SpecClause): SpecClause => ({ ...c, id: fresh('C'), text: text(c.text) });
  const base: SpecDoc = details.length !== (doc.info?.details ?? []).length ? { ...doc, info: { ...doc.info, details } } : doc;

  if (t.kind === 'spec') {
    const sections = t.sections.map((s) => ({ ...s, id: fresh('S'), clauses: s.clauses.map(clause) }));
    const { setup: _old, ...rest } = base;
    return { doc: { ...rest, title: t.title?.trim() || doc.title, ...(t.setup ? { setup: t.setup } : {}), sections }, added: sections.map((s) => s.id) };
  }
  const si = Math.max(0, doc.sections.findIndex((s) => s.id === at.sectionId));
  if (t.kind === 'section') {
    const sections = t.sections.map((s) => ({ ...s, id: fresh('S'), clauses: s.clauses.map(clause) }));
    return { doc: { ...base, sections: [...base.sections.slice(0, si + 1), ...sections, ...base.sections.slice(si + 1)] }, added: sections.map((s) => s.id) };
  }
  const clauses = t.sections.flatMap((s) => s.clauses).map(clause);
  return {
    doc: { ...base, sections: base.sections.map((s, i) => { if (i !== si) return s; const ci = s.clauses.findIndex((c) => c.id === at.clauseId), cut = ci < 0 ? s.clauses.length : ci + 1; return { ...s, clauses: [...s.clauses.slice(0, cut), ...clauses, ...s.clauses.slice(cut)] }; }) },
    added: clauses.map((c) => c.id)
  };
}

// ---- the specification as a file of its own

export const SPEC_FILE_EXT = 'gfde-spec';
/** The specification as the text of its own file. */
export const specFileText = (doc: SpecDoc): string => JSON.stringify({ format: 'gfde-specification', version: 1, spec: doc }, null, 1);
/** The specification in a file's text; none when the file is not a specification saved by the app. */
export function specFromFileText(text: string): SpecDoc | undefined {
  try {
    const v = JSON.parse(text) as { format?: string; spec?: unknown };
    return v && (v.format === 'gfde-specification' || v.format === 'lvds-specification') && isSpecDoc(v.spec) ? v.spec : undefined;
  } catch { return undefined; }
}
