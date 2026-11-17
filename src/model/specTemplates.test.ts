// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { LIBRARY_KEYS } from '../database/librarySync';
import { sampleProject } from '../data/sampleProject';
import { lineText, specView, starterSpec, type SpecDoc } from './specDoc';
import {
  applyTemplate, clauseGroup, isSpecDoc, loadTemplates, removeTemplate, saveTemplates, specFileText, specFromFileText, templateNameError, templateOf, templateSummary, withTemplate,
  SPEC_TEMPLATES_KEY
} from './specTemplates';

const doc: SpecDoc = {
  title: 'Electrical specification', info: { number: 'E-001', client: 'Client Co', details: [{ id: 'D1', name: 'Plot number', value: '373' }, { id: 'D2', name: 'Authority', value: 'DEWA' }] },
  setup: { watermark: 'DRAFT' },
  sections: [
    { id: 'S1', title: 'General', included: true, clauses: [{ id: 'C1', kind: 'clause', text: 'For plot {{detail.D1}}.' }] },
    { id: 'S2', title: 'Switchgear', included: true, clauses: [
      { id: 'C2', kind: 'heading', text: 'MCCBs' }, { id: 'C3', kind: 'clause', text: 'Rated for {{main.rated}}; approved by {{detail.D2}}.' },
      { id: 'C4', kind: 'heading', text: 'Frames', level: 1 }, { id: 'C5', kind: 'clause', text: 'Frame sizes as scheduled.' },
      { id: 'C6', kind: 'heading', text: 'ACBs' }, { id: 'C7', kind: 'clause', text: 'Draw-out.' }] }
  ]
};
const when = new Date('2026-11-17T08:00:00Z');

describe('specification templates — making one', () => {
  it('a heading is saved with everything under it up to the next heading of its level; another line alone', () => {
    expect(clauseGroup(doc.sections[1], 'C2').map((c) => c.id)).toEqual(['C2', 'C3', 'C4', 'C5']);
    expect(clauseGroup(doc.sections[1], 'C4').map((c) => c.id)).toEqual(['C4', 'C5']);
    expect(clauseGroup(doc.sections[1], 'C7').map((c) => c.id)).toEqual(['C7']);
    expect(clauseGroup(doc.sections[1], 'nope')).toEqual([]);
  });

  it('keeps the fields as fields and names the details the wording uses', () => {
    const t = templateOf(doc, 'clauses', ' MCCB ', { sectionId: 'S2', clauseId: 'C2' }, when)!;
    expect(t).toMatchObject({ name: 'MCCB', kind: 'clauses', updatedAt: '2026-11-17', details: [{ id: 'D2', name: 'Authority' }] });
    expect(t.sections[0].clauses[1].text).toBe('Rated for {{main.rated}}; approved by {{detail.D2}}.');
    expect(templateSummary(t)).toBe('4 lines');
    expect(JSON.stringify(t)).not.toContain('DEWA'); // a detail's value stays with its document
  });

  it('a section, and a whole specification with its title and page setup but not its number or parties', () => {
    expect(templateOf(doc, 'section', 'Switchgear', { sectionId: 'S2' }, when)!.sections.map((s) => s.title)).toEqual(['Switchgear']);
    const all = templateOf(doc, 'spec', 'Office standard', {}, when)!;
    expect(all).toMatchObject({ title: 'Electrical specification', setup: { watermark: 'DRAFT' } });
    expect(templateSummary(all)).toBe('2 sections, 7 lines');
    expect(JSON.stringify(all)).not.toContain('Client Co');
    expect(JSON.stringify(all)).not.toContain('E-001');
  });

  it('there is nothing to save without the section or the clause', () => {
    expect(templateOf(doc, 'section', 'x', { sectionId: 'nope' })).toBeUndefined();
    expect(templateOf(doc, 'clauses', 'x', { sectionId: 'S2' })).toBeUndefined();
  });

  it('a name is needed, and a template of the same name and kind is replaced', () => {
    expect(templateNameError('  ')).toBe('Give the template a name.');
    expect(templateNameError('x'.repeat(81))).toBe('Keep the name to 80 characters.');
    expect(templateNameError('MCCB')).toBeUndefined();
    const a = templateOf(doc, 'clauses', 'MCCB', { sectionId: 'S2', clauseId: 'C2' }, when)!;
    const b = templateOf(doc, 'clauses', 'mccb', { sectionId: 'S2', clauseId: 'C6' }, when)!;
    const c = templateOf(doc, 'section', 'MCCB', { sectionId: 'S2' }, when)!;
    const one = withTemplate([], a), two = withTemplate(one.list, b), three = withTemplate(two.list, c);
    expect([one.updated, two.updated, three.updated]).toEqual([false, true, false]);
    expect(two.list.map((t) => [t.id, t.sections[0].clauses.length])).toEqual([[a.id, 2]]);
    expect(removeTemplate(three.list, a.id).map((t) => t.kind)).toEqual(['section']);
  });
});

