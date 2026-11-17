import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES, DEFAULT_TEMPLATE_ID } from './folderTemplateBuiltins';
import { duplicateTemplate, renameNode } from './folderTemplateEdit';
import { allTemplates, defaultTemplateId, saveTemplate, webTemplatesClient, type TemplatesClient } from './folderTemplatesClient';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
};
const mine = () => duplicateTemplate(BUILT_IN_TEMPLATES[1], []);

describe('the web version\'s template store', () => {
  it('saves, lists, updates and deletes a user template', async () => {
    const store = memory();
    const c = webTemplatesClient(store, () => '2026-11-17');
    const t = mine();
    let s = await c.save(t);
    expect(s.templates).toHaveLength(1);
    expect(s.templates[0]).toMatchObject({ id: t.id, version: 1, editedAt: '2026-11-17' });
    s = await c.save({ ...s.templates[0], name: 'Office' });
    expect(s.templates).toHaveLength(1);
    expect(s.templates[0]).toMatchObject({ name: 'Office', version: 2 });
    expect((await webTemplatesClient(store).list()).templates[0].name).toBe('Office');
    s = await c.setDefault(t.id);
    expect(defaultTemplateId(s)).toBe(t.id);
    s = await c.delete(t.id);
    expect(s).toMatchObject({ templates: [], defaultId: null });
    expect(defaultTemplateId(s)).toBe(DEFAULT_TEMPLATE_ID);
  });
  it('leaves out stored content that is not a user template, and survives unreadable storage', async () => {
    const store = memory();
    store.m.set('lvds.folderTemplates', JSON.stringify({ templates: [mine(), { id: 'user-x', name: 1 }, { ...mine(), id: 'consultant-full' }], defaultId: 5 }));
    const s = await webTemplatesClient(store).list();
    expect(s.templates).toHaveLength(1);
    expect(s.skipped).toBe(2);
    expect(s.defaultId).toBeNull();
    store.m.set('lvds.folderTemplates', '{not json');
    expect((await webTemplatesClient(store).list()).templates).toEqual([]);
    const blocked = webTemplatesClient({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect((await blocked.save(mine())).templates).toHaveLength(1);
  });
  it('lists built-in templates first and falls back to the app default when the chosen one is gone', () => {
    const t = mine();
    expect(allTemplates({ templates: [t], defaultId: null, skipped: 0 }).map((x) => x.id)).toEqual([...BUILT_IN_TEMPLATES.map((x) => x.id), t.id]);
    expect(defaultTemplateId({ templates: [], defaultId: 'user-gone', skipped: 0 })).toBe(DEFAULT_TEMPLATE_ID);
    expect(defaultTemplateId({ templates: [], defaultId: 'villa-small', skipped: 0 })).toBe('villa-small');
  });
});

describe('saveTemplate', () => {
  const spy = () => {
    const saved: unknown[] = [];
    const client: TemplatesClient = { ...webTemplatesClient(memory()), save: async (t) => { saved.push(t); return { templates: [t], defaultId: null, skipped: 0 }; } };
    return { client, saved };
  };
  it('checks the template, then saves it without the built-in mark and with a trimmed name', async () => {
    const { client, saved } = spy();
    await saveTemplate(client, { ...mine(), name: '  Office  ', builtIn: true });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Office' });
    expect(saved[0]).not.toHaveProperty('builtIn');
  });
  it('refuses a template with a problem or no name, and does not call the store', async () => {
    const { client, saved } = spy();
    const t = mine();
    await expect(saveTemplate(client, { ...t, folders: renameNode(t.folders, t.folders[0].id, 'Bad?Name') })).rejects.toThrow(/not allowed in folder names/);
    await expect(saveTemplate(client, { ...t, name: '   ' })).rejects.toThrow(/no name/);
    expect(saved).toEqual([]);
  });
});
