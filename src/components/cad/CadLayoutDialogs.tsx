import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui';
import { PrinterSelect } from '../docs/OutputDialogs';
import { canPreviewSheetPdf, PdfPreview } from '../docs/SheetPdfPreview';
import { printerPaper } from '../../docs/layoutPlot';
import { PLAN_LABEL, PLAN_TYPES } from '../../docs/planLayout';
import { drawingLayoutId, LAYOUT_PAPERS, paperName, type DrawingLayout } from '../../model/drawingLayouts';
import type { PlanType } from '../../model/drawingSet';
import { loadLayoutTemplates, parseLayoutTemplate, saveLayoutTemplates, withLayoutTemplate, type LayoutTemplate } from '../../model/layoutTemplates';
import { MORE_SCALES, VP_SCALES } from '../../model/planViewports';
import { safeFileName, saveBinary, savePdf, saveText } from '../../util/files';
import { canPrint, plotPrinter, usePrinters } from '../../util/printers';
import type { ManagerRow } from './cadLayoutManager';

/** Design CAD → Output → Layout: the layout templates (save, new from one, import, export, delete), a layout's paper and
 * the project's scale list for viewports. */

const scalesText = (t: LayoutTemplate) => (t.viewports.length ? `${t.viewports.length} · ${t.viewports.map((v) => (v.scale ? `1:${v.scale}` : 'fit')).join(', ')}` : '0');

/** Layout templates: the library of layouts saved for new ones; a new layout of the drawing or a plan sheet of the level
 * is made from the one picked. */
export function LayoutTemplatesDialog({ current, canSheet, onNew, onStatus, onClose }: {
  /** The layout showing, to save as a template (none on the Model tab). */
  current?: { name: string; make: (name: string) => LayoutTemplate };
  /** A plan sheet of the level can be made (the drawing has a level). */
  canSheet: boolean;
  onNew: (t: LayoutTemplate, as: 'drawing' | PlanType) => void;
  onStatus: (m: string) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState(loadLayoutTemplates);
  const [picked, setPicked] = useState<string | undefined>(list[0]?.id);
  const [name, setName] = useState(current?.name ?? '');
  const [as, setAs] = useState<'drawing' | PlanType>('drawing');
  const file = useRef<HTMLInputElement>(null);
  const t = list.find((x) => x.id === picked);
  const keep = (next: LayoutTemplate[]) => { setList(next); saveLayoutTemplates(next); };
  const save = () => {
    if (!current || !name.trim()) return;
    const made = current.make(name.trim()), next = withLayoutTemplate(list, made);
    keep(next); setPicked(next.find((x) => x.name.toLowerCase() === made.name.toLowerCase())?.id);
    onStatus(`Layout template ${made.name} saved to your library`);
  };
  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 640 }} label="Layout templates">
      <h3>Layout templates <span className="m">your library</span></h3>
      <table className="sched" aria-label="Layout templates">
        <thead><tr><th>Name</th><th>Paper</th><th>Viewports</th><th>Tables</th></tr></thead>
        <tbody>{list.length ? list.map((x) => (
          <tr key={x.id} onClick={() => setPicked(x.id)} aria-selected={picked === x.id} style={{ cursor: 'pointer', fontWeight: picked === x.id ? 600 : undefined }}>
            <td>{x.name}</td><td>{paperName(x.paper)}</td><td>{scalesText(x)}</td><td>{x.tables?.length || '—'}</td>
          </tr>
        )) : <tr><td colSpan={4} className="m">No layout templates yet: open a layout and save it as one.</td></tr>}</tbody>
      </table>
      <div className="cad-devform">
        {current ? <>
          <label>Save this layout as<input aria-label="Template name" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button className="chip" disabled={!name.trim()} onClick={save}>Save as template</button>
        </> : <span className="m">Open a layout tab to save it as a template.</span>}
        {t && <label>New layout as
          <select aria-label="New layout as" value={as} onChange={(e) => setAs(e.target.value as 'drawing' | PlanType)}>
            <option value="drawing">Layout of this drawing</option>
            {PLAN_TYPES.map((p) => <option key={p} value={p} disabled={!canSheet}>{PLAN_LABEL[p]}</option>)}
          </select>
        </label>}
      </div>
      <div className="modal-actions">
        <button className="chip" onClick={onClose}>Close</button>
        <button className="chip" onClick={() => file.current?.click()}>Import…</button>
        <input ref={file} type="file" accept=".json" aria-label="Layout template file" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
          let v: LayoutTemplate | undefined;
          try { v = parseLayoutTemplate(JSON.parse(await f.text())); } catch { v = undefined; }
          if (!v) { onStatus('That file is not a layout template'); return; }
          const next = withLayoutTemplate(list, v);
          keep(next); setPicked(next.find((x) => x.name.toLowerCase() === v!.name.toLowerCase())?.id);
          onStatus(`Layout template ${v.name} imported`);
        }} />
        <button className="chip" disabled={!t} onClick={async () => { if (!t) return; const m = await saveText(`${safeFileName(t.name)}.layout.json`, JSON.stringify(t, null, 2), 'Layout template', 'json', { output: 'layoutTemplate' }); if (m) onStatus(m); }}>Export…</button>
        <button className="chip" disabled={!t} onClick={() => { if (!t) return; const next = list.filter((x) => x.id !== t.id); keep(next); setPicked(next[0]?.id); onStatus(`Layout template ${t.name} deleted`); }}>Delete</button>
        <span className="sp" />
        <button className="chip primary" disabled={!t} onClick={() => { if (!t) return; onNew(t, as); onClose(); }}>New layout</button>
      </div>
    </Modal>
  );
}

