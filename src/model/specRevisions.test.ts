import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { specFields, specRevisionRows, specStamp, specView, type SpecDoc, type SpecSection } from './specDoc';
import { changeRows, changedSinceIssue, issueRevision, marksOf, nextRevisionId, revisionIdError, snapshot, specChanges, withdrawLast, withMarks, SPEC_MARKS } from './specRevisions';

const sec = (clauses: SpecSection['clauses']): SpecSection => ({ id: 'S1', title: 'Boards', included: true, clauses });
const base: SpecDoc = { title: 'Spec', sections: [
  sec([{ id: 'C1', kind: 'heading', text: 'Construction' }, { id: 'C2', kind: 'clause', text: 'Free-standing.' }, { id: 'C3', kind: 'clause', text: 'Copper busbars rated {{main.rated}}.' }, { id: 'C4', kind: 'clause', text: 'To be deleted.' },
    { id: 'C5', kind: 'table', text: 'Boards', table: { rows: [['MDB', '1600']] } }]),
  { id: 'S2', title: 'Cables', included: true, clauses: [{ id: 'K1', kind: 'clause', text: 'Copper.' }] },
  { id: 'S3', title: 'Draft notes', included: false, clauses: [{ id: 'N1', kind: 'clause', text: 'Not in the document.' }] }
] };
const d1 = new Date('2026-10-01T10:00:00Z'), d2 = new Date('2026-11-17T10:00:00Z');
const a = issueRevision(base, { id: ' A ', description: ' Issued for tender ', by: 'PS' }, d1);
const edit = (d: SpecDoc): SpecDoc => ({ ...d, sections: [
  { ...d.sections[0], clauses: [d.sections[0].clauses[1], d.sections[0].clauses[0], { ...d.sections[0].clauses[2], text: 'Tinned copper busbars rated {{main.rated}}.' },
    { ...d.sections[0].clauses[4], table: { rows: [['MDB', '2000']] } }, { id: 'C9', kind: 'clause', text: 'New clause.' }] },
  { id: 'S4', title: 'Earthing', included: true, clauses: [{ id: 'E1', kind: 'clause', text: 'TN-S.' }] }, d.sections[2]] });
const edited = edit(a);

describe('specification revisions — issuing', () => {
  it('keeps the included wording as issued, with the id, date, description and who', () => {
    expect(a.revisions).toEqual([{ id: 'A', date: '2026-10-01', description: 'Issued for tender', by: 'PS', title: 'Spec', sections: snapshot(base) }]);
    expect(a.revisions![0].sections.map((s) => s.id)).toEqual(['S1', 'S2']);
    expect(a.revisions![0].sections[0].lines[4]).toMatchObject({ id: 'C5', kind: 'table', text: 'Boards' });
    expect(JSON.stringify(a.revisions)).not.toContain('"rows"'); // a table is kept as a short mark, not in full
  });

  it('suggests the next id after letters, numbers and a prefix', () => {
    expect(nextRevisionId()).toBe('A');
    const ids = (id: string) => nextRevisionId([{ id, date: '', description: '', title: '', sections: [] }]);
    expect([ids('A'), ids('b'), ids('0'), ids('9'), ids('P1'), ids('T09'), ids('Z'), ids('Final')]).toEqual(['B', 'c', '1', '10', 'P2', 'T10', 'Z1', 'Final1']);
  });

  it('refuses an empty, long or repeated id', () => {
    expect(revisionIdError(a, ' ')).toContain('Give the revision an id');
    expect(revisionIdError(a, 'a')).toBe('Revision a is already issued.');
    expect(revisionIdError(a, '123456789')).toContain('8 characters');
    expect(revisionIdError(a, 'B')).toBeUndefined();
  });

  it('knows whether the wording has moved on since the issue; an excluded section does not count', () => {
    expect(changedSinceIssue(base)).toBe(true);
    expect(changedSinceIssue(a)).toBe(false);
    expect(changedSinceIssue({ ...a, sections: [a.sections[0], a.sections[1], { ...a.sections[2], clauses: [] }] })).toBe(false);
    expect(changedSinceIssue(edited)).toBe(true);
    expect(changedSinceIssue({ ...a, title: 'Other' })).toBe(true);
  });

  it('withdraws the last revision and leaves the wording', () => {
    const b = issueRevision(edited, { id: 'B', description: 'Revised' }, d2);
    expect(withdrawLast(b).revisions!.map((r) => r.id)).toEqual(['A']);
    expect(withdrawLast(b).sections).toBe(b.sections);
  });

  it('the document\'s stamp, its "Revision and date" field and the cover table follow its own revisions once it has one', () => {
    expect(specStamp(base, sampleProject)).not.toContain('REV A · ');
    expect(specStamp(a, sampleProject)).toMatch(/^REV A · /);
    expect(specFields(sampleProject, a).find((f) => f.key === 'project.issue')!.value).toMatch(/^REV A · /);
    expect(specRevisionRows(sampleProject, a)).toEqual([{ id: 'A', date: '2026-10-01', description: 'Issued for tender', by: 'PS' }]);
    expect(specRevisionRows({ ...sampleProject, revisions: undefined }, base)).toEqual([]);
  });
});

