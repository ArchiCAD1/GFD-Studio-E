import { describe, expect, it } from 'vitest';
import { addSelectedTool, allItems, blankMenu, groups, isItem, commandMenu, countLine, measureOf, shownBy, SNAP_OVERRIDES, tidy, type CtxEntry, type MenuCommon } from './cadContextMenu';
import { cadCommand } from './cadCommands';
import { MENU_ICONS } from './cadMenuIcons';
import type { SketchItem } from '../../types';

const items = allItems;
const labels = (list: CtxEntry[]) => list.map((x) => (x === '-' ? '-' : x.label));
const common: MenuCommon = { canUndo: true, canRedo: false, undoLabel: 'Offset', propsOn: true, canPaste: false };
const blank = blankMenu({ ...common, recent: ['LINE', 'MOVE', 'GRID'], objectsHidden: false });
const cmdMenu = commandMenu({ options: [{ option: 'Close', key: 'C' }, { option: 'Undo', key: 'U' }], inputs: ['2.5', '@1,0'], toggles: { ortho: true, polar: false, osnap: true }, snapOnce: 'midpoint' });

describe('right-click menus (phase 1)', () => {
  it('every entry, also in lists of lists, runs a command the command line knows, or a page action: no entry without a tool behind it', () => {
    for (const x of [...items(blank), ...items(cmdMenu)]) {
      if (x.sub) continue;
      if (x.cmd) expect(cadCommand(x.cmd), x.cmd).toBeTruthy();
      else expect(x.act, x.label).toBeTruthy();
    }
  });

  it('every icon is one the menus have, and no label or key uses a glyph in place of an icon', () => {
    for (const x of [...items(blank), ...items(cmdMenu)]) {
      if (x.icon) expect(MENU_ICONS[x.icon], x.icon).toBeTruthy();
      expect(`${x.label}${x.key ?? ''}`, x.label).not.toMatch(/[▸▾✓●]/);
    }
  });

  it('the blank-canvas menu: Repeat and Recent commands, Paste off with nothing to paste, Undo / Redo as the history has them, one Zoom list', () => {
    expect(labels(blank)).toEqual(['Repeat LINE', 'Recent commands', '-', 'Paste', 'Paste to original coordinates', 'Undo Offset', 'Redo', '-', 'Isolate', 'Pan', 'Zoom', '-',
      'Select all', 'Quick select…', 'Count', '-', 'Place device', 'Cable route', 'Cable tray', '-', 'Properties', 'Options…']);
    const by = (l: string) => items(blank).find((x) => x.label === l)!;
    expect(by('Recent commands').sub!.filter(isItem).map((x) => [x.label, x.arg])).toEqual([['MOVE', '1'], ['GRID', '2']]);
    expect([by('Paste').off, by('Undo Offset').off, by('Redo').off, by('End object isolation').off]).toEqual([true, false, true, true]);
    expect(by('Zoom').sub!.filter(isItem).map((x) => x.label)).toEqual(['Zoom window', 'Zoom previous', 'Zoom extents']);
    expect([by('Properties').on, by('Place device').lv, by('Options…').cmd]).toEqual([true, true, 'OPTIONS']);
    expect(labels(blankMenu({ ...common, recent: [], canPaste: true, canUndo: false, undoLabel: undefined, objectsHidden: true })).slice(0, 2)).toEqual(['Paste', 'Paste to original coordinates']);
    expect(by('Undo Offset').key).toBe('Ctrl+Z');
  });

  it('the command menu: Enter, Cancel, the prompt options, Recent input, Snap overrides (the one chosen is now, next) and the switches with their state', () => {
    expect(labels(cmdMenu)).toEqual(['Enter', 'Cancel', '-', 'Close', 'Undo', '-', 'Recent input', 'Snap overrides', '-', 'Object snap', 'Ortho', 'Polar tracking', '-', 'Zoom']);
    const by = (l: string) => items(cmdMenu).find((x) => x.label === l)!;
    expect(by('Recent input').sub!.filter(isItem).map((x) => x.arg)).toEqual(['2.5', '@1,0']);
    expect(by('Close')).toMatchObject({ act: 'option', arg: 'C', key: 'C' });
    expect(by('Snap overrides').sub!.filter(isItem).map((x) => x.label)).toEqual(SNAP_OVERRIDES.map((m) => m.label));
    expect(by('Midpoint')).toMatchObject({ now: true, key: 'next' });
    expect([by('Ortho'), by('Polar tracking'), by('Object snap')].map((x) => [x.key, x.on])).toEqual([['F8', true], ['F10', false], ['F3', true]]);
    // No values typed yet and no options: neither shows.
    expect(labels(commandMenu({ options: [], inputs: [], toggles: {} })).slice(0, 4)).toEqual(['Enter', 'Cancel', '-', 'Snap overrides']);
  });

  it('tidy: no separator first, last or twice, and no empty flyout', () => {
    expect(labels(tidy(['-', { label: 'A' }, '-', '-', { label: 'B', sub: [] }, { label: 'C' }, '-']))).toEqual(['A', '-', 'C']);
  });

  it('tidy also tidies the lists, and drops a list left empty', () => {
    const t = tidy([{ label: 'A', sub: ['-', { label: 'x' }, '-', '-', { label: 'y' }, '-'] }, { label: 'B', sub: ['-', '-'] }, { label: 'C', sub: [{ label: 'D', sub: [] }] }]);
    expect(labels(t)).toEqual(['A']);
    expect(labels((t[0] as { sub: CtxEntry[] }).sub)).toEqual(['x', '-', 'y']);
  });

  it('groups: the non-empty ones with a divider between', () => {
    expect(labels(groups([], [{ label: 'A' }, { label: 'B' }], [], [{ label: 'C' }]))).toEqual(['A', 'B', '-', 'C']);
  });

  it('SELECTINVERT and Z O are commands, so the entries that run them work', () => {
    expect(cadCommand('SELECTINVERT')).toMatchObject({ action: 'selectInvert' });
    expect(cadCommand('INVERTSELECTION')).toMatchObject({ action: 'selectInvert' });
    expect(cadCommand('Z O')).toMatchObject({ action: 'zoomSel' });
    expect(cadCommand('ZOOM OBJECT')).toMatchObject({ action: 'zoomSel' });
  });

  it('COUNT: by kind, most first; devices after', () => {
    expect(countLine(['Line', 'Polyline', 'Line', 'Circle'], 3)).toBe('2 Line · 1 Circle · 1 Polyline · 3 devices');
    expect(countLine([], 1)).toBe('1 device');
  });

  it('ISOLATEOBJECTS / HIDEOBJECTS: the keys hidden on their drawing only', () => {
    const f = shownBy({ file: 'a.dwg', mode: 'hide', keys: ['sk:1', 'dev:2'] }, 'a.dwg');
    expect([f('sk:1'), f('dev:2'), f('sk:3')]).toEqual([false, false, true]);
    expect(shownBy({ file: 'a.dwg', mode: 'hide', keys: ['sk:1'] }, 'b.dwg')('sk:1')).toBe(true);
    expect(shownBy(null, 'a.dwg')('sk:1')).toBe(true);
  });

  it('ADDSELECTED: the tool that draws the same kind', () => {
    const it0 = (x: Partial<SketchItem>) => ({ id: 'x', layer: '0', pts: [[0, 0], [1, 0]], kind: 'line', ...x }) as SketchItem;
    expect([it0({}), it0({ kind: 'pline' }), it0({ kind: 'pline', tray: { widthMm: 300 } }), it0({ kind: 'pline', cable: { feederId: 'F1' } }), it0({ kind: 'pline', closed: true, cloud: 5 }),
      it0({ kind: 'circle', r: 1 }), it0({ kind: 'text' }), it0({ kind: 'insert', block: 'B' }), it0({ kind: 'attdef' })].map(addSelectedTool))
      .toEqual(['line', 'pline', 'tray', 'cable', 'revcloud', 'circle', 'text', 'insert', null]);
  });

  it('QUICKMEASURE: total length, and the area inside closed polylines and circles; texts are not measured', () => {
    const sq = { id: 'a', layer: '0', kind: 'pline', closed: true, pts: [[0, 0], [2, 0], [2, 2], [0, 2]] } as SketchItem;
    const ln = { id: 'b', layer: '0', kind: 'line', pts: [[0, 0], [3, 4]] } as SketchItem;
    const c = { id: 'c', layer: '0', kind: 'circle', pts: [[0, 0]], r: 1 } as SketchItem;
    const t = { id: 'd', layer: '0', kind: 'text', pts: [[0, 0]], text: 'x' } as SketchItem;
    const q = measureOf([sq, ln, c, t]);
    expect([q.n, +q.length.toFixed(4), +q.area.toFixed(4)]).toEqual([3, +(8 + 5 + 2 * Math.PI).toFixed(4), +(4 + Math.PI).toFixed(4)]);
  });
});

