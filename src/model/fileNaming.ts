/** File names for the app's outputs, from a folder template's naming rule (spec C4): a pattern of fields
 * ("{ProjectNo}-{Discipline}-{Type}-{Seq:3}-{Rev}") filled from the project and the document. Pure; the
 * extension is added by whoever saves the file. */

import { DOC_TYPES, type DocType } from './folderRoles';
import { safeNamePart, type NamingPreset, type NamingRule } from './folderTemplates';

/** Fields a file name may use. Project is the project number and Number the sequence (ISO 19650 wording). */
export const FILE_TOKENS = [
  'ProjectNo', 'Project', 'ProjectShort', 'Client', 'Plot', 'Discipline', 'Type', 'Seq', 'Number', 'Rev', 'Stage', 'Date',
  'Board', 'Level', 'Sheet', 'Study', 'Originator', 'Volume', 'Role', 'BuildingCode'
] as const;
export type FileToken = (typeof FILE_TOKENS)[number];
const isToken = (k: string): k is FileToken => (FILE_TOKENS as readonly string[]).includes(k);
/** Fields that are a running number and may be padded: {Seq:3} → 007. */
const NUMBERED: readonly FileToken[] = ['Seq', 'Number'];

export const NAMING_PRESETS: Record<Exclude<NamingPreset, 'custom'>, { label: string; pattern: string; separator: NamingRule['separator'] }> = {
  office: { label: 'Office code', pattern: '{ProjectNo}-{Discipline}-{Type}-{Seq:3}-{Rev}', separator: '-' },
  iso19650: { label: 'ISO 19650', pattern: '{Project}-{Originator}-{Volume}-{Level}-{Type}-{Role}-{Number}', separator: '-' },
  simple: { label: 'Simple', pattern: '{ProjectShort}_{Type}_{Rev}', separator: '_' }
};

export type NamePart = { token: FileToken; pad?: number } | { text: string };

const PART = /\{(\w+)(?::(\d))?\}/g;

/** The pattern as fields and the text between them. An unknown {field} stays as text. */
export function parsePattern(pattern: string): NamePart[] {
  const out: NamePart[] = [];
  let at = 0;
  for (const m of pattern.matchAll(PART)) {
    if (!isToken(m[1])) continue;
    if (m.index > at) out.push({ text: pattern.slice(at, m.index) });
    const pad = m[2] && NUMBERED.includes(m[1]) ? Math.max(1, +m[2]) : undefined;
    out.push(pad ? { token: m[1], pad } : { token: m[1] });
    at = m.index + m[0].length;
  }
  if (at < pattern.length) out.push({ text: pattern.slice(at) });
  return out;
}

export const patternOf = (parts: readonly NamePart[]): string =>
  parts.map((p) => ('text' in p ? p.text : p.pad ? `{${p.token}:${p.pad}}` : `{${p.token}}`)).join('');

const ILLEGAL = /[<>:"/\\|?*&#%]/;
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/** What is wrong with a pattern, in plain words; empty when it can be used. */
export function patternIssues(pattern: string): string[] {
  const out: string[] = [];
  if (!pattern.trim()) return ['The pattern is empty'];
  for (const m of pattern.matchAll(/\{(\w*)(?::[^}]*)?\}/g)) if (!isToken(m[1])) out.push(`{${m[1]}} is not a field a file name can use`);
  const text = parsePattern(pattern).filter((p): p is { text: string } => 'text' in p).map((p) => p.text.replace(/\{\w*(?::[^}]*)?\}/g, '')).join('');
  const bad = text.match(ILLEGAL);
  if (bad) out.push(`Remove ${bad[0]} (not allowed in file names)`);
  if (/[{}]/.test(text)) out.push('A { or } is not part of a field');
  if (!parsePattern(pattern).some((p) => 'token' in p)) out.push('The pattern has no field, so every file would get the same name');
  return out;
}

export type NameValues = Partial<Record<FileToken, string | number>>;

/** Values the builder's preview uses when no project is open. */
export const SAMPLE_VALUES: NameValues = {
  ProjectNo: '2417', ProjectShort: 'AlBarsha-Villas', Client: 'Sample Developments LLC', Plot: '345-0789', Seq: 1, Rev: 'B', Stage: 'Schematic',
  Date: '20261117', Board: 'DB-GF-01', Level: 'GF', Sheet: '201', Study: 'VD', Originator: 'LVD', Volume: 'ZZ', Role: 'E', BuildingCode: 'B1'
};

const SEPS = '[-_. ]';
const MISSING = '';

/** The pattern a document type uses: its own when the rule has one, else the rule's. */
export const patternFor = (rule: NamingRule, docType?: DocType): string => (docType && rule.perType?.[docType]?.trim()) || rule.pattern;

/** The file name (no extension) for a document. Discipline falls back to the rule's ("E"), Type to the
 * document type, Project to the project number and Number to the sequence. A field with no value is left
 * out with the separator beside it; characters a file name cannot hold become "-". */
