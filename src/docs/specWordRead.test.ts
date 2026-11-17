// @vitest-environment jsdom
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { specView, starterSpec, type SpecDoc } from '../model/specDoc';
import { buildSpecDocx } from './specWord';
import { readSpecDocx, specFromWordXml, wordReadText, FRONT } from './specWordRead';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const p = (text: string, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const styled = (id: string, text: string) => p(text, `<w:pStyle w:val="${id}"/>`);
const body = (inner: string) => `<?xml version="1.0"?><w:document ${NS}><w:body>${inner}<w:sectPr/></w:body></w:document>`;
const STYLES = `<?xml version="1.0"?><w:styles ${NS}>
  <w:style w:type="paragraph" w:styleId="Titre"><w:name w:val="Title"/></w:style>
  <w:style w:type="paragraph" w:styleId="H1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="H2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="H3"><w:name w:val="Heading 3"/></w:style>
  <w:style w:type="paragraph" w:styleId="SpecHead"><w:name w:val="Spec head"/><w:basedOn w:val="H2"/></w:style>
  <w:style w:type="paragraph" w:styleId="Outlined"><w:name w:val="Clause title"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style>
</w:styles>`;
const shape = (d: SpecDoc) => d.sections.map((s) => [s.title, ...s.clauses.map((c) => `${c.kind[0]}${c.level ?? 0}:${c.kind === 'table' ? JSON.stringify(c.table!.rows) : c.text}`)]);

describe('reading a Word document — with heading styles', () => {
  const { doc, report } = specFromWordXml(body([
    styled('Titre', 'Electrical specification'),
    p('Project: Tower A'),
    styled('TOC1', '1 General 3'),
    p('Contents'),
    `<w:p><w:r><w:t>2 Boards</w:t></w:r><w:r><w:instrText> PAGEREF _Toc1 \\h </w:instrText></w:r><w:r><w:t>5</w:t></w:r></w:p>`,
    styled('H1', '1. GENERAL'),
    styled('H2', '1.1 Scope'),
    p('1.1.1 The works include:'),
    p('low voltage switchboards;', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>'),
    p('main board;', '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr>'),
    p('Note: see the schedule.'),
    styled('SpecHead', 'Submissions'),
    `<w:p><w:r><w:t>Drawings </w:t></w:r><w:r><w:tab/><w:t>and</w:t><w:br/><w:t>samples.</w:t></w:r><w:del><w:r><w:delText>removed</w:delText></w:r></w:del><w:r><w:drawing><wp:inline/></w:drawing></w:r></w:p>`,
    styled('H3', 'Samples'),
    styled('Outlined', 'Tests'),
    p(''),
    styled('H1', 'BOARDS'),
    `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Board</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Rating</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>MDB-1</w:t></w:r></w:p><w:p><w:r><w:t>main</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    `<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>`
  ].join('')), STYLES);

  it('makes sections of Heading 1, clause headings of the rest, items of list levels, tables of tables', () => {
    expect(doc.title).toBe('Electrical specification');
    expect(shape(doc)).toEqual([
      [FRONT, 'c0:Project: Tower A'],
      ['GENERAL', 'h0:Scope', 'c0:The works include:', 'c1:low voltage switchboards;', 'c2:main board;', 'n0:Note: see the schedule.', 'h0:Submissions', 'c0:Drawings and samples.', 'h1:Samples', 'h0:Tests'],
      ['BOARDS', 't0:[["Board","Rating"],["MDB-1 main",""]]']
    ]);
  });

  it('skips the document\'s own contents page, drops typed numbers, and reports what was read and what was not', () => {
    expect(JSON.stringify(doc)).not.toContain('PAGEREF');
    expect(report).toMatchObject({ sections: 3, lines: 10, tables: 1, pictures: 1 });
    expect(wordReadText(report)).toBe('3 sections, 10 lines, 1 table; 1 picture not brought in — add it with Add picture');
    expect(specView(doc, sampleProject).blocks[1].lines.map((l) => l.no)).toEqual(['2.1', '2.1.1', 'a)', 'i)', '', '2.2', '2.2.1', '2.2.2', '2.3']);
  });
});

describe('reading a Word document — typed numbers only, no styles', () => {
  const { doc } = specFromWordXml(body([
    p('1.0 GENERAL'), p('1.1 Scope of works'), p('1.1.1 The contractor shall supply all materials.'), p('(a) switchboards;'), p('(b) cables:'), p('(i) power cables;'), p('(ii) control cables.'),
    p('1.1.2 All work shall be completed to the satisfaction of the engineer.'), p('h) eighth item;'), p('i) ninth item;'),
    p('SECTION 2 CABLES'), p('2.1 General'), p('2.1.1 Cables shall be copper.'), p('• armoured where buried.'), p('2.2 A line that reads as a sentence, so it is a clause.')
  ].join('')));

  it('reads the depth from the numbers: a section, a heading, clauses, lettered and numbered items', () => {
    expect(shape(doc)).toEqual([
      ['GENERAL', 'h0:Scope of works', 'c0:The contractor shall supply all materials.', 'c1:switchboards;', 'c1:cables:', 'c2:power cables;', 'c2:control cables.',
        'c0:All work shall be completed to the satisfaction of the engineer.', 'c1:eighth item;', 'c1:ninth item;'],
      ['CABLES', 'h0:General', 'c0:Cables shall be copper.', 'c1:armoured where buried.', 'c0:A line that reads as a sentence, so it is a clause.']
    ]);
  });
});

describe('reading a Word document — files', () => {
  it('reads back the app\'s own Word export: the same sections with the same lines, the contents page skipped', async () => {
    const start = starterSpec();
    const { doc } = await readSpecDocx(await Packer.toBuffer(buildSpecDocx(sampleProject, start)));
    const read = doc.sections.filter((s) => s.title !== FRONT), given = specView(start, sampleProject).blocks;
    expect(read.map((s) => s.title)).toEqual(given.map((b) => b.title));
    expect(read.map((s) => s.clauses.map((c) => c.kind))).toEqual(given.map((b) => b.lines.map((l) => l.kind)));
    expect(JSON.stringify(read)).not.toContain('Contents');
  });

  it('refuses a file that is not a Word document, in plain words', async () => {
    await expect(readSpecDocx(new TextEncoder().encode('hello'))).rejects.toThrow('not a Word document (.docx). An older .doc file must first be saved as .docx');
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip(); zip.file('other.txt', 'x');
    await expect(readSpecDocx(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('not a Word document (.docx).');
    expect(() => specFromWordXml(body(p('')))).toThrow('No text was found');
  });
});
