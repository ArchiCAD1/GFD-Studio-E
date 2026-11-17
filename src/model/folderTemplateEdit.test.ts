import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES } from './folderTemplateBuiltins';
import { validateTemplate, type FolderNode } from './folderTemplates';
import {
  addFolder, addRole, addSubfolder, ancestorsOf, canDrop, copyName, duplicateTemplate, editorKey, findNode, freeName, indentNode, moveBy, moveNode,
  newNodeId, outdentNode, pushHistory, redoHistory, removeNode, removeRole, renameNode, renumberLevel, roleFolder, setNodeField, startHistory, undoHistory
} from './folderTemplateEdit';

const tree = (): FolderNode[] => [
  { id: 'a', name: '01_Admin', children: [{ id: 'a1', name: 'Contract' }, { id: 'a2', name: 'Minutes', role: 'minutes' }] },
  { id: 'b', name: '02_Inputs' },
  { id: 'c', name: '03_Calcs', children: [{ id: 'c1', name: 'VD', role: 'calcVd' }, { id: 'c2', name: 'SC', roles: ['calcFault', 'calcCable'] }] }
];
const names = (ns: readonly FolderNode[]): string[] => ns.map((n) => n.name);
const shape = (ns: readonly FolderNode[]): string => ns.map((n) => (n.children?.length ? `${n.id}(${shape(n.children)})` : n.id)).join(' ');

describe('adding, renaming and deleting', () => {
  it('adds a folder after the selected one, with a free name and a new id', () => {
    const { nodes, id } = addFolder(tree(), 'a1');
    expect(shape(nodes)).toBe(`a(a1 ${id} a2) b c(c1 c2)`);
    expect(findNode(nodes, id)?.name).toBe('New folder');
    const again = addFolder(nodes, id);
    expect(findNode(again.nodes, again.id)?.name).toBe('New folder 2');
  });
  it('adds at the end of the top level with nothing selected, and inside a folder as its last subfolder', () => {
    const top = addFolder(tree(), null);
    expect(shape(top.nodes)).toBe(`a(a1 a2) b c(c1 c2) ${top.id}`);
    const sub = addSubfolder(tree(), 'b', 'Architect');
    expect(shape(sub.nodes)).toBe(`a(a1 a2) b(${sub.id}) c(c1 c2)`);
    expect(findNode(sub.nodes, sub.id)?.name).toBe('Architect');
  });
  it('gives ids that no folder has', () => {
    const t = tree();
    expect(findNode(t, newNodeId(t))).toBeUndefined();
  });
  it('renames one folder and leaves the given tree alone', () => {
    const t = tree();
    expect(findNode(renameNode(t, 'c1', 'Voltage-Drop'), 'c1')?.name).toBe('Voltage-Drop');
    expect(findNode(t, 'c1')?.name).toBe('VD');
  });
  it('deletes a folder with what is inside it, and drops an emptied children list', () => {
    expect(shape(removeNode(tree(), 'c'))).toBe('a(a1 a2) b');
    const one = removeNode(removeNode(tree(), 'a1'), 'a2');
    expect(findNode(one, 'a')).not.toHaveProperty('children');
  });
  it('sets and clears a condition, a subfolder pattern and a note', () => {
    let t = setNodeField(tree(), 'c1', 'when', 'scope:pv');
    t = setNodeField(t, 'c1', 'onUse', '{Stage}/Rev-{Rev}');
    t = setNodeField(t, 'c1', 'note', ' VD report ');
    expect(findNode(t, 'c1')).toMatchObject({ when: 'scope:pv', onUse: '{Stage}/Rev-{Rev}', note: 'VD report' });
    t = setNodeField(setNodeField(t, 'c1', 'when', 'always'), 'c1', 'note', '');
    expect(findNode(t, 'c1')).not.toHaveProperty('when');
    expect(findNode(t, 'c1')).not.toHaveProperty('note');
  });
  it('freeName compares without case', () => {
    expect(freeName([{ id: 'x', name: 'new FOLDER' }])).toBe('New folder 2');
  });
});

describe('moving', () => {
  it('moves up and down among siblings and stops at the ends', () => {
    expect(shape(moveBy(tree(), 'b', -1))).toBe('b a(a1 a2) c(c1 c2)');
    expect(shape(moveBy(tree(), 'c1', 1))).toBe('a(a1 a2) b c(c2 c1)');
    expect(shape(moveBy(tree(), 'a', -1))).toBe('a(a1 a2) b c(c1 c2)');
    expect(shape(moveBy(tree(), 'c', 1))).toBe('a(a1 a2) b c(c1 c2)');
  });
  it('indents into the folder above and outdents to just after its parent', () => {
    expect(shape(indentNode(tree(), 'b'))).toBe('a(a1 a2 b) c(c1 c2)');
    expect(shape(indentNode(tree(), 'a'))).toBe('a(a1 a2) b c(c1 c2)');
    expect(shape(outdentNode(tree(), 'a1'))).toBe('a(a2) a1 b c(c1 c2)');
    expect(shape(outdentNode(tree(), 'b'))).toBe('a(a1 a2) b c(c1 c2)');
  });
  it('drops a folder before, after or into another, with its subfolders', () => {
    expect(shape(moveNode(tree(), 'c', 'a', 'before'))).toBe('c(c1 c2) a(a1 a2) b');
    expect(shape(moveNode(tree(), 'a', 'c1', 'after'))).toBe('b c(c1 a(a1 a2) c2)');
    expect(shape(moveNode(tree(), 'a2', 'b', 'inside'))).toBe('a(a1) b(a2) c(c1 c2)');
  });
  it('refuses a drop on itself or inside its own subfolders', () => {
    expect(canDrop(tree(), 'a', 'a')).toBe(false);
    expect(canDrop(tree(), 'a', 'a1')).toBe(false);
    expect(canDrop(tree(), 'a1', 'a')).toBe(true);
    expect(canDrop(tree(), 'nope', 'a')).toBe(false);
    expect(shape(moveNode(tree(), 'a', 'a2', 'inside'))).toBe('a(a1 a2) b c(c1 c2)');
  });
  it('knows a folder\'s ancestors', () => {
    expect(ancestorsOf(tree(), 'c2')?.map((n) => n.id)).toEqual(['c']);
    expect(ancestorsOf(tree(), 'b')).toEqual([]);
    expect(ancestorsOf(tree(), 'nope')).toBeUndefined();
  });
});

