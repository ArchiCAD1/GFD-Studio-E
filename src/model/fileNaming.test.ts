import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES } from './folderTemplateBuiltins';
import type { NamingRule } from './folderTemplates';
import {
  duplicateNames, FILE_TOKENS, formatName, namingIssues, NAMING_PRESETS, parsePattern, patternIssues, patternOf, presetOf, SAMPLE_VALUES, separatorOf, withoutPart, withPreset, withSeparator, withTypePattern
} from './fileNaming';

const office: NamingRule = { preset: 'office', pattern: NAMING_PRESETS.office.pattern, separator: '-', discipline: 'E' };

describe('parsePattern', () => {
  it('splits fields and text, keeps padding, and round-trips', () => {
    const parts = parsePattern('{ProjectNo}-E-{Type}_{Seq:3}');
    expect(parts).toEqual([{ token: 'ProjectNo' }, { text: '-E-' }, { token: 'Type' }, { text: '_' }, { token: 'Seq', pad: 3 }]);
    expect(patternOf(parts)).toBe('{ProjectNo}-E-{Type}_{Seq:3}');
  });
  it('keeps an unknown field as text and ignores padding on a field that is not a number', () => {
    expect(parsePattern('{Nope}-{Rev:3}')).toEqual([{ text: '{Nope}-' }, { token: 'Rev' }]);
  });
});

describe('formatName', () => {
  it('fills the office pattern for each document type', () => {
    expect(formatName(office, 'DWG', { ...SAMPLE_VALUES, Seq: 201 })).toBe('2417-E-DWG-201-B');
    expect(formatName(office, 'CAL', { ...SAMPLE_VALUES, Seq: 1 })).toBe('2417-E-CAL-001-B');
    expect(formatName(office, 'TR', { ProjectNo: '2417', Seq: 7 })).toBe('2417-E-TR-007');
  });
  it('fills every field', () => {
    const rule: NamingRule = { preset: 'custom', pattern: FILE_TOKENS.map((t) => `{${t}}`).join('-'), separator: '-' };
    const name = formatName(rule, 'SCH', SAMPLE_VALUES);
    expect(name).toBe('2417-2417-AlBarsha-Villas-Sample-Developments-LLC-345-0789-E-SCH-1-0001-B-Schematic-20261117-DB-GF-01-GF-201-VD-LVD-ZZ-E-B1');
  });
  it('fills the ISO 19650 preset of the built-in template', () => {
    const iso = BUILT_IN_TEMPLATES.find((t) => t.id === 'iso19650')!.naming;
    expect(formatName(iso, 'DWG', { ...SAMPLE_VALUES, Seq: 12 })).toBe('2417-LVD-ZZ-GF-DWG-E-0012');
  });
  it('uses a document type\'s own pattern', () => {
    const rule = withTypePattern(office, 'SCH', '{ProjectNo}-E-SCH-{Board}-{Rev}');
    expect(formatName(rule, 'SCH', SAMPLE_VALUES)).toBe('2417-E-SCH-DB-GF-01-B');
    expect(formatName(rule, 'DWG', SAMPLE_VALUES)).toBe('2417-E-DWG-001-B');
  });
  it('leaves out a field with no value, with its separator', () => {
    expect(formatName(office, 'DWG', { ProjectNo: '2417', Seq: 5 })).toBe('2417-E-DWG-005');
    expect(formatName(office, 'DWG', { Seq: 5, Rev: 'A' })).toBe('E-DWG-005-A');
    expect(formatName({ ...office, pattern: '{Client}_{Type}_{Rev}_{Date}' }, 'BOQ', { Rev: 'R1' })).toBe('BOQ_R1');
  });
  it('makes typed values safe for a file name', () => {
    expect(formatName({ ...office, pattern: '{Client}_{Type}' }, 'SPC', { Client: 'A/B & Sons: "Main"' })).toBe('A-B---Sons---Main-_SPC');
    expect(formatName({ ...office, pattern: '{Board}' }, undefined, { Board: 'CON' })).toBe('CON_');
    expect(formatName({ ...office, pattern: '{Rev}.' }, undefined, { Rev: 'A' })).toBe('A');
  });
  it('writes capitals when asked, and does not pad a sequence that is not a number', () => {
    expect(formatName({ ...office, pattern: '{ProjectShort}-{Seq:3}', upper: true }, undefined, { ProjectShort: 'villa', Seq: 'a1' })).toBe('VILLA-A1');
  });
});

