import { describe, expect, it } from 'vitest';
import { cadCommand } from './cadCommands';
import { allItems, isItem, type CtxEntry, type CtxItem } from './cadContextMenu';
import { drawnHead, drawnMenu, type DrawnMenuState } from './cadDrawnObjectMenu';
import { MENU_ICONS } from './cadMenuIcons';
import { argOf } from './cadSheetMenus';
import { isSketchEdit } from './SketchEditPanel';
import type { SketchItem } from '../../types';

const flat = allItems;
const labels = (list: CtxEntry[]) => list.map((x) => (x === '-' ? '-' : x.label));
const subs = (m: CtxEntry[], l: string) => (flat(m).find((x) => x.label === l)!.sub ?? []).filter(isItem);
const sk = (more: Partial<SketchItem>): SketchItem => ({ id: 'a', layer: 'A-WALL', kind: 'line', pts: [[0, 0], [3, 0]], ...more }) as SketchItem;
const base: Omit<DrawnMenuState, 'items'> = { devices: 0, canShow: true, blocks: ['WC', 'DOOR'], dimStyles: ['ISO-25'], canUndo: true, canRedo: false, undoLabel: 'Offset', propsOn: true, canPaste: true, repeat: 'LINE', lengthM: 3 };
const menu = (items: SketchItem[], more: Partial<DrawnMenuState> = {}) => drawnMenu({ ...base, items, ...more });
/** What follows the kind's own tools, the same for every drawn object that has the usual modify group. */
const tail = (modify: string[]) => ['-', 'Clipboard', 'Undo Offset', 'Redo', '-', ...modify, '-', 'Isolate', 'Pan', 'Zoom', '-', 'Select similar', 'Invert selection', 'Deselect all', 'Quick select…', 'Count', '-', 'Properties', 'Options…'];

