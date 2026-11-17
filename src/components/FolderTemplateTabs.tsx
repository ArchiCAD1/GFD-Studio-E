import { useState, type KeyboardEvent } from 'react';
import {
  duplicateNames, FILE_TOKENS, formatName, NAMING_PRESETS, parsePattern, patternFor, patternIssues, patternOf, presetOf, SAMPLE_VALUES, separatorOf, withoutPart, withPreset, withSeparator, withTypePattern,
  type FileToken, type NamePart
} from '../model/fileNaming';
import { suggestRoles } from '../model/folderMatch';
import { DOC_TYPES, ROLE_CATALOGUE, type DocType } from '../model/folderRoles';
import { addRole, removeRole, roleFolder, setNodeField } from '../model/folderTemplateEdit';
import { walkNodes, type FolderNode, type NamingPreset, type NamingRule } from '../model/folderTemplates';

const noSubmit = (e: KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') e.preventDefault(); };
const ON_USE = ['{Stage}/Rev-{Rev}', 'Rev-{BoqRev}', 'TR-{TrNo}', '{YYYYMMDD}_Rev{Rev}'];
const DOC_LABEL: Record<DocType, string> = { DWG: 'Drawing', CAL: 'Calculation', SCH: 'Schedule', BOQ: 'Bill of quantities', SPC: 'Specification', TR: 'Transmittal', CRS: 'Comment response sheet', RFI: 'RFI', MOM: 'Minutes' };
const EXT: Record<DocType, string> = { DWG: 'pdf', CAL: 'pdf', SCH: 'xlsx', BOQ: 'xlsx', SPC: 'docx', TR: 'pdf', CRS: 'pdf', RFI: 'pdf', MOM: 'pdf' };

/** The template editor's Roles tab (spec C3): every output the app makes and the folder it saves to. */
export function RolesTab({ nodes, onChange }: { nodes: readonly FolderNode[]; onChange: (folders: FolderNode[]) => void }) {
  const [only, setOnly] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState('');
  const folders: { id: string; path: string }[] = [];
  walkNodes(nodes, (n, up) => { folders.push({ id: n.id, path: [...up.map((a) => a.name), n.name].join(' / ') }); });
  const rows = ROLE_CATALOGUE.map((r) => ({ role: r, at: roleFolder(nodes, r.id) }));
  const assigned = rows.filter((x) => x.at).length;
  const auto = () => {
    const found = suggestRoles(nodes);
    onChange(found.reduce<FolderNode[]>((ns, s) => addRole(ns, s.nodeId, s.role), [...nodes]));
    setFresh(new Set(found.map((s) => s.role)));
    setNote(found.length ? `${found.length} role${found.length === 1 ? '' : 's'} matched to a folder by name. Check the marked rows.` : 'No folder name matched a role that is still unassigned.');
  };
  return (
    <>
      <div className="ft-actions">
        <button type="button" className={`chip${only ? '' : ' on'}`} aria-pressed={!only} onClick={() => setOnly(false)}>All</button>
        <button type="button" className={`chip${only ? ' on' : ''}`} aria-pressed={only} onClick={() => setOnly(true)}>Unassigned ({ROLE_CATALOGUE.length - assigned})</button>
        <span className="sp" />
        <button type="button" className="chip" title="Give each unassigned role the folder whose name fits it" onClick={auto}>Auto-assign by name</button>
      </div>
      <div className="ft-table">
        <table>
          <thead><tr><th>Output from the app</th><th>Role</th><th>Saves to folder</th><th>Creates on save</th><th aria-label="Status" /></tr></thead>
          <tbody>
            {rows.filter((x) => !only || !x.at).map(({ role, at }) => (
              <tr key={role.id} className={fresh.has(role.id) ? 'fresh' : undefined}>
                <td>{role.label}</td>
                <td><span className="ft-tag role">{role.id}</span></td>
                <td>
                  <select aria-label={`Folder for ${role.label}`} value={at?.id ?? ''} onChange={(e) => onChange(e.target.value ? addRole(nodes, e.target.value, role.id) : at ? removeRole(nodes, at.id, role.id) : [...nodes])}>
                    <option value="">Ask each time</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
                  </select>
                </td>
                <td>
                  {at
                    ? <select aria-label={`Subfolders made in ${at.name}`} title="Belongs to the folder: every role saved there uses it" value={at.onUse ?? ''} onChange={(e) => onChange(setNodeField(nodes, at.id, 'onUse', e.target.value))}>
                        <option value="">None</option>
                        {[...new Set([...ON_USE, ...(at.onUse ? [at.onUse] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    : <span className="m">None</span>}
                </td>
                <td className={at ? 'ok' : 'warn'} title={at ? 'Has a folder' : 'Asks where to save'}>{at ? '✓' : '⚠'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m" role="status">{ROLE_CATALOGUE.length} roles · {assigned} assigned. A folder can hold many roles; a role has one folder.{note ? ` ${note}` : ''}</p>
    </>
  );
}

const label = (p: NamePart): string => ('text' in p ? p.text : p.pad ? `${p.token} ·${p.pad}` : p.token);

/** The template editor's File naming tab (spec C4): the file-name pattern built from fields, with a preview. */
export function NamingTab({ rule, onChange }: { rule: NamingRule; onChange: (rule: NamingRule) => void }) {
  const [text, setText] = useState('');
  const [drag, setDrag] = useState<number | null>(null);
  const parts = parsePattern(rule.pattern);
  const setPattern = (pattern: string) => onChange({ ...rule, pattern, preset: presetOf(pattern), separator: separatorOf(pattern, rule.separator) });
  const setParts = (next: NamePart[]) => setPattern(patternOf(next));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= parts.length || from === to) return;
    const next = [...parts];
    const [p] = next.splice(from, 1);
    next.splice(to, 0, p);
    setParts(next);
  };
  const addToken = (token: FileToken) => {
    const last = parts[parts.length - 1];
    const pad = token === 'Seq' ? 3 : token === 'Number' ? 4 : undefined;
    setParts([...parts, ...(last && 'token' in last ? [{ text: rule.separator }] : []), pad ? { token, pad } : { token }]);
  };
  const issues = patternIssues(rule.pattern);
  const names = DOC_TYPES.map((d) => ({ d, name: formatName(rule, d, SAMPLE_VALUES) }));
  const dup = duplicateNames(names.map((n) => n.name));
  return (
    <>
      <div className="grid2">
        <label>Preset
          <select value={rule.preset === 'custom' ? 'custom' : presetOf(rule.pattern)} onChange={(e) => onChange(withPreset(rule, e.target.value as NamingPreset))}>
            {(Object.keys(NAMING_PRESETS) as (keyof typeof NAMING_PRESETS)[]).map((k) => <option key={k} value={k}>{NAMING_PRESETS[k].label}</option>)}
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>Discipline code
          <input value={rule.discipline ?? 'E'} maxLength={10} onChange={(e) => onChange({ ...rule, discipline: e.target.value })} onKeyDown={noSubmit} />
        </label>
        <label>Separator between fields
          <select value={rule.separator} onChange={(e) => onChange({ ...withSeparator(rule, e.target.value as NamingRule['separator']), preset: 'custom' })}>
            <option value="-">- hyphen</option><option value="_">_ underscore</option><option value=".">. dot</option>
          </select>
        </label>
        <label className="row"><input type="checkbox" checked={!!rule.upper} onChange={(e) => { const { upper: _u, ...rest } = rule; onChange(e.target.checked ? { ...rest, upper: true } : rest); }} /> Write names in capitals</label>
      </div>

      <div className="ft-sec">Pattern</div>
      <div className="ft-chips pattern" aria-label="Pattern">
        {parts.map((p, i) => (
          <span key={i} className={`ft-chip${'token' in p ? ' token' : ''}${drag === i ? ' drag' : ''}`} draggable
            onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
            onDragOver={(e) => { if (drag !== null) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (drag !== null) move(drag, i); setDrag(null); }}
            onDragEnd={() => setDrag(null)}>
            <button type="button" aria-label={`Move ${label(p)} left`} disabled={i === 0} onClick={() => move(i, i - 1)}>‹</button>
            {label(p)}
            <button type="button" aria-label={`Move ${label(p)} right`} disabled={i === parts.length - 1} onClick={() => move(i, i + 1)}>›</button>
            <button type="button" aria-label={`Remove ${label(p)}`} onClick={() => setParts(withoutPart(parts, i, rule.separator))}>×</button>
          </span>
        ))}
        {!parts.length && <span className="m">Empty: add fields below.</span>}
      </div>
      <p className="m">The file type (.pdf, .xlsx, .dxf) is added when a file is saved.</p>
      <div className="ft-sec">Fields</div>
      <div className="ft-chips">
        {FILE_TOKENS.map((k) => <button type="button" key={k} className="ft-chip add" onClick={() => addToken(k)}>{k}</button>)}
        <span className="ft-addtext">
          <input aria-label="Text to add" placeholder="text…" value={text} maxLength={20} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (text) { setParts([...parts, { text }]); setText(''); } } }} />
          <button type="button" className="chip" disabled={!text} onClick={() => { setParts([...parts, { text }]); setText(''); }}>Add text</button>
        </span>
      </div>
      <label>Pattern as text
        <input value={rule.pattern} maxLength={120} spellCheck={false} onChange={(e) => setPattern(e.target.value)} onKeyDown={noSubmit} />
      </label>
      {issues.map((m) => <p key={m} className="bad">{m}</p>)}

      <div className="ft-cols">
        <div>
          <div className="ft-sec">Own pattern for a document type</div>
          <div className="ft-table">
            <table>
              <tbody>
                {DOC_TYPES.map((d) => {
                  const own = rule.perType?.[d] ?? '';
                  const bad = own ? patternIssues(own) : [];
                  return (
                    <tr key={d}>
                      <td title={DOC_LABEL[d]}>{d}</td>
                      <td>
                        <input aria-label={`Pattern for ${DOC_LABEL[d]}`} placeholder="default" value={own} maxLength={120} spellCheck={false} onChange={(e) => onChange(withTypePattern(rule, d, e.target.value))} onKeyDown={noSubmit} />
                        {bad.map((m) => <div key={m} className="bad">{m}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="ft-sec">Preview with a sample project</div>
          <div className="ft-preview">
            {names.map(({ d, name }) => <div key={d} title={`${DOC_LABEL[d]}: ${patternFor(rule, d)}`}><b>{name || '(empty)'}</b>.{EXT[d]}</div>)}
          </div>
          {dup.length
            ? <p className="warn">Two document types get the same name: {dup.join(', ')}. Add {'{Type}'} or give one its own pattern.</p>
            : <p className="ok">All names differ and are safe for Windows.</p>}
        </div>
      </div>
    </>
  );
}