describe('specification templates — using one in another document', () => {
  const other: SpecDoc = { title: 'ELV specification', info: { number: 'X-9', details: [{ id: 'D1', name: 'authority', value: 'RTA' }] }, sections: [
    { id: 'S1', title: 'First', included: true, clauses: [{ id: 'C1', kind: 'clause', text: 'One.' }, { id: 'C2', kind: 'clause', text: 'Two.' }] }, { id: 'S2', title: 'Second', included: true, clauses: [] }] };

  it('clauses go in after the chosen clause with ids of their own; a detail is matched by its name', () => {
    const t = templateOf(doc, 'clauses', 'MCCB', { sectionId: 'S2', clauseId: 'C2' }, when)!;
    const r = applyTemplate(other, t, { sectionId: 'S1', clauseId: 'C1' });
    const c = r.doc.sections[0].clauses;
    expect(c.map((x) => x.text)).toEqual(['One.', 'MCCBs', 'Rated for {{main.rated}}; approved by {{detail.D1}}.', 'Frames', 'Frame sizes as scheduled.', 'Two.']);
    expect(new Set(r.doc.sections.flatMap((s) => [s.id, ...s.clauses.map((x) => x.id)])).size).toBe(8);
    expect(r.added).toEqual(c.slice(1, 5).map((x) => x.id));
    expect(lineText(specView(r.doc, sampleProject).blocks[0].lines[2])).toContain('approved by RTA');
    expect(r.doc.info!.details).toEqual(other.info!.details);
    // no clause chosen: at the end of the section
    expect(applyTemplate(other, t, { sectionId: 'S2' }).doc.sections[1].clauses.length).toBe(4);
  });

  it('a detail the document does not have is added with no value, so it shows as DATA REQUIRED until filled', () => {
    const t = templateOf(doc, 'section', 'General', { sectionId: 'S1' }, when)!;
    const r = applyTemplate(other, t, { sectionId: 'S1' });
    expect(r.doc.sections.map((s) => s.title)).toEqual(['First', 'General', 'Second']);
    expect(r.doc.info!.details).toEqual([{ id: 'D1', name: 'authority', value: 'RTA' }, { id: 'D2', name: 'Plot number', value: '' }]);
    expect(r.doc.sections[1].clauses[0].text).toBe('For plot {{detail.D2}}.');
    expect(specView(r.doc, sampleProject).missing.map((m) => m.label)).toEqual(['Plot number']);
  });

  it('a whole specification replaces the sections, title and page setup, and keeps the document\'s own information', () => {
    const t = templateOf(doc, 'spec', 'Office standard', {}, when)!;
    const r = applyTemplate({ ...other, setup: { paper: 'A3' } }, t);
    expect(r.doc.title).toBe('Electrical specification');
    expect(r.doc.setup).toEqual({ watermark: 'DRAFT' });
    expect(r.doc.sections.map((s) => s.title)).toEqual(['General', 'Switchgear']);
    expect(r.doc.info!.number).toBe('X-9');
    expect(r.doc.info!.details!.map((d) => d.name)).toEqual(['authority', 'Plot number']);
    expect(r.doc.sections[1].clauses[1].text).toContain('{{detail.D1}}'); // Authority → the document's own "authority"
  });
});

describe('specification templates — the library and the file', () => {
  beforeEach(() => localStorage.clear());

  it('is one of the synced libraries, and reads back what it saved; anything else in storage is ignored', () => {
    expect(LIBRARY_KEYS).toContain(SPEC_TEMPLATES_KEY);
    const t = templateOf(doc, 'section', 'Switchgear', { sectionId: 'S2' }, when)!;
    expect(saveTemplates([t])).toBe(true);
    expect(loadTemplates()).toEqual([t]);
    localStorage.setItem(SPEC_TEMPLATES_KEY, JSON.stringify([t, { id: 'x', name: 'bad', kind: 'section', sections: [{ id: 'S', title: 't', clauses: [{ id: 'C', kind: 'nonsense', text: '' }] }] }, 7]));
    expect(loadTemplates()).toEqual([t]);
    localStorage.setItem(SPEC_TEMPLATES_KEY, '{not json');
    expect(loadTemplates()).toEqual([]);
  });

  it('a specification saved as a file opens again the same; other files are refused', () => {
    expect(specFromFileText(specFileText(doc))).toEqual(doc);
    expect(specFromFileText(specFileText(starterSpec()))).toEqual(starterSpec());
    expect(specFromFileText('{"format":"lvds-specification","spec":{"title":"x","sections":[]}}')).toBeUndefined();
    expect(specFromFileText(JSON.stringify({ spec: doc }))).toBeUndefined();
    expect(specFromFileText('hello')).toBeUndefined();
    expect(isSpecDoc({ title: 'x', sections: [{ id: 'S1', title: 'a', clauses: [{ id: 'C1', kind: 'table', text: '' }] }] })).toBe(false); // a table with no rows
  });
});
