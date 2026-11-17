/** Editing a folder template (Preferences → Folder templates, spec C1 and C2): pure operations on the
 * template's tree, used by src/components/FolderTemplatesPanel.tsx. Nothing here touches the disk: a template
 * only describes folders; deleting a folder here never deletes a folder a project already has. */

import { isRole } from './folderRoles';
import { nodeRoles, renumber, walkNodes, type FolderNode, type FolderNumbering, type FolderTemplate } from './folderTemplates';

type Nodes = readonly FolderNode[];

const hex = (bytes: number): string => {
  const b = new Uint8Array(bytes);
  const c = globalThis.crypto;
  if (c?.getRandomValues) c.getRandomValues(b); else b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); });
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/** An id for a user template, in the form the desktop app's store accepts ("user-…"). */
export const newTemplateId = (): string => `user-${hex(8)}`;

const allIds = (nodes: Nodes): Set<string> => {
  const s = new Set<string>();
  walkNodes(nodes, (n) => { s.add(n.id); });
  return s;
};

/** An id no folder of the tree has. */
export function newNodeId(nodes: Nodes): string {
  const used = allIds(nodes);
  let id = `n-${hex(4)}`;
  while (used.has(id)) id = `n-${hex(4)}`;
  return id;
}

const withChildren = (n: FolderNode, children: FolderNode[]): FolderNode => {
  const { children: _c, ...rest } = n;
  return children.length ? { ...rest, children } : rest;
};

/** The tree with `fn` applied to each level's list, deepest first. */
const mapLevels = (nodes: Nodes, fn: (level: FolderNode[], parent: FolderNode | null) => FolderNode[], parent: FolderNode | null = null): FolderNode[] =>
  fn(nodes.map((n) => (n.children?.length ? withChildren(n, mapLevels(n.children, fn, n)) : n)), parent);

export function findNode(nodes: Nodes, id: string): FolderNode | undefined {
  let hit: FolderNode | undefined;
  walkNodes(nodes, (n) => { if (!hit && n.id === id) hit = n; });
  return hit;
}

/** The folder's ancestors, top first (empty for a top folder); undefined when the folder is not in the tree. */
export function ancestorsOf(nodes: Nodes, id: string): FolderNode[] | undefined {
  let hit: FolderNode[] | undefined;
  walkNodes(nodes, (n, path) => { if (!hit && n.id === id) hit = path; });
  return hit;
}

/** The folders beside this one (itself included), in order. */
export function siblingsOf(nodes: Nodes, id: string): FolderNode[] | undefined {
  const up = ancestorsOf(nodes, id);
  if (!up) return undefined;
  return up.length ? [...(up[up.length - 1].children ?? [])] : [...nodes];
}

