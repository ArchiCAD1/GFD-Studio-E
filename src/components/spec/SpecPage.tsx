import { useMemo, useRef, useState, type ClipboardEvent } from 'react';
import {
  AlignLeft, ArrowDown, ArrowUp, Baseline, Bold, Braces, ClipboardPaste, Copy, FilePlus2, FileText, FileType, FolderOpen, Heading1, Heading2, Italic, List, ListOrdered, PaintBucket, Paintbrush,
  BookmarkPlus, BookOpen, Link2, LibraryBig, Save, Columns3, Image as ImageIcon, Rows3, Table as TableIcon, ImageMinus, ImagePlus, IndentDecrease, IndentIncrease, ListPlus, Paperclip, SeparatorHorizontal, TableOfContents, Pencil, Pilcrow, Plus, RotateCcw, Scissors, Search, StickyNote, Trash2, Underline, Undo2
} from 'lucide-react';
import type { Project } from '../../types';
import {
  addClause, addDetail, addSection, fieldUses, indentClause, maxLevel, withAppendix, moveClause, moveSection, removeClause, removeDetail, removeSection, slotText, specFields, specRevisionRows, specSetup, specView, starterSpec, withClause, withContents, withCover, withDetail,
  withInfo, withSectionIncluded, withSectionTitle, withSetup, withTitle, fieldKeys, captionText, SPEC_PARTIES, SPEC_SETUP, type SpecClause, type SpecDoc, type SpecKind, type SpecLogoPlace, type SpecMargins, type SpecPaper, type SpecSlots
} from '../../model/specDoc';
import { addCol, addRow, deleteCol, deleteRow, imageFromDataUrl, setCell, tableFromSheet, tableFromText, tableSize, IMAGE_MAX_BYTES } from '../../model/specBlocks';
import { Big, Group, Icons, IconTool, PageRibbon, RIBBON_CSS, Rows, Small } from '../pageRibbon';
import { buildSpecHtml, specPdfPage } from '../../docs/specReport';
import { safeFileName, saveBinary, savePdf, saveText } from '../../util/files';
import { linkFields, linkSuggestions } from '../../model/specLink';
import {
  applyTemplate, loadTemplates, removeTemplate, saveTemplates, specFileText, specFromFileText, templateNameError, templateOf, templateSummary, withTemplate,
  SPEC_FILE_EXT, TEMPLATE_KINDS, TEMPLATE_MAX_CHARS, type SpecTemplate, type SpecTemplateKind
} from '../../model/specTemplates';

/** Specification: the project specification as sections of numbered clauses whose values come from the project.
 * It has the section list, the page with clause editing, the File, Home and Specification tabs of the ribbon (the
 * last: document information, parties, page setup, header, footer, logo and watermark), and export to Word and PDF; the clause library and the office template follow (docs/notes/Future development, Specification writer). */

const CSS = `${RIBBON_CSS}
.spx { display: flex; flex-direction: column; gap: 12px; color: var(--tx); min-width: 0; }
.spx h3 { margin: 0; font-size: 18px; }
.spx-note { font-size: 12px; color: var(--mut); margin: 0; }
.spx-strip { display: flex; flex-wrap: wrap; gap: 8px 20px; border: 1px solid var(--line); border-radius: 6px; background: var(--p2); padding: 10px 12px; font-size: 12px; color: var(--mut); }
.spx-strip b { color: var(--tx); font-weight: 600; }
.spx-strip .bad { color: var(--bad); font-weight: 600; }
.spx-cols { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(220px, 280px); gap: 14px; align-items: start; }
@media (max-width: 1100px) { .spx-cols { grid-template-columns: 1fr; } }
.spx-card { border: 1px solid var(--line); border-radius: 9px; background: var(--panel); padding: 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.spx-card h4 { margin: 0; font-size: 13px; }
.spx-sec { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 0 8px; border-radius: 6px; font-size: 12.5px; color: var(--mut); cursor: pointer; }
.spx-sec.on { background: var(--p2); }
.spx-sec.in { color: var(--tx); }
.spx-sec.on .spx-sec-t { font-weight: 600; }
.spx-sec input { width: 16px; height: 16px; accent-color: var(--acc); flex: none; }
.spx-sec button { flex: 1; min-width: 0; text-align: left; border: 0; background: transparent; color: inherit; font: inherit; padding: 6px 0; cursor: pointer; display: flex; gap: 8px; }
.spx-sec-n { width: 20px; color: var(--mut); flex: none; }
.spx-paper { background: #fff; color: #1a1a1a; border: 1px solid var(--line); padding: 40px 48px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.55; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.spx-head { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #1a1a1a; padding-bottom: 6px; font-size: 11px; }
.spx-paper h5 { margin: 6px 0 2px; font-size: 17px; }
.spx-line { display: grid; grid-template-columns: 52px 1fr; gap: 6px; padding: 3px 4px; border-radius: 3px; cursor: text; border: 1px solid transparent; }
.spx-line.h { font-weight: 700; font-size: 13.5px; margin-top: 6px; }
.spx-line.n { font-style: italic; color: #444; }
.spx-line.l1 { margin-left: 52px; grid-template-columns: 30px 1fr; } .spx-line.l2 { margin-left: 82px; grid-template-columns: 30px 1fr; }
.spx-line.h.l1 { margin-left: 0; grid-template-columns: 52px 1fr; font-size: 13px; }
.spx-line.brk { margin-top: 22px; position: relative; }
.spx-line.brk::before { content: "Page break"; position: absolute; left: 0; right: 0; top: -18px; border-top: 1px dashed #999; font-size: 10px; font-weight: 400; font-style: normal; color: #666; text-align: center; }
.spx-line.blk { display: block; margin-left: 52px; cursor: pointer; }
.spx-cap { font-size: 12px; font-weight: 700; margin: 2px 0 4px; }
.spx-tb { border-collapse: collapse; width: 100%; font-size: 12px; } .spx-tb th, .spx-tb td { border: 1px solid currentColor; padding: 3px 6px; text-align: left; vertical-align: top; }
.spx-tb input, .spx-capin { box-sizing: border-box; width: 100%; border: 0; padding: 2px 0; font: inherit; color: inherit; background: transparent; }
.spx-tb input:focus, .spx-capin:focus { outline: 2px solid var(--acc); outline-offset: 1px; }
.spx-capin { border-bottom: 1px dashed currentColor; margin-bottom: 6px; font-weight: 700; }
.spx-blk-tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; font-size: 11.5px; }
.spx-blk-tools button, .spx-blk-tools select { height: 28px; padding: 0 8px; border: 1px solid currentColor; border-radius: 4px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.spx-blk-tools button:disabled { opacity: .45; cursor: default; }
.spx-tpl { display: grid; grid-template-columns: minmax(0, 1fr) auto 36px; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); font-size: 12.5px; }
.spx-tpl button { height: 34px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--p2); color: var(--tx); font: inherit; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.spx-pic { display: block; max-width: 100%; height: auto; }
.spx-line.sel { border-color: #b8860b; background: #fffbea; }
.spx-line textarea { box-sizing: border-box; width: 100%; min-height: 64px; border: 1px solid #999; padding: 4px 6px; font: inherit; font-weight: 400; font-style: normal; color: #1a1a1a; background: #fff; resize: vertical; }
.spx-f { background: #fff2cc; border-bottom: 1px solid #b8860b; padding: 0 3px; }
.spx-m { background: #fde2e0; border-bottom: 1px solid #b42318; padding: 0 3px; color: #7a1410; font-weight: 700; }
.spx-off { color: #7a1410; font-size: 12px; }
.spx-field { display: grid; grid-template-columns: 1fr auto; gap: 8px; font-size: 12.5px; min-height: 26px; align-items: center; color: var(--mut); }
.spx-field b { color: var(--tx); font-weight: 400; }
.spx-field .bad { color: var(--bad); font-weight: 600; }
.spx-foot { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid #1a1a1a; padding-top: 6px; margin-top: 14px; font-size: 11px; }
.spx-head span, .spx-foot span { flex: 1; } .spx-head span:nth-child(2), .spx-foot span:nth-child(2) { text-align: center; } .spx-head span:nth-child(3), .spx-foot span:nth-child(3) { text-align: right; }
.spx-setup { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; align-items: start; }
.spx-form { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px 12px; align-items: center; font-size: 12.5px; }
.spx-form label { color: var(--mut); }
.spx-form input, .spx-form select, .spx-det input { box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--p2); color: var(--tx); font: inherit; font-size: 12.5px; }
.spx-det { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) 36px; gap: 8px; align-items: center; }
.spx-det button { width: 36px; height: 36px; border-radius: 6px; border: 1px solid var(--line); background: var(--p2); color: var(--tx); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.spx-key { grid-column: 1 / -1; font-size: 11px; color: var(--mut); margin-top: -4px; }
.spx-tick { display: flex; align-items: center; gap: 10px; min-height: 30px; font-size: 12.5px; }
.spx-tick input { width: 16px; height: 16px; accent-color: var(--acc); flex: none; }
.spx-sub { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 12px; padding-left: 26px; }
.spx-three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.spx-four { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.spx-logo { max-height: 40px; max-width: 160px; background: #fff; padding: 4px; border-radius: 4px; }
.spx-insert { box-sizing: border-box; height: 40px; max-width: 220px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--p2); color: var(--tx); font: inherit; font-size: 12.5px; }
`;

