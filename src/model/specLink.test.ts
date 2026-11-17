import { describe, expect, it } from 'vitest';
import { linkFields, linkSuggestions } from './specLink';
import type { SpecDoc, SpecField } from './specDoc';

const fields: SpecField[] = [
  { key: 'doc.title', label: 'Document title', group: 'Document', value: 'Specification' },
  { key: 'project.name', label: 'Project name', group: 'Project', value: 'Tower A' },
  { key: 'main.id', label: 'Main board', group: 'Main board', value: 'MDB-1' },
  { key: 'main.rated', label: 'Main board rating', group: 'Main board', value: '1600 A' },
  { key: 'main.busbar', label: 'Busbar rating', group: 'Main board', value: '1600 A' },
  { key: 'earthing.system', label: 'Earthing system', group: 'Earthing', value: 'TN-S' },
  { key: 'boards.count', label: 'Number of boards', group: 'Project', value: '12' },
  { key: 'project.frequency', label: 'Frequency', group: 'Project', value: '50' },
  { key: 'main.ip', label: 'Enclosure', group: 'Main board' }
];
const doc: SpecDoc = { title: 'Specification', sections: [{ id: 'S1', title: 'Boards', included: true, clauses: [
  { id: 'C1', kind: 'heading', text: 'Tower A boards' },
  { id: 'C2', kind: 'clause', text: 'The main board MDB-1 is rated 1600 A; MDB-10 and 11600 A are other things. Earthing TN-S, not TN-S-C? See {{main.id}} and MDB-1.' },
  { id: 'C3', kind: 'table', text: 'Boards of Tower A', table: { rows: [['MDB-1', '1600 A']] } },
  { id: 'C4', kind: 'clause', text: 'This Specification covers 12 boards at 50 Hz.' }] }] };

describe('linking typed values to the project', () => {
  it('finds the project values typed as whole words, longest first, one field per value', () => {
    expect(linkSuggestions(doc, fields)).toEqual([
      { key: 'project.name', label: 'Project name', value: 'Tower A', count: 2 },
      { key: 'main.rated', label: 'Main board rating', value: '1600 A', count: 1 },
      { key: 'main.id', label: 'Main board', value: 'MDB-1', count: 2 },
      { key: 'earthing.system', label: 'Earthing system', value: 'TN-S', count: 2 }
    ]);
  });

  it('turns only the chosen values into fields, and leaves fields, longer words, bare numbers and table cells alone', () => {
    const r = linkFields(doc, ['project.name', 'main.id', 'main.rated'], fields);
    expect(r.replaced).toBe(5);
    const c = r.doc.sections[0].clauses;
    expect(c[0].text).toBe('{{project.name}} boards');
    expect(c[1].text).toBe('The main board {{main.id}} is rated {{main.rated}}; MDB-10 and 11600 A are other things. Earthing TN-S, not TN-S-C? See {{main.id}} and {{main.id}}.');
    expect(c[2]).toEqual({ ...doc.sections[0].clauses[2], text: 'Boards of {{project.name}}' });
    expect(c[3]).toBe(doc.sections[0].clauses[3]);
    expect(linkSuggestions(r.doc, fields).map((x) => x.key)).toEqual(['earthing.system']);
  });

  it('nothing chosen, or nothing found, changes nothing', () => {
    expect(linkFields(doc, [], fields)).toEqual({ doc, replaced: 0 });
    expect(linkFields(doc, ['main.ip', 'boards.count', 'doc.title'], fields)).toEqual({ doc, replaced: 0 });
  });

  it('a value inside a longer value is not cut out of it', () => {
    const f: SpecField[] = [{ key: 'a', label: 'Short', group: 'x', value: 'MDB-1' }, { key: 'b', label: 'Long', group: 'x', value: 'MDB-1 main board' }];
    const d: SpecDoc = { title: 't', sections: [{ id: 'S1', title: 's', included: true, clauses: [{ id: 'C1', kind: 'clause', text: 'Feed the MDB-1 main board from MDB-1.' }] }] };
    expect(linkFields(d, ['a', 'b'], f).doc.sections[0].clauses[0].text).toBe('Feed the {{b}} from {{a}}.');
  });
});