/** A name no folder in `siblings` has (compared without case): "New folder", "New folder 2"… */
export function freeName(siblings: Nodes, base = 'New folder'): string {
  const taken = new Set(siblings.map((s) => s.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}

export interface Added { nodes: FolderNode[]; id: string }

/** A new folder beside `afterId`, straight after it; at the end of the top level when there is none. */
export function addFolder(nodes: Nodes, afterId: string | null, name?: string): Added {
  const id = newNodeId(nodes);
  const sibs = afterId ? siblingsOf(nodes, afterId) : undefined;
  if (!afterId || !sibs) return { nodes: [...nodes, { id, name: name ?? freeName(nodes) }], id };
  const node: FolderNode = { id, name: name ?? freeName(sibs) };
  return { nodes: mapLevels(nodes, (level) => { const i = level.findIndex((n) => n.id === afterId); return i < 0 ? level : [...level.slice(0, i + 1), node, ...level.slice(i + 1)]; }), id };
}

/** A new folder inside `parentId`, last. */
export function addSubfolder(nodes: Nodes, parentId: string, name?: string): Added {
  const parent = findNode(nodes, parentId);
  if (!parent) return addFolder(nodes, null, name);
  const id = newNodeId(nodes);
  const node: FolderNode = { id, name: name ?? freeName(parent.children ?? []) };
  return { nodes: updateNode(nodes, parentId, (p) => withChildren(p, [...(p.children ?? []), node])), id };
}

/** The tree with one folder replaced by `fn(folder)`. */
export function updateNode(nodes: Nodes, id: string, fn: (n: FolderNode) => FolderNode): FolderNode[] {
  return mapLevels(nodes, (level) => level.map((n) => (n.id === id ? fn(n) : n)));
}

export const renameNode = (nodes: Nodes, id: string, name: string): FolderNode[] => updateNode(nodes, id, (n) => ({ ...n, name }));

/** A folder's condition, subfolder pattern or note; an empty value (or "always") clears it. */
export function setNodeField(nodes: Nodes, id: string, field: 'when' | 'onUse' | 'note', value: string): FolderNode[] {
  return updateNode(nodes, id, (n) => {
    const { [field]: _old, ...rest } = n;
    const v = value.trim();
    return v && !(field === 'when' && v === 'always') ? ({ ...rest, [field]: v } as FolderNode) : rest;
  });
}

/** The tree without the folder and everything inside it. */
export function removeNode(nodes: Nodes, id: string): FolderNode[] {
  return mapLevels(nodes, (level) => level.filter((n) => n.id !== id));
}

/** One place up (-1) or down (+1) among its siblings; unchanged at either end. */
export function moveBy(nodes: Nodes, id: string, by: -1 | 1): FolderNode[] {
  return mapLevels(nodes, (level) => {
    const i = level.findIndex((n) => n.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= level.length) return level;
    const out = [...level];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  });
}

/** Into the folder just above it, as its last subfolder; unchanged for the first folder of a level. */
export function indentNode(nodes: Nodes, id: string): FolderNode[] {
  return mapLevels(nodes, (level) => {
    const i = level.findIndex((n) => n.id === id);
    if (i <= 0) return level;
    const prev = level[i - 1];
    return [...level.slice(0, i - 1), withChildren(prev, [...(prev.children ?? []), level[i]]), ...level.slice(i + 1)];
  });
}

/** Out of its folder, to just after that folder; unchanged for a top folder. */
export function outdentNode(nodes: Nodes, id: string): FolderNode[] {
  const up = ancestorsOf(nodes, id);
  const node = findNode(nodes, id);
  if (!up?.length || !node) return [...nodes];
  return placeNode(removeNode(nodes, id), node, up[up.length - 1].id, 'after');
}

export type DropPlace = 'before' | 'after' | 'inside';

function placeNode(nodes: Nodes, node: FolderNode, targetId: string, place: DropPlace): FolderNode[] {
  if (place === 'inside') return updateNode(nodes, targetId, (t) => withChildren(t, [...(t.children ?? []), node]));
  return mapLevels(nodes, (level) => {
    const i = level.findIndex((n) => n.id === targetId);
    if (i < 0) return level;
    const at = place === 'before' ? i : i + 1;
    return [...level.slice(0, at), node, ...level.slice(at)];
  });
}

/** True when the folder may be dropped there: not on itself and not inside its own subfolders. */
export function canDrop(nodes: Nodes, id: string, targetId: string): boolean {
  if (id === targetId || !findNode(nodes, id)) return false;
  const up = ancestorsOf(nodes, targetId);
  return !!up && !up.some((a) => a.id === id);
}

/** Drag and drop: the folder (with what is inside it) moved before, after or into the target. */
export function moveNode(nodes: Nodes, id: string, targetId: string, place: DropPlace): FolderNode[] {
  const node = findNode(nodes, id);
  if (!node || !canDrop(nodes, id, targetId)) return [...nodes];
  return placeNode(removeNode(nodes, id), node, targetId, place);
}

/** Numbers the folders at this folder's level ("01_", "1.", "A-" or none). */
export function renumberLevel(nodes: Nodes, id: string, style: FolderNumbering): FolderNode[] {
  const up = ancestorsOf(nodes, id);
  if (!up) return [...nodes];
  const parentId = up.length ? up[up.length - 1].id : null;
  return mapLevels(nodes, (level, parent) => ((parent?.id ?? null) === parentId ? renumber(level, style) : level));
}

function setRoles(n: FolderNode, roles: string[]): FolderNode {
  const { role: _r, roles: _rs, ...rest } = n;
  return roles.length === 0 ? rest : roles.length === 1 ? { ...rest, role: roles[0] } : { ...rest, roles };
}

/** The folder a role saves to, if any. */
export function roleFolder(nodes: Nodes, role: string): FolderNode | undefined {
  let hit: FolderNode | undefined;
  walkNodes(nodes, (n) => { if (!hit && nodeRoles(n).includes(role)) hit = n; });
  return hit;
}

/** Gives the folder a role. A role saves to one folder, so it is taken off the folder that had it. */
export function addRole(nodes: Nodes, id: string, role: string): FolderNode[] {
  if (!isRole(role)) return [...nodes];
  return mapLevels(nodes, (level) => level.map((n) => {
    const roles = nodeRoles(n).filter((r) => r !== role);
    return setRoles(n, n.id === id ? [...roles, role] : roles);
  }));
}

export const removeRole = (nodes: Nodes, id: string, role: string): FolderNode[] =>
  updateNode(nodes, id, (n) => setRoles(n, nodeRoles(n).filter((r) => r !== role)));

/* ---------- templates ---------- */

const copyNodes = (nodes: Nodes): FolderNode[] => nodes.map((n) => ({ ...n, ...(n.roles ? { roles: [...n.roles] } : {}), ...(n.children ? { children: copyNodes(n.children) } : {}) }));

/** A name no template in the list has: "X (copy)", "X (copy 2)"… */
export function copyName(name: string, taken: readonly string[]): string {
  const has = new Set(taken.map((t) => t.toLowerCase()));
  const base = `${name} (copy)`;
  if (!has.has(base.toLowerCase())) return base;
  let i = 2;
  while (has.has(`${name} (copy ${i})`.toLowerCase())) i++;
  return `${name} (copy ${i})`;
}

/** The user's own copy of a template (built-in or not), ready to edit. Folder ids are kept. */
export function duplicateTemplate(t: FolderTemplate, takenNames: readonly string[]): FolderTemplate {
  const { builtIn: _b, editedAt: _e, ...rest } = t;
  return { ...rest, id: newTemplateId(), name: copyName(t.name, takenNames).slice(0, 120), version: 0, basedOn: t.builtIn ? t.name : (t.basedOn ?? t.name), folders: copyNodes(t.folders), naming: { ...t.naming, ...(t.naming.perType ? { perType: { ...t.naming.perType } } : {}) } };
}

/* ---------- undo inside the editor ---------- */

export interface EditHistory<T> { past: T[]; present: T; future: T[] }

export const startHistory = <T>(present: T): EditHistory<T> => ({ past: [], present, future: [] });
/** A new state; the last 100 are kept for undo. An unchanged state is not recorded. */
export const pushHistory = <T>(h: EditHistory<T>, next: T): EditHistory<T> =>
  (next === h.present ? h : { past: [...h.past, h.present].slice(-100), present: next, future: [] });
export const undoHistory = <T>(h: EditHistory<T>): EditHistory<T> =>
  (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h);
export const redoHistory = <T>(h: EditHistory<T>): EditHistory<T> =>
  (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h);

/* ---------- keyboard ---------- */

export type EditorCommand = 'rename' | 'delete' | 'up' | 'down' | 'indent' | 'outdent' | 'undo' | 'redo';

/** The editor command for a key pressed on the tree (not while a name is being typed). */
export function editorKey(e: { key: string; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): EditorCommand | undefined {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (mod && e.key.toLowerCase() === 'y') return 'redo';
  if (mod) return undefined;
  if (e.key === 'F2') return 'rename';
  if (e.key === 'Delete') return 'delete';
  if (e.altKey && e.key === 'ArrowUp') return 'up';
  if (e.altKey && e.key === 'ArrowDown') return 'down';
  if (e.key === 'Tab') return e.shiftKey ? 'outdent' : 'indent';
  return undefined;
}