describe('QUICKMEASURE on polylines with arc segments', () => {
  it('a closed polyline of two straight sides and a half circle: length and area count the arc', () => {
    const d = 2, p = { id: 'P', kind: 'pline', layer: '0', closed: true, pts: [[0, 0], [d, 0], [d, 1], [0, 1]], bulges: [0, 0, 0, 0] } as SketchItem;
    // A bulge of 1 on the side from (2,0) to (2,1) makes it a half circle of diameter 1.
    const q = measureOf([{ ...p, bulges: [0, 1, 0, 0] } as SketchItem]);
    expect(q.length).toBeCloseTo(2 + Math.PI / 2 + 2 + 1, 6);
    expect(q.area).toBeCloseTo(2 + Math.PI / 8, 6);
  });
});

describe('QUICKMEASURE on hatches', () => {
  it('a hatch\'s area is its net area, islands taken out', () => {
    const h: SketchItem = { id: 'H', kind: 'pline', layer: 'LV-HATCH', closed: true, pts: [[0, 0], [10, 0], [10, 10], [0, 10]], hatch: { pattern: 'ansi31', scale: 3, angle: 0 }, holes: [[[2, 2], [4, 2], [4, 4], [2, 4]]] };
    const c: SketchItem = { id: 'C', kind: 'circle', layer: 'LV-HATCH', pts: [[0, 0]], r: 1, hatch: { pattern: 'solid', scale: 3, angle: 0 } };
    expect(measureOf([h]).area).toBeCloseTo(96);
    expect(measureOf([c]).area).toBeCloseTo(Math.PI, 2);
  });
});
