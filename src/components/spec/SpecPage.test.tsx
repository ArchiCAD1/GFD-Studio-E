// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SpecPage from './SpecPage';

const saved: { name: string; bytes?: Uint8Array; html?: string; text?: string }[] = [];
vi.mock('../../util/files', async (orig) => ({
  ...(await orig<typeof import('../../util/files')>()),
  saveBinary: async (name: string, bytes: Uint8Array) => { saved.push({ name, bytes }); return `Saved ${name}`; },
  savePdf: async (name: string, html: string) => { saved.push({ name, html }); return `Saved ${name}`; },
  saveText: async (name: string, text: string) => { saved.push({ name, text }); return `C:/specs/${name}`; }
}));
import { sampleProject } from '../../data/sampleProject';
import { starterSpec } from '../../model/specDoc';
import type { Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement, last: Project, changes: number;
const status: string[] = [];
const undo = vi.fn();
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); changes = 0; status.length = 0; undo.mockClear(); localStorage.clear(); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const render = (p: Project) => { last = p; act(() => root.render(<SpecPage project={p} onChange={(x) => { changes++; render(x); }} onStatus={(m) => status.push(m)} onUndo={undo} />)); };
const tool = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.prb button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === label)!;
const press = (label: string) => act(() => tool(label).click());
const tabTo = (name: string) => act(() => [...document.querySelectorAll<HTMLButtonElement>('.prb-tab')].find((t) => t.textContent === name)!.click());
const sectionButton = (title: string) => [...document.querySelectorAll<HTMLButtonElement>('.spx-sec button')].find((b) => b.textContent?.endsWith(title))!;
const lines = () => [...document.querySelectorAll<HTMLDivElement>('.spx-line')];
const paper = () => document.querySelector('.spx-paper')!.textContent ?? '';
const edit = (text: string) => { const ta = document.querySelector<HTMLTextAreaElement>('.spx-line textarea')!; act(() => { ta.value = text; ta.setSelectionRange(text.length, text.length); ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); }); };
const spec = () => last.spec!;

