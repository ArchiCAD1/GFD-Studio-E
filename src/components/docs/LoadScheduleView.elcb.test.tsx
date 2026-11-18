// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoadScheduleView from './LoadScheduleView';
import type { Project } from '../../types';
import { EMPTY_DATABASE } from '../../database/database';
import { sampleProject } from '../../data/sampleProject';
import { scheduleCircuits } from '../../calc/loadSchedule';
import { addCircuit } from '../../model/schedule';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD = 'DB-GF1';
let shown = BOARD;
let start: Project = sampleProject;
let root: Root;
let latest: Project;
const status = vi.fn();

function Harness() {
  const [p, setP] = useState(start);
  latest = p;
  return <LoadScheduleView project={p} boardId={shown} db={EMPTY_DATABASE} onBoard={() => {}} onChange={setP} onStatus={status} onSettings={() => {}} />;
}
const mount = () => act(() => root.render(<Harness />));
const board = () => latest.boards.find((b) => b.id === BOARD)!;
const press = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); window.dispatchEvent(new MouseEvent('mouseup')); });
/** The Room input of a circuit row, by its reference (R1, RYB4 …). */
const roomOf = (ref: string) => [...document.querySelectorAll<HTMLInputElement>('table.ls input[placeholder="Room"][data-cell]')].find((i) => i.closest('tr')!.querySelector('b')?.textContent === ref)!;
const menuButton = () => [...document.querySelectorAll<HTMLButtonElement>('.ls-actions button')].find((b) => b.textContent!.includes('ELCB / RCD'))!;
const openMenu = () => act(() => menuButton().click());
const items = () => [...document.querySelectorAll<HTMLButtonElement>('.ls-actions .menu-pop button')];
const item = (text: string | RegExp) => items().find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent!)))!;
const type = (el: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  shown = BOARD; start = sampleProject; status.mockClear();
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('Add → ELCB / RCD', () => {
  it('has the menu in the add row, after 3-phase circuit', () => {
    mount();
    expect(document.querySelector('.ls-actions')!.textContent).toMatch(/3-phase circuit.*ELCB \/ RCD.*Spare 1-phase/);
  });

  it('enables the items by the selected row: none, a 1-phase circuit, a 3-phase circuit', () => {
    start = addCircuit(sampleProject, BOARD, 'RYB').project;
    const ryb = scheduleCircuits(start, BOARD).find((f) => f.phase === 'RYB')!;
    mount();
    openMenu();
    expect(items().map((b) => b.textContent)).toEqual(['3-phase ELCB (4P, TP&N) over ways…', '3-phase ELCB for the selected 3-phase circuit', '1-phase RCBO for the selected circuit', 'All automatic again']);
    expect(item('3-phase ELCB for the selected 3-phase circuit').disabled).toBe(true);
    expect(item('1-phase RCBO for the selected circuit').disabled).toBe(true);
    expect(item('All automatic again').disabled).toBe(true);
    expect(item('3-phase ELCB (4P, TP&N) over ways…').disabled).toBe(false);
    press(roomOf('R1'));
    openMenu();
    expect(item('1-phase RCBO for R1').disabled).toBe(false);
    expect(item('3-phase ELCB for the selected 3-phase circuit').disabled).toBe(true);
    press(roomOf(`RYB${ryb.way}`));
    openMenu();
    expect(item(`3-phase ELCB for RYB${ryb.way} only`).disabled).toBe(false);
    expect(item('1-phase RCBO for the selected circuit').disabled).toBe(true);
  });

  it('makes the selected 1-phase circuit an RCBO and says so; it can be removed again', () => {
    mount();
    press(roomOf('R1'));
    openMenu();
    act(() => item('1-phase RCBO for R1').click());
    const f = latest.feeders.find((x) => x.id === `${BOARD}-R1`)!;
    expect(f.rcbo).toBe(true);
    expect(status).toHaveBeenLastCalledWith(expect.stringMatching(/^R1: RCBO \d+ A \d+ mA in place of the MCB; it leaves ELCB-1$/));
    expect(document.querySelector('.ls-head')!.textContent).toContain('+ 1 placed by hand');
    expect(document.querySelector('table.ls')!.textContent).toMatch(/RCBO-1.*by hand · this circuit/);
    press(roomOf('R1'));
    openMenu();
    expect(items().map((b) => b.textContent)).toContain('Edit RCBO-1…');
    act(() => item('Remove RCBO-1').click());
    expect(latest.feeders.find((x) => x.id === `${BOARD}-R1`)!.rcbo).toBeUndefined();
    expect(document.querySelector('.ls-head')!.textContent).not.toContain('placed by hand');
  });

  it('adds a 3-phase ELCB over ways through the dialog, and refuses an overlap', () => {
    mount();
    openMenu();
    act(() => item('3-phase ELCB (4P, TP&N) over ways…').click());
    expect(document.querySelector('.elcb-dialog h3')!.textContent).toBe(`Add 3-phase ELCB — ${BOARD}`);
    const from = document.querySelector<HTMLInputElement>('.elcb-dialog input[data-field="from"]')!;
    const to = document.querySelector<HTMLInputElement>('.elcb-dialog input[data-field="to"]')!;
    type(from, '2');
    type(to, '2');
    act(() => [...document.querySelectorAll<HTMLInputElement>('.elcb-dialog input[type="radio"]')][1].click());
    act(() => document.querySelector<HTMLButtonElement>('.elcb-dialog button[type="submit"]')!.click());
    expect(document.querySelector('.elcb-dialog')).toBeNull();
    expect(board().elcbs).toMatchObject([{ fromWay: 2, toWay: 2, poles: 3 }]);
    expect(status).toHaveBeenLastCalledWith(expect.stringMatching(/placed over way 2$/));
    expect(document.querySelector('.ls-head')!.textContent).toContain('+ 1 placed by hand');
    expect(document.querySelector('table.ls')!.textContent).toContain('by hand · ');
    // The same ways again: refused inline, the dialog stays.
    openMenu();
    act(() => item('3-phase ELCB (4P, TP&N) over ways…').click());
    type(document.querySelector<HTMLInputElement>('.elcb-dialog input[data-field="from"]')!, '2');
    type(document.querySelector<HTMLInputElement>('.elcb-dialog input[data-field="to"]')!, '3');
    expect(document.querySelector('.elcb-dialog [role="alert"]')!.textContent).toMatch(/^Ways 2–3 overlap ELCB-\d+ \(way 2\)$/);
    expect(document.querySelector<HTMLButtonElement>('.elcb-dialog button[type="submit"]')!.disabled).toBe(true);
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.elcb-dialog button')].find((b) => b.textContent === 'Cancel')!.click());
    expect(board().elcbs).toHaveLength(1);
  });

  it('All automatic again asks, then removes what was placed by hand', async () => {
    mount();
    press(roomOf('R1'));
    openMenu();
    act(() => item('1-phase RCBO for R1').click());
    openMenu();
    await act(async () => { item('All automatic again').click(); await Promise.resolve(); await Promise.resolve(); });
    expect(latest.feeders.some((f) => f.rcbo)).toBe(false);
    expect(document.querySelector('.ls-head')!.textContent).not.toContain('placed by hand');
  });

  it('has no ELCB / RCD menu on the MD form', () => {
    shown = 'MDB-1';
    mount();
    expect([...document.querySelectorAll('button')].some((b) => b.textContent!.includes('ELCB / RCD'))).toBe(false);
  });
});
