import { useMemo, useState, type KeyboardEvent } from 'react';
import { ROLE_CATALOGUE, roleById } from '../model/folderRoles';
import {
  acceptAll, chooseRole, insideLeftOut, learnedTemplate, learnRows, rootPattern, rowRole, scanNumbering, SCAN_LIMITS, startChoices,
  type FolderScan, type LearnChoices
} from '../model/folderLearn';
import { assignedRoles, countFolders, type FolderTemplate, type NamingRule } from '../model/folderTemplates';

const NUMBERING_LABEL = { '01_': '01_ two-digit', '1.': '1. number', 'A-': 'A- letters', none: 'none' } as const;
const STEPS = ['1 Choose folder', '2 Review roles', '3 Name & save'];
const GROUPS = [...new Set(ROLE_CATALOGUE.map((r) => r.group))];
const noSubmit = (e: KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') e.preventDefault(); };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Learn from folder (spec C5): choose a job folder, review the suggested roles, name the template. Only
 * folder names are read; nothing in the folder is changed. `onDone` gets the new template and whether it
 * should become the default; the panel saves it and opens it in the editor. */
export default function FolderLearnWizard({ scanFolder, newId, naming, takenNames, onCancel, onDone }: {
  scanFolder: () => Promise<FolderScan | null>;
  newId: () => string;
  naming: NamingRule;
  takenNames: readonly string[];
  onCancel: () => void;
  onDone: (t: FolderTemplate, makeDefault: boolean) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [scan, setScan] = useState<FolderScan | null>(null);
  const [choices, setChoices] = useState<LearnChoices | null>(null);
  const [name, setName] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows = useMemo(() => (scan ? learnRows(scan) : []), [scan]);
  const [id] = useState(newId);

  const choose = async () => {
    setBusy(true); setError('');
    try {
      const s = await scanFolder();
      if (s) {
        const r = learnRows(s);
        setScan(s); setChoices(startChoices(s, r));
        const root = rootPattern(s.name);
        let base = `${root ? root.short : s.name} layout${root ? ` (${root.number})` : ''}`.slice(0, 110);
        for (let k = 2; takenNames.includes(base); k++) base = `${base.replace(/ \(\d+\)$/, '')} (${k})`;
        setName(base);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const template = scan && choices ? learnedTemplate(scan, rows, choices, { id, name: name.trim(), naming }) : null;
  const finish = async () => {
    if (!template) return;
    setBusy(true);
    try { await onDone(template, makeDefault); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  const shown = choices ? rows.filter((r) => !insideLeftOut(r.path, choices.leaveOut)) : [];
  const root = scan ? rootPattern(scan.name) : undefined;
  const files = scan ? scan.totalFiles + scan.files : 0;
  const can = step === 1 ? !!scan : step === 2 ? true : !!name.trim() && !busy;

  return (
    <div className="ft">
      <div className="ft-head"><b>Learn from folder</b></div>
      <div className="tabs prefs-tabs">
        {STEPS.map((s, i) => (
          <button type="button" key={s} className={step === i + 1 ? 'on' : ''} disabled={i + 1 > step && !scan} onClick={() => setStep(i + 1)}>{step > i + 1 ? '✓ ' : ''}{s}</button>
        ))}
      </div>

      {step === 1 && (
        <div className="ft-main">
          <div className="pf-loc">
            <input aria-label="Folder" readOnly value={scan?.name ?? ''} placeholder="No folder chosen" />
            <button type="button" className="chip" disabled={busy} onClick={choose}>Choose…</button>
          </div>
          <p className="m">The app reads folder names only, up to {SCAN_LIMITS.maxDepth} levels and {SCAN_LIMITS.maxFolders} folders. It never opens, lists or reads your files; it only counts them. Hidden and system folders and links are skipped. Nothing in the folder is changed.</p>
          {busy && <p className="m" role="status">Reading folder names…</p>}
          {scan && (
            <>
              <p className="ok" role="status">✓ Read {plural(scan.count, 'folder')}, {plural(scan.depth, 'level')}. {plural(files, 'file')} ignored.</p>
              {scan.truncated && <p className="warn">Only the first {SCAN_LIMITS.maxFolders} folders were read.</p>}
              {scan.deeper && <p className="warn">Folders deeper than {SCAN_LIMITS.maxDepth} levels were not read.</p>}
              {scan.skipped + scan.unreadable > 0 && <p className="m">{scan.skipped ? `${plural(scan.skipped, 'hidden folder or link', 'hidden folders or links')} skipped. ` : ''}{scan.unreadable ? `${plural(scan.unreadable, 'folder')} could not be read.` : ''}</p>}
              {!scan.count && <p className="warn">The folder has no folders in it to learn from.</p>}
            </>
          )}
        </div>
      )}

      {step === 2 && scan && choices && (
        <div className="ft-cols">
          <div className="ft-tree" aria-label="Folders found">
            <div className="ft-row root"><span className="ft-name">{scan.name}</span></div>
            {shown.map((r) => (
              <div key={r.path} className={`ft-row tick${choices.leaveOut.has(r.path) ? ' off' : ''}`} style={{ paddingLeft: 8 + r.depth * 16 }}>
                <span className="ft-name">{r.name}</span>{r.files > 0 && <span className="m">{plural(r.files, 'file')}</span>}
              </div>
            ))}
          </div>
          <div className="ft-main">
            {root && (
              <label className="row">
                <input type="checkbox" checked={choices.replaceRoot} onChange={(e) => setChoices({ ...choices, replaceRoot: e.target.checked })} />
                <span>The folder name looks like a project number and name. Use <code>{root.pattern}</code> instead of “{scan.name}”</span>
              </label>
            )}
            <p className="m">Numbering found: <code>{NUMBERING_LABEL[scanNumbering(scan)]}</code>{scanNumbering(scan) !== 'none' ? ' (kept)' : ''} · {plural(files, 'file')} ignored</p>
            <div className="ft-table">
              <table>
                <thead><tr><th>Folder</th><th>Suggested role</th><th>Match</th><th style={{ width: 80 }}>Accept</th></tr></thead>
                <tbody>
                  {shown.map((r) => {
                    const out = choices.leaveOut.has(r.path);
                    const role = rowRole(r, choices);
                    const leave = (on: boolean) => { const s = new Set(choices.leaveOut); if (on) s.add(r.path); else s.delete(r.path); setChoices({ ...choices, leaveOut: s }); };
                    return (
                      <tr key={r.path}>
                        <td><code>{r.path}</code></td>
                        <td>
                          {r.issue
                            ? (out ? <span className="m">Leave out (revision / date folder)</span> : <span className="m">Kept</span>)
                            : (
                              <select aria-label={`Role for ${r.path}`} value={role} onChange={(e) => setChoices(chooseRole(rows, choices, r.path, e.target.value))}>
                                <option value="">— none —</option>
                                {GROUPS.map((g) => (
                                  <optgroup key={g} label={g}>
                                    {ROLE_CATALOGUE.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                                  </optgroup>
                                ))}
                              </select>
                            )}
                        </td>
                        <td>
                          {r.suggestion
                            ? <><meter min={0} max={1} value={r.suggestion.score} aria-label="Match" /> <span className="m">{r.suggestion.score.toFixed(2)}</span></>
                            : r.issue ? '' : <span className="m">{r.best > 0 ? r.best.toFixed(2) : 'no match'}</span>}
                        </td>
                        <td>
                          {r.issue
                            ? <>
                                <button type="button" className="chip" aria-pressed={out} aria-label={`Leave out ${r.path}`} onClick={() => leave(true)}>✓</button>{' '}
                                <button type="button" className="chip" aria-pressed={!out} aria-label={`Keep ${r.path}`} onClick={() => leave(false)}>✕</button>
                              </>
                            : r.suggestion
                              ? <>
                                  <button type="button" className="chip" aria-pressed={role === r.suggestion.role} aria-label={`Accept ${roleById(r.suggestion.role)?.label ?? r.suggestion.role} for ${r.path}`} onClick={() => setChoices(chooseRole(rows, choices, r.path, r.suggestion!.role))}>✓</button>{' '}
                                  <button type="button" className="chip" aria-pressed={role !== r.suggestion.role} aria-label={`Reject the suggestion for ${r.path}`} onClick={() => setChoices(chooseRole(rows, choices, r.path, ''))}>✕</button>
                                </>
                              : r.best > 0 ? <span className="m">below 0.6</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="ft-actions">
              <span className="m">Each role is suggested once (the best match wins). Suggestions start at a 0.6 match.</span>
              <span className="sp" />
              <button type="button" className="chip" onClick={() => setChoices(acceptAll(scan, rows, choices))}>Accept all</button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && template && (
        <div className="ft-main">
          <label className="ft-title">Template name
            <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={noSubmit} />
          </label>
          <label className="row"><input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Set as default for new projects</label>
          <p className="m">{plural(countFolders(template.folders), 'folder')} · {plural(assignedRoles(template.folders).size, 'role')} assigned · numbering <code>{NUMBERING_LABEL[template.numbering ?? 'none']}</code>. Save opens the template in the editor so you can finish it.</p>
        </div>
      )}

      {error && <p className="bad" role="alert">{error}</p>}
      <div className="ft-foot">
        <span className="sp" />
        <button type="button" className="chip" onClick={onCancel}>Cancel</button>
        {step > 1 && <button type="button" className="chip" onClick={() => setStep(step - 1)}>Back</button>}
        <button type="button" className="chip primary" disabled={!can || (step === 1 && !scan?.count)} onClick={() => (step < 3 ? setStep(step + 1) : finish())}>{step < 3 ? 'Next' : 'Save and edit'}</button>
      </div>
    </div>
  );
}
