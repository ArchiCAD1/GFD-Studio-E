// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewProjectWizard } from './BriefEditor';
import { ProjectFolderCard } from './ProjectFolder';
import { folderZip, splitPath, type FolderChoice, type FolderDisk } from './projectFolderActions';
import { builtInTemplate } from '../model/folderTemplateBuiltins';
import { webTemplatesClient } from '../model/folderTemplatesClient';
import { rememberedFolder, rememberFolder } from '../model/projectFolderPlan';
import { BUILT_IN_REFERENCES } from '../model/designReference';
import { newProject, type Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement;
const client = () => { const m = new Map<string, string>(); return webTemplatesClient({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }); };
const fakeDisk = (have: string[] = [], exists = true) => {
  const made: { root: string; paths: string[] }[] = [];
  const disk: FolderDisk = {
    chooseParent: vi.fn(async () => 'D:\\Chosen'),
    create: vi.fn(async (r: string, paths: string[]) => { made.push({ root: r, paths }); return { root: r, rootMade: true, created: paths.length, existed: 0, failed: [] }; }),
    status: vi.fn(async (r: string, paths: string[]) => {
      const there = new Set([...have, ...made.flatMap((m) => m.paths)]);
      return { root: r, exists: exists || made.length > 0, present: paths.filter((p) => there.has(p)), missing: paths.filter((p) => !there.has(p)), looseFiles: ['plan.dwg'], looseCount: 1 };
    }),
    open: vi.fn(async () => null)
  };
  return { disk, made };
};
beforeEach(() => { localStorage.clear(); host = document.body.appendChild(document.createElement('div')); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; localStorage.clear(); });

const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });
const type = (el: HTMLInputElement, v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
const field = (label: string) => [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))!.querySelector<HTMLInputElement>('input')!;
const text = () => document.body.textContent ?? '';

describe('New project: the Project folder step (F1)', () => {
  const onCreate = vi.fn();
  const show = async (disk?: FolderDisk) => {
    onCreate.mockClear();
    act(() => root.render(<NewProjectWizard initialName="Villa Jumeirah" references={BUILT_IN_REFERENCES} folderParent={disk ? 'D:\\Projects' : ''} folderClient={client()} folderDisk={disk} onQuick={() => {}} onCreate={onCreate} onCancel={() => {}} />));
    await flush();
    click(document.querySelector('.home-act')!);
    for (let i = 0; i < 4; i++) click(button('Next'));
  };
  it('offers the default template, the place, the name and the folders, with the count', async () => {
    const { disk } = fakeDisk();
    await show(disk);
    expect(text()).toContain('step 5 of 6: Project folder');
    expect(field('Folder name').value).toBe('Villa Jumeirah');
    expect(field('Location').value).toBe('D:\\Projects');
    expect(text()).toContain('D:\\Projects\\Villa Jumeirah');
    expect(text()).toMatch(/\d+ folders will be created\. Nothing existing is moved or deleted\./);
  });
  it('passes the choice to Create project as the sixth argument, with unticked folders left out', async () => {
    const { disk } = fakeDisk();
    await show(disk);
    const before = +text().match(/(\d+) folders will be created/)![1];
    click(document.querySelector('.pf-tree input[type=checkbox]')!);
    expect(+text().match(/(\d+) folders will be created/)![1]).toBeLessThan(before);
    click(button('Browse…'));
    await flush();
    expect(field('Location').value).toBe('D:\\Chosen');
    click(button('Next'));
    expect(text()).toContain('Project folder: Electrical consultant full, in D:\\Chosen\\Villa Jumeirah');
    click(button('Create project'));
    const choice = onCreate.mock.calls[0][5] as FolderChoice;
    expect(choice).toMatchObject({ parent: 'D:\\Chosen', name: 'Villa Jumeirah' });
    expect(choice.template.id).toBe('consultant-full');
    expect(choice.unticked.length).toBeGreaterThan(0);
  });
  it('Skip folders creates the project with no folder choice', async () => {
    const { disk } = fakeDisk();
    await show(disk);
    click(button('Skip folders'));
    expect(text()).toContain('Project folder: none');
    click(button('Create project'));
    expect(onCreate.mock.calls[0][5]).toBeUndefined();
  });
  it('needs a location on the desktop before the project can be created', async () => {
    const { disk } = fakeDisk();
    await show(disk);
    type(field('Location'), '');
    click(button('Next'));
    expect(button('Create project').disabled).toBe(true);
    expect(text()).toContain('choose its location on the Project folder step, or skip it');
  });
  it('in the web version says the folders come as a ZIP file', async () => {
    await show(undefined);
    expect(text()).toContain('The web version cannot make folders on your computer');
    expect([...document.querySelectorAll('label')].some((l) => l.textContent?.startsWith('Location'))).toBe(false);
  });
});

