/** Where the user's folder templates are kept, for the screens: the desktop app's settings folder through
 * its bridge (electron/folderTemplates.cjs), or this browser's storage in the web version. Built-in
 * templates come from the code and are never stored. */

import { BUILT_IN_TEMPLATES, DEFAULT_TEMPLATE_ID } from './folderTemplateBuiltins';
import { namingIssues } from './fileNaming';
import { isFolderTemplate, validateTemplate, type FolderTemplate } from './folderTemplates';

export interface TemplatesState { templates: FolderTemplate[]; defaultId: string | null; skipped: number; error?: string }

export interface TemplatesClient {
  list: () => Promise<TemplatesState>;
  /** The web version's store can answer at once. */
  listNow?: () => TemplatesState;
  save: (t: FolderTemplate) => Promise<TemplatesState>;
  delete: (id: string) => Promise<TemplatesState>;
  setDefault: (id: string | null) => Promise<TemplatesState>;
  /** Desktop only: a file dialog. */
  import?: () => Promise<(TemplatesState & { added: number }) | null>;
  export?: (templates: FolderTemplate[], defaultName?: string) => Promise<string | null>;
}

const KEY = 'lvds.folderTemplates';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The web version's store: one JSON value in the browser's storage; unreadable content counts as empty. */
export function webTemplatesClient(storage: Store | undefined = typeof localStorage === 'undefined' ? undefined : localStorage, today = () => new Date().toISOString().slice(0, 10)): TemplatesClient {
  let memory: TemplatesState = { templates: [], defaultId: null, skipped: 0 };
  const read = (): TemplatesState => {
    try {
      const raw = storage?.getItem(KEY);
      if (!raw) return memory;
      const v = JSON.parse(raw) as { templates?: unknown; defaultId?: unknown };
      const all = Array.isArray(v.templates) ? v.templates : [];
      const templates = all.filter(isFolderTemplate).filter((t) => /^user-[A-Za-z0-9-]{1,64}$/.test(t.id));
      return { templates, defaultId: typeof v.defaultId === 'string' ? v.defaultId : null, skipped: all.length - templates.length };
    } catch { return memory; }
  };
  const write = (s: TemplatesState): TemplatesState => {
    memory = { templates: s.templates, defaultId: s.defaultId, skipped: 0 };
    try { storage?.setItem(KEY, JSON.stringify({ templates: s.templates, defaultId: s.defaultId })); } catch { /* kept for this visit only */ }
    return memory;
  };
  return {
    list: async () => read(),
    listNow: read,
    save: async (t) => {
      const cur = read();
      const old = cur.templates.find((x) => x.id === t.id);
      const saved = { ...t, version: (old?.version ?? 0) + 1, editedAt: today() };
      return write({ ...cur, templates: old ? cur.templates.map((x) => (x.id === t.id ? saved : x)) : [...cur.templates, saved] });
    },
    delete: async (id) => { const cur = read(); return write({ ...cur, templates: cur.templates.filter((x) => x.id !== id), defaultId: cur.defaultId === id ? null : cur.defaultId }); },
    setDefault: async (id) => write({ ...read(), defaultId: id })
  };
}

/** The desktop app's store when its bridge has one, else the browser's. */
export function templatesClient(): TemplatesClient {
  const bridge = typeof window === 'undefined' ? undefined : window.lvds?.folderTemplates;
  return bridge ?? webTemplatesClient();
}

/** Saves a template after the editor's checks: refused (with the reasons) while it has errors. */
export async function saveTemplate(client: TemplatesClient, t: FolderTemplate): Promise<TemplatesState> {
  const errors = validateTemplate(t).filter((i) => i.level === 'error');
  if (!t.name.trim()) throw new Error('The template has no name.');
  const problems = [...errors.map((e) => e.message), ...namingIssues(t.naming)];
  if (problems.length) throw new Error(problems.join(' · '));
  const { builtIn: _b, ...own } = t;
  return client.save({ ...own, name: t.name.trim() });
}

/** Built-in templates first, then the user's. */
export const allTemplates = (s: TemplatesState): FolderTemplate[] => [...BUILT_IN_TEMPLATES, ...s.templates];
/** The template new projects start from: the user's choice when it still exists, else the app's. */
export const defaultTemplateId = (s: TemplatesState): string =>
  (s.defaultId && allTemplates(s).some((t) => t.id === s.defaultId) ? s.defaultId : DEFAULT_TEMPLATE_ID);
