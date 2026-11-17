import { useEffect, useMemo, useState } from 'react';
import type { FolderBuilding, FolderTemplate, FolderVars, FolderWhen, ProjectFolder } from '../model/folderTemplates';
import { allTemplates, defaultTemplateId, templatesClient, type TemplatesClient, type TemplatesState } from '../model/folderTemplatesClient';
import { cleanFolderName, joinPath, offByDefault, planFolders, rememberFolder, suggestedRootName } from '../model/projectFolderPlan';

/** What the desktop app can do with folders on disk; absent in the web version. */
export type FolderDisk = NonNullable<Window['lvds']['projectFolders']>;
export const folderDisk = (): FolderDisk | undefined => (typeof window === 'undefined' ? undefined : window.lvds?.projectFolders);

/** The user's choice on the "Project folder" step. `parent` is where the project folder goes (desktop only). */
export interface FolderChoice { template: FolderTemplate; parent: string; name: string; unticked: string[] }

const EMPTY: TemplatesState = { templates: [], defaultId: null, skipped: 0 };
export const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The folder templates on this computer: built-in ones at once, the user's when `loaded` turns true. */
export function useFolderTemplates(client?: TemplatesClient): TemplatesState & { loaded: boolean } {
  const c = useMemo(() => client ?? templatesClient(), [client]);
  const [state, setState] = useState<TemplatesState & { loaded: boolean }>(() => (c.listNow ? { ...c.listNow(), loaded: true } : { ...EMPTY, loaded: false }));
  useEffect(() => {
    if (c.listNow) return undefined;
    let live = true;
    c.list().then((s) => { if (live) setState({ ...s, loaded: true }); }).catch(() => { if (live) setState({ ...EMPTY, loaded: true }); });
    return () => { live = false; };
  }, [c]);
  return state;
}

/** A first choice for a project: the default template, the folders its scope switches off unticked. */
export function firstChoice(state: TemplatesState, vars: FolderVars, flags: FolderWhen[], parent: string, templateId?: string): FolderChoice {
  const all = allTemplates(state);
  const template = all.find((t) => t.id === (templateId ?? defaultTemplateId(state))) ?? all[0];
  return { template, parent, name: suggestedRootName(template, vars), unticked: offByDefault(template.folders, flags) };
}

/** True when the choice can be used to make folders on this computer. */
export const choiceReady = (c: FolderChoice, disk: FolderDisk | undefined): boolean => !!cleanFolderName(c.name) && (!disk || !!c.parent.trim());

/** Makes the chosen folders through the desktop app and remembers the place for this project. */
export async function createChosenFolders(disk: FolderDisk, projectId: string | undefined, c: FolderChoice, vars: FolderVars, buildings: readonly FolderBuilding[], overrides?: ProjectFolder['overrides']): Promise<string> {
  const root = joinPath(c.parent.trim(), cleanFolderName(c.name));
  const { paths } = planFolders(c.template, overrides, vars, buildings, c.unticked, root);
  const r = await disk.create(root, paths);
  rememberFolder(projectId, { root: r.root, unticked: c.unticked });
  const failed = r.failed.length ? ` ${plural(r.failed.length, 'folder')} could not be made: ${r.failed[0].reason}` : '';
  return `${r.created + (r.rootMade ? 1 : 0) ? `Created ${plural(r.created + (r.rootMade ? 1 : 0), 'folder')}` : 'Every folder was already there'} in ${r.root}.${failed}`;
}

/** The project's folder setting for a chosen template: the project keeps its own copy of the template. */
export const projectFolderOf = (t: FolderTemplate, old?: ProjectFolder): ProjectFolder =>
  (old && old.templateId === t.id ? old : { templateId: t.id, version: t.version, template: t });

/** A full folder path split into the folder that holds it and its own name. */
export function splitPath(full: string): { parent: string; name: string } {
  const clean = full.replace(/[\\/]+$/, '');
  const i = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  return i < 0 ? { parent: '', name: clean } : { parent: clean.slice(0, i) || clean.slice(0, i + 1), name: clean.slice(i + 1) };
}

/** A ZIP of the empty folders, for the web version (or to send to someone). */
export async function folderZip(rootName: string, paths: readonly string[]): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const root = zip.folder(rootName)!;
  for (const p of paths) root.folder(p);
  return zip.generateAsync({ type: 'uint8array' });
}