describe('Overview: the Project folder card (F3)', () => {
  const template = builtInTemplate('villa-small')!;
  const withFolder = (): Project => ({ ...newProject('Villa'), id: 'p1', folder: { templateId: template.id, version: 1, template } });
  const show = async (project: Project, disk: FolderDisk | undefined, onChange = vi.fn(), onStatus = vi.fn()) => {
    act(() => root.render(<ProjectFolderCard project={project} onChangeProject={onChange} onStatus={onStatus} client={client()} disk={disk} />));
    await flush();
    return { onChange, onStatus };
  };
  it('offers to create a folder for a project that has none, and makes it', async () => {
    const { disk, made } = fakeDisk();
    const project = { ...newProject('Villa'), id: 'p0' };
    const { onChange, onStatus } = await show(project, disk);
    expect(text()).toContain('No project folder');
    click(button('Create project folder…'));
    await flush();
    type(field('Location'), 'D:\\Projects');
    click(button('Create folders'));
    await flush();
    expect(made).toHaveLength(1);
    expect(made[0].root).toBe('D:\\Projects\\Villa');
    expect(made[0].paths.length).toBeGreaterThan(5);
    expect(onChange.mock.calls[0][0].folder.templateId).toBe('consultant-full');
    expect(onStatus.mock.calls[0][0]).toMatch(/^Created \d+ folders in D:\\Projects\\Villa\./);
    expect(rememberedFolder('p0')?.root).toBe('D:\\Projects\\Villa');
  });
  it('asks for the folder on a computer that has not seen the project', async () => {
    const { disk } = fakeDisk();
    await show(withFolder(), disk);
    expect(text()).toContain('its folder has not been chosen on this computer yet');
    expect(button('Choose the folder on this computer…')).toBeTruthy();
  });
  it('shows what is present and missing, creates only the missing folders, and opens the folder', async () => {
    const { disk, made } = fakeDisk(['01_Admin']);
    rememberFolder('p1', { root: 'D:\\Projects\\Villa', unticked: [] });
    const { onStatus, onChange } = await show(withFolder(), disk);
    expect(text()).toMatch(/1 of \d+ folders present · \d+ folders missing/);
    expect(text()).toContain('1 file in the project folder itself, not in a subfolder: plan.dwg. They are left where they are.');
    click(button('Create missing folders'));
    await flush();
    expect(made[0].root).toBe('D:\\Projects\\Villa');
    expect(made[0].paths).not.toContain('01_Admin');
    expect(onStatus).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(text()).toMatch(/All \d+ folders present/);
    click(button('Open'));
    await flush();
    expect(disk.open).toHaveBeenCalledWith('D:\\Projects\\Villa');
  });
  it('says so when the remembered folder is gone', async () => {
    const { disk } = fakeDisk([], false);
    rememberFolder('p1', { root: 'D:\\Gone\\Villa', unticked: [] });
    await show(withFolder(), disk);
    expect(text()).toContain('This folder is not on this computer.');
  });
  it('in the web version offers the ZIP file', async () => {
    await show(withFolder(), undefined);
    expect(button('Download as ZIP…')).toBeTruthy();
    expect(text()).toContain('The web version cannot make folders on your computer');
  });
});

describe('helpers', () => {
  it('splits a path into its folder and name', () => {
    expect(splitPath('D:\\Projects\\Villa')).toEqual({ parent: 'D:\\Projects', name: 'Villa' });
    expect(splitPath('/home/me/Villa/')).toEqual({ parent: '/home/me', name: 'Villa' });
    expect(splitPath('Villa')).toEqual({ parent: '', name: 'Villa' });
  });
  it('zips the empty folders under the project folder', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await folderZip('P1_Villa', ['01_Admin', '03_Calcs/VD']));
    const dirs = Object.values(zip.files).filter((f) => f.dir).map((f) => f.name).sort();
    expect(dirs).toEqual(['P1_Villa/', 'P1_Villa/01_Admin/', 'P1_Villa/03_Calcs/', 'P1_Villa/03_Calcs/VD/']);
    expect(Object.values(zip.files).filter((f) => !f.dir)).toEqual([]);
  });
});