/** Layouts of another drawing: the ones ticked are added to this drawing (their paper and viewport frames at their scales,
 * showing this drawing), and can be kept as templates too. */
export function ImportLayoutsDialog({ file, list, onImport, onClose }: { file: string; list: LayoutTemplate[]; onImport: (ticked: LayoutTemplate[], keep: boolean) => void; onClose: () => void }) {
  const [ticked, setTicked] = useState(() => new Set(list.map((_, i) => i)));
  const [keep, setKeep] = useState(false);
  const flip = (i: number, on: boolean) => { const n = new Set(ticked); if (on) n.add(i); else n.delete(i); setTicked(n); };
  const chosen = list.filter((_, i) => ticked.has(i));
  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 640 }} label="Layouts from another drawing">
      <h3>Layouts from another drawing <span className="m">{file}</span></h3>
      <table className="sched" aria-label="Layouts of that drawing">
        <thead><tr><th /><th>Name</th><th>Paper</th><th>Viewports</th></tr></thead>
        <tbody>{list.map((x, i) => (
          <tr key={i}>
            <td><input type="checkbox" aria-label={`Import ${x.name}`} checked={ticked.has(i)} onChange={(e) => flip(i, e.target.checked)} /></td>
            <td>{x.name}</td><td>{paperName(x.paper)}</td><td>{scalesText(x)}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="cad-devform">
        <label><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Also keep them as layout templates (your library)</label>
        <span className="m">Each comes with its paper and its viewport frames at their scales. The viewports show this drawing.</span>
      </div>
      <div className="modal-actions">
        <button className="chip" onClick={onClose}>Cancel</button>
        <span className="sp" />
        <button className="chip primary" disabled={!chosen.length} onClick={() => { onImport(chosen, keep); onClose(); }}>Import {chosen.length} layout{chosen.length === 1 ? '' : 's'}</button>
      </div>
    </Modal>
  );
}

const KIND_TEXT: Record<ManagerRow['kind'], string> = { file: 'Drawing file', drawing: 'Layout', sheet: 'Plan sheet' };

/** Every layout tab of the drawing in one list (LAYOUTMANAGER): open, rename, copy, order and delete them, and give a named
 * page setup to several plan sheets at once. Ticks are kept by tab id; the page does the work and one undo step each. */
export function LayoutManagerDialog({ file, rows, active, setups, onOpen, onRename, onCopy, onMove, onDelete, onApplySetup, onNew, onClose }: {
  file: string;
  rows: ManagerRow[];
  /** The tab showing (null: Model). */
  active: string | null;
  setups: { id: string; name: string }[];
  onOpen: (id: string) => void;
  /** Rename a layout; the error to show when it cannot be. */
  onRename: (id: string, name: string) => string | undefined;
  onCopy: (ids: string[]) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (ids: string[]) => void;
  onApplySetup: (setupId: string, ids: string[]) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [setupId, setSetupId] = useState(setups[0]?.id ?? '');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { if (renaming?.id) { field.current?.focus(); field.current?.select(); } }, [renaming?.id]);
  const picked = rows.filter((r) => ticked.has(r.id)), one = picked.length === 1 ? picked[0] : undefined;
  const flip = (id: string, on: boolean) => { const n = new Set(ticked); if (on) n.add(id); else n.delete(id); setTicked(n); };
  const sameKind = one ? rows.filter((r) => r.kind === one.kind) : [];
  const at = one ? sameKind.indexOf(one) : -1;
  const sheets = picked.filter((r) => r.kind === 'sheet').length, usable = setups.some((x) => x.id === setupId);
  const startRename = () => { if (one && one.kind !== 'file') { setError(''); setRenaming({ id: one.id, name: one.kind === 'sheet' ? one.name.replace(/^.*? — /, '') : one.name }); } };
  const finishRename = () => {
    if (!renaming) return;
    const e = onRename(renaming.id, renaming.name);
    if (e) { setError(e); return; }
    if (renaming.id.startsWith('dwg:')) { const n = new Set(ticked); if (n.delete(renaming.id)) n.add(drawingLayoutId(renaming.name.trim())); setTicked(n); }
    setError(''); setRenaming(null);
  };
  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 940 }} label="Layout manager">
      <h3>Layout manager <span className="m">{file}</span></h3>
      <div style={{ overflowX: 'auto' }}><table className="sched" aria-label="Layouts of this drawing">
        <thead><tr><th /><th>Layout</th><th>Kind</th><th>Paper</th><th>Shows</th><th>Page setup</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} aria-current={r.id === active ? 'true' : undefined} onDoubleClick={(e) => { if (renaming || (e.target as HTMLElement).closest('input')) return; onOpen(r.id); onClose(); }}>
            <td><input type="checkbox" aria-label={`Pick ${r.name}`} checked={ticked.has(r.id)} disabled={r.kind === 'file'} title={r.kind === 'file' ? 'As saved in the drawing file: open it, plot it or save it as a template from its tab' : undefined} onChange={(e) => flip(r.id, e.target.checked)} /></td>
            <td>{renaming?.id === r.id
              ? <input ref={field} aria-label="New name" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); finishRename(); } else if (e.key === 'Escape') { e.preventDefault(); setError(''); setRenaming(null); } }} />
              : <>{r.name}{r.id === active && <span className="m"> · current</span>}</>}</td>
            <td>{KIND_TEXT[r.kind]}</td><td>{r.paper}</td><td>{r.shows}</td><td>{r.setup}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {error && <p className="m" role="alert">⚠ {error}</p>}
      <div className="cad-devform" style={{ display: 'flex', flexWrap: 'wrap', paddingTop: 8 }}>
        <button className="chip" disabled={!one} title={one ? 'Open the layout ticked' : 'Tick one layout to open it (double-click a row opens it too)'} onClick={() => { if (one) { onOpen(one.id); onClose(); } }}>Open</button>
        <button className="chip" disabled={!one} title={one ? 'Give the layout ticked another name' : 'Tick one layout to rename it'} onClick={startRename}>Rename…</button>
        <button className="chip" disabled={!picked.length} title={picked.length ? 'A copy of each layout ticked' : 'Tick the layouts to copy'} onClick={() => onCopy(picked.map((r) => r.id))}>Copy</button>
        <button className="chip" disabled={!one || at <= 0} title={!one ? 'Tick one layout to move it' : at <= 0 ? 'It is the first of its kind' : 'One place earlier among its kind'} onClick={() => { if (one) onMove(one.id, -1); }}>Move up</button>
        <button className="chip" disabled={!one || at < 0 || at >= sameKind.length - 1} title={!one ? 'Tick one layout to move it' : at >= sameKind.length - 1 ? 'It is the last of its kind' : 'One place later among its kind'} onClick={() => { if (one) onMove(one.id, 1); }}>Move down</button>
        <button className="chip" disabled={!picked.length} title={picked.length ? 'Delete the layouts ticked (⌘Z undoes it)' : 'Tick the layouts to delete'} onClick={() => { onDelete(picked.map((r) => r.id)); setTicked(new Set()); }}>Delete</button>
      </div>
      <div className="cad-devform" style={{ gridTemplateColumns: 'minmax(0, 320px) auto 1fr', alignItems: 'end' }}>
        <label>Page setup
          <select aria-label="Page setup to apply" value={setupId} disabled={!setups.length} onChange={(e) => setSetupId(e.target.value)}>
            {setups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <button className="chip" disabled={!usable || !sheets} title={!setups.length ? 'No named page setups yet: Output → Page setups' : !sheets ? 'Page setups are for plan sheets: tick one or more; a layout made here has its paper only' : 'Give the page setup to the plan sheets ticked'} onClick={() => onApplySetup(setupId, picked.map((r) => r.id))}>Apply to ticked</button>
        {!setups.length && <span className="m">No named page setups yet: Output → Page setups</span>}
      </div>
      <div className="modal-actions">
        <button className="chip" onClick={onNew}>New layout</button>
        <span className="sp" />
        <button className="chip primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

/** Plot a layout of the drawing (the file's own or one made here) to PDF or a printer, black-and-white, on its own paper. */
export function LayoutPlotDialog({ name, about, paper, html, fileName, onStatus, onClose }: {
  name: string;
  /** The layout's paper and viewports in a line (shown beside the printer). */
  about: string;
  /** The paper (mm). */
  paper: [number, number];
  /** The page to plot; called only when plotting or previewing. */
  html: () => string;
  fileName: string;
  onStatus: (m: string) => void;
  onClose: () => void;
}) {
  const printers = usePrinters();
  const [printer, setPrinter] = useState(plotPrinter());
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const pp = printerPaper(paper[0], paper[1]);
  async function go() {
    setBusy(true);
    try {
      if (printer) {
        await window.gfde.files.printHtml!({ html: html(), deviceName: printer, copies, ...pp });
        onStatus(`Sent ${name} to ${printer}${copies > 1 ? `, ${copies} copies` : ''}`);
      } else {
        const toBytes = window.gfde?.files?.pdfBytes;
        const m = toBytes ? await saveBinary(fileName, await toBytes({ html: html(), cssPages: true }), 'PDF', 'pdf', 'application/pdf', { output: 'drawingPdf' }) : await savePdf(fileName, html(), { cssPages: true }, { output: 'drawingPdf' });
        if (m) onStatus(m);
      }
      onClose();
    } catch (e) {
      onStatus(`${printer ? 'Printing' : 'Plot'} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }
  return (<>
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 520 }} label="Plot">
      <h3>Plot <span className="m">{name}</span></h3>
      <div className="cad-devform">
        <PrinterSelect value={printer} onChange={setPrinter} list={printers.list} />
        <span className="m">{about}</span>
        {printer && <label>Copies<input aria-label="Copies" type="number" min={1} max={99} value={copies} onChange={(e) => setCopies(Math.min(99, Math.max(1, Math.round(Number(e.target.value)) || 1)))} /></label>}
        <span className="m">Printing is always black-and-white.{printer && !canPrint() ? ' Printers need the desktop app.' : ''}{printer && !pp ? ' A printer takes A4 to A1 here: this paper plots to PDF.' : ''}</span>
      </div>
      <div className="modal-actions">
        <button className="chip" onClick={onClose}>Cancel</button>
        {canPreviewSheetPdf() && <button className="chip" onClick={() => setPreview(true)}>Preview</button>}
        <span className="sp" />
        <button className="chip primary" disabled={busy || (!!printer && (!canPrint() || !pp))} onClick={() => void go()}>{busy ? 'Plotting…' : printer ? 'Print' : 'Plot PDF'}</button>
      </div>
    </Modal>
    {preview && <PdfPreview title={name} load={async (toBytes) => ({ bytes: await toBytes({ html: html(), cssPages: true }), name: fileName })} onClose={() => setPreview(false)} />}
  </>);
}

/** A layout's paper: the size and orientation; its viewports keep their place and scale. */
export function LayoutPaperDialog({ layout, onSave, onClose }: { layout: DrawingLayout; onSave: (paper: [number, number]) => void; onClose: () => void }) {
  const [w, h] = layout.paper;
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  const hit = LAYOUT_PAPERS.find((p) => (near(w, p.mm[0]) && near(h, p.mm[1])) || (near(w, p.mm[1]) && near(h, p.mm[0])));
  const [id, setId] = useState(hit?.id ?? 'custom');
  const [portrait, setPortrait] = useState(h > w);
  const mm = LAYOUT_PAPERS.find((p) => p.id === id)?.mm;
  const [long, short] = mm ?? [Math.max(w, h), Math.min(w, h)]; // a paper not in the list turns with the orientation too
  const paper: [number, number] = portrait ? [short, long] : [long, short];
  const n = layout.viewports.length;
  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 420 }} label="Page setup">
      <h3>Page setup <span className="m">{layout.name}</span></h3>
      <div className="cad-devform">
        <label>Paper
          <select aria-label="Paper" value={id} onChange={(e) => setId(e.target.value)}>
            {!hit && <option value="custom">{paperName(layout.paper)}</option>}
            {LAYOUT_PAPERS.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
        </label>
        <div className="seg" role="group" aria-label="Orientation">
          <button className={portrait ? undefined : 'on'} aria-pressed={!portrait} onClick={() => setPortrait(false)}>Landscape</button>
          <button className={portrait ? 'on' : undefined} aria-pressed={portrait} onClick={() => setPortrait(true)}>Portrait</button>
        </div>
        <span className="m">{n === 1 ? 'Its viewport keeps its place and scale.' : `Its ${n} viewports keep their place and scale.`}</span>
      </div>
      <div className="modal-actions">
        <button className="chip" onClick={onClose}>Cancel</button>
        <span className="sp" />
        <button className="chip primary" onClick={() => { onSave(paper); onClose(); }}>Save</button>
      </div>
    </Modal>
  );
}

/** The scale list: the scales offered for viewports in this project (SCALELISTEDIT). */
export function ScaleListDialog({ scales, onSave, onClose }: { scales: number[]; onSave: (list: number[]) => void; onClose: () => void }) {
  const [ticked, setTicked] = useState(() => new Set(scales));
  const [extra, setExtra] = useState<number[]>([]);
  const [add, setAdd] = useState('');
  const all = [...new Set([...VP_SCALES, ...MORE_SCALES, ...scales, ...extra])].sort((a, b) => a - b);
  const flip = (k: number, on: boolean) => { const n = new Set(ticked); if (on) n.add(k); else n.delete(k); setTicked(n); };
  const addOne = () => {
    const k = Math.round(Number(add));
    if (!(k > 0) || all.includes(k)) { setAdd(''); return; }
    setExtra([...extra, k]); flip(k, true); setAdd('');
  };
  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 420 }} label="Scale list">
      <h3>Scale list <span className="m">viewport scales of this project</span></h3>
      <div className="pub-list" role="group" aria-label="Scales">
        {all.map((k) => <label key={k}><input type="checkbox" checked={ticked.has(k)} onChange={(e) => flip(k, e.target.checked)} /> 1:{k}</label>)}
      </div>
      <div className="cad-devform">
        <label>Add 1:<input aria-label="New scale" inputMode="numeric" value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOne(); } }} /></label>
        <button className="chip" onClick={addOne}>Add</button>
      </div>
      <div className="modal-actions">
        <button className="chip" onClick={onClose}>Cancel</button>
        <button className="chip" onClick={() => setTicked(new Set(VP_SCALES))}>Standard list</button>
        <span className="sp" />
        <button className="chip primary" disabled={!ticked.size} onClick={() => { onSave(all.filter((k) => ticked.has(k))); onClose(); }}>Save</button>
      </div>
    </Modal>
  );
}