describe('renumbering one level', () => {
  it('renumbers the level of the selected folder only', () => {
    const t = renumberLevel(moveBy(tree(), 'c', -1), 'a', '1.');
    expect(names(t)).toEqual(['1. Admin', '2. Calcs', '3. Inputs']);
    expect(names(findNode(t, 'a')!.children!)).toEqual(['Contract', 'Minutes']);
    const sub = renumberLevel(tree(), 'c1', '01_');
    expect(names(findNode(sub, 'c')!.children!)).toEqual(['01_VD', '02_SC']);
    expect(names(sub)).toEqual(['01_Admin', '02_Inputs', '03_Calcs']);
  });
  it('takes the numbers off with "none"', () => {
    expect(names(renumberLevel(tree(), 'b', 'none'))).toEqual(['Admin', 'Inputs', 'Calcs']);
  });
});

describe('roles', () => {
  it('moves a role to the folder it is given to: a role saves to one folder', () => {
    const t = addRole(tree(), 'b', 'calcVd');
    expect(roleFolder(t, 'calcVd')?.id).toBe('b');
    expect(findNode(t, 'c1')).not.toHaveProperty('role');
    const two = addRole(t, 'b', 'calcFault');
    expect(findNode(two, 'b')?.roles).toEqual(['calcVd', 'calcFault']);
    expect(findNode(two, 'c2')).toMatchObject({ role: 'calcCable' });
    expect(findNode(two, 'c2')).not.toHaveProperty('roles');
  });
  it('ignores a role that is not in the catalogue, and removes a role', () => {
    expect(addRole(tree(), 'b', 'notARole')).toEqual(tree());
    expect(findNode(removeRole(tree(), 'c2', 'calcFault'), 'c2')).toMatchObject({ role: 'calcCable' });
    expect(roleFolder(removeRole(tree(), 'c1', 'calcVd'), 'calcVd')).toBeUndefined();
  });
});

describe('templates', () => {
  it('duplicates a built-in as an editable user template that passes the checks', () => {
    const src = BUILT_IN_TEMPLATES[0];
    const copy = duplicateTemplate(src, BUILT_IN_TEMPLATES.map((t) => t.name));
    expect(copy.id).toMatch(/^user-[0-9a-f]{16}$/);
    expect(copy).toMatchObject({ name: `${src.name} (copy)`, version: 0, basedOn: src.name });
    expect(copy).not.toHaveProperty('builtIn');
    expect(validateTemplate(copy).filter((i) => i.level === 'error')).toEqual([]);
    copy.folders[0].name = 'changed';
    expect(src.folders[0].name).not.toBe('changed');
  });
  it('keeps what a user copy was based on, and numbers further copies', () => {
    const mine = duplicateTemplate(BUILT_IN_TEMPLATES[1], []);
    expect(duplicateTemplate(mine, [mine.name]).basedOn).toBe(BUILT_IN_TEMPLATES[1].name);
    expect(copyName('Office', ['office (COPY)', 'Office (copy 2)'])).toBe('Office (copy 3)');
  });
});

describe('undo inside the editor', () => {
  it('steps back and forward, and a new change clears redo', () => {
    let h = startHistory(tree());
    h = pushHistory(h, renameNode(h.present, 'b', 'Received'));
    h = pushHistory(h, removeNode(h.present, 'a'));
    expect(shape(h.present)).toBe('b c(c1 c2)');
    h = undoHistory(h);
    expect(findNode(h.present, 'b')?.name).toBe('Received');
    expect(shape(h.present)).toBe('a(a1 a2) b c(c1 c2)');
    h = redoHistory(h);
    expect(shape(h.present)).toBe('b c(c1 c2)');
    h = pushHistory(undoHistory(h), moveBy(undoHistory(h).present, 'b', -1));
    expect(h.future).toEqual([]);
    expect(redoHistory(h)).toBe(h);
  });
  it('does not record an unchanged state, and undo at the start does nothing', () => {
    const h = startHistory(tree());
    expect(pushHistory(h, h.present)).toBe(h);
    expect(undoHistory(h)).toBe(h);
  });
});

describe('keyboard', () => {
  it('maps the editor keys', () => {
    expect(editorKey({ key: 'F2' })).toBe('rename');
    expect(editorKey({ key: 'Delete' })).toBe('delete');
    expect(editorKey({ key: 'ArrowUp', altKey: true })).toBe('up');
    expect(editorKey({ key: 'ArrowDown', altKey: true })).toBe('down');
    expect(editorKey({ key: 'Tab' })).toBe('indent');
    expect(editorKey({ key: 'Tab', shiftKey: true })).toBe('outdent');
    expect(editorKey({ key: 'z', ctrlKey: true })).toBe('undo');
    expect(editorKey({ key: 'Z', metaKey: true, shiftKey: true })).toBe('redo');
    expect(editorKey({ key: 'y', ctrlKey: true })).toBe('redo');
    expect(editorKey({ key: 'ArrowUp' })).toBeUndefined();
    expect(editorKey({ key: 'a', ctrlKey: true })).toBeUndefined();
  });
});
