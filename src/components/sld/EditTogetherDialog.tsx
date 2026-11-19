import { useMemo, useState } from 'react';
import type { Project } from '../../types';
import { bulkResult, introducedIssues, previewBulkEdit, type BulkEdit, type BulkMode } from '../../model/bulkEdit';
import { pairText } from '../../model/datasetDiff';
import { PROPOSABLE } from '../../model/designChanges';
import { Modal } from '../ui';

/** Edit together…: one field set on every picked load, with a live before / after list. Nothing changes until Apply, which hands
 * the whole result back for one undo step. No modification record is made (that stays the Changes page's). */
export default function EditTogetherDialog({ project, ids, onApply, onClose }: {
  project: Project;
  ids: string[];
  onApply: (r: { project: Project; edit: BulkEdit; label: string; changed: number }) => void;
  onClose: () => void;
}) {
  const [field, setField] = useState('');
  const [mode, setMode] = useState<BulkMode>('set');
  const [value, setValue] = useState('');
  const fields = PROPOSABLE.feeder;
  const def = fields.find((f) => f.key === field);
  const num = def?.kind === 'number';
  const edit: BulkEdit | undefined = def && value !== '' ? { target: 'feeder', field, mode: num ? mode : 'set', value: def.kind === 'bool' ? value === 'true' : num ? Number(value) : value } : undefined;
  const preview = useMemo(() => (edit ? previewBulkEdit(project, ids, edit, { title: 'Edit together', reason: '' }) : undefined), [project, ids, edit?.field, edit?.mode, edit?.value]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = useMemo(() => (preview && !preview.error ? bulkResult(project, preview) : undefined), [preview, project]);
  const issues = after ? introducedIssues(project, after) : [];
  const ok = !!after && !!edit && !!def && preview!.changed > 0;

  return (
    <Modal onClose={onClose} onSubmit={(e) => { e.preventDefault(); if (ok) onApply({ project: after!, edit: edit!, label: def!.label, changed: preview!.changed }); }}>
      <h3>Edit {ids.length} loads together</h3>
      <p className="m">Set one field on all of them. Nothing changes until you press Apply.</p>
      <div className="row">
        <select aria-label="Field" value={field} onChange={(e) => { setField(e.target.value); setValue(''); }}><option value="">Field to change…</option>{fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
        {num && <select aria-label="Mode" value={mode} onChange={(e) => setMode(e.target.value as BulkMode)}><option value="set">set to</option><option value="scale">multiplied by</option><option value="add">increased by</option></select>}
        {def?.kind === 'bool' ? <select aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)}><option value="">…</option><option value="true">Yes</option><option value="false">No</option></select>
          : def && <input aria-label="Value" type={num ? 'number' : 'text'} step="any" placeholder="value" autoFocus value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 110 }} />}
      </div>
      {preview?.error && <p className="bad">{preview.error}</p>}
      {preview && !preview.error && (
        <div className="mod-detail">
          <table className="tbl"><thead><tr><th>Load</th><th>Before</th><th>After</th><th></th></tr></thead><tbody>
            {preview.rows.map((r) => (
              <tr key={r.id} className={r.skipped ? 'm' : ''}><td>{r.id} {r.label !== r.id ? <span className="m">{r.label}</span> : null}</td><td>{pairText(r.before, r.after)[0]}</td><td>{r.skipped ? '—' : pairText(r.before, r.after)[1]}</td><td>{r.skipped ? `left as it is: ${r.skipped}` : r.warning ?? ''}</td></tr>
            ))}
          </tbody></table>
          <p className="m">{preview.changed} to change, {preview.skipped} left as they are.</p>
          {issues.length > 0 && <div className="mod-conflicts"><b>Would start failing:</b><ul>{issues.map((i, k) => <li key={k}>{i.where}: {i.problem}</li>)}</ul></div>}
        </div>
      )}
      <div className="modal-actions">
        <span className="sp" />
        <button type="button" className="chip" onClick={onClose}>Cancel</button>
        <button type="submit" className="chip primary" disabled={!ok}>Apply</button>
      </div>
    </Modal>
  );
}