describe('right-click menu of drawn objects: one order', () => {
  it('a line: Repeat, one Line tools list, clipboard and undo, modify with Scale, view, select, palette', () => {
    const m = menu([sk({})]);
    expect(labels(m)).toEqual(['Repeat LINE', '-', 'Line tools', ...tail(['Erase', 'Move', 'Copy selection', 'Scale', 'Rotate', 'Mirror', 'Draw order'])]);
    expect(subs(m, 'Line tools').map((x) => x.label)).toEqual(['Trim', 'Extend', 'Offset', 'Fillet', 'Chamfer', 'Break', 'Join…', 'Reverse direction', 'Convert to cable route', 'Quick measure', 'Add selected', 'Make block…']);
    expect(subs(m, 'Line tools').map((x) => x.key).filter(Boolean)).toEqual(['TR', 'EX', 'O', 'F', 'CHA', 'BR', 'J', 'QM', 'B']);
    expect(subs(m, 'Line tools').find((x) => x.label === 'Convert to cable route')!.lv).toBe(true);
  });

  it('Erase is red, Copy selection is not called Copy, Properties shows the palette, Undo and Redo name their steps', () => {
    const m = flat(menu([sk({})], { redoLabel: 'Move', canRedo: true }));
    expect(m.find((x) => x.label === 'Erase')).toMatchObject({ bad: true, key: 'Del', act: 'sk', arg: 'erase' });
    expect(m.find((x) => x.label === 'Copy selection')).toMatchObject({ key: 'CO', arg: 'copy' });
    expect(m.some((x) => x.label === 'Copy')).toBe(true); // Copy under Clipboard (Ctrl+C) is the clipboard's
    expect(m.filter((x) => x.label === 'Copy').map((x) => x.key)).toEqual(['Ctrl+C']);
    expect(m.find((x) => x.label === 'Properties')).toMatchObject({ on: true, act: 'properties' });
    expect(m.find((x) => x.label === 'Undo Offset')).toMatchObject({ cmd: 'UNDO', off: false });
    expect(m.find((x) => x.label === 'Redo Move')).toMatchObject({ cmd: 'REDO', off: false });
    expect(flat(menu([sk({})], { propsOn: false, undoLabel: undefined, canUndo: false })).find((x) => x.label === 'Undo')).toMatchObject({ off: true });
  });

  it('a polyline: Polyline tools with Close or Open, Explode, Use as room boundary only when closed', () => {
    const open = sk({ kind: 'pline', pts: [[0, 0], [1, 0], [1, 1]] }), closed = { ...open, closed: true };
    expect(labels(menu([open])).slice(0, 3)).toEqual(['Repeat LINE', '-', 'Polyline tools']);
    const t = subs(menu([open]), 'Polyline tools').map((x) => x.label);
    expect(t).toEqual(['Offset', 'Fillet', 'Chamfer', 'Trim', 'Extend', 'Break', 'Join…', 'Close', 'Explode', 'Reverse direction', 'Convert to cable route', 'Quick measure', 'Add selected', 'Make block…']);
    const c = subs(menu([closed]), 'Polyline tools').map((x) => x.label);
    expect(c).toContain('Open');
    expect(c).toContain('Use as room boundary');
    expect(subs(menu([closed]), 'Polyline tools').find((x) => x.label === 'Use as room boundary')!.lv).toBe(true);
    expect(labels(menu([open]))).toContain('Scale');
  });

  it('circles, arcs, ellipses and revision clouds have their own shorter lists', () => {
    expect(subs(menu([sk({ kind: 'circle', pts: [[0, 0]], r: 1 })]), 'Circle tools').map((x) => x.label)).toEqual(['Offset', 'Quick measure', 'Add selected', 'Make block…']);
    expect(subs(menu([sk({ kind: 'arc', pts: [[0, 0]], r: 1 })]), 'Arc tools').map((x) => x.label)).toEqual(['Offset', 'Quick measure', 'Add selected', 'Make block…']);
    expect(subs(menu([sk({ kind: 'ellipse', pts: [[0, 0]] })]), 'Ellipse tools').map((x) => x.label)).toEqual(['Quick measure', 'Add selected', 'Make block…']);
    expect(subs(menu([sk({ kind: 'pline', closed: true, cloud: 5 })]), 'Revision cloud tools').map((x) => x.label)).toEqual(['Quick measure', 'Add selected', 'Make block…']);
  });

  it('a text: Text tools with Edit text, Find, Justify (the current one now), Height, Case, Frame, Background mask', () => {
    const m = menu([sk({ kind: 'text', pts: [[0, 0]], text: 'Hi', just: 'C', mask: true, frame: 'box' })], { lengthM: undefined });
    expect(labels(m)).toEqual(['Repeat LINE', '-', 'Text tools', ...tail(['Erase', 'Move', 'Copy selection', 'Rotate', 'Draw order'])]);
    expect(subs(m, 'Text tools').map((x) => x.label)).toEqual(['Edit text', 'Find and replace…', 'Justify', 'Text height', 'Case', 'Frame', 'Background mask', 'Add selected', 'Make block…']);
    expect(subs(m, 'Justify').filter((x) => x.now).map((x) => x.arg)).toEqual(['txjust|C']);
    expect(subs(m, 'Frame').filter((x) => x.now).map((x) => x.arg)).toEqual(['txframe|box']);
    expect(subs(m, 'Text tools').find((x) => x.label === 'Background mask')).toMatchObject({ on: true, arg: 'txmask' });
    expect(subs(m, 'Text height').map((x) => x.label)[0]).toBe('1.8 mm on paper');
  });

  it('a note, a dimension, a hatch and a block each have their own list', () => {
    const note = menu([sk({ kind: 'mtext', pts: [[0, 0]], just: 'TR' })]);
    expect(subs(note, 'Note tools').map((x) => x.label)).toEqual(['Edit text', 'Width…', 'Justify', 'Find and replace…', 'Add selected', 'Make block…']);
    expect(subs(note, 'Justify').filter((x) => x.now).map((x) => x.arg)).toEqual(['ntjust|TR']);
    const dim = menu([sk({ kind: 'dim', pts: [[0, 0], [1, 0]], text: '5 m' })]);
    expect(subs(dim, 'Dimension tools').map((x) => x.label)).toEqual(['Edit text', 'Remove text override', 'Dimension style', 'Precision', 'Text position', 'Add selected', 'Make block…']);
    expect(subs(menu([sk({ kind: 'dim', pts: [[0, 0], [1, 0]], dimKind: 'angular' })], { dimStyles: [] }), 'Dimension tools').map((x) => x.label)).toEqual(['Edit text', 'Precision', 'Add selected', 'Make block…']);
    expect(subs(dim, 'Precision').filter((x) => x.now).map((x) => x.arg)).toEqual(['dimprec|2']);
    const hatch = menu([sk({ kind: 'pline', closed: true, pts: [[0, 0], [4, 0], [4, 4]], hatch: { pattern: 'ansi31', scale: 1, angle: 45 }, holes: [[[1, 1], [2, 1], [2, 2]]] })]);
    expect(subs(hatch, 'Hatch tools').map((x) => x.label)).toEqual(['Edit hatch…', 'Hatch scale', 'Hatch angle', 'Set origin', 'Remove islands', 'Recreate boundary', 'Quick measure', 'Add selected', 'Make block…']);
    expect(subs(hatch, 'Hatch angle').filter((x) => x.now).map((x) => x.arg)).toEqual(['hangle|45']);
    const blk = menu([sk({ kind: 'insert', pts: [[0, 0]], block: 'WC', attrs: { A: '1' } })]);
    expect(subs(blk, 'Block tools').map((x) => x.label)).toEqual(['Edit attributes', 'Reset attributes', 'Open block editor', 'Edit block in place', 'Select all of this block', 'Count instances', 'Replace with another block', 'Explode', 'Add selected']);
    expect(subs(blk, 'Replace with another block').map((x) => x.label)).toEqual(['DOOR']);
    expect(subs(menu([sk({ kind: 'insert', pts: [[0, 0]], block: 'WC' })], { blocks: ['WC'] }), 'Block tools').map((x) => x.label)).toEqual(['Open block editor', 'Edit block in place', 'Select all of this block', 'Count instances', 'Explode', 'Add selected']);
  });

  it('a cable tray: its electrical rows flat and in amber, Width with the current one, Tray tools; modify has no Scale, Rotate or Mirror', () => {
    const m = menu([sk({ kind: 'pline', pts: [[0, 0], [5, 0]], tray: { widthMm: 300 } })]);
    expect(labels(m)).toEqual(['Repeat LINE', '-', 'Size tray from cables', 'Fill ratio check', 'Cables in this route', 'Width', 'Tray tools', ...tail(['Erase', 'Move', 'Copy selection', 'Draw order'])]);
    expect(['Size tray from cables', 'Fill ratio check', 'Cables in this route', 'Width', 'Tray tools'].map((l) => flat(m).find((x) => x.label === l)!.lv)).toEqual([true, true, true, true, true]);
    expect(subs(m, 'Width').filter((x) => x.now).map((x) => x.arg)).toEqual(['width|300']);
    expect(subs(m, 'Tray tools').map((x) => x.label)).toEqual(['Offset', 'Break', 'Fillet', 'Reverse direction', 'Quick measure']);
    expect(drawnHead({ items: [sk({ kind: 'pline', tray: { widthMm: 300 } })], devices: 0 })).toEqual({ icon: 'tray', title: 'Cable tray', detail: '300 mm · A-WALL' });
  });

  it('a cable route: Trace circuit, Show in SLD (when the page can), Reverse direction, Route tools; modify with Scale, Rotate and Mirror', () => {
    const r = sk({ kind: 'pline', pts: [[0, 0], [5, 0]], cable: { feederId: 'F1' } });
    expect(labels(menu([r]))).toEqual(['Repeat LINE', '-', 'Trace circuit', 'Show in SLD', 'Reverse direction', 'Route tools', ...tail(['Erase', 'Move', 'Copy selection', 'Scale', 'Rotate', 'Mirror', 'Draw order'])]);
    expect(labels(menu([r], { canShow: false }))).not.toContain('Show in SLD');
    expect(subs(menu([r]), 'Route tools').map((x) => x.label)).toEqual(['Trim', 'Extend', 'Offset', 'Fillet', 'Break', 'Join…', 'Quick measure']);
    expect(['Trace circuit', 'Reverse direction', 'Route tools'].map((l) => menu([r]).find((x) => x !== '-' && x.label === l) as CtxItem).map((x) => x.lv)).toEqual([true, true, true]);
  });

  it('several drawn objects: Tools (or the kind\'s) with Join (all open paths), Array, Quick measure, Make block; Filter lists the kinds', () => {
    const a = sk({}), b = sk({ id: 'b', kind: 'pline', pts: [[0, 0], [1, 1], [2, 0]] }), c = sk({ id: 'c', kind: 'circle', pts: [[0, 0]], r: 1 });
    const m = menu([a, b]);
    expect(labels(m)).toEqual(['Repeat LINE', '-', 'Tools', ...tail(['Erase', 'Move', 'Copy selection', 'Scale', 'Mirror', 'Draw order']).flatMap((x) => (x === 'Quick select…' ? [x, 'Filter'] : [x]))]);
    expect(subs(m, 'Tools').map((x) => x.label)).toEqual(['Join…', 'Array', 'Quick measure', 'Make block…']);
    expect(subs(menu([a, c]), 'Tools').map((x) => x.label)).toEqual(['Array', 'Quick measure', 'Make block…']);
    expect(labels(menu([a, sk({ id: 'z' })]))).toContain('Line tools');
    expect(subs(m, 'Filter').map((x) => [x.label, x.key, x.arg])).toEqual([['Line only', '1', 'filter|Line'], ['Polyline only', '1', 'filter|Polyline']]);
    expect(drawnHead({ items: [a, b, sk({ id: 'd' })], devices: 2 })).toEqual({ icon: 'boxes', title: '5 picked', second: '2 Line · 1 Polyline · 2 devices' });
  });

  it('drawn objects with devices: Erase, Move, Copy selection only; Filter has Devices only and Drawn objects only first', () => {
    const m = menu([sk({}), sk({ id: 'b', kind: 'circle', pts: [[0, 0]], r: 1 })], { devices: 3 });
    expect(labels(m)).toEqual(['Repeat LINE', '-', 'Clipboard', 'Undo Offset', 'Redo', '-', 'Erase', 'Move', 'Copy selection', '-', 'Isolate', 'Pan', 'Zoom', '-', 'Select similar', 'Invert selection', 'Deselect all', 'Quick select…', 'Filter', 'Count', '-', 'Properties', 'Options…']);
    expect(subs(m, 'Filter').map((x) => [x.label, x.key, x.arg])).toEqual([['Devices only', '3', 'filter|devices'], ['Drawn objects only', '2', 'filter|drawn'], ['Line only', '1', 'filter|Line'], ['Circle only', '1', 'filter|Circle']]);
  });

  it('Clipboard has Cut, Copy, Copy with base point, Paste, Paste to original coordinates (the last two off with nothing to paste); Draw order has the four', () => {
    const m = menu([sk({})], { canPaste: false });
    expect(subs(m, 'Clipboard').map((x) => [x.label, x.key, x.arg, !!x.off])).toEqual([['Cut', 'Ctrl+X', 'clipboard|cut', false], ['Copy', 'Ctrl+C', 'clipboard|copy', false], ['Copy with base point', 'Ctrl+Shift+C', 'clipboard|copybase', false], ['Paste', 'Ctrl+V', 'clipboard|paste', true], ['Paste to original coordinates', undefined, 'clipboard|pasteorig', true]]);
    expect(subs(m, 'Draw order').map((x) => [x.label, x.arg])).toEqual([['Bring to front', 'draworder|front'], ['Send to back', 'draworder|back'], ['Above object', 'draworder|above'], ['Under object', 'draworder|under']]);
    expect(subs(m, 'Isolate').map((x) => x.cmd)).toEqual(['ISOLATEOBJECTS', 'HIDEOBJECTS', 'UNISOLATEOBJECTS']);
    expect(subs(m, 'Zoom').map((x) => x.label)).toEqual(['Zoom window', 'Zoom to selection', 'Zoom previous', 'Zoom extents']);
  });

  it('the header: one object by kind, length and layer; a tray by width', () => {
    expect(drawnHead({ items: [sk({})], devices: 0, lengthM: 2.3456 })).toEqual({ icon: 'line', title: 'Line', detail: '2.35 m · A-WALL' });
    expect(drawnHead({ items: [sk({ kind: 'text', pts: [[0, 0]] })], devices: 0 })).toEqual({ icon: 'text', title: 'Text', detail: 'A-WALL' });
    expect(drawnHead({ items: [sk({ kind: 'insert', pts: [[0, 0]] })], devices: 0 }).icon).toBe('insert');
    expect(drawnHead({ items: [sk({ kind: 'pline', cable: { feederId: 'F1' } })], devices: 0 }).icon).toBe('route');
  });

  it('every entry is a page action or a command the command line knows, every edit is one editSketch handles, every icon exists, no glyph stands in for an icon', () => {
    const picks: SketchItem[][] = [[sk({})], [sk({ kind: 'pline', pts: [[0, 0], [1, 0], [1, 1]], closed: true })], [sk({ kind: 'text', pts: [[0, 0]], text: 'x' })], [sk({ kind: 'mtext', pts: [[0, 0]] })], [sk({ kind: 'dim', pts: [[0, 0], [1, 0]], text: 'x' })],
      [sk({ kind: 'insert', pts: [[0, 0]], block: 'WC', attrs: { A: '1' } })], [sk({ kind: 'pline', tray: { widthMm: 300 } })], [sk({ kind: 'pline', cable: { feederId: 'F1' } })], [sk({}), sk({ id: 'b' })],
      [sk({ kind: 'pline', closed: true, hatch: { pattern: 'ansi31', scale: 1, angle: 0 }, holes: [[[1, 1], [2, 1], [2, 2]]] })], [sk({ kind: 'circle', pts: [[0, 0]], r: 1 })], [sk({ kind: 'point', pts: [[0, 0]] })]];
    for (const items of picks) {
      for (const x of flat(menu(items, { devices: 0 }))) {
        if (x.icon) expect(MENU_ICONS[x.icon], x.icon).toBeTruthy();
        expect(`${x.label}${x.key ?? ''}`, x.label).not.toMatch(/[▸▾✓●]/);
        if (x.sub) continue;
        if (x.cmd) expect(cadCommand(x.cmd), x.cmd).toBeTruthy();
        else if (x.act === 'sk') expect(isSketchEdit(argOf(x.arg ?? '').action), x.label).toBe(true);
        else expect(x.act, x.label).toBeTruthy();
      }
    }
  });
});

describe('right-click menu of the opened drawing\'s objects: the drawn-object menu on their stand-ins', () => {
  it('a block of the drawing has its own Block tools (page actions), in the same one order; no Filter', () => {
    const m = menu([sk({ id: 'dw:1A:0' }), sk({ id: 'dw:1A:1', kind: 'circle', pts: [[0, 0]], r: 1 })], { dwBlock: 'L1', lengthM: undefined });
    expect(labels(m)).toContain('Block tools');
    expect(labels(m)).not.toContain('Filter');
    const tools = subs(m, 'Block tools');
    expect(tools.map((x) => x.label)).toEqual(['Count instances', 'Explode into drawn objects', 'Copy as a block of this drawing', 'Crop…', 'Select all of this block']);
    expect(tools.every((x) => x.act === 'dw')).toBe(true);
    expect(tools.map((x) => x.arg)).toEqual(['count', 'explode', 'copyblock', 'crop', 'selblock']);
    expect(labels(m).slice(-3)).toEqual(['-', 'Properties', 'Options…']);
  });
});