describe('patternIssues', () => {
  it('accepts the presets', () => {
    for (const p of Object.values(NAMING_PRESETS)) expect(patternIssues(p.pattern)).toEqual([]);
  });
  it('explains what is wrong', () => {
    expect(patternIssues('')).toEqual(['The pattern is empty']);
    expect(patternIssues('{ProjectNo}-{Nope}')[0]).toMatch(/\{Nope\} is not a field/);
    expect(patternIssues('{ProjectNo}?')[0]).toMatch(/Remove \?/);
    expect(patternIssues('drawing')[0]).toMatch(/no field/);
  });
});

describe('changing the rule', () => {
  it('swaps the separator between fields, in every pattern', () => {
    const rule = withSeparator(withTypePattern(office, 'TR', '{ProjectNo}-TR-{Seq:3}'), '_');
    expect(rule.pattern).toBe('{ProjectNo}_{Discipline}_{Type}_{Seq:3}_{Rev}');
    expect(rule.perType?.TR).toBe('{ProjectNo}-TR-{Seq:3}');
    expect(rule.separator).toBe('_');
  });
  it('applies a preset, and names the preset a pattern is', () => {
    expect(withPreset(office, 'simple')).toMatchObject({ preset: 'simple', pattern: '{ProjectShort}_{Type}_{Rev}', separator: '_' });
    expect(withPreset(office, 'custom').pattern).toBe(office.pattern);
    expect(presetOf(NAMING_PRESETS.iso19650.pattern)).toBe('iso19650');
    expect(presetOf('{Rev}')).toBe('custom');
  });
  it('drops a type pattern that is empty or the same as the default', () => {
    const one = withTypePattern(office, 'TR', '{ProjectNo}-TR-{Seq:3}');
    expect(withTypePattern(one, 'TR', '  ')).not.toHaveProperty('perType');
    expect(withTypePattern(office, 'DWG', office.pattern)).not.toHaveProperty('perType');
  });
  it('reads the separator a typed pattern uses', () => {
    expect(separatorOf('{ProjectNo}-{Type}-{Rev}', '_')).toBe('-');
    expect(separatorOf('{ProjectNo}_{Type}-{Rev}', '_')).toBe('_');
    expect(separatorOf('{ProjectNo}', '.')).toBe('.');
  });
  it('takes a field out with the separator beside it', () => {
    const parts = parsePattern('{ProjectNo}-{Type}-{Rev}');
    expect(patternOf(withoutPart(parts, 2, '-'))).toBe('{ProjectNo}-{Rev}');
    expect(patternOf(withoutPart(parts, 0, '-'))).toBe('{Type}-{Rev}');
    expect(patternOf(withoutPart(parts, 1, '-'))).toBe('{ProjectNo}{Type}-{Rev}');
    expect(patternOf(withoutPart(parsePattern('{Rev}'), 0, '-'))).toBe('');
  });
  it('lists the problems that stop a template being saved', () => {
    expect(namingIssues(office)).toEqual([]);
    const bad = namingIssues({ ...office, pattern: '', perType: { TR: '{Nope}' } });
    expect(bad[0]).toBe('File naming: The pattern is empty');
    expect(bad[1]).toMatch(/^File naming for TR: \{Nope\}/);
  });
  it('finds names that repeat', () => {
    expect(duplicateNames(['a', 'B', 'b', 'c'])).toEqual(['b']);
    expect(duplicateNames(['a', 'b'])).toEqual([]);
  });
});
