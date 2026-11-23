// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type ProjectsDashboard from './components/ProjectsDashboard';
import type Ribbon from './components/Ribbon';
import { sampleProject } from './data/sampleProject';
import { listProjects, loadProject, metaOf } from './model/projectStore';
import { resetWebStore } from './model/webStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let dashboard: ComponentProps<typeof ProjectsDashboard> | undefined;
let ribbon: ComponentProps<typeof Ribbon> | undefined;
vi.mock('./components/ProjectsDashboard', () => ({ default: (props: ComponentProps<typeof ProjectsDashboard>) => { dashboard = props; return null; } }));
vi.mock('./components/Ribbon', async (original) => ({
  ...await original<typeof import('./components/Ribbon')>(),
  default: (props: ComponentProps<typeof Ribbon>) => { ribbon = props; return null; }
}));

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  localStorage.clear();
  resetWebStore();
  dashboard = undefined;
  ribbon = undefined;
});
afterEach(() => { act(() => root.unmount()); host.remove(); resetWebStore(); });

async function until(ready: () => boolean) {
  const deadline = Date.now() + 10000;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('The project migration did not reach the expected app state');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
}

describe('legacy browser project saves in the app', () => {
  it.each([false, true])('keeps the current filename and recent list correct after a status edit (open: %s)', async (opened) => {
    const project = { ...sampleProject, id: 'legacy-villa', name: 'Legacy villa', format: 'lvds.project' };
    const original = JSON.stringify(project);
    localStorage.setItem('gfde.project.Legacy.lvds', original);
    localStorage.setItem('gfde.projects', JSON.stringify([metaOf('Legacy.lvds', project)]));
    localStorage.setItem('gfde.recent', JSON.stringify(['Legacy.lvds']));
    await act(async () => root.render(<App />));
    await until(() => dashboard?.list[0]?.file === 'Legacy.lvds');
    if (opened) {
      await act(async () => dashboard!.onOpen('Legacy.lvds'));
      await until(() => ribbon?.a.currentFile === 'Legacy.lvds');
      await act(async () => ribbon!.a.onView('projects'));
      await until(() => dashboard?.currentFile === 'Legacy.lvds' && !dashboard.dirty);
    }
    await act(async () => { await dashboard!.onStatus('Legacy.lvds', 'submitted'); });
    await until(() => dashboard?.list[0]?.file === 'Legacy.gfde');
    expect(dashboard!.recent).toEqual(['Legacy.gfde']);
    expect(dashboard!.currentFile).toBe(opened ? 'Legacy.gfde' : undefined);
    expect((await loadProject('Legacy.gfde')).status).toBe('submitted');
    if (opened) {
      await act(async () => dashboard!.onContinue());
      await until(() => ribbon?.a.currentFile === 'Legacy.gfde');
      await act(async () => { await ribbon!.a.onSave(); });
    }
    expect((await listProjects()).map((m) => m.file)).toEqual(['Legacy.gfde']);
    expect(localStorage.getItem('gfde.project.Legacy.lvds')).toBe(original);
  }, 15000);
});
