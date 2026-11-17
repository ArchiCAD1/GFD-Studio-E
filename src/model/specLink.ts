import type { SpecDoc, SpecField } from './specDoc';

/**
 * Linking wording to the project: where a clause states a value the project holds (the project name, a board's
 * rating, the earthing system …) the typed value can be turned into a field, so the clause follows the project from
 * then on. Nothing is changed without the engineer choosing it — the same figure can mean something else in a clause.
 */

export interface LinkSuggestion { key: string; label: string; value: string; count: number }

const TOKEN = /(\{\{[^}]*\}\})/;
const edge = (ch: string | undefined) => ch === undefined || !/[A-Za-z0-9]/.test(ch);
/** Where `value` stands in `text` as a whole word (not inside a longer word or number). */
function hits(text: string, value: string): number[] {
  const out: number[] = [];
  for (let i = text.indexOf(value); i >= 0; i = text.indexOf(value, i + value.length)) if (edge(text[i - 1]) && edge(text[i + value.length])) out.push(i);
  return out;
}
/** The plain parts of a clause (fields already in it are left alone), each with whether it is plain. */
const parts = (text: string): { text: string; plain: boolean }[] => text.split(TOKEN).map((t) => ({ text: t, plain: !TOKEN.test(t) }));

/** The fields worth offering: with a value of three characters or more that is not a bare number, the document's
 * own (title, number, status) and the revision stamp left out; one field per value. */
function candidates(fields: SpecField[]): { key: string; label: string; value: string }[] {
  const seen = new Set<string>();
  return fields.filter((f) => !f.key.startsWith('doc.') && f.key !== 'project.issue').flatMap((f) => {
    const value = f.value?.trim();
    if (!value || value.length < 3 || /^[\d.,\s]+$/.test(value) || seen.has(value)) return [];
    seen.add(value);
    return [{ key: f.key, label: f.label, value }];
  });
}

/** The project values found typed in the clauses, headings, notes and captions, longest value first, with how many
 * times each stands. */
export function linkSuggestions(doc: SpecDoc, fields: SpecField[]): LinkSuggestion[] {
  const texts = doc.sections.flatMap((s) => s.clauses.flatMap((c) => parts(c.text).filter((x) => x.plain).map((x) => x.text)));
  return candidates(fields).map((f) => ({ ...f, count: texts.reduce((n, t) => n + hits(t, f.value).length, 0) })).filter((f) => f.count > 0).sort((a, b) => b.value.length - a.value.length || a.label.localeCompare(b.label));
}

/** Turns the typed values of the chosen fields into fields, longest value first so a value inside a longer one is
 * not cut out of it. `replaced`: how many places changed. */
export function linkFields(doc: SpecDoc, keys: string[], fields: SpecField[]): { doc: SpecDoc; replaced: number } {
  const chosen = candidates(fields).filter((f) => keys.includes(f.key)).sort((a, b) => b.value.length - a.value.length);
  let replaced = 0;
  const link = (text: string): string => {
    let out = text;
    for (const f of chosen) {
      out = parts(out).map((x) => {
        if (!x.plain) return x.text;
        const at = hits(x.text, f.value);
        replaced += at.length;
        return at.reduceRight((t, i) => `${t.slice(0, i)}{{${f.key}}}${t.slice(i + f.value.length)}`, x.text);
      }).join('');
    }
    return out;
  };
  const sections = doc.sections.map((s) => ({ ...s, clauses: s.clauses.map((c) => { const text = link(c.text); return text === c.text ? c : { ...c, text }; }) }));
  return { doc: replaced ? { ...doc, sections } : doc, replaced };
}
