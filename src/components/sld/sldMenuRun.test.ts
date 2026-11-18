import { describe, expect, it } from 'vitest';
import { evaluateProject } from '../../calc/electrical';
import { sampleProject } from '../../data/sampleProject';
import { SLD_MENU_ACTIONS, SLD_VIEW_ACTIONS, type SldTarget } from '../../model/sldMenu';
import { withUids } from '../../model/stableIds';
import type { Project } from '../../types';
import { runSldMenu, type SldMenuCtx } from './sldMenuRun';

const project: Project = withUids(structuredClone(sampleProject));
/** A page that records every call it is asked to make. */
function mock(more: Partial<SldMenuCtx> = {}) {
  const calls: [string, ...unknown[]][] = [];
  const ctx = new Proxy({ project, calcProject: project, copiedBoard: 'SMDB-GF', ...more } as SldMenuCtx, {
    get: (o, k: string) => (k in o ? (o as unknown as Record<string, unknown>)[k] : (...a: unknown[]) => { calls.push([k, ...a]); })
  });
  return { ctx, calls };
}
const board: SldTarget = { kind: 'board', id: 'SMDB-FF' }, load: SldTarget = { kind: 'feeder', id: 'FF-LAB' };
const run = (t: SldTarget, action: string, value?: string, more: Partial<SldMenuCtx> = {}) => { const m = mock(more); runSldMenu(m.ctx, t, action, value); return m.calls; };

