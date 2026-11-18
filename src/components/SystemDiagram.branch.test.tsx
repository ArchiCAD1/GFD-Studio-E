// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SystemDiagram from './SystemDiagram';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import { setArmedItem } from '../diagram/dragItem';
import { sldMenu } from '../model/sldMenu';
import { DEFAULT_LAYERS } from '../diagram/annotations';
import type { Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const project: Project = { ...sampleProject, id: 'branch' };
const results = evaluateProject(project);

describe('SLD Show this branch only', () => {
  let host: HTMLDivElement, root: Root, statuses: string[];
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    localStorage.clear();
    statuses = [];
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); setArmedItem(null); });

  const draw = (screenMarks = true) => act(() => root.render(
    <SystemDiagram project={project} calcProject={project} results={results} selectedFeederId={null} selectedBoardId={null}
      onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} onPatchFeeder={noop} onStatus={(s) => statuses.push(s)} screenMarks={screenMarks}
      menuFor={(t, v) => sldMenu({ project, calcProject: project, results, canUndo: false, canRedo: false, layers: DEFAULT_LAYERS, colorBy: 'none', supply: 'normal', hasGenerator: false, outages: [], grid: v.grid, detail: v.detail, branch: v.branch }, t)}
      onMenu={noop} />
  ));
  const rightClick = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 90 })); });
  const row = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.cad-menu button')].find((b) => b.querySelector('.lb')?.textContent === label);
  const board = (id: string) => host.querySelector(`.sysdiag > svg g.bd[data-lv-id="board:${id}"]`)!;
  const showBranch = (id: string) => { rightClick(board(id)); act(() => row('Show this branch only')!.click()); };
  const empty = () => host.querySelector('.sysdiag > svg')!;
  const key = (k: string) => act(() => { host.querySelector('.sysdiag')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });

  it('dims the boards and ways outside the branch, not those in it, and says so', () => {
    draw();
    expect(host.querySelector('.sysdiag > svg .off')).toBeNull();
    showBranch('SMDB-GF');
    expect(statuses).toContain("Showing SMDB-GF's branch only — Esc or Show everything ends it");
    expect(board('SMDB-GF').classList.contains('off')).toBe(false);
    expect(board('SMDB-FF').classList.contains('off')).toBe(true);
    expect(board('MDB-1').classList.contains('off')).toBe(true);
    expect(host.querySelector('.sysdiag > svg g.fd[data-lv-id="feeder:FF-LAB"]')!.classList.contains('off')).toBe(true);
  });

  it('Esc ends it', () => {
    draw();
    showBranch('SMDB-GF');
    key('Escape');
    expect(host.querySelector('.sysdiag > svg .off')).toBeNull();
  });

  it('Show everything ends it and is offered only while it is on', () => {
    draw();
    rightClick(empty());
    expect(row('Show everything')).toBeUndefined();
    act(() => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    showBranch('SMDB-GF');
    rightClick(empty());
    act(() => row('Show everything')!.click());
    expect(host.querySelector('.sysdiag > svg .off')).toBeNull();
    rightClick(board('SMDB-GF'));
    expect(row('Show this branch only')).toBeTruthy();
  });

  it('a board offers Show this branch only until its own branch is shown', () => {
    draw();
    showBranch('SMDB-GF');
    rightClick(board('SMDB-GF'));
    expect(row('Show this branch only')).toBeUndefined();
  });

  it('with screenMarks off (exporting) nothing is dimmed; the view is kept for after', () => {
    draw();
    showBranch('SMDB-GF');
    draw(false);
    expect(host.querySelector('.sysdiag > svg .off')).toBeNull();
    draw(true);
    expect(board('SMDB-FF').classList.contains('off')).toBe(true);
  });
});
