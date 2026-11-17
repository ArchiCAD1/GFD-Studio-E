import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { addClause, addDetail, captionText, indentClause, specContents, withAppendix, withContents, withCover, addSection, fieldKeys, fieldUses, removeDetail, slotRuns, slotText, specSetup, withDetail, withInfo, withSetup, withTitle, SPEC_SETUP, lineText, moveClause, moveSection, removeClause, removeSection, specFields, specView, starterSpec, withClause, withSectionIncluded, withSectionTitle, type SpecDoc } from './specDoc';
import { mainBoards } from './transformers';

const field = (p: Project, key: string) => specFields(p).find((f) => f.key === key)!;
const doc: SpecDoc = { title: 'Spec', sections: [
  { id: 'S1', title: 'General', included: true, clauses: [{ id: 'C1', kind: 'clause', text: 'For {{project.name}}.' }, { id: 'C2', kind: 'note', text: 'A note.' }] },
  { id: 'S2', title: 'Fire alarm', included: false, clauses: [{ id: 'C3', kind: 'clause', text: 'Not included.' }] },
  { id: 'S3', title: 'LV switchboards', included: true, clauses: [
    { id: 'C4', kind: 'heading', text: 'Ratings' }, { id: 'C5', kind: 'clause', text: 'Rated {{main.rated}} at {{ project.voltage }}.' }, { id: 'C6', kind: 'clause', text: 'Busbars: {{main.busbar}}; cubicle colour {{office.colour}}.' },
    { id: 'C7', kind: 'heading', text: 'Testing' }, { id: 'C8', kind: 'clause', text: 'Tested.' }] }
] };

describe('specification — fields from the project', () => {
  it('takes its values from the design, with units', () => {
    const main = mainBoards(sampleProject)[0];
    expect(field(sampleProject, 'project.name').value).toBe(sampleProject.name);
    expect(field(sampleProject, 'project.voltage').value).toBe(`${sampleProject.voltageV} V`);
    expect(field(sampleProject, 'main.id').value).toBe(main.id);
    expect(field(sampleProject, 'main.rated').value).toBe(`${main.ratedCurrentA!.toLocaleString('en-US')} A`);
    expect(field(sampleProject, 'boards.count').value).toBe(String(sampleProject.boards.length));
  });

  it('a value the project does not have is left out, never guessed', () => {
    const p: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => ({ ...b, busbarMaterial: undefined, ipRating: ' ' })), lightning: undefined, earthingPlan: undefined };
    for (const k of ['main.busbar', 'main.ip', 'lightning.class', 'lightning.method', 'earthing.system', 'earthing.conductor']) expect(field(p, k).value).toBeUndefined();
    expect(field({ ...sampleProject, boards: [], feeders: [] }, 'main.id').value).toBeUndefined();
  });

  it('follows the lightning protection study and the earthing schematic', () => {
    const p: Project = { ...sampleProject, earthingPlan: { conductorMm2: 95 }, lightning: { lengthM: 40, widthM: 25, heightM: 18, method: 'ese', lpsClass: 'II' } };
    expect(field(p, 'lightning.class').value).toBe('Class II');
    expect(field(p, 'lightning.method').value).toBe('ESE air terminal');
    expect(field(p, 'earthing.conductor').value).toBe('95 mm²');
    expect(field({ ...p, earthingPlan: {} }, 'earthing.conductor').value).toBe('70 mm²');
    expect(field(p, 'earthing.system').value).toBeTruthy();
  });

  it('every field has a key of its own, a label and a group', () => {
    const fs = specFields(sampleProject);
    expect(new Set(fs.map((f) => f.key)).size).toBe(fs.length);
    expect(fs.every((f) => f.label && f.group)).toBe(true);
  });
});

