import { describe, expect, it } from 'vitest';
import { ANNO_START, SYMBOL_R_MM, symbolUnits } from './cadAnnotate';
import { LV_PALETTE, PALETTE_GROUPS } from './cadDevices';
import { PLAN_SYMBOL_IDS, PLAN_SYMBOLS, planSymbolShapes, planSymbolSvg, symbolBox, symbolGeom } from './planSymbols';

describe('plan symbols', () => {
  it('a symbol is the same size on paper at every scale', () => {
    // 1.8 mm radius: metres on the plan at 1:50, 1:100 and 1:200.
    expect(symbolUnits({ ...ANNO_START, scale: 50 }, 1)).toBeCloseTo(0.09, 6);
    expect(symbolUnits({ ...ANNO_START, scale: 100 }, 1)).toBeCloseTo(0.18, 6);
    expect(symbolUnits({ ...ANNO_START, scale: 200 }, 1)).toBeCloseTo(0.36, 6);
    // A drawing in millimetres: the same paper size in its units.
    expect(symbolUnits({ ...ANNO_START, scale: 100 }, 0.001)).toBeCloseTo(180, 6);
    for (const scale of [50, 100, 200]) expect((symbolUnits({ ...ANNO_START, scale }, 1) * 1000) / scale).toBeCloseTo(SYMBOL_R_MM, 6);
  });

  it('holds the 26 plan symbols and the 4 plain ones, each with a name and unique id', () => {
    expect(PLAN_SYMBOL_IDS.filter((id) => PLAN_SYMBOLS[id].group !== 'plain')).toHaveLength(26);
    expect(PLAN_SYMBOL_IDS).toHaveLength(30);
    expect(new Set(PLAN_SYMBOL_IDS).size).toBe(30);
    for (const id of PLAN_SYMBOL_IDS) { expect(PLAN_SYMBOLS[id].label).not.toBe(''); expect(PLAN_SYMBOLS[id].prims.length).toBeGreaterThan(0); }
  });

  it('no symbol is oversized or undersized on paper', () => {
    for (const id of PLAN_SYMBOL_IDS) {
      const b = symbolBox(id)!, w = b.x1 - b.x0, h = b.y1 - b.y0;
      for (const v of [b.x0, b.y0, b.x1, b.y1]) expect(Number.isFinite(v)).toBe(true);
      expect(Math.max(w, h), id).toBeGreaterThanOrEqual(2.5);
      expect(w, id).toBeLessThanOrEqual(12);
      expect(h, id).toBeLessThanOrEqual(7);
    }
  });

  it('a socket is a half circle below its bar with the stem down the sheet', () => {
    const g = symbolGeom('socket', 0, 0, 1)!;
    const arc = g.paths[0].pts;
    expect(arc[0][0]).toBeCloseTo(-1.75); expect(arc[arc.length - 1][0]).toBeCloseTo(1.75);
    expect(Math.min(...arc.map((q) => q[1]))).toBeCloseTo(-1.75);
    expect(Math.max(...arc.map((q) => q[1]))).toBeCloseTo(0);
    expect(g.paths[1].pts).toEqual([[0, -1.75], [0, -3.25]]);
  });

  it('scales and moves with its point, and takes a tag for its text', () => {
    const g = symbolGeom('db', 10, 20, 0.1, 'EDB')!;
    expect(g.paths[0].pts[0][0]).toBeCloseTo(9.7); expect(g.paths[0].pts[0][1]).toBeCloseTo(20.175);
    expect(g.texts[0]).toMatchObject({ s: 'EDB', at: [10, 20] });
    expect(g.texts[0].h).toBeCloseTo(0.18);
    expect(symbolGeom('nothing', 0, 0, 1)).toBeUndefined();
  });

  it('draws on a sheet in black and white, y down', () => {
    const svg = planSymbolSvg('exhaust-fan', 50, 50);
    expect(svg).toContain('<circle cx="50" cy="50" r="1.75"/>');
    expect(svg).toContain('>EF</text>');
    expect(svg).not.toMatch(/NaN|undefined/);
    expect(svg.match(/#[0-9a-f]{3,6}/gi)!.every((c) => c === '#000' || c === '#fff')).toBe(true);
    // The socket's stem points down the sheet (larger y).
    expect(planSymbolSvg('socket', 0, 0)).toContain('M0 1.75L0 3.25');
    expect(planSymbolSvg('nothing', 0, 0)).toBe('');
  });

  it('saves as lines, circles and text on its layer', () => {
    const shapes = planSymbolShapes('junction-box', 'E-LV-POINTS', 5, 5, 0.1);
    expect(shapes.map((s) => s.kind)).toEqual(['circle', 'text']);
    expect(shapes.every((s) => s.layer === 'E-LV-POINTS')).toBe(true);
    expect(shapes[0].r).toBeCloseTo(0.175);
    expect(planSymbolShapes('socket', 'L', 0, 0, 1).map((s) => s.kind)).toEqual(['pline', 'line', 'line']);
  });

  it('the palette points only at symbols that exist, every item under a heading with a symbol for its button', () => {
    const linked = LV_PALETTE.filter((x) => x.symbol.plan);
    expect(linked.filter((x) => 'lv' in x.kind).map((x) => x.id)).toEqual(['exfan', 's13', 's13t', 'shaver', 's15', 'hd', 'isol']);
    // The accessories are their plan symbols.
    expect(linked.filter((x) => 'acc' in x.kind).map((x) => x.id)).toEqual(['switch', 'switch-2way', 'dimmer', 'switch-fan', 'limit-switch', 'push-button', 'switch-panel', 'cb-box', 'junction-box', 'pull-box', 'junction-box-ceiling']);
    for (const x of LV_PALETTE) {
      expect(PALETTE_GROUPS, x.id).toContain(x.group);
      expect(PLAN_SYMBOLS[(x.symbol.plan ?? x.symbol.icon)!], x.id).toBeDefined();
    }
    // Each point type once: placing counts on the circuit by its type.
    expect(new Set(LV_PALETTE.map((x) => x.id)).size).toBe(LV_PALETTE.length);
    for (const x of LV_PALETTE) if ('lv' in x.kind) expect(x.kind.lv).toBe(x.id);
  });

  it('a power outlet carries its rating beside the socket', () => {
    const s15 = LV_PALETTE.find((x) => x.id === 's15')!.symbol;
    expect(symbolGeom(s15.plan!, 0, 0, 1, s15.tag)!.texts.map((t) => t.s)).toEqual(['15 A']);
    expect(planSymbolSvg(s15.plan!, 0, 0, 1, s15.tag)).toContain('>15 A</text>');
    expect(symbolBox(s15.plan!, s15.tag)!.x1).toBeLessThan(symbolBox(s15.plan!, '100 A TPN')!.x1);
  });
});

describe('plan symbols turned on the plan', () => {
  it('turns about its point by right angles, exactly', () => {
    // A socket's stem: down the sheet at 0°, to the right at 90°, up at 180°, to the left at 270°.
    const stem = (rot: number) => symbolGeom('socket', 0, 0, 1, undefined, rot)!.paths[1].pts[1];
    expect(stem(0)).toEqual([0, -3.25]);
    expect(stem(90)).toEqual([3.25, 0]);
    expect(stem(180).map((v) => v + 0)).toEqual([0, 3.25]);
    expect(stem(270).map((v) => v + 0)).toEqual([-3.25, 0]);
    expect(symbolGeom('socket', 0, 0, 1, undefined, 360)!.paths[1].pts[1].map((v) => v + 0)).toEqual([0, -3.25]);
  });

  it('keeps its text upright and clear of the symbol', () => {
    const at0 = symbolGeom('power-outlet', 0, 0, 1, '15 A')!.texts[0], at180 = symbolGeom('power-outlet', 0, 0, 1, '15 A', 180)!.texts[0];
    expect(at0.side).toBe(true);
    // Turned half round: placed by its middle, left of the symbol, the same height.
    expect(at180.side).toBeUndefined();
    expect(at180.at[0]).toBeLessThan(-2.9);
    expect(at180.h).toBe(at0.h);
    const b = symbolBox('power-outlet', '15 A', 180)!;
    expect(b.x1).toBeCloseTo(2.4);
    expect(planSymbolSvg('power-outlet', 0, 0, 1, '15 A', 180)).toContain('text-anchor="middle"');
  });

  it('turns on the sheet and in a saved drawing alike', () => {
    expect(planSymbolSvg('socket', 10, 10, 1, undefined, 180)).toContain('M10 8.25L10 6.75');
    const line = planSymbolShapes('socket', 'L', 0, 0, 1, undefined, 90)[1];
    expect(line.pts).toEqual([[1.75, 0], [3.25, 0]]);
  });
});