describe('Specification page', () => {
  it('opens on the starter wording with the first section, filled from the project, and saves nothing yet', () => {
    render(sampleProject);
    expect(paper()).toContain('1 General requirements');
    expect(paper()).toContain(`electrical installation for ${sampleProject.name}`);
    expect(lines()[0].textContent).toBe('1.1Scope');
    expect(lines()[1].textContent!.startsWith('1.1.1')).toBe(true);
    expect(document.querySelectorAll('.spx-sec').length).toBe(10);
    expect(changes).toBe(0);
  });

  it('a value from the project is shaded; one the project lacks is DATA REQUIRED and counted', () => {
    const p: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => ({ ...b, busbarMaterial: undefined, ipRating: undefined, busbarIcwKa: undefined })), lightning: undefined, earthingPlan: undefined };
    render(p);
    act(() => sectionButton('LV switchboards').click());
    expect(document.querySelectorAll('.spx-paper .spx-f').length).toBeGreaterThan(2);
    expect([...document.querySelectorAll('.spx-paper .spx-m')].map((m) => m.textContent)).toEqual(['DATA REQUIRED: Short-time withstand (1 s)', 'DATA REQUIRED: Degree of protection', 'DATA REQUIRED: Busbar material']);
    expect(document.querySelector('.spx-strip .bad')!.textContent).toContain('missing');
    expect([...document.querySelectorAll('.spx-field .bad')].length).toBe(3);
  });

  it('ticking a section includes it and renumbers the list', () => {
    render(sampleProject);
    expect(sectionButton('Structured cabling').textContent).toBe('–Structured cabling');
    act(() => document.querySelector<HTMLInputElement>('input[aria-label="Include Fire alarm"]')!.click());
    expect(spec().sections.find((s) => s.title === 'Fire alarm')!.included).toBe(true);
    expect(sectionButton('Fire alarm').textContent).toBe('8Fire alarm');
    expect(document.querySelector('.spx-strip')!.textContent).toContain('8 of 10 sections included');
  });

  it('a section that is not included can still be read and edited, and says so', () => {
    render(sampleProject);
    act(() => sectionButton('Fire alarm').click());
    expect(paper()).toContain('This section is not included in the specification');
    expect(lines().length).toBe(1);
  });

  it('click a clause to edit its wording; the field stays a field', () => {
    render(sampleProject);
    act(() => lines()[1].click());
    const ta = document.querySelector<HTMLTextAreaElement>('.spx-line textarea')!;
    expect(ta.value).toContain('{{project.name}}');
    edit('This document covers the electrical works for {{project.name}}.');
    expect(spec().sections[0].clauses[1].text).toBe('This document covers the electrical works for {{project.name}}.');
    expect(changes).toBe(1);
    act(() => lines()[2].click());
    expect(lines()[1].textContent).toBe(`1.1.1This document covers the electrical works for ${sampleProject.name}.`);
    expect(changes).toBe(1);
  });

  it('Insert field puts a project value where the cursor was', () => {
    render(sampleProject);
    act(() => lines()[1].click());
    const ta = document.querySelector<HTMLTextAreaElement>('.spx-line textarea')!;
    // Going to the ribbon takes the cursor out of the clause: where it was is remembered.
    act(() => { ta.value = 'Supply: .'; ta.setSelectionRange(8, 8); ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Insert field"]')!;
    act(() => { select.value = 'project.voltage'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(spec().sections[0].clauses[1].text).toBe('Supply: {{project.voltage}}.');
    expect(select.querySelector('option[value="project.voltage"]')!.textContent).toBe(`System voltage — ${sampleProject.voltageV} V`);
  });

  it('Home tools: add a clause after the one selected, change its style, move it and delete it', () => {
    render(sampleProject);
    act(() => lines()[1].click());
    press('Add clause');
    expect(spec().sections[0].clauses[2].text).toBe('New clause.');
    expect(lines()[2].className).toContain('sel');
    press('Note');
    expect(spec().sections[0].clauses[2].kind).toBe('note');
    expect(tool('Note').getAttribute('aria-pressed')).toBe('true');
    press('Move up');
    expect(spec().sections[0].clauses[1].kind).toBe('note');
    press('Delete clause');
    expect(spec().sections[0].clauses.map((c) => c.text)).toEqual(starterSpec().sections[0].clauses.map((c) => c.text));
    expect(tool('Delete clause').disabled).toBe(true);
    press('Undo');
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('File tools: add, rename, move and delete a section; back to the starter wording', () => {
    render(sampleProject);
    tabTo('File');
    press('Add section');
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Section title"]')!;
    act(() => { input.value = 'Standby generator'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(spec().sections.map((s) => s.title)[10]).toBe('Standby generator');
    expect(paper()).toContain('No clauses yet');
    press('Move section up');
    expect(spec().sections.map((s) => s.title)[9]).toBe('Standby generator');
    press('Delete section');
    expect(spec().sections.length).toBe(10);
    press('Starter wording');
    expect(spec()).toEqual(starterSpec());
    expect(status[0]).toContain('starter wording is back');
  });

  it('tools of later stages are greyed and say so', () => {
    render(sampleProject);
    for (const label of ['Paste', 'Bold', 'Find and replace', 'Bullets']) expect(tool(label).disabled).toBe(true);
    expect(tool('Paste').title).toBe('Comes in a later stage');
    expect([...document.querySelectorAll<HTMLButtonElement>('.prb-tab')].filter((t) => t.disabled).map((t) => t.textContent)).toEqual(['Insert']);
    expect(document.querySelector<HTMLSelectElement>('select[aria-label="Insert field"]')!.disabled).toBe(true);
  });

  it('exports the specification to Word and to PDF, and says when values in it are DATA REQUIRED', async () => {
    saved.length = 0;
    render({ ...sampleProject, boards: sampleProject.boards.map((b) => ({ ...b, busbarMaterial: undefined })) });
    await act(async () => { tool('Export Word').click(); await vi.waitFor(() => expect(saved.length).toBe(1)); });
    expect(saved[0].name).toMatch(/Electrical-specification\.docx$/);
    expect(new TextDecoder().decode(saved[0].bytes!.subarray(0, 2))).toBe('PK');
    await vi.waitFor(() => expect(status.some((m) => m.includes('DATA REQUIRED'))).toBe(true));
    tabTo('File');
    await act(async () => { tool('Export PDF').click(); await vi.waitFor(() => expect(saved.length).toBe(2)); });
    expect(saved[1].name).toMatch(/Electrical-specification\.pdf$/);
    expect(saved[1].html).toContain('<h2>2 LV switchboards</h2>');
    expect(saved[1].html).toContain('DATA REQUIRED: Busbar material');
  });

  it('with no section included there is nothing to export', () => {
    const none = { ...starterSpec(), sections: starterSpec().sections.map((x) => ({ ...x, included: false })) };
    render({ ...sampleProject, spec: none });
    expect(tool('Export Word').disabled).toBe(true);
  });

  it('indents a clause into a lettered item and back, and marks a page break before it', () => {
    render(sampleProject);
    act(() => lines()[2].click());
    expect(tool('Outdent').disabled).toBe(true);
    press('Indent');
    expect(lines()[2].textContent!.startsWith('a)')).toBe(true);
    expect(lines()[2].classList.contains('l1')).toBe(true);
    press('Indent');
    expect(spec().sections[0].clauses[2].level).toBe(2);
    expect(tool('Indent').disabled).toBe(true);
    press('Outdent'); press('Outdent');
    expect(lines()[2].textContent!.startsWith('1.1.2')).toBe(true);
    press('Page break');
    expect(spec().sections[0].clauses[2].breakBefore).toBe(true);
    expect(lines()[2].classList.contains('brk')).toBe(true);
    expect(tool('Page break').getAttribute('aria-pressed')).toBe('true');
  });

  it('makes a section an appendix: lettered, after the numbered sections', () => {
    render(sampleProject);
    tabTo('File');
    press('Appendix');
    expect(spec().sections[0].appendix).toBe(true);
    expect(sectionButton('General requirements').textContent).toBe('AGeneral requirements');
    expect(paper()).toContain('Appendix A — General requirements');
    expect(sectionButton('LV switchboards').textContent).toBe('1LV switchboards');
    press('Appendix');
    expect(sectionButton('General requirements').textContent).toBe('1General requirements');
  });

  describe('templates and the specification file', () => {
    const card = (label: string) => document.querySelector<HTMLElement>(`section[aria-label="${label}"]`);
    const setValue = (el: HTMLInputElement | HTMLSelectElement, v: string) => act(() => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    });
    const now = () => last.spec ?? starterSpec();
    const click = (label: string) => act(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label || b.getAttribute('aria-label') === label)!.click());

    it('saves a heading with its clauses as a template and adds it in another section', () => {
      render(sampleProject);
      act(() => lines()[0].click()); // 1.1 Scope, a heading
      const under = now().sections[0].clauses.findIndex((c, i) => i > 0 && c.kind === 'heading');
      tabTo('File');
      press('Save as template');
      expect(card('Save as template')!.querySelector<HTMLSelectElement>('select')!.value).toBe('clauses');
      const saveButton = () => [...card('Save as template')!.querySelectorAll('button')].find((b) => b.textContent === 'Save template')!;
      expect(saveButton().disabled).toBe(true); // no name yet
      setValue(card('Save as template')!.querySelector<HTMLInputElement>('input[aria-label="Template name"]')!, 'Scope wording');
      act(() => saveButton().click());
      expect(status[status.length - 1]).toBe(`Template saved: Scope wording (clauses, ${under} lines)`);
      expect(card('Templates')!.textContent).toContain('Scope wording');
      expect(JSON.parse(localStorage.getItem('lvds.specTemplates')!)).toHaveLength(1);
      // use it in the second section
      act(() => sectionButton('LV switchboards').click());
      const before = now().sections[1].clauses.length;
      click('Use template Scope wording');
      expect(now().sections[1].clauses.length).toBe(before + under);
      expect(now().sections[1].clauses[before].text).toBe(now().sections[0].clauses[0].text);
      expect(new Set(now().sections.flatMap((x) => x.clauses.map((c) => c.id))).size).toBe(now().sections.reduce((n, x) => n + x.clauses.length, 0));
      click('Delete template Scope wording');
      expect(card('Templates')!.textContent).toContain('No templates yet');
      expect(JSON.parse(localStorage.getItem('lvds.specTemplates')!)).toEqual([]);
    });

    it('saves the whole specification as a template; using it replaces the sections and says how to get back', () => {
      render(sampleProject);
      tabTo('File');
      press('Save as template');
      setValue(card('Save as template')!.querySelector<HTMLSelectElement>('select')!, 'spec');
      setValue(card('Save as template')!.querySelector<HTMLInputElement>('input[aria-label="Template name"]')!, 'Office standard');
      click('Save template');
      const titles = now().sections.map((x) => x.title);
      act(() => root.unmount()); root = createRoot(host);
      render({ ...sampleProject, spec: { title: 'Other', info: { number: 'X-1' }, sections: [{ id: 'S1', title: 'Only', included: true, clauses: [] }] } });
      tabTo('File');
      press('Templates');
      click('Use template Office standard');
      expect(now().sections.map((x) => x.title)).toEqual(titles);
      expect(now().info).toEqual({ number: 'X-1' });
      expect(status[status.length - 1]).toContain('undo to return to yours');
    });

    it('saves the specification as a file of its own and opens one', async () => {
      saved.length = 0;
      render(sampleProject);
      tabTo('File');
      await act(async () => { tool('Save specification as').click(); await vi.waitFor(() => expect(saved.length).toBe(1)); });
      expect(saved[0].name.endsWith('.lvspec')).toBe(true);
      expect(JSON.parse(saved[0].text!)).toMatchObject({ format: 'lvds-specification', spec: { title: 'Electrical specification' } });
      const open = async (name: string, text: string) => {
        const input = document.querySelector<HTMLInputElement>('input[aria-label="Specification file"]')!;
        Object.defineProperty(input, 'files', { configurable: true, value: [new File([text], name)] });
        await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await vi.waitFor(() => expect(status[status.length - 1]).toContain(name)); });
      };
      await open('other.lvspec', JSON.stringify({ format: 'lvds-specification', version: 1, spec: { title: 'Opened', sections: [{ id: 'S9', title: 'From file', included: true, clauses: [] }] } }));
      expect(now().title).toBe('Opened');
      expect(sectionButton('From file')).toBeTruthy();
      const before = changes;
      await open('notes.lvspec', 'not a specification');
      expect(status[status.length - 1]).toBe('notes.lvspec: not a specification saved by LV Design Studio');
      expect(changes).toBe(before);
    });
  });

  describe('Review tab: the specification\'s own revisions', () => {
    const typeIn = (label: string, v: string) => act(() => {
      const el = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const card = (label: string) => document.querySelector<HTMLElement>(`section[aria-label="${label}"]`)!;
    const editFirstClause = (text: string) => {
      tabTo('Home');
      act(() => lines()[1].click());
      edit(text);
    };

    it('issues a revision, tracks the edits after it as the next draft, and shows them on the page and in the list', async () => {
      saved.length = 0;
      render(sampleProject);
      tabTo('Review');
      expect(tool('Issue revision').disabled).toBe(true); // no description yet
      expect(card('Revisions').textContent).toContain('None issued yet');
      typeIn('Revision description', 'Issued for tender'); typeIn('Revision by', 'PS');
      press('Issue revision');
      expect(spec().revisions!.map((r) => [r.id, r.description, r.by])).toEqual([['A', 'Issued for tender', 'PS']]);
      expect(status[status.length - 1]).toBe('Specification revision A issued');
      expect(document.querySelector('.spx-strip')!.textContent).toContain('Revision A issued');
      typeIn('Revision description', 'Again');
      expect(card('Revisions').textContent).toContain('Nothing has changed since revision A.');

      editFirstClause('A reworded first clause.');
      expect(lines()[1].classList.contains('rvc')).toBe(true);
      expect(lines()[1].getAttribute('data-rev')).toBe('B');
      expect(lines()[0].classList.contains('rvc')).toBe(false);
      expect(document.querySelector('.spx-strip')!.textContent).toContain('Draft of revision B · 1 change since A');
      tabTo('Review');
      expect(card('Changes').textContent).toContain('Changes in revision B (draft) — against revision A');
      expect(card('Changes').textContent).toContain('ChangedA reworded first clause.');

      press('Revision cloud'); press('Deleted text'); press('Change list page'); press('Highlight');
      expect(spec().marks).toEqual({ cloud: true, deleted: true, list: true, highlight: false });
      await act(async () => { tool('Export PDF').click(); await vi.waitFor(() => expect(saved.length).toBe(1)); });
      expect(saved[0].html).toContain('<h2>Changes in revision B (draft)</h2>');
      expect(saved[0].html).toContain('class="cl  cld"');

      typeIn('Revision description', 'Wording revised');
      press('Issue revision');
      expect(spec().revisions!.map((r) => r.id)).toEqual(['A', 'B']);
      expect(status[status.length - 1]).toBe('Specification revision B issued — 1 change against revision A');
      expect(card('Changes').textContent).toContain('Changes in revision B — against revision A');
      // a row of the list opens its section on the Home tab
      act(() => card('Changes').querySelector<HTMLElement>('tr.go')!.click());
      expect(document.querySelector('.spx-paper')).not.toBeNull();
      expect(lines()[1].classList.contains('rvc')).toBe(true);
    });

    it('takes a chosen revision id, refuses a repeated one, and withdraws the last revision', () => {
      render(sampleProject);
      tabTo('Review');
      typeIn('Revision id', 'P1'); typeIn('Revision description', 'Preliminary');
      press('Issue revision');
      expect(spec().revisions![0].id).toBe('P1');
      expect(document.querySelector<HTMLInputElement>('input[aria-label="Revision id"]')!.placeholder).toBe('P2');
      editFirstClause('Changed again.');
      tabTo('Review');
      typeIn('Revision id', 'p1'); typeIn('Revision description', 'x');
      expect(tool('Issue revision').disabled).toBe(true);
      expect(card('Revisions').textContent).toContain('Revision p1 is already issued.');
      press('Withdraw last');
      expect(spec().revisions).toEqual([]);
      expect(status[status.length - 1]).toContain('Revision P1 withdrawn');
      expect(tool('Withdraw last').disabled).toBe(true);
    });
  });

  describe('opening a Word document and linking its values', () => {
    const card = () => document.querySelector<HTMLElement>('section[aria-label="Link values to the project"]');
    const openFile = async (name: string, bytes: Uint8Array | string) => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Word document"]')!;
      const file = new File([bytes as BlobPart], name);
      if (!file.arrayBuffer) Object.defineProperty(file, 'arrayBuffer', { value: async () => (typeof bytes === 'string' ? new TextEncoder().encode(bytes).buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) });
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await vi.waitFor(() => expect(status[status.length - 1]).toContain(name), { timeout: 5000 }); });
    };

    it('reads the wording, keeps the document information and page setup, and offers the project values it found', async () => {
      const { Packer } = await import('docx');
      const { buildSpecDocx } = await import('../../docs/specWord');
      const name = sampleProject.name;
      const word: Project = { ...sampleProject, spec: { title: 'From Word', setup: { cover: { on: false }, contents: { on: false } }, sections: [{ id: 'S1', title: 'General', included: true, clauses: [
        { id: 'C1', kind: 'heading', text: 'Scope' }, { id: 'C2', kind: 'clause', text: `These works are for ${name}.` }, { id: 'C3', kind: 'clause', text: 'Nothing to link here.' }] }] } };
      const bytes = new Uint8Array(await Packer.toBuffer(buildSpecDocx(word, word.spec!)));
      render({ ...sampleProject, spec: { ...starterSpec(), info: { number: 'E-7' }, setup: { watermark: 'DRAFT' } } });
      tabTo('File');
      await openFile('office.docx', bytes);
      expect(spec().info).toEqual({ number: 'E-7' });
      expect(spec().setup).toEqual({ watermark: 'DRAFT' });
      const general = spec().sections.find((x) => x.title === 'General')!;
      expect(general.clauses.map((c) => c.text)).toEqual(['Scope', `These works are for ${name}.`, 'Nothing to link here.']);
      expect(status[status.length - 1]).toContain('Word document opened — office.docx');
      expect(status[status.length - 1]).toContain('undo to return');
      // the project name was found typed in the wording
      expect(card()!.textContent).toContain(`${name} → Project name`);
      act(() => [...card()!.querySelectorAll('button')].find((b) => b.textContent === 'Link the ticked values')!.click());
      expect(spec().sections.find((x) => x.title === 'General')!.clauses[1].text).toBe('These works are for {{project.name}}.');
      expect(status[status.length - 1]).toMatch(/^Linked to the project: \d+ place/);
      expect(card()).toBeNull();
    });

    it('a value that is unticked is left as typed', () => {
      const name = sampleProject.name;
      render({ ...sampleProject, spec: { title: 'x', sections: [{ id: 'S1', title: 'General', included: true, clauses: [{ id: 'C1', kind: 'clause', text: `For ${name}.` }] }] } });
      press('Link values');
      act(() => document.querySelector<HTMLInputElement>('input[aria-label="Link Project name"]')!.click());
      const go = [...card()!.querySelectorAll('button')].find((b) => b.textContent === 'Link the ticked values')!;
      expect(go.disabled).toBe(true);
      expect(spec().sections[0].clauses[0].text).toBe(`For ${name}.`);
    });

    it('says so when the file is not a Word document, and changes nothing', async () => {
      render(sampleProject);
      tabTo('File');
      const before = changes;
      await openFile('notes.docx', 'plain text');
      expect(status[status.length - 1]).toContain('notes.docx: The file is not a Word document (.docx)');
      expect(changes).toBe(before);
    });
  });

  describe('tables and pictures', () => {
    const paste = (target: Element, text: string) => act(() => {
      const e = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'clipboardData', { value: { getData: (t: string) => (t === 'text/plain' ? text : ''), files: [] } });
      target.dispatchEvent(e);
    });
    const page = () => document.querySelector('.spx-paper')!;
    const cellBox = (r: number, c: number) => document.querySelector<HTMLInputElement>(`.spx-tb input[aria-label$="row ${r} column ${c}"]`)!;
    const leave = (el: HTMLInputElement, v: string) => act(() => { el.focus(); el.value = v; el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    const toolIn = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.spx-blk-tools button')].find((b) => b.textContent!.trim() === label)!;

    it('cells copied from a sheet and pasted on the page become a table after the clause being edited', () => {
      render(sampleProject);
      act(() => lines()[1].click());
      paste(page(), 'Board\tRating\nMDB-1\t1600 A\n');
      const c = spec().sections[0].clauses;
      expect(c[2]).toMatchObject({ kind: 'table', text: '', table: { rows: [['Board', 'Rating'], ['MDB-1', '1600 A']] } });
      expect(status[status.length - 1]).toBe('Table added from the copied cells: 2 rows × 2 columns');
      expect(document.querySelector('.spx-tb th input')).not.toBeNull(); // selected, ready to edit
    });

    it('plain text pasted on the page is left alone', () => {
      render(sampleProject);
      const before = changes;
      paste(page(), 'Only a sentence.');
      expect(changes).toBe(before);
    });

    it('edits a cell and the caption, adds and deletes rows and columns, and turns the header row off', () => {
      render(sampleProject);
      press('Add table');
      const table = () => spec().sections[0].clauses.find((x) => x.kind === 'table')!;
      expect(table().table!.rows).toEqual([['', '', ''], ['', '', ''], ['', '', '']]);
      leave(cellBox(1, 1), 'Board');
      leave(document.querySelector<HTMLInputElement>('.spx-capin')!, 'Main boards');
      expect(table()).toMatchObject({ text: 'Main boards', table: { rows: [['Board', '', ''], ['', '', ''], ['', '', '']] } });
      act(() => cellBox(2, 2).focus());
      act(() => toolIn('Add row').click());
      act(() => toolIn('Add column').click());
      expect(table().table!.rows.map((r) => r.length)).toEqual([4, 4, 4, 4]);
      act(() => cellBox(4, 4).focus());
      act(() => toolIn('Delete row').click());
      expect(toolIn('Delete column').disabled).toBe(true); // no cell chosen after a delete
      act(() => cellBox(1, 4).focus());
      act(() => toolIn('Delete column').click());
      expect(table().table!.rows).toEqual([['Board', '', ''], ['', '', ''], ['', '', '']]);
      act(() => document.querySelector<HTMLInputElement>('.spx-blk-tools input[type="checkbox"]')!.click());
      expect(table().table!.header).toBe(false);
      expect(document.querySelector('.spx-tb th')).toBeNull();
      expect(tool('Clause heading').disabled).toBe(true);
      expect(tool('Indent').disabled).toBe(true);
    });

    it('copies one of the project sheets in as a table', () => {
      render({ ...sampleProject, sheets: { sheets: [{ id: 'SH1', name: 'Loads', cells: { A1: 'Load', B1: 'kW', A2: 'Total', B2: '=40+2' }, styles: {}, widths: {}, rows: 40, cols: 12 }] } } as Project);
      act(() => { const sel = document.querySelector<HTMLSelectElement>('select[aria-label="Table from sheet"]')!; sel.value = 'SH1'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(spec().sections[0].clauses.find((x) => x.kind === 'table')!.table!.rows).toEqual([['Load', 'kW'], ['Total', '42']]);
      expect(status[status.length - 1]).toContain('sheet Loads: 2 × 2');
    });

    it('shows a picture with its numbered caption and sets its width', () => {
      const image = { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAoCAIAAAC6iKlyAAAAc0lEQVR4Xu3QQQ0AIBDAMMC/5yOIYK/WwJLtmVn8d/4neIyOGB0xOmJ0xOiI0RGjI0ZHjI4YHTE6YnTE6IjREaMjRkeMjhgdMTpidMToiNERoyNGR4yOGB0xOmJ0xOiI0RGjI0ZHjI4YHTE6YnTE6IjRkQub1QNNNLL5wAAAAABJRU5ErkJggg==', w: 120, h: 40 };
      const base = starterSpec();
      render({ ...sampleProject, spec: { ...base, sections: base.sections.map((x, i) => (i ? x : { ...x, clauses: [...x.clauses, { id: 'P1', kind: 'image' as const, text: 'Riser', image }] })) } });
      const pic = document.querySelector<HTMLElement>('[data-clause="P1"]')!;
      expect(pic.querySelector('.spx-cap')!.textContent).toBe('Figure 1 — Riser');
      expect(pic.querySelector<HTMLImageElement>('img')!.style.width).toBe('60%');
      act(() => pic.click());
      act(() => { const sel = document.querySelector<HTMLSelectElement>('select[aria-label="Picture width"]')!; sel.value = '40'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(spec().sections[0].clauses.find((x) => x.id === 'P1')!.image).toEqual({ ...image, widthPct: 40 });
    });
  });

  describe('Specification tab: document information and page setup', () => {
    const box = (label: string) => document.querySelector<HTMLInputElement>(`.spx-setup [aria-label="${label}"]`)!;
    const type = (label: string, v: string) => act(() => { const el = box(label); el.value = v; el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    const choose = (label: string, v: string) => act(() => { const el = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); });

    it('sets the number, status and a party; a blank party shows what the project has', () => {
      render({ ...sampleProject, info: { ...sampleProject.info, owner: 'Owner Co' } });
      tabTo('Specification');
      expect(box('Client').placeholder).toBe('From the project: Owner Co');
      type('Document number', 'E-001'); type('Status', 'For tender'); type('Main contractor', 'Build Co');
      expect(spec().info).toEqual({ number: 'E-001', status: 'For tender', mainContractor: 'Build Co' });
      expect(document.querySelector('.spx-strip')!.textContent).toContain('E-001 · For tender');
      expect(changes).toBe(3);
    });

    it('adds a detail, uses it in a clause, and says so when a detail in use is removed', () => {
      render(sampleProject);
      tabTo('Specification');
      press('Add detail');
      type('Detail D1 name', 'Plot number'); type('Detail D1 value', '373-1245');
      expect(spec().info!.details).toEqual([{ id: 'D1', name: 'Plot number', value: '373-1245' }]);
      tabTo('Home');
      act(() => lines()[1].click());
      act(() => { const sel = document.querySelector<HTMLSelectElement>('select[aria-label="Insert field"]')!; sel.value = 'detail.D1'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      act(() => lines()[0].click());
      expect(paper()).toContain('373-1245');
      tabTo('Specification');
      act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Remove detail Plot number"]')!.click());
      expect(spec().info!.details).toEqual([]);
      expect(status[status.length - 1]).toContain('1 clause used it');
    });

    it('sets paper, margins, a footer slot, the logo position and the watermark; the preview and the PDF follow', async () => {
      saved.length = 0;
      render(sampleProject);
      tabTo('Specification');
      choose('Paper', 'A3'); choose('Orientation', 'landscape');
      type('Margin top', '30'); type('Margin left', '500');
      type('Footer left', '{{doc.title}} — {{page}}/{{pages}}'); type('Watermark', 'DRAFT');
      expect(spec().setup).toMatchObject({ paper: 'A3', landscape: true, watermark: 'DRAFT' });
      expect(spec().setup!.marginsMm).toMatchObject({ top: 30, left: 60 });
      expect(document.querySelector('.spx-foot')!.textContent).toContain('Electrical specification — 1/1');
      expect(document.querySelector('.spx-strip')!.textContent).toContain('A3 landscape · watermark DRAFT');
      await act(async () => { tool('Export PDF').click(); await vi.waitFor(() => expect(saved.length).toBe(1)); });
      expect(saved[0].html).toContain('size: A3 landscape; margin: 30mm');
      expect(saved[0].html).toContain('<div class="wm"><span>DRAFT</span></div>');
      press('Default page setup');
      expect(spec().setup).toBeUndefined();
    });

    it('turns the cover page and the contents page on and off, and sets what each shows', async () => {
      saved.length = 0;
      render(sampleProject);
      tabTo('Specification');
      expect(tool('Cover page').getAttribute('aria-pressed')).toBe('true');
      const tick = (label: string) => act(() => [...document.querySelectorAll<HTMLLabelElement>('.spx-tick')].find((l) => l.textContent!.trim() === label)!.querySelector('input')!.click());
      tick('List the clause headings'); tick('Revision table'); type('Note on the cover', 'Read with the drawings.');
      expect(spec().setup).toEqual({ contents: { headings: true }, cover: { revisions: false, note: 'Read with the drawings.' } });
      await act(async () => { tool('Export PDF').click(); await vi.waitFor(() => expect(saved.length).toBe(1)); });
      expect(saved[0].html).toContain('<section class="cover');
      expect(saved[0].html).toContain('class="l2"');
      press('Cover page'); press('Contents page');
      expect(spec().setup).toMatchObject({ cover: { on: false }, contents: { on: false } });
      expect(document.querySelector('.spx-strip')!.textContent).toContain('No cover page · no contents page');
      expect(document.querySelector<HTMLInputElement>('input[aria-label="Cover: Logo"]')!.disabled).toBe(true);
    });

    it('the header on the page follows the header slots', () => {
      render({ ...sampleProject, spec: { ...starterSpec(), setup: { header: ['{{doc.number}}', 'Tender issue', ''] }, info: { number: 'E-9' } } });
      expect(document.querySelector('.spx-head')!.textContent).toBe('E-9Tender issue');
    });
  });
});