export function formatName(rule: NamingRule, docType: DocType | undefined, values: NameValues): string {
  const v: NameValues = { Discipline: rule.discipline ?? 'E', ...(docType ? { Type: docType } : {}), ...values };
  if (v.Project === undefined) v.Project = v.ProjectNo;
  if (v.Number === undefined) v.Number = v.Seq;
  const s = parsePattern(patternFor(rule, docType)).map((p) => {
    if ('text' in p) return p.text.replace(/[<>:"/\\|?*&#%{}]/g, '');
    const raw = v[p.token];
    if (raw === undefined || raw === '') return MISSING;
    const isNum = NUMBERED.includes(p.token) && /^\d+$/.test(String(raw));
    const pad = p.pad ?? (p.token === 'Number' ? 4 : 0);
    return safeNamePart(isNum && pad ? String(raw).padStart(pad, '0') : String(raw)).replace(/\s+/g, '-');
  }).join('');
  const name = s
    .replace(new RegExp(`^(?:${SEPS}*${MISSING})+${SEPS}*`), '')
    .replace(new RegExp(`(?:${SEPS}*${MISSING})+${SEPS}*$`), '')
    .replace(new RegExp(`(${SEPS}*)(?:${MISSING}${SEPS}*)+`, 'g'), (m: string, a: string) => (a || m.split(MISSING).join('')).slice(0, 1))
    .replace(/[. ]+$/, '')
    .trim();
  const safe = RESERVED.test(name) ? `${name}_` : name;
  return rule.upper ? safe.toUpperCase() : safe;
}

/** The rule with another separator: the text between two fields that was the old separator becomes the new one. */
export function withSeparator(rule: NamingRule, separator: NamingRule['separator']): NamingRule {
  const swap = (pattern: string) => patternOf(parsePattern(pattern).map((p) => ('text' in p && p.text === rule.separator ? { text: separator } : p)));
  const perType = rule.perType ? Object.fromEntries(Object.entries(rule.perType).map(([k, p]) => [k, swap(p)])) as NamingRule['perType'] : undefined;
  return { ...rule, separator, pattern: swap(rule.pattern), ...(perType ? { perType } : {}) };
}

/** The separator a pattern uses between its fields: the one seen most often, else `fallback`. */
export function separatorOf(pattern: string, fallback: NamingRule['separator']): NamingRule['separator'] {
  const count: Record<string, number> = { '-': 0, _: 0, '.': 0 };
  for (const p of parsePattern(pattern)) if ('text' in p && p.text in count) count[p.text]++;
  const best = (Object.keys(count) as NamingRule['separator'][]).sort((a, b) => count[b] - count[a])[0];
  return count[best] > 0 && count[best] > count[fallback] ? best : fallback;
}

/** The parts without one of them. Taking a field out also takes out the separator beside it, so no two
 * separators are left side by side. */
export function withoutPart(parts: readonly NamePart[], index: number, separator: string): NamePart[] {
  const isSep = (p: NamePart | undefined) => !!p && 'text' in p && p.text === separator;
  const drop = new Set([index]);
  if ('token' in parts[index]) {
    if (isSep(parts[index - 1])) drop.add(index - 1);
    else if (isSep(parts[index + 1])) drop.add(index + 1);
  }
  return parts.filter((_, i) => !drop.has(i));
}

/** The rule set to a preset's pattern and separator; "custom" keeps the pattern as it is. */
export function withPreset(rule: NamingRule, preset: NamingPreset): NamingRule {
  if (preset === 'custom') return { ...rule, preset };
  const p = NAMING_PRESETS[preset];
  return { ...rule, preset, pattern: p.pattern, separator: p.separator };
}

/** The preset a pattern matches, else "custom". */
export const presetOf = (pattern: string): NamingPreset =>
  (Object.keys(NAMING_PRESETS) as Exclude<NamingPreset, 'custom'>[]).find((k) => NAMING_PRESETS[k].pattern === pattern) ?? 'custom';

/** One document type's own pattern; an empty one (or the rule's own) goes back to the default. */
export function withTypePattern(rule: NamingRule, docType: DocType, pattern: string): NamingRule {
  const { perType: old, ...rest } = rule;
  const perType = { ...old };
  if (!pattern.trim() || pattern === rule.pattern) delete perType[docType]; else perType[docType] = pattern;
  return Object.keys(perType).length ? { ...rest, perType } : rest;
}

/** Names that come out the same for different documents in a preview list. */
export function duplicateNames(names: readonly string[]): string[] {
  const seen = new Set<string>(), dup = new Set<string>();
  for (const n of names) { const k = n.toLowerCase(); if (seen.has(k)) dup.add(n); seen.add(k); }
  return [...dup];
}

/** Problems in a naming rule that stop a template being saved: its pattern and each type's own pattern. */
export function namingIssues(rule: NamingRule): string[] {
  return [
    ...patternIssues(rule.pattern).map((m) => `File naming: ${m}`),
    ...DOC_TYPES.flatMap((d) => (rule.perType?.[d] ? patternIssues(rule.perType[d]!).map((m) => `File naming for ${d}: ${m}`) : []))
  ];
}