describe('specification — numbering and filling', () => {
  it('numbers the included sections, their headings and clauses; notes have no number', () => {
    const v = specView(doc, sampleProject);
    expect(v.blocks.map((b) => [b.no, b.title])).toEqual([['1', 'General'], ['2', 'LV switchboards']]);
    expect(v.blocks[0].lines.map((l) => l.no)).toEqual(['1.1', '']);
    expect(v.blocks[1].lines.map((l) => l.no)).toEqual(['2.1', '2.1.1', '2.1.2', '2.2', '2.2.1']);
  });

  it('including a section renumbers the ones after it', () => {
    const v = specView(withSectionIncluded(doc, 'S2', true), sampleProject);
    expect(v.blocks.map((b) => b.no + ' ' + b.title)).toEqual(['1 General', '2 Fire alarm', '3 LV switchboards']);
    expect(v.blocks[2].lines[1].no).toBe('3.1.1');
  });

  it('fills the fields from the project and lists the ones with no value', () => {
    const p: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => ({ ...b, busbarMaterial: undefined })) };
    const v = specView(doc, p);
    expect(lineText(v.blocks[0].lines[0])).toBe(`For ${p.name}.`);
    expect(lineText(v.blocks[1].lines[1])).toBe(`Rated ${field(p, 'main.rated').value} at ${p.voltageV} V.`);
    expect(lineText(v.blocks[1].lines[2])).toBe('Busbars: DATA REQUIRED: Busbar material; cubicle colour DATA REQUIRED: office.colour.');
    expect(v.missing).toEqual([
      { sectionNo: '2', clauseNo: '2.1.2', key: 'main.busbar', label: 'Busbar material' },
      { sectionNo: '2', clauseNo: '2.1.2', key: 'office.colour', label: 'office.colour' }
    ]);
    expect(v.blocks[1].lines[1].runs).toEqual([{ text: 'Rated ' }, { field: 'main.rated', label: 'Rated current', value: field(p, 'main.rated').value }, { text: ' at ' }, { field: 'project.voltage', label: 'System voltage', value: `${p.voltageV} V` }, { text: '.' }]);
  });

  it('a section that is not included is not checked for missing data', () => {
    const d = addClause(doc, 'S2', 'clause', 'Colour {{office.colour}}.');
    expect(specView(d, sampleProject).missing.filter((m) => m.key === 'office.colour').length).toBe(1);
  });

  it('finds the fields a text uses', () => {
    expect(fieldKeys('{{a.b}} and {{ c-d }} but not {single} or {{ }}')).toEqual(['a.b', 'c-d']);
  });
});

