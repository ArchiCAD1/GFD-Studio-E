// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '../../data/sampleProject';
import type { Project } from '../../types';
import * as bulk from '../../model/bulkEdit';
import EditTogetherDialog from './EditTogetherDialog';

// The edits reachable from here cannot start a name or way clash, so the issue list is shown through a stand-in.
vi.mock('../../model/bulkEdit', async (orig) => { const m = await orig<typeof import('../../model/bulkEdit')>(); return { ...m, introducedIssues: vi.fn(m.introducedIssues) }; });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project: Project = { ...sampleProject, id: 'together' };
const ids = ['FF-OFF', 'FF-IT', 'FF-LAB'];

describe('Edit together dialog', () => {
  let real: typeof bulk.introducedIssues;
  beforeAll(async () => { real = (await vi.importActual<typeof bulk>('../../model/bulkEdit')).introducedIssues; });
  beforeEach(() => { vi.mocked(bulk.introducedIssues).mockImplementation(real); });
  let host: HTMLDivElement, root: Root;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });
  const show = (p: Project = project, onApply = vi.fn(), onClose = vi.fn()) => { act(() => root.render(<EditTogetherDialog project={p} ids={ids} onApply={onApply} onClose={onClose} />)); return { onApply, onClose }; };
  const control = (label: string) => document.querySelector<HTMLSelectElement & HTMLInputElement>(`[aria-label="${label}"]`)!;
  const set = (el: HTMLSelectElement | HTMLInputElement, value: string) => act(() => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
  const apply = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Apply')!;

  it('titles itself with the count and offers the load fields; Apply waits for a change', () => {
    show();
    expect(document.querySelector('h3')!.textContent).toBe('Edit 3 loads together');
    expect([...control('Field').options].map((o) => o.textContent)).toContain('Load (kW)');
    expect(apply().disabled).toBe(true);
    expect(document.querySelector('table')).toBeNull();
  });
  it('previews before and after for each load and counts what changes', () => {
    show();
    set(control('Field'), 'loadKw');
    expect(control('Mode').textContent).toContain('multiplied by');
    set(control('Mode'), 'scale');
    set(control('Value'), '2');
    const rows = [...document.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(3);
    const kw = (id: string) => project.feeders.find((f) => f.id === id)!.loadKw;
    expect(rows[0].textContent).toContain('FF-OFF');
    expect(rows[0].textContent).toContain(String(kw('FF-OFF') * 2));
    expect(document.body.textContent).toContain('3 to change, 0 left as they are.');
    expect(apply().disabled).toBe(false);
  });
  it('leaves alone what is already the value, and keeps Apply off when nothing changes', () => {
    const same = project.feeders.find((f) => f.id === 'FF-OFF')!.loadKw;
    show();
    set(control('Field'), 'loadKw');
    set(control('Value'), String(same));
    expect(document.body.textContent).toMatch(/\d to change, \d left as they are\./);
    expect(document.body.textContent).toContain('already this value');
    set(control('Field'), 'essential');
    set(control('Value'), 'true');
    expect(document.body.textContent).toContain('3 to change');
  });
  it('lists what would start failing, and says nothing when nothing would', () => {
    show();
    set(control('Field'), 'loadKw');
    set(control('Value'), '5');
    expect(document.body.textContent).not.toContain('Would start failing');
    vi.mocked(bulk.introducedIssues)        .mockReturnValue([{ where: 'Panel SMDB-FF', ref: 'x', problem: 'has 2 circuits on way R1', view: 'load-schedule' }]);
    set(control('Value'), '6');
    expect(document.body.textContent).toContain('Would start failing:');
    expect(document.body.textContent).toContain('Panel SMDB-FF: has 2 circuits on way R1');
  });
  it('Apply hands back the result, Cancel closes', () => {
    const { onApply, onClose } = show();
    set(control('Field'), 'rcdMa');
    set(control('Value'), '30');
    act(() => apply().click());
    expect(onApply).toHaveBeenCalledTimes(1);
    const r = onApply.mock.calls[0][0];
    expect(r.changed).toBe(3);
    expect(typeof r.label).toBe('string');
    expect(ids.map((id) => r.project.feeders.find((f: { id: string }) => f.id === id).rcdMa)).toEqual([30, 30, 30]);
    expect(r.project.modifications ?? []).toHaveLength((project.modifications ?? []).length);
    expect(project.feeders.find((f) => f.id === 'FF-OFF')!.rcdMa).not.toBe(30);
    act(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!.click());
    expect(onClose).toHaveBeenCalled();
  });
});