describe('the SLD menu runner', () => {
  const target = (action: string): [SldTarget, string | undefined] => {
    switch (action) {
      case 'edit': case 'schedule': case 'diagram': case 'copy': case 'paste': case 'duplicate': case 'repeat': case 'lengthchecked': case 'delete': case 'plan': case 'zoom': case 'properties': return [board, undefined];
      case 'add': return [board, 'load'];
      case 'order': return [load, 'left'];
      case 'rename': return [board, 'SMDB-FF-X'];
      case 'cabletype': return [board, 'auto'];
      case 'change': return [load, 'essential'];
      case 'quickfix': return [load, '0'];
      case 'addsupply': return [{ kind: 'supply', boardId: 'MDB-1' }, 'generator'];
      case 'scenario': return [{ kind: 'canvas' }, 'generator'];
      case 'values': return [{ kind: 'canvas' }, 'fault'];
      case 'colour': return [{ kind: 'canvas' }, 'vd'];
      case 'tieop': return [{ kind: 'tie', id: 'BC-1' }, 'closed'];
      case 'tierating': return [{ kind: 'tie', id: 'BC-1' }, '1600'];
      case 'tieremove': return [{ kind: 'tie', id: 'BC-1' }, undefined];
      default: return [{ kind: 'canvas' }, undefined];
    }
  };
  it.each(SLD_MENU_ACTIONS.filter((a) => !SLD_VIEW_ACTIONS.includes(a)))('%s reaches the page', (action) => {
    const [t, v] = target(action);
    // A failing circuit, so Quick fix has something to run; the order target is the second way, so it moves.
    const failing: Project = { ...project, feeders: project.feeders.map((f) => (f.id === 'FF-LAB' ? { ...f, cableCsaMm2: 4 } : f)) };
    const calls = run(t, action, v, { project: failing, calcProject: failing });
    expect(calls.length, action).toBeGreaterThan(0);
  });
  it('leaves the view actions to the drawing, and an unknown action alone', () => {
    for (const a of SLD_VIEW_ACTIONS) expect(run(board, a, 'x')).toEqual([]);
    expect(run(board, 'nonsense', 'x')).toEqual([]);
    expect(SLD_VIEW_ACTIONS.every((a) => SLD_MENU_ACTIONS.includes(a))).toBe(true);
  });
  it('Edit selects a board first, a load goes to its form, a transformer to its board', () => {
    expect(run(board, 'edit')).toEqual([['selectBoard', 'SMDB-FF'], ['editBoard', 'SMDB-FF']]);
    expect(run(load, 'edit')).toEqual([['editFeeder', 'FF-LAB']]);
    expect(run({ kind: 'supply', boardId: 'MDB-1' }, 'edit')).toEqual([['selectBoard', 'MDB-1'], ['editBoard', 'MDB-1']]);
  });
  it('Add uses the ribbon presets', () => {
    expect(run(board, 'add', 'motor')).toEqual([['addLoad', 'SMDB-FF', { loadType: 'motor', powerFactor: 0.86, demandFactor: 1 }]]);
    expect(run(board, 'add', 'pv')[0][2]).toMatchObject({ loadType: 'pv', generation: true });
    expect(run(board, 'add', 'board')).toEqual([['addBoard', 'SMDB-FF']]);
  });
  it('Paste opens the board dialog, or pastes the copied load at once', () => {
    expect(run(board, 'paste')).toEqual([['pasteBoard', 'SMDB-FF']]);
    const calls = run(board, 'paste', undefined, { copiedBoard: undefined, copiedLoad: 'GF-HVAC' });
    expect(calls[0][0]).toBe('apply');
    expect((calls[0][1] as { message: string }).message).toContain('copy of GF-HVAC');
    expect(run(load, 'paste')).toEqual([]);
  });
  it('Order moves through the drag path, or says it is already there', () => {
    const calls = run({ kind: 'feeder', id: 'FF-IT' }, 'order', 'left');
    expect(calls).toEqual([['moveItem', { kind: 'feeder', id: 'FF-IT' }, { type: 'feeder', feederId: 'FF-OFF' }]]);
    expect(run({ kind: 'feeder', id: 'FF-OFF' }, 'order', 'left')).toEqual([['status', 'FF-OFF is already first on its busbar']]);
  });
  it('Rename checks the name first', () => {
    expect(run(board, 'rename', 'SMDB-GF')[0][0]).toBe('status');
    expect(run(board, 'rename', ' ')).toEqual([]);
    expect(run(board, 'rename', 'SMDB-FF')).toEqual([]);
    const ok = run(board, 'rename', 'SMDB-L1');
    expect(ok[0][0]).toBe('apply');
    const r = ok[0][1] as { project: Project; select: unknown; message: string };
    expect(r.project.boards.some((b) => b.id === 'SMDB-L1')).toBe(true);
    expect(r.project.feeders.find((f) => f.id === 'INC-FF')?.feedsBoardId).toBe('SMDB-L1');
    expect(r.select).toEqual({ type: 'board', id: 'SMDB-L1' });
    expect(r.message).toBe('Renamed SMDB-FF to SMDB-L1 (undo with ⌘Z)');
  });
  it('Change splits the field from its value, and asks undo to be mentioned', () => {
    const calls = run(load, 'change', 'rcdMa|30');
    const r = calls[0][1] as { project: Project; message: string };
    expect(r.project.feeders.find((f) => f.id === 'FF-LAB')?.rcdMa).toBe(30);
    expect(r.message).toBe('FF-LAB: earth leakage 30 mA (undo with ⌘Z)');
    const cleared = run(load, 'change', 'rcdMa|')[0][1] as { project: Project };
    expect(cleared.project.feeders.find((f) => f.id === 'FF-LAB')?.rcdMa).toBeUndefined();
  });
  it('Quick fix applies the chosen fix of the calculated project', () => {
    const failing: Project = { ...project, feeders: project.feeders.map((f) => (f.id === 'FF-LAB' ? { ...f, cableCsaMm2: 4 } : f)) };
    expect(evaluateProject(failing).find((r) => r.feeder.id === 'FF-LAB')?.status).not.toBe('ok');
    const calls = run(load, 'quickfix', '0', { project: failing, calcProject: failing });
    expect(calls[0].slice(0, 2)).toEqual(['fixFeeder', 'FF-LAB']);
    expect(run(load, 'quickfix', '9', { project: failing, calcProject: failing })).toEqual([]);
  });
  it('Show on plan and Zoom name what was clicked', () => {
    expect(run(load, 'plan')).toEqual([['showOnPlan', { feeder: 'FF-LAB' }]]);
    expect(run(board, 'plan')).toEqual([['showOnPlan', { board: 'SMDB-FF' }]]);
    expect(run({ kind: 'supply', boardId: 'MDB-1' }, 'zoom')).toEqual([['zoomTo', 'board', 'MDB-1']]);
    expect(run(load, 'properties')).toEqual([['properties', 'feeder', 'FF-LAB']]);
  });
  it('the transformer and the empty drawing drop their items', () => {
    expect(run({ kind: 'supply', boardId: 'MDB-1' }, 'addsupply', 'generator-acb')).toEqual([['dropItem', { kind: 'generator', changeover: 'ACB' }, { type: 'bus', boardId: 'MDB-1' }]]);
    expect(run({ kind: 'canvas' }, 'addsupply', 'mc')).toEqual([['dropItem', { kind: 'board', board: 'MC' }, { type: 'canvas' }]]);
  });
  it('a bus coupler row sets the operation or the rating', () => {
    expect(run({ kind: 'tie', id: 'BC-1' }, 'tieop', 'open')).toEqual([['setTie', 'BC-1', { closed: false }]]);
    expect(run({ kind: 'tie', id: 'BC-1' }, 'tierating', '1600')).toEqual([['setTie', 'BC-1', { ratingA: 1600 }]]);
  });
});