type Tab = 'file' | 'home' | 'setup';
const LOGO_PLACES: [SpecLogoPlace, string][] = [['none', 'Not shown'], ['header-left', 'Header, left'], ['header-right', 'Header, right'], ['footer-left', 'Footer, left'], ['footer-right', 'Footer, right']];
const LOGO_MAX = 400_000; // bytes: the logo is kept in the project file
const SIDES = ['left', 'centre', 'right'] as const;
const MARGINS: (keyof SpecMargins)[] = ['top', 'right', 'bottom', 'left'];

/** A text box that saves when left (or on Enter), so one change is one undo step. */
function Entry({ label, value, placeholder, onSave, type }: { label: string; value: string; placeholder?: string; onSave: (v: string) => void; type?: 'number' }) {
  return <input key={value} type={type ?? 'text'} aria-label={label} defaultValue={value} placeholder={placeholder} {...(type === 'number' ? { min: 5, max: 60, step: 1 } : {})}
    onBlur={(e) => { if (e.currentTarget.value !== value) onSave(e.currentTarget.value); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}
const KIND_CLASS: Record<SpecKind, string> = { heading: 'h', clause: '', note: 'n', table: 'blk', image: 'blk' };

export default function SpecPage({ project, onChange, onStatus, onUndo }: { project: Project; onChange: (p: Project, step?: boolean) => void; onStatus?: (m: string) => void; onUndo?: () => void }) {
  const doc: SpecDoc = useMemo(() => project.spec ?? starterSpec(), [project.spec]);
  const [tab, setTab] = useState<Tab>('home');
  const [sectionId, setSectionId] = useState(doc.sections[0]?.id ?? '');
  const [clauseId, setClauseId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  /** Where the cursor last was in the clause being edited, for Insert field. */
  const caret = useRef<number | null>(null);

  const section = doc.sections.find((s) => s.id === sectionId) ?? doc.sections[0];
  const clause = section?.clauses.find((c) => c.id === clauseId);
  const view = useMemo(() => specView(doc, project), [doc, project]);
  const fields = useMemo(() => specFields(project), [project]);
  // The section on the page: as numbered in the specification when included, else on its own so it can still be edited.
  const block = useMemo(() => {
    if (!section) return undefined;
    return view.blocks.find((b) => b.id === section.id) ?? specView({ ...doc, sections: [{ ...section, included: true }] }, project).blocks[0];
  }, [view, section, doc, project]);
  const used = useMemo(() => [...new Set((section?.clauses ?? []).flatMap((c) => fieldKeys(c.text)))], [section]);

  const save = (next: SpecDoc) => onChange({ ...project, spec: next }, true);
  const included = doc.sections.filter((s) => s.included).length;
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<null | 'save' | 'library' | 'link'>(null);
  const [linkOff, setLinkOff] = useState<Set<string>>(new Set()); // the suggested values the engineer has unticked
  const wordFile = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<SpecTemplate[]>(loadTemplates);
  const [tplName, setTplName] = useState('');
  const [tplKind, setTplKind] = useState<SpecTemplateKind>('section');
  const specFile = useRef<HTMLInputElement>(null);
  async function exportAs(kind: 'docx' | 'pdf') {
    setBusy(true);
    try {
      const name = `${safeFileName(project.name)} - ${safeFileName(doc.title)}`;
      const m = kind === 'pdf'
        ? await savePdf(`${name}.pdf`, buildSpecHtml(project, doc), specPdfPage(project, doc))
        : await saveBinary(`${name}.docx`, await (await import('../../docs/specWord')).specDocxBytes(project, doc), 'Word document', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      if (m) onStatus?.(view.missing.length ? `${m} — ${view.missing.length} value${view.missing.length === 1 ? '' : 's'} in it are DATA REQUIRED` : m);
    } finally {
      setBusy(false);
    }
  }
  const setup = useMemo(() => specSetup(doc, project), [doc, project]);
  const logoFile = useRef<HTMLInputElement>(null);
  const picFile = useRef<HTMLInputElement>(null);
  const [cell, setCell_] = useState<[number, number] | null>(null); // the table cell last clicked, for row and column tools
  /** Puts a table or a picture after the clause being edited (at the end of the section when none) and selects it. */
  const addBlock = (kind: 'table' | 'image', block: Pick<SpecClause, 'table' | 'image'>, what: string) => {
    const next = addClause(doc, section!.id, kind, '', clause?.id, block);
    const before = new Set(section!.clauses.map((c) => c.id));
    save(next);
    setClauseId(next.sections.find((x) => x.id === section!.id)!.clauses.find((c) => !before.has(c.id))!.id); setCell_(null);
    onStatus?.(what);
  };
  const addCells = (text: string, from: string): boolean => {
    const rows = tableFromText(text);
    if (!rows) return false;
    addBlock('table', { table: { rows } }, `Table added from ${from}: ${rows.length} row${rows.length === 1 ? '' : 's'} × ${rows[0].length} column${rows[0].length === 1 ? '' : 's'}`);
    return true;
  };
  const addPicture = (file: File | undefined | null) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { onStatus?.('Picture: choose a PNG or JPEG picture'); return; }
    if (file.size > IMAGE_MAX_BYTES) { onStatus?.(`Picture: the file is ${Math.round(file.size / 1000)} kB; use one under ${IMAGE_MAX_BYTES / 1000} kB (it is kept in the project file)`); return; }
    const r = new FileReader();
    r.onload = () => { const image = imageFromDataUrl(String(r.result)); if (image) addBlock('image', { image }, `Picture added: ${image.w} × ${image.h} pixels`); else onStatus?.('Picture: the file could not be read as a PNG or JPEG picture'); };
    r.readAsDataURL(file);
  };
  /** Paste on the page: copied cells (Sheets, Excel) become a table, a copied picture a picture; plain text is left
   * to the text box it is pasted into. */
  const onPaste = (e: ClipboardEvent) => {
    const pic = [...(e.clipboardData?.files ?? [])].find((f) => /^image\/(png|jpeg)$/.test(f.type));
    if (e.target instanceof HTMLInputElement) return; // a table cell or a caption: paste as text
    if (addCells(e.clipboardData?.getData('text/plain') ?? '', 'the copied cells')) { e.preventDefault(); return; }
    if (pic) { e.preventDefault(); addPicture(pic); }
  };
  const pasteCells = () => {
    const read = navigator.clipboard?.readText?.();
    if (!read) { onStatus?.('Paste cells: click the page and press Ctrl+V'); return; }
    void read.then((text) => { if (!addCells(text, 'the copied cells')) onStatus?.('Paste cells: nothing copied from a sheet — copy two or more cells in Sheets or Excel first'); }).catch(() => onStatus?.('Paste cells: click the page and press Ctrl+V'));
  };
  const fromSheet = (id: string) => {
    const sheet = project.sheets?.sheets.find((x) => x.id === id), rows = sheet && tableFromSheet(sheet);
    if (!sheet) return;
    if (!rows) { onStatus?.(`Table from sheet: ${sheet.name} is empty`); return; }
    addBlock('table', { table: { rows } }, `Table added from sheet ${sheet.name}: ${rows.length} × ${rows[0].length} (a copy — it does not follow the sheet)`);
  };
  // ---- templates and the specification's own file
  const keepTemplates = (list: SpecTemplate[]): boolean => {
    if (!saveTemplates(list)) { onStatus?.('Templates: this computer’s storage did not take the library (it may be full)'); return false; }
    setTemplates(list);
    return true;
  };
  const tplError = templateNameError(tplName) ?? (tplKind === 'clauses' && !clause ? 'Click the heading or clause to save first.' : undefined);
  const saveTemplate = () => {
    const t = tplError ? undefined : templateOf(doc, tplKind, tplName, { sectionId: section!.id, clauseId: clause?.id });
    if (!t) return;
    if (JSON.stringify(t).length > TEMPLATE_MAX_CHARS) { onStatus?.('Template not saved: it is too large for the library (its pictures) — remove or shrink the pictures, or use Save specification as'); return; }
    const next = withTemplate(templates, t);
    if (!keepTemplates(next.list)) return;
    onStatus?.(`Template ${next.updated ? 'updated' : 'saved'}: ${t.name} (${TEMPLATE_KINDS[t.kind].toLowerCase()}, ${templateSummary(t)})`);
    setTplName(''); setPanel('library');
  };
  const putTemplate = (t: SpecTemplate) => {
    const r = applyTemplate(doc, t, { sectionId: section!.id, clauseId: clause?.id });
    save(r.doc);
    if (t.kind === 'clauses') setClauseId(null); else { setSectionId(r.added[0]); setClauseId(null); }
    onStatus?.(t.kind === 'spec' ? `Specification replaced by the template ${t.name} (undo to return to yours)` : `Template added: ${t.name} (${templateSummary(t)})`);
  };
  const saveSpecFile = async () => {
    const name = `${safeFileName(project.name)} — ${safeFileName(doc.title)}.${SPEC_FILE_EXT}`;
    try { const path = await saveText(name, specFileText(doc), 'LV Design Studio specification', SPEC_FILE_EXT); if (path !== null) onStatus?.(`Specification saved as a file: ${path || name}`); }
    catch (e) { onStatus?.(`Save failed: ${String((e as Error)?.message ?? e)}`); }
  };
  const openSpecFile = async (file: File | undefined) => {
    if (!file) return;
    const next = specFromFileText(await file.text());
    if (!next) { onStatus?.(`${file.name}: not a specification saved by LV Design Studio`); return; }
    save(next); setSectionId(next.sections[0].id); setClauseId(null);
    onStatus?.(`Specification opened from ${file.name}: ${next.sections.length} section${next.sections.length === 1 ? '' : 's'} (undo to return to the one before)`);
  };
  // ---- a Word document, and linking typed values to the project
  const openWord = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { readSpecDocx, wordReadText } = await import('../../docs/specWordRead');
      const { doc: read, report } = await readSpecDocx(await file.arrayBuffer());
      // The wording comes from the file; the document's own information and page setup stay.
      const next: SpecDoc = { ...read, ...(doc.info ? { info: doc.info } : {}), ...(doc.setup ? { setup: doc.setup } : {}) };
      save(next); setSectionId(next.sections[0].id); setClauseId(null);
      const found = linkSuggestions(next, specFields(project, next)).length;
      setLinkOff(new Set()); setPanel(found ? 'link' : null);
      onStatus?.(`Word document opened — ${file.name}: ${wordReadText(report)}${found ? `. ${found} project value${found === 1 ? '' : 's'} found in the wording: choose which to link` : ''} (undo to return to the specification before)`);
    } catch (e) { onStatus?.(`${file.name}: ${String((e as Error)?.message ?? e)}`); }
  };
  const suggestions = useMemo(() => (panel === 'link' ? linkSuggestions(doc, fields) : []), [panel, doc, fields]);
  const linkChosen = () => {
    const r = linkFields(doc, suggestions.filter((x) => !linkOff.has(x.key)).map((x) => x.key), fields);
    if (r.replaced) save(r.doc);
    onStatus?.(r.replaced ? `Linked to the project: ${r.replaced} place${r.replaced === 1 ? '' : 's'} now follow${r.replaced === 1 ? 's' : ''} the project values` : 'Nothing was chosen to link');
    setPanel(null);
  };
  const isBlock = clause?.kind === 'table' || clause?.kind === 'image';
  const setTable = (c: SpecClause, table: NonNullable<SpecClause['table']>) => save(withClause(doc, section!.id, c.id, { table }));
  const info = doc.info ?? {};
  const setSlot = (edge: 'header' | 'footer', i: number, v: string) => { const next = [...setup[edge]] as SpecSlots; next[i] = v; save(withSetup(doc, { [edge]: next })); };
  const setMargin = (side: keyof SpecMargins, v: string) => { const n = Number(v); if (Number.isFinite(n)) save(withSetup(doc, { marginsMm: { ...setup.marginsMm, [side]: Math.min(60, Math.max(5, n)) } })); };
  const readLogo = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { onStatus?.('Logo: choose a PNG or JPEG picture'); return; }
    if (file.size > LOGO_MAX) { onStatus?.(`Logo: the picture is ${Math.round(file.size / 1000)} kB; use one under ${LOGO_MAX / 1000} kB`); return; }
    const r = new FileReader();
    r.onload = () => { save(withSetup(doc, { logo: String(r.result), ...(setup.logoPlace === 'none' ? { logoPlace: 'header-left' as const } : {}) })); onStatus?.('Logo: set for this specification'); };
    r.readAsDataURL(file);
  };
  const dropDetail = (id: string) => { const n = fieldUses(doc, `detail.${id}`); save(removeDetail(doc, id)); if (n) onStatus?.(`Detail removed — ${n} clause${n === 1 ? '' : 's'} used it and now show DATA REQUIRED (undo to bring it back)`); };
  const pick = (id: string | null) => { setClauseId(id); caret.current = null; };
  const commitText = (id: string, text: string) => { const c = section.clauses.find((x) => x.id === id); if (c && c.text !== text) save(withClause(doc, section.id, id, { text })); };
  const add = (kind: SpecKind) => {
    const text = kind === 'heading' ? 'New heading' : kind === 'note' ? 'Note: ' : 'New clause.';
    const next = addClause(doc, section.id, kind, text, clause?.id);
    const before = new Set(section.clauses.map((c) => c.id));
    save(next);
    pick(next.sections.find((s) => s.id === section.id)!.clauses.find((c) => !before.has(c.id))!.id);
  };
  const setKind = (kind: SpecKind) => { if (clause && clause.kind !== kind) save(withClause(doc, section.id, clause.id, { kind })); };
  const insertField = (key: string) => {
    if (!clause || !key) return;
    const now = editor.current?.value ?? clause.text, at = caret.current ?? now.length;
    save(withClause(doc, section.id, clause.id, { text: `${now.slice(0, at)}{{${key}}}${now.slice(at)}` }));
    caret.current = at + key.length + 4;
  };
  const addNewSection = () => {
    const next = addSection(doc, 'New section');
    save(next);
    setSectionId(next.sections[next.sections.length - 1].id); pick(null); setRenaming(true);
  };
  const dropSection = () => {
    if (doc.sections.length < 2) return;
    const rest = removeSection(doc, section.id);
    save(rest);
    setSectionId(rest.sections[0].id); pick(null);
  };
  const rename = (v: string) => { setRenaming(false); if (v.trim() && v.trim() !== section.title) save(withSectionTitle(doc, section.id, v)); };
  const startOver = () => { save(starterSpec()); setSectionId('S1'); pick(null); onStatus?.('Specification: the starter wording is back (undo to return to yours)'); };

  if (!section || !block) return <div className="spx"><style>{CSS}</style><h3>Specification</h3><p className="spx-note">No sections.</p></div>;
  const numberOf = (id: string) => view.blocks.find((b) => b.id === id)?.no ?? '–';
  const keep = (e: { currentTarget: HTMLTextAreaElement }) => { caret.current = e.currentTarget.selectionStart; };

  return (
    <div className="spx">
      <style>{CSS}</style>
      <h3>Specification</h3>
      <p className="spx-note">The project specification, electrical and ELV. Tick the sections, edit the clauses in your own wording, and put project values in a clause as fields — they follow the design. The starter text is plain wording to edit, not text of any standard. Export Word gives a file to finish in Word; Export PDF a black-and-white document.</p>

      <PageRibbon label="Specification tools" tab={tab} onTab={setTab} tabs={[{ id: 'file', name: 'File' }, { id: 'home', name: 'Home' }, { id: 'setup', name: 'Specification' }, { id: null, name: 'Insert' }, { id: null, name: 'Review' }]}>
        {tab === 'file' ? (
          <>
            <Group name="Specification">
              <Big icon={FilePlus2} label="Starter wording" onClick={startOver} />
              <Rows>
                <Small icon={FolderOpen} label="Open specification" onClick={() => specFile.current?.click()} />
                <Small icon={Save} label="Save specification as" onClick={() => void saveSpecFile()} />
                <Small icon={FileText} label="Open Word document" onClick={() => wordFile.current?.click()} />
              </Rows>
            </Group>
            <Group name="Templates">
              <Big icon={LibraryBig} label="Templates" onClick={() => setPanel(panel === 'library' ? null : 'library')} />
              <Big icon={BookmarkPlus} label="Save as template" onClick={() => { setTplKind(clause ? 'clauses' : 'section'); setPanel(panel === 'save' ? null : 'save'); }} />
            </Group>
            <Group name="Sections">
              <Big icon={Plus} label="Add section" onClick={addNewSection} />
              <Rows>
                <Small icon={Pencil} label="Rename section" onClick={() => setRenaming(true)} />
                <Small icon={Trash2} label="Delete section" onClick={dropSection} disabled={doc.sections.length < 2} />
                <Small icon={ArrowUp} label="Move section up" onClick={() => save(moveSection(doc, section.id, -1))} disabled={doc.sections[0].id === section.id} />
                <Small icon={ArrowDown} label="Move section down" onClick={() => save(moveSection(doc, section.id, 1))} disabled={doc.sections[doc.sections.length - 1].id === section.id} />
                <Small icon={Paperclip} label="Appendix" onClick={() => save(withAppendix(doc, section.id, !section.appendix))} pressed={!!section.appendix} />
              </Rows>
            </Group>
            <Group name="Output">
              <Big icon={FileText} label="Export Word" onClick={() => void exportAs('docx')} disabled={busy || !included} />
              <Big icon={FileType} label="Export PDF" onClick={() => void exportAs('pdf')} disabled={busy || !included} />
            </Group>
          </>
        ) : tab === 'setup' ? (
          <>
            <Group name="Information">
              <Big icon={ListPlus} label="Add detail" onClick={() => save(addDetail(doc))} />
            </Group>
            <Group name="Logo">
              <Big icon={ImagePlus} label="Choose logo" onClick={() => logoFile.current?.click()} />
              <Big icon={ImageMinus} label="Use project logo" onClick={() => save(withSetup(doc, { logo: undefined }))} disabled={!doc.setup?.logo} />
            </Group>
            <Group name="Pages">
              <Rows>
                <Small icon={BookOpen} label="Cover page" onClick={() => save(withCover(doc, { on: !setup.cover.on }))} pressed={setup.cover.on} />
                <Small icon={TableOfContents} label="Contents page" onClick={() => save(withContents(doc, { on: !setup.contents.on }))} pressed={setup.contents.on} />
              </Rows>
            </Group>
            <Group name="Page">
              <Big icon={RotateCcw} label="Default page setup" onClick={() => save({ ...doc, setup: doc.setup?.logo ? { logo: doc.setup.logo } : undefined })} disabled={!doc.setup} />
            </Group>
            <Group name="Output">
              <Big icon={FileText} label="Export Word" onClick={() => void exportAs('docx')} disabled={busy || !included} />
              <Big icon={FileType} label="Export PDF" onClick={() => void exportAs('pdf')} disabled={busy || !included} />
            </Group>
          </>
        ) : (
          <>
            <Group name="Clipboard">
              <Big icon={ClipboardPaste} label="Paste" />
              <Rows>
                <Small icon={Scissors} label="Cut" />
                <Small icon={Copy} label="Copy" />
                <Small icon={Paintbrush} label="Copy format" />
              </Rows>
            </Group>
            <Group name="Font">
              <Icons>
                <IconTool icon={Bold} label="Bold" />
                <IconTool icon={Italic} label="Italic" />
                <IconTool icon={Underline} label="Underline" />
                <IconTool icon={PaintBucket} label="Highlight" />
                <IconTool icon={Baseline} label="Text colour" />
                <IconTool icon={AlignLeft} label="Align left" />
              </Icons>
            </Group>
            <Group name="Clauses">
              <Big icon={ListOrdered} label="Add clause" onClick={() => add('clause')} />
              <Rows>
                <Small icon={Heading2} label="Add heading" onClick={() => add('heading')} />
                <Small icon={StickyNote} label="Add note" onClick={() => add('note')} />
                <Small icon={ArrowUp} label="Move up" onClick={clause ? () => save(moveClause(doc, section.id, clause.id, -1)) : undefined} disabled={!clause || section.clauses[0].id === clause.id} />
                <Small icon={ArrowDown} label="Move down" onClick={clause ? () => save(moveClause(doc, section.id, clause.id, 1)) : undefined} disabled={!clause || section.clauses[section.clauses.length - 1].id === clause.id} />
                <Small icon={Trash2} label="Delete clause" onClick={clause ? () => { save(removeClause(doc, section.id, clause.id)); pick(null); } : undefined} disabled={!clause} />
                <Small icon={IndentIncrease} label="Indent" onClick={clause ? () => save(indentClause(doc, section.id, clause.id, 1)) : undefined} disabled={!clause || (clause.level ?? 0) >= maxLevel(clause.kind)} />
                <Small icon={IndentDecrease} label="Outdent" onClick={clause ? () => save(indentClause(doc, section.id, clause.id, -1)) : undefined} disabled={!clause || !(clause.level ?? 0)} />
                <Small icon={SeparatorHorizontal} label="Page break" onClick={clause ? () => save(withClause(doc, section.id, clause.id, { breakBefore: !clause.breakBefore })) : undefined} disabled={!clause} pressed={!!clause?.breakBefore} />
                <Small icon={List} label="Bullets" />
              </Rows>
            </Group>
            <Group name="Styles">
              <Rows>
                <Small icon={Heading1} label="Clause heading" onClick={clause && !isBlock ? () => setKind('heading') : undefined} disabled={!clause || isBlock} pressed={clause?.kind === 'heading'} />
                <Small icon={Pilcrow} label="Clause" onClick={clause && !isBlock ? () => setKind('clause') : undefined} disabled={!clause || isBlock} pressed={clause?.kind === 'clause'} />
                <Small icon={StickyNote} label="Note" onClick={clause && !isBlock ? () => setKind('note') : undefined} disabled={!clause || isBlock} pressed={clause?.kind === 'note'} />
              </Rows>
            </Group>
            <Group name="Tables and pictures">
              <Big icon={TableIcon} label="Add table" onClick={() => addBlock('table', { table: { rows: [['', '', ''], ['', '', ''], ['', '', '']] } }, 'Table added: 3 × 3')} />
              <Rows>
                <Small icon={ClipboardPaste} label="Paste cells" onClick={pasteCells} />
                <Small icon={ImageIcon} label="Add picture" onClick={() => picFile.current?.click()} />
              </Rows>
              {(project.sheets?.sheets.length ?? 0) > 0 && (
                <select className="spx-insert" aria-label="Table from sheet" value="" title="Copy one of the project's sheets into the text as a table" onChange={(e) => fromSheet(e.target.value)}>
                  <option value="">Table from sheet…</option>
                  {project.sheets!.sheets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
            </Group>
            <Group name="Project data">
              <Rows><Small icon={Link2} label="Link values" onClick={() => { setLinkOff(new Set()); setPanel(panel === 'link' ? null : 'link'); }} pressed={panel === 'link'} /></Rows>
              <Braces size={26} aria-hidden style={{ color: 'var(--acc)' }} />
              <select className="spx-insert" aria-label="Insert field" value="" disabled={!clause || isBlock} title={clause ? 'Put a project value in the clause being edited' : 'Click a clause first'} onChange={(e) => insertField(e.target.value)}>
                <option value="">Insert field…</option>
                {[...new Set(fields.map((f) => f.group))].map((g) => <optgroup key={g} label={g}>{fields.filter((f) => f.group === g).map((f) => <option key={f.key} value={f.key}>{f.label}{f.value === undefined ? ' — not set' : ` — ${f.value}`}</option>)}</optgroup>)}
              </select>
            </Group>
            <Group name="Editing">
              <Rows>
                <Small icon={Search} label="Find and replace" />
                <Small icon={Undo2} label="Undo" onClick={onUndo} />
              </Rows>
            </Group>
            <Group name="Output">
              <Big icon={FileText} label="Export Word" onClick={() => void exportAs('docx')} disabled={busy || !included} />
            </Group>
          </>
        )}
      </PageRibbon>

      <div className="spx-strip">
        <span>Document: <b>{doc.title}</b>{info.number?.trim() ? <> · {info.number.trim()}</> : null}{info.status?.trim() ? <> · {info.status.trim()}</> : null}</span>
        <span>{setup.cover.on ? 'Cover page' : 'No cover page'} · {setup.contents.on ? 'contents page' : 'no contents page'}</span>
        <span>{setup.paper} {setup.landscape ? 'landscape' : 'portrait'}{setup.watermark ? <> · watermark <b>{setup.watermark}</b></> : null}</span>
        <span>{included} of {doc.sections.length} sections included</span>
        <span>{view.blocks.reduce((n, b) => n + b.lines.reduce((m, l) => m + l.runs.filter((r) => 'field' in r).length, 0), 0)} project values</span>
        {view.missing.length ? <span className="bad">{view.missing.length} missing: {[...new Set(view.missing.map((m) => m.label))].join(', ')}</span> : <span>None missing</span>}
      </div>

      <input ref={picFile} type="file" accept="image/png,image/jpeg" aria-label="Picture file" hidden onChange={(e) => { addPicture(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
      <input ref={logoFile} type="file" accept="image/png,image/jpeg" aria-label="Logo picture" hidden onChange={(e) => { readLogo(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
      <input ref={specFile} type="file" accept={`.${SPEC_FILE_EXT},application/json`} aria-label="Specification file" hidden onChange={(e) => { void openSpecFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
      {panel === 'save' && tab !== 'setup' && (
        <section className="spx-card" aria-label="Save as template">
          <h4>Save as template</h4>
          <div className="spx-form" style={{ maxWidth: 640 }}>
            <label>What to save</label>
            <select aria-label="What to save" value={tplKind} onChange={(e) => setTplKind(e.target.value as SpecTemplateKind)}>
              <option value="clauses">{clause ? (clause.kind === 'heading' ? 'The selected heading with its clauses' : 'The selected line') : 'A heading with its clauses (click one first)'}</option>
              <option value="section">This section — {section.title}</option>
              <option value="spec">The whole specification, with its page setup</option>
            </select>
            <label>Template name</label>
            <input aria-label="Template name" value={tplName} placeholder="e.g. MCCB — moulded case circuit breakers" onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveTemplate(); }} />
          </div>
          <div className="spx-blk-tools">
            <button type="button" onClick={saveTemplate} disabled={!!tplError}>Save template</button>
            <button type="button" onClick={() => setPanel(null)}>Close</button>
            <span>{tplName && tplError ? tplError : 'Fields stay fields: the template fills in from the project it is used in. A template of the same name and kind is replaced.'}</span>
          </div>
        </section>
      )}
      <input ref={wordFile} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Word document" hidden onChange={(e) => { void openWord(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
      {panel === 'link' && tab !== 'setup' && (
        <section className="spx-card" aria-label="Link values to the project">
          <h4>Link values to the project</h4>
          {suggestions.length === 0 && <p className="spx-note">No project value is typed in the wording. Where a clause should follow the project, click it and use Insert field.</p>}
          {suggestions.map((x) => (
            <label key={x.key} className="spx-tick">
              <input type="checkbox" aria-label={`Link ${x.label}`} checked={!linkOff.has(x.key)} onChange={(e) => { const next = new Set(linkOff); if (e.target.checked) next.delete(x.key); else next.add(x.key); setLinkOff(next); }} />
              <span><b>{x.value}</b> → {x.label} <span className="spx-note">· typed in {x.count} place{x.count === 1 ? '' : 's'}</span></span>
            </label>
          ))}
          <p className="spx-note">A linked value becomes a field: it then changes with the project, and shows DATA REQUIRED if the project loses it. Untick a value that only happens to be the same (a rating that is not this board’s). Whole words only; fields already in the text are left alone.</p>
          <div className="spx-blk-tools">
            <button type="button" onClick={linkChosen} disabled={suggestions.every((x) => linkOff.has(x.key))}>Link the ticked values</button>
            <button type="button" onClick={() => setPanel(null)}>Close</button>
          </div>
        </section>
      )}
      {panel === 'library' && tab !== 'setup' && (
        <section className="spx-card" aria-label="Templates">
          <h4>Templates</h4>
          {templates.length === 0 && <p className="spx-note">No templates yet. Write a product specification once — a heading with its clauses, a section or the whole document — then use Save as template.</p>}
          {templates.map((t) => (
            <div key={t.id} className="spx-tpl">
              <span><b>{t.name}</b><br /><span className="spx-note">{TEMPLATE_KINDS[t.kind]} · {templateSummary(t)} · saved {t.updatedAt}</span></span>
              <button type="button" aria-label={`Use template ${t.name}`} onClick={() => putTemplate(t)}>{t.kind === 'spec' ? 'Replace specification' : t.kind === 'section' ? 'Add after this section' : 'Add here'}</button>
              <button type="button" aria-label={`Delete template ${t.name}`} title="Delete this template from the library" onClick={() => { if (keepTemplates(removeTemplate(templates, t.id))) onStatus?.(`Template deleted: ${t.name}`); }}><Trash2 size={15} aria-hidden /></button>
            </div>
          ))}
          <p className="spx-note">Clauses go in after the clause being edited (at the end of the section when none). The library is kept on this computer and synced with your LV Database library file.</p>
          <div className="spx-blk-tools"><button type="button" onClick={() => setPanel(null)}>Close</button></div>
        </section>
      )}
      {tab === 'setup' ? (
        <div className="spx-setup">
          <section className="spx-card" aria-label="Document and parties">
            <h4>Document and parties</h4>
            <div className="spx-form">
              <label>Document title</label><Entry label="Document title" value={doc.title} onSave={(v) => save(withTitle(doc, v))} />
              <label>Document number</label><Entry label="Document number" value={info.number ?? ''} onSave={(v) => save(withInfo(doc, { number: v }))} />
              <label>Status</label><Entry label="Status" value={info.status ?? ''} placeholder="e.g. For tender" onSave={(v) => save(withInfo(doc, { status: v }))} />
              {SPEC_PARTIES.map((x) => { const from = x.from(project)?.trim(); return [<label key={`${x.key}l`}>{x.label}</label>, <Entry key={x.key} label={x.label} value={info[x.key] ?? ''} placeholder={from ? `From the project: ${from}` : undefined} onSave={(v) => save(withInfo(doc, { [x.key]: v }))} />]; })}
            </div>
            <p className="spx-note">A party left blank is read from the project information where the project has it. Each of these is a field you can put in a clause, the header or the footer.</p>
          </section>

          <section className="spx-card" aria-label="Additional details">
            <h4>Additional details</h4>
            {(info.details ?? []).length === 0 && <p className="spx-note">None yet. Use Add detail for anything else the document needs — plot number, contract number, authority, a second consultant.</p>}
            {(info.details ?? []).map((d) => (
              <div key={d.id} className="spx-det">
                <Entry label={`Detail ${d.id} name`} value={d.name} placeholder="Name" onSave={(v) => save(withDetail(doc, d.id, { name: v }))} />
                <Entry label={`Detail ${d.id} value`} value={d.value} placeholder="Value" onSave={(v) => save(withDetail(doc, d.id, { value: v }))} />
                <button type="button" aria-label={`Remove detail ${d.name || d.id}`} title="Remove this detail" onClick={() => dropDetail(d.id)}><Trash2 size={16} aria-hidden /></button>
                <span className="spx-key">Field: {'{{'}detail.{d.id}{'}}'}</span>
              </div>
            ))}
            <p className="spx-note">Details with a value print under the title on the first page, after the parties.</p>
          </section>

          <section className="spx-card" aria-label="Cover page and contents page">
            <h4>Cover page and contents page</h4>
            <label className="spx-tick"><input type="checkbox" checked={setup.cover.on} onChange={(e) => save(withCover(doc, { on: e.target.checked }))} /> Cover page</label>
            <div className="spx-sub">
              {([['logo', 'Logo'], ['parties', 'Parties'], ['details', 'Additional details'], ['revisions', 'Revision table']] as const).map(([k, l]) => (
                <label key={k} className="spx-tick"><input type="checkbox" disabled={!setup.cover.on} checked={setup.cover[k]} aria-label={`Cover: ${l}`} onChange={(e) => save(withCover(doc, { [k]: e.target.checked }))} /> {l}</label>
              ))}
            </div>
            <div className="spx-form"><label>Note on the cover</label><Entry label="Note on the cover" value={doc.setup?.cover?.note ?? ''} placeholder="Blank for none" onSave={(v) => save(withCover(doc, { note: v.trim() || undefined }))} /></div>
            <label className="spx-tick"><input type="checkbox" checked={setup.contents.on} onChange={(e) => save(withContents(doc, { on: e.target.checked }))} /> Contents page</label>
            <div className="spx-sub">
              <label className="spx-tick"><input type="checkbox" disabled={!setup.contents.on} checked={setup.contents.headings} onChange={(e) => save(withContents(doc, { headings: e.target.checked }))} /> List the clause headings</label>
              <label className="spx-tick"><input type="checkbox" disabled={!setup.contents.on} checked={setup.contents.pageNumbers} onChange={(e) => save(withContents(doc, { pageNumbers: e.target.checked }))} /> Page numbers</label>
            </div>
            <p className="spx-note">The cover shows the title, the project, the document number, status and revision, with no header or footer. The revision table lists the project’s issued revisions ({specRevisionRows(project).length || 'none yet'}) until the specification has revisions of its own. In the Word file the contents page numbers are Word fields: Word fills them in when the file is opened.</p>
          </section>

          <section className="spx-card" aria-label="Page setup">
            <h4>Page setup</h4>
            <div className="spx-form">
              <label>Paper</label>
              <select aria-label="Paper" value={setup.paper} onChange={(e) => save(withSetup(doc, { paper: e.target.value as SpecPaper }))}><option value="A4">A4</option><option value="A3">A3</option></select>
              <label>Orientation</label>
              <select aria-label="Orientation" value={setup.landscape ? 'landscape' : 'portrait'} onChange={(e) => save(withSetup(doc, { landscape: e.target.value === 'landscape' }))}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
              <label>Margins, mm</label>
              <div className="spx-four">{MARGINS.map((m) => <Entry key={m} type="number" label={`Margin ${m}`} value={String(setup.marginsMm[m])} onSave={(v) => setMargin(m, v)} />)}</div>
            </div>
            <p className="spx-note">Margins in the order top, right, bottom, left; each between 5 and 60 mm. The header and footer print inside the top and bottom margins.</p>
          </section>

          <section className="spx-card" aria-label="Header, footer, logo and watermark">
            <h4>Header, footer, logo and watermark</h4>
            <div className="spx-form">
              <label>Header</label>
              <div className="spx-three">{SIDES.map((side, i) => <Entry key={side} label={`Header ${side}`} value={setup.header[i]} placeholder={side} onSave={(v) => setSlot('header', i, v)} />)}</div>
              <label>Footer</label>
              <div className="spx-three">{SIDES.map((side, i) => <Entry key={side} label={`Footer ${side}`} value={setup.footer[i]} placeholder={side} onSave={(v) => setSlot('footer', i, v)} />)}</div>
              <label>Logo</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                {setup.logo ? <img className="spx-logo" src={setup.logo} alt="Logo" /> : <span className="spx-note">No logo — use Choose logo</span>}
                {setup.logo && <span className="spx-note">{doc.setup?.logo ? 'This specification’s own' : 'The project’s company logo'}</span>}
              </div>
              <label>Logo position</label>
              <select aria-label="Logo position" value={setup.logoPlace} onChange={(e) => save(withSetup(doc, { logoPlace: e.target.value as SpecLogoPlace }))}>{LOGO_PLACES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <label>Watermark</label><Entry label="Watermark" value={doc.setup?.watermark ?? ''} placeholder="e.g. DRAFT — blank for none" onSave={(v) => save(withSetup(doc, { watermark: v.trim() || undefined }))} />
            </div>
            <p className="spx-note">Left, centre and right. Use any field, and {'{{'}page{'}}'} and {'{{'}pages{'}}'} for page numbers — the default footer is “{SPEC_SETUP.footer[2]}”. The logo takes the place of the text at its position. The watermark prints light grey behind the text of every page.</p>
            <div className="spx-paper" aria-label="Header and footer as printed" style={{ padding: '14px 18px' }}>
              <div className="spx-head">{setup.header.map((x, i) => <span key={i}>{setup.logo && setup.logoPlace === `header-${['left', 'center', 'right'][i]}` ? '[logo]' : slotText(x, doc, project)}</span>)}</div>
              <div className="spx-foot" style={{ marginTop: 6 }}>{setup.footer.map((x, i) => <span key={i}>{setup.logo && setup.logoPlace === `footer-${['left', 'center', 'right'][i]}` ? '[logo]' : slotText(x, doc, project)}</span>)}</div>
            </div>
          </section>
        </div>
      ) : (
      <div className="spx-cols">
        <section className="spx-card" aria-label="Sections">
          <h4>Sections</h4>
          {doc.sections.map((s) => (
            <div key={s.id} className={`spx-sec${s.id === section.id ? ' on' : ''}${s.included ? ' in' : ''}`}>
              <input type="checkbox" checked={s.included} aria-label={`Include ${s.title}`} onChange={(e) => save(withSectionIncluded(doc, s.id, e.target.checked))} />
              {renaming && s.id === section.id
                ? <input type="text" aria-label="Section title" autoFocus defaultValue={s.title} style={{ flex: 1, minWidth: 0, width: 'auto', height: 28 }}
                    onKeyDown={(e) => { if (e.key === 'Enter') rename(e.currentTarget.value); else if (e.key === 'Escape') setRenaming(false); }} onBlur={(e) => rename(e.currentTarget.value)} />
                : <button type="button" aria-current={s.id === section.id} onClick={() => { setSectionId(s.id); pick(null); setRenaming(false); }}><span className="spx-sec-n">{numberOf(s.id)}</span><span className="spx-sec-t">{s.title}</span></button>}
            </div>
          ))}
          <p className="spx-note">Tick a section to include it. Clauses renumber by themselves. An appendix is lettered and goes after the numbered sections.</p>
        </section>

        <div className="spx-paper" aria-label={`Section ${section.title}`} tabIndex={0} onPaste={onPaste}>
          <div className="spx-head">{setup.header.map((x, i) => <span key={i}>{setup.logo && setup.logoPlace === `header-${['left', 'center', 'right'][i]}` ? '[logo]' : slotText(x, doc, project)}</span>)}</div>
          <h5>{block.heading}</h5>
          {!section.included && <p className="spx-off">This section is not included in the specification. Tick it in the list to include it.</p>}
          {block.lines.length === 0 && <p className="spx-off">No clauses yet. Use Add clause.</p>}
          {block.lines.map((l) => {
            const c = section.clauses.find((x) => x.id === l.id)!;
            const sel = l.id === clauseId;
            if (l.table || l.image) {
              const t = c.table, [nr, nc] = t ? tableSize(t) : [0, 0], at = sel ? cell : null;
              return (
                <div key={l.id} data-clause={l.id} className={`spx-line blk${sel ? ' sel' : ''}${l.breakBefore ? ' brk' : ''}`} onClick={() => { if (!sel) { pick(l.id); setCell_(null); } }}>
                  {sel
                    ? <input key={`${c.id}:${c.text}`} className="spx-capin" aria-label={`${l.label} caption`} defaultValue={c.text} placeholder={`${l.label} — caption (optional)`} onBlur={(e) => commitText(c.id, e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                    : l.table && <div className="spx-cap">{captionText(l)}</div>}
                  {l.table && t && (
                    <table className="spx-tb" aria-label={l.label}>
                      <tbody>
                        {t.rows.map((row, r) => (
                          <tr key={r}>{row.map((v, k) => {
                            const Tag = l.table!.header && r === 0 ? 'th' : 'td';
                            return <Tag key={k}>{sel ? <input key={`${r}:${k}:${v}`} aria-label={`${l.label} row ${r + 1} column ${k + 1}`} defaultValue={v} onFocus={() => setCell_([r, k])} onBlur={(e) => { if (e.currentTarget.value !== v) setTable(c, setCell(t, r, k, e.currentTarget.value)); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /> : v}</Tag>;
                          })}</tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {l.image && <img className="spx-pic" src={l.image.src} alt={captionText(l)} style={{ width: `${l.image.widthPct}%` }} />}
                  {!sel && l.image && <div className="spx-cap">{captionText(l)}</div>}
                  {sel && t && (
                    <div className="spx-blk-tools" aria-label="Table tools">
                      <button type="button" onClick={() => setTable(c, addRow(t, at?.[0]))}><Rows3 size={13} aria-hidden /> Add row</button>
                      <button type="button" onClick={() => setTable(c, addCol(t, at?.[1]))}><Columns3 size={13} aria-hidden /> Add column</button>
                      <button type="button" disabled={!at || nr <= 1} onClick={() => { setTable(c, deleteRow(t, at![0])); setCell_(null); }}>Delete row</button>
                      <button type="button" disabled={!at || nc <= 1} onClick={() => { setTable(c, deleteCol(t, at![1])); setCell_(null); }}>Delete column</button>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={l.table!.header} onChange={(e) => setTable(c, { ...t, header: e.target.checked })} /> Header row</label>
                      <span>{nr} × {nc}{at ? ` · row ${at[0] + 1}, column ${at[1] + 1}` : ' · click a cell for row and column tools'}</span>
                    </div>
                  )}
                  {sel && c.image && (
                    <div className="spx-blk-tools" aria-label="Picture tools">
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Width
                        <select aria-label="Picture width" value={l.image!.widthPct} onChange={(e) => save(withClause(doc, section.id, c.id, { image: { ...c.image!, widthPct: Number(e.target.value) } }))}>
                          {[25, 40, 50, 60, 75, 100].map((w) => <option key={w} value={w}>{w} % of the text width</option>)}
                        </select>
                      </label>
                      <span>{c.image.w} × {c.image.h} pixels</span>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div key={l.id} data-clause={l.id} className={`spx-line ${KIND_CLASS[l.kind]}${sel ? ' sel' : ''}${l.level ? ` l${l.level}` : ''}${l.breakBefore ? ' brk' : ''}`} onClick={() => { if (!sel) pick(l.id); }}>
                <span>{l.no}</span>
                {sel
                  ? <textarea ref={editor} key={`${c.id}:${c.text}`} aria-label={`Edit clause ${l.no}`} defaultValue={c.text} autoFocus spellCheck
                      onSelect={keep} onKeyUp={keep} onClick={keep} onBlur={(e) => { keep(e); commitText(c.id, e.currentTarget.value); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.value = c.text; pick(null); } }} />
                  : <span>{l.runs.map((r, i) => ('text' in r ? <span key={i}>{r.text}</span> : r.value !== undefined ? <span key={i} className="spx-f" title={`Project value: ${r.label}`}>{r.value}</span> : <span key={i} className="spx-m" title={`The project has no value for: ${r.label}`}>DATA REQUIRED: {r.label}</span>))}</span>}
              </div>
            );
          })}
        </div>

        <section className="spx-card" aria-label="Project fields in this section">
          <h4>Project fields in this section</h4>
          {used.length === 0 && <p className="spx-note">No project values in this section yet. Click a clause, then Insert field.</p>}
          {used.map((k) => { const f = fields.find((x) => x.key === k); return <div key={k} className="spx-field"><span>{f?.label ?? k}</span>{f?.value !== undefined ? <b>{f.value}</b> : <span className="bad">Not set</span>}</div>; })}
          <p className="spx-note">A value that is not set shows as DATA REQUIRED on the page. Set it in the project and it fills in here. In a clause, a field is written as {'{{'}key{'}}'}.</p>
        </section>
      </div>
      )}
      <p className="spx-note">Click a clause to edit it; click elsewhere to finish, Esc to cancel. Copy cells in Sheets or Excel, click the page and press Ctrl+V to put them in as a table; a copied picture goes in the same way. Greyed tools come in later stages.</p>
    </div>
  );
}