describe('specification revisions — what changed', () => {
  it('there is nothing to compare before the first issue, or at the first issue', () => {
    expect(specChanges(base)).toMatchObject({ rev: 'A', issued: false, count: 0 });
    expect(specChanges(a)).toMatchObject({ rev: 'A', issued: true, count: 0 });
    expect([specChanges(base).base, specChanges(a).base]).toEqual([undefined, undefined]);
  });

  it('after an issue, edits are the draft of the next revision against it', () => {
    const ch = specChanges(edited);
    expect(ch).toMatchObject({ rev: 'B', issued: false, base: 'A' });
    expect([...ch.lines]).toEqual([['C3', 'changed'], ['C5', 'changed'], ['C9', 'new'], ['E1', 'new']]); // a moved line is not a change
    expect([...ch.newSections]).toEqual(['S4']);
    expect(ch.deleted).toEqual([{ sectionId: 'S1', sectionTitle: 'Boards', after: 'C3', line: { id: 'C4', kind: 'clause', text: 'To be deleted.' } }]);
    expect(ch.removedSections).toEqual(['Cables']);
  });

  it('once issued, the marks are those of that issue against the one before; then of the next draft', () => {
    const b = issueRevision(edited, { id: 'B', description: 'Revised' }, d2);
    expect(specChanges(b)).toMatchObject({ rev: 'B', issued: true, base: 'A' });
    expect([...specChanges(b).lines.keys()]).toEqual(['C3', 'C5', 'C9', 'E1']);
    const more: SpecDoc = { ...b, sections: b.sections.map((s) => (s.id === 'S4' ? { ...s, title: 'Earthing and bonding' } : s)) };
    const ch = specChanges(more);
    expect(ch).toMatchObject({ rev: 'C', issued: false, base: 'B' });
    expect([ch.lines.size, [...ch.titles], ch.deleted.length]).toEqual([0, ['S4'], 0]);
  });

  it('can be compared with a chosen revision instead', () => {
    const b = issueRevision(edited, { id: 'B', description: 'Revised' }, d2);
    const c = { ...b, sections: b.sections.map((s) => (s.id === 'S4' ? { ...s, clauses: [...s.clauses, { id: 'E2', kind: 'clause' as const, text: 'Bonded.' }] } : s)) };
    expect([...specChanges(c).lines.keys()]).toEqual(['E2']);
    expect([...specChanges(withMarks(c, { against: 'A' })).lines.keys()]).toEqual(['C3', 'C5', 'C9', 'E1', 'E2']);
    expect(specChanges(withMarks(c, { against: 'nope' })).base).toBe('B');
    // an issued revision is not compared with itself; and issuing returns to "the one before"
    expect(specChanges(withMarks(b, { against: 'B' })).base).toBe('A');
    expect(issueRevision(withMarks(c, { against: 'A', cloud: true }), { id: 'C', description: 'x' }, d2).marks).toEqual({ cloud: true });
  });

  it('lists the changes in document order by clause number', () => {
    const rows = changeRows(edited, specView(edited, sampleProject));
    expect(rows.map((r) => `${r.ref} | ${r.what} | ${r.text}`)).toEqual([
      `1.2.1 | Changed | Tinned copper busbars rated ${specFields(sampleProject).find((f) => f.key === 'main.rated')!.value}.`,
      'after 1.2.1 | Deleted | To be deleted.',
      'Table 1 | Changed | Table 1 — Boards',
      '1.2.2 | New | New clause.',
      '2 | Section added | Earthing',
      '— | Section removed | Cables'
    ]);
    expect(changeRows(a, specView(a, sampleProject))).toEqual([]);
  });

  it('how changes show: highlight and revision mark unless set otherwise', () => {
    expect(marksOf(base)).toEqual(SPEC_MARKS);
    expect(marksOf(withMarks(base, { cloud: true, highlight: false, against: 'A' }))).toEqual({ ...SPEC_MARKS, cloud: true, highlight: false });
  });
});