describe('specification — editing', () => {
  it('adds a clause after another or at the end, with an id of its own', () => {
    const d = addClause(addClause(doc, 'S3', 'clause', 'After ratings.', 'C5'), 'S3', 'note', 'Last.');
    const s = d.sections[2].clauses;
    expect(s.map((c) => c.text)).toEqual(['Ratings', 'Rated {{main.rated}} at {{ project.voltage }}.', 'After ratings.', 'Busbars: {{main.busbar}}; cubicle colour {{office.colour}}.', 'Testing', 'Tested.', 'Last.']);
    const ids = d.sections.flatMap((x) => [x.id, ...x.clauses.map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('changes, moves and removes a clause', () => {
    expect(withClause(doc, 'S1', 'C1', { text: 'New.' }).sections[0].clauses[0]).toEqual({ id: 'C1', kind: 'clause', text: 'New.' });
    expect(withClause(doc, 'S1', 'C2', { kind: 'clause' }).sections[0].clauses[1].kind).toBe('clause');
    expect(moveClause(doc, 'S3', 'C5', 1).sections[2].clauses.map((c) => c.id)).toEqual(['C4', 'C6', 'C5', 'C7', 'C8']);
    expect(moveClause(doc, 'S3', 'C4', -1)).toEqual(doc);
    expect(removeClause(doc, 'S3', 'C7').sections[2].clauses.map((c) => c.id)).toEqual(['C4', 'C5', 'C6', 'C8']);
  });

  it('adds, renames, moves and removes a section', () => {
    const d = addSection(doc, ' Generators ');
    expect(d.sections[3]).toMatchObject({ title: 'Generators', included: true, clauses: [] });
    expect(addSection(doc, ' ')).toBe(doc);
    expect(withSectionTitle(doc, 'S1', 'General requirements').sections[0].title).toBe('General requirements');
    expect(withSectionTitle(doc, 'S1', ' ')).toBe(doc);
    expect(moveSection(doc, 'S3', -1).sections.map((s) => s.id)).toEqual(['S1', 'S3', 'S2']);
    expect(moveSection(doc, 'S3', 1)).toBe(doc);
    expect(removeSection(doc, 'S2').sections.map((s) => s.id)).toEqual(['S1', 'S3']);
  });

  it('edits never change the document they were given', () => {
    const before = JSON.stringify(doc);
    addClause(doc, 'S1', 'clause', 'x'); withClause(doc, 'S1', 'C1', { text: 'y' }); removeClause(doc, 'S1', 'C1'); moveSection(doc, 'S1', 1); withSectionIncluded(doc, 'S2', true);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('specification — the starter', () => {
  const s = starterSpec();
  it('has ten sections, electrical ones included and the ELV ones ready to tick', () => {
    expect(s.sections.map((x) => x.title)).toEqual(['General requirements', 'LV switchboards', 'Distribution boards', 'Cables and wiring', 'Cable containment', 'Earthing and lightning protection',
      'Lighting and emergency lighting', 'Fire alarm', 'CCTV and access control', 'Structured cabling']);
    expect(s.sections.filter((x) => !x.included).map((x) => x.title)).toEqual(['Fire alarm', 'CCTV and access control', 'Structured cabling']);
  });

  it('uses only fields the app has, and ids of its own', () => {
    const known = new Set(specFields(sampleProject).map((f) => f.key));
    const used = s.sections.flatMap((x) => x.clauses.flatMap((c) => fieldKeys(c.text)));
    expect(used.length).toBeGreaterThan(8);
    expect(used.filter((k) => !known.has(k))).toEqual([]);
    const ids = s.sections.flatMap((x) => [x.id, ...x.clauses.map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows for the sample project with every clause numbered', () => {
    const v = specView(s, sampleProject);
    expect(v.blocks.length).toBe(7);
    expect(v.blocks.every((b) => b.lines.every((l) => l.kind === 'note' || l.no.startsWith(`${b.no}.`)))).toBe(true);
    expect(lineText(v.blocks[0].lines[1])).toContain(sampleProject.name);
  });

  it('names no standard: the wording is plain text to edit', () => {
    const all = s.sections.flatMap((x) => x.clauses.map((c) => c.text)).join(' ');
    expect(all).not.toMatch(/\b(IEC|BS|EN|NFPA|IEEE|DEWA)\b/);
  });
});

describe('specification — document information and page setup', () => {
  const doc = starterSpec();
  const bare: Project = { ...sampleProject, info: undefined, drawing: undefined };
  const value = (p: Project, d: SpecDoc, key: string) => specFields(p, d).find((f) => f.key === key)?.value;

  it('a party is the document\'s own, else the project\'s, else not set', () => {
    const p: Project = { ...bare, info: { owner: 'Owner Co', contractor: 'Build Co' }, drawing: { company: 'Design Co' } };
    expect(value(p, doc, 'party.client')).toBe('Owner Co');
    expect(value(p, doc, 'party.consultant')).toBe('Design Co');
    expect(value(p, withInfo(doc, { client: ' Client Ltd ' }), 'party.client')).toBe('Client Ltd');
    expect(value(p, doc, 'party.mainContractor')).toBe('Build Co');
    expect(value(p, doc, 'party.mepContractor')).toBeUndefined();
    expect(value(bare, doc, 'party.client')).toBeUndefined();
  });

  it('the engineer\'s own details are fields; a clause using one that has no value is DATA REQUIRED', () => {
    let d = addDetail(addDetail(doc, 'Plot number', '373-1245'), 'Authority');
    expect(d.info!.details!.map((x) => x.id)).toEqual(['D1', 'D2']);
    expect(value(bare, d, 'detail.D1')).toBe('373-1245');
    d = { ...d, sections: [{ id: 'S1', title: 'General', included: true, clauses: [{ id: 'C1', kind: 'clause', text: 'Plot {{detail.D1}}, authority {{detail.D2}}, doc {{doc.number}}.' }] }] };
    const v = specView(d, bare);
    expect(lineText(v.blocks[0].lines[0])).toBe('Plot 373-1245, authority DATA REQUIRED: Authority, doc DATA REQUIRED: Document number.');
    expect(fieldUses(d, 'detail.D1')).toBe(1);
    d = withDetail(d, 'D2', { value: 'DEWA' });
    expect(specView(withInfo(d, { number: 'E-001' }), bare).missing).toEqual([]);
    expect(removeDetail(d, 'D1').info!.details!.map((x) => x.id)).toEqual(['D2']);
    expect(addDetail(removeDetail(d, 'D1'), 'x').info!.details!.map((x) => x.id)).toEqual(['D2', 'D3']);
  });

  it('page setup: defaults, the document\'s own choices, margins kept in range, the project logo unless the document has one', () => {
    expect(specSetup(doc, bare)).toEqual({ ...SPEC_SETUP, logo: undefined, watermark: undefined,
      cover: { on: true, logo: true, parties: true, details: true, revisions: true, note: undefined }, contents: { on: true, headings: false, pageNumbers: true } });
    expect(specSetup(withCover(withContents(doc, { headings: true }), { on: false, note: ' x ' }), bare)).toMatchObject({ cover: { on: false, logo: true, note: 'x' }, contents: { on: true, headings: true } });
    const p: Project = { ...bare, drawing: { logo: 'data:image/png;base64,AAAA' } };
    expect(specSetup(doc, p).logo).toBe('data:image/png;base64,AAAA');
    const s = specSetup(withSetup(doc, { paper: 'A3', landscape: true, marginsMm: { top: 200, right: 1, bottom: NaN, left: 25 }, logo: 'data:image/png;base64,BBBB', watermark: ' DRAFT ' }), p);
    expect([s.paper, s.landscape, s.logo, s.watermark]).toEqual(['A3', true, 'data:image/png;base64,BBBB', 'DRAFT']);
    expect(s.marginsMm).toEqual({ top: 60, right: 5, bottom: SPEC_SETUP.marginsMm.bottom, left: 25 });
  });

  it('a header or footer slot fills fields and keeps page numbers apart', () => {
    const d = withInfo(doc, { number: 'E-001' });
    expect(slotRuns('{{doc.number}} · Page {{page}} of {{pages}}', d, bare)).toEqual([{ text: 'E-001 · Page ' }, { page: 'page' }, { text: ' of ' }, { page: 'pages' }]);
    expect(slotText('{{doc.title}} {{doc.status}} {{page}}/{{pages}}', d, bare, '3', '9')).toBe('Electrical specification DATA REQUIRED: Document status 3/9');
    expect(slotRuns('', d, bare)).toEqual([]);
  });

  it('the title is not emptied', () => {
    expect(withTitle(doc, '  ').title).toBe(doc.title);
    expect(withTitle(doc, ' ELV specification ').title).toBe('ELV specification');
  });
});

describe('specification — indent levels, page breaks and appendices', () => {
  const c = (id: string, kind: 'heading' | 'clause' | 'note', level = 0, text = id) => ({ id, kind, text, ...(level ? { level } : {}) });
  const d: SpecDoc = { title: 'Spec', sections: [
    { id: 'S1', title: 'Schedules', included: true, appendix: true, clauses: [c('A1', 'heading'), c('A2', 'clause')] },
    { id: 'S2', title: 'General', included: true, clauses: [
      c('C1', 'clause', 1), c('C2', 'heading'), c('C3', 'clause'), c('C4', 'clause', 1), c('C5', 'clause', 1, 'Needs {{main.nothing}}'), c('C6', 'clause', 2), c('C7', 'clause', 2), c('C8', 'note', 2),
      c('C9', 'clause'), c('C10', 'heading', 1), c('C11', 'clause'), c('C12', 'clause', 1), c('C13', 'heading'), c('C14', 'heading', 5), c('C15', 'clause', 9)] },
    { id: 'S3', title: 'Drawings', included: true, appendix: true, clauses: [] },
    { id: 'S4', title: 'Boards', included: true, clauses: [c('D1', 'heading', 1), c('D2', 'clause')] }
  ] };
  const v = specView(d, sampleProject);

  it('numbers headings, sub-headings, clauses and lettered and numbered items; levels stay within what a kind allows', () => {
    const g = v.blocks[0];
    expect(g.lines.map((l) => l.no)).toEqual(['a)', '1.1', '1.1.1', 'a)', 'b)', 'i)', 'ii)', '', '1.1.2', '1.1.3', '1.1.3.1', 'a)', '1.2', '1.2.1', 'i)']);
    expect(g.lines.map((l) => l.level)).toEqual([1, 0, 0, 1, 1, 2, 2, 2, 0, 1, 0, 1, 0, 1, 2]);
    expect(g.lines[6].ref).toBe('1.1.1 b) ii)');
    expect(g.lines[11].ref).toBe('1.1.3.1 a)');
    expect(new Set(g.lines.map((l) => l.ref).filter((x) => /^\d[\d.]*$/.test(x))).size).toBe(7); // no number twice
    expect(v.missing).toEqual([{ sectionNo: '1', clauseNo: '1.1.1 b)', key: 'main.nothing', label: 'main.nothing' }]);
    // A sub-heading with no heading above it is an ordinary heading.
    expect(v.blocks[1].lines.map((l) => l.no)).toEqual(['2.1', '2.1.1']);
    // A clause before the first heading and that heading do not share a number.
    const mixed: SpecDoc = { title: 'x', sections: [{ id: 'S1', title: 'G', included: true, clauses: [c('K1', 'clause'), c('K2', 'heading'), c('K3', 'clause')] }] };
    expect(specView(mixed, sampleProject).blocks[0].lines.map((l) => l.no)).toEqual(['1.1', '1.2', '1.2.1']);
  });

  it('appendices are lettered and come after the numbered sections', () => {
    expect(v.blocks.map((b) => b.heading)).toEqual(['1 General', '2 Boards', 'Appendix A — Schedules', 'Appendix B — Drawings']);
    expect(v.blocks[2].lines.map((l) => l.no)).toEqual(['A.1', 'A.1.1']);
    expect(specContents(v, false).map((e) => `${e.no} ${e.title}`)).toEqual(['1 General', '2 Boards', 'A Appendix — Schedules', 'B Appendix — Drawings']);
    expect(specView(withAppendix(d, 'S1', false), sampleProject).blocks.map((b) => b.no)).toEqual(['1', '2', '3', 'A']);
  });

  it('indent and outdent move one level and stop at the ends; a line added under an item is the next item', () => {
    const level = (x: SpecDoc, id: string) => x.sections[1].clauses.find((k) => k.id === id)!.level ?? 0;
    expect(level(indentClause(d, 'S2', 'C3', 1), 'C3')).toBe(1);
    expect(level(indentClause(d, 'S2', 'C6', 1), 'C6')).toBe(2);
    expect(level(indentClause(d, 'S2', 'C10', 1), 'C10')).toBe(1);
    expect(level(indentClause(d, 'S2', 'C3', -1), 'C3')).toBe(0);
    expect(level(indentClause(d, 'S2', 'C6', -1), 'C6')).toBe(1);
    const added = addClause(d, 'S2', 'clause', 'Next', 'C4').sections[1].clauses[4];
    expect([added.text, added.level]).toEqual(['Next', 1]);
    expect(addClause(d, 'S2', 'note', 'N', 'C4').sections[1].clauses[4].level).toBeUndefined();
  });

  it('a page break is kept on the line', () => {
    const x = withClause(d, 'S2', 'C9', { breakBefore: true });
    expect(specView(x, sampleProject).blocks[0].lines.map((l) => l.breakBefore).filter(Boolean).length).toBe(1);
    expect(specView(withClause(x, 'S2', 'C9', { breakBefore: false }), sampleProject).blocks[0].lines.some((l) => l.breakBefore)).toBe(false);
  });
});

describe('specification — tables and pictures in the text', () => {
  const pic = { src: 'data:image/png;base64,AAAA', w: 200, h: 100 };
  let d: SpecDoc = { title: 'Spec', sections: [{ id: 'S1', title: 'General', included: true, clauses: [{ id: 'C1', kind: 'heading', text: 'Scope' }, { id: 'C2', kind: 'clause', text: 'See the table.' }] }, { id: 'S2', title: 'Boards', included: true, clauses: [] }] };
  d = addClause(d, 'S1', 'table', 'Boards of {{project.name}}', 'C2', { table: { rows: [['Board', 'A'], ['MDB', '1600']] } });
  d = addClause(d, 'S1', 'clause', 'After the table.');
  d = addClause(d, 'S2', 'image', '', undefined, { image: pic });
  d = addClause(d, 'S2', 'table', '', undefined, { table: { rows: [['x']], header: false } });
  const v = specView(d, sampleProject);

  it('a table or picture takes no clause number; tables and figures are numbered through the document', () => {
    expect(v.blocks[0].lines.map((l) => l.no)).toEqual(['1.1', '1.1.1', '', '1.1.2']);
    expect(v.blocks.flatMap((b) => b.lines).filter((l) => l.label).map((l) => captionText(l))).toEqual([`Table 1 — Boards of ${sampleProject.name}`, 'Figure 1', 'Table 2']);
    expect(v.blocks[0].lines[2].table).toEqual({ rows: [['Board', 'A'], ['MDB', '1600']], header: true });
    expect(v.blocks[1].lines[1].table!.header).toBe(false);
    expect(v.blocks[1].lines[0].image).toEqual({ ...pic, widthPct: 60 });
  });

  it('a caption with a field that has no value is listed against its table', () => {
    const x = withClause(d, 'S1', d.sections[0].clauses[2].id, { text: 'For {{doc.number}}' });
    expect(specView(x, sampleProject).missing).toEqual([{ sectionNo: '1', clauseNo: 'Table 1', key: 'doc.number', label: 'Document number' }]);
  });

  it('a table or picture is not indented, and its width stays between 10 and 100 %', () => {
    const id = d.sections[0].clauses[2].id;
    expect(indentClause(d, 'S1', id, 1).sections[0].clauses[2].level).toBe(0);
    const wide = withClause(d, 'S2', d.sections[1].clauses[0].id, { image: { ...pic, widthPct: 400 } });
    expect(specView(wide, sampleProject).blocks[1].lines[0].image!.widthPct).toBe(100);
  });
});
