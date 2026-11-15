import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { CadText, CadView, FileLayout } from '../engines/cad/cadEngine';
import { placeBoard, placeLvPoint } from '../model/cadDevices';
import { dropRefGeometry, keepRefGeometry } from '../model/cadRefs';
import { wireLevel } from '../model/cadWiring';
import { asFileLayout, type DrawingLayout } from '../model/drawingLayouts';
import type { Project, SketchItem } from '../types';
import { layoutDesign, layoutPlotHtml, layoutPlotSvg, printerPaper } from './layoutPlot';

const text = (s: string, x: number, y: number, h: number, more: Partial<CadText> = {}): CadText => ({ x, y, h, rot: 0, s, layer: 0, rgb: 0, align: 0, ...more } as CadText);
/** A model in millimetres whose origin is at 1000, 2000: a 10 m square from 0, 0 (relative), a line far away, a line on a layer that is off. */
function model(texts: CadText[] = []): Pick<CadView, 'segs' | 'segLayers' | 'info'> {
  const sq = [0, 0, 10000, 0, 10000, 0, 10000, 10000, 10000, 10000, 0, 10000, 0, 10000, 0, 0];
  return {
    segs: new Float32Array([...sq, 900000, 900000, 910000, 900000, 2000, 2000, 8000, 8000]),
    segLayers: new Uint16Array([0, 0, 0, 0, 0, 1]),
    info: { origin: [1000, 2000], layers: [{ on: true }, { on: false }], texts } as unknown as CadView['info']
  };
}
/** A3 with one viewport 200 × 200 mm at 100, 50 showing the square at 1:100 (20 m of model in 200 mm), centred on it. */
const layout = (more: Partial<DrawingLayout['viewports'][0]> = {}): FileLayout =>
  asFileLayout({ name: 'Layout2', paper: [420, 297], viewports: [{ x: 100, y: 50, w: 200, h: 200, cx: 6000, cy: 7000, vh: 20000, ...more }] }, 1);

describe('a layout of the drawing as it plots', () => {
  it('is an SVG the size of its paper, the model clipped to each viewport, black lines', () => {
    const { svg, w, h } = layoutPlotSvg(layout(), model());
    expect([w, h]).toEqual([420, 297]);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="420mm" height="297mm" viewBox="0 0 420 297"/);
    // The frame: 100 mm from the left, its top 47 mm from the paper's top (297 − 50 − 200).
    expect(svg).toContain('<clipPath id="vp0"><rect x="100" y="47" width="200" height="200"/></clipPath>');
    // The square (10 m at 1:100 = 100 mm), its corner at the model point 1000, 2000: 50 mm left of and below the centre, one line carried on round it.
    expect(svg).toContain('<path d="M150 197L250 197L250 97L150 97L150 197"/>');
    expect(svg).toContain('stroke="#000" stroke-width="0.18"');
    expect(svg).not.toMatch(/stroke="(?!#000)/);
    expect(svg.match(/<path /g)).toHaveLength(1); // the far line and the one on the layer that is off are left out
    expect(svg).not.toContain('<rect x="100" y="47" width="200" height="200" fill="none"'); // the frame is on screen only
  });

  it('prints a frame only when asked, and nothing of a viewport that is off', () => {
    expect(layoutPlotSvg(layout(), model(), { frames: [true] }).svg).toContain('<rect x="100" y="47" width="200" height="200" fill="none" stroke="#000" stroke-width="0.25"/>');
    const off = { ...layout(), viewports: layout().viewports.map((v) => ({ ...v, on: false })) };
    expect(layoutPlotSvg(off, model(), { frames: [true] }).svg).not.toContain('<path');
  });

  it('shows the layers the app has on: one turned off there is left out, one turned on there prints', () => {
    // The square's layer off in the app, the diagonal's on (the drawing has them the other way round).
    const { svg } = layoutPlotSvg(layout(), model(), { layersOn: new Uint8Array([0, 1]) });
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('<path d="M170 177L230 117"/>'); // 2000, 2000 → 8000, 8000 relative: 20 mm in from the square's corner, 60 mm long
    expect(layoutPlotSvg(layout(), model([text('ROOM', 6000, 7000, 250)]), { layersOn: [false, true] }).svg).not.toContain('ROOM');
  });

  it('puts the model texts on the paper with capitals of their height (the font is 1 / 0.716 of it), turned and aligned; too small to read are left out', () => {
    const { svg } = layoutPlotSvg(layout(), model([
      text('LOBBY <A&B>', 6000, 7000, 250), text('up', 6000, 7000, 300, { rot: Math.PI / 2, align: 1 }), text('fitted', 6000, 7000, 250, { align: 2, w: 1200 } as Partial<CadText>),
      text('speck', 6000, 7000, 20), text('away', 950000, 7000, 250)
    ]));
    expect(svg).toContain('<text x="200" y="147" font-size="3.49" text-anchor="start">LOBBY &lt;A&amp;B&gt;</text>');
    expect(svg).toContain('<text x="200" y="147" font-size="4.19" text-anchor="middle" transform="rotate(-90 200 147)">up</text>');
    expect(svg).toContain('<text x="200" y="147" font-size="3.49" text-anchor="end" textLength="12" lengthAdjust="spacingAndGlyphs">fitted</text>');
    expect(svg).not.toContain('speck');
    expect(svg).not.toContain('away');
  });

  it("prints what the drawing file has on its own paper: its lines and texts, from the layout's origin and units", () => {
    // Paper space in inches (25.4 mm per unit), its 0, 0 at 10, 5 mm on an A4 sheet; no viewports.
    const l: FileLayout = {
      name: 'Title', tab: 1, paper: [297, 210], margins: [5, 5, 5, 5], at: [10, 5], mm_per_unit: 25.4, viewports: [],
      origin: [1, 1], segs: new Float32Array([0, 0, 2, 0]), segColors: new Uint32Array(1), segLayers: new Uint16Array(1), texts: [text('DRG 01', 1, 2, 0.2)], layers: []
    };
    const { svg } = layoutPlotSvg(l, model());
    // 1, 1 in → 35.4, 30.4 mm from the lower left → y 179.6 from the top; 3, 1 in → 86.2 mm.
    expect(svg).toContain('stroke-width="0.25" stroke-linecap="round" stroke-linejoin="round"><path d="M35.4 179.6L86.2 179.6"/></g>');
    expect(svg).toContain('<text x="35.4" y="154.2" font-size="7.09" text-anchor="start">DRG 01</text>');
  });

  it('a file layout with no paper set up plots on A3, as it is shown', () => {
    const l: FileLayout = { ...layout(), paper: [0, 0], margins: [0, 0, 0, 0] };
    expect(layoutPlotSvg(l, model())).toMatchObject({ w: 420, h: 297 });
  });

  it('many segments go into several paths', () => {
    const n = 9000, segs = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) segs.set([i, 0, i, 5000], i * 4); // separate uprights 1 unit apart
    const m = { segs, segLayers: new Uint16Array(n), info: { origin: [0, 0], layers: [{ on: true }], texts: [] } as unknown as CadView['info'] };
    const l = asFileLayout({ name: 'L', paper: [420, 297], viewports: [{ x: 10, y: 10, w: 400, h: 277, cx: 4500, cy: 2500, vh: 6925 }] }, 1); // 1:25
    expect(layoutPlotSvg(l, m).svg.match(/<path /g)).toHaveLength(3);
  });

  it('is a page of its own size with no margins', () => {
    const { html, w, h } = layoutPlotHtml('plan.dwg · Layout2 <draft>', layout(), model());
    expect([w, h]).toEqual([420, 297]);
    expect(html).toContain('<title>plan.dwg · Layout2 &lt;draft&gt;</title>');
    expect(html).toContain('@page { size: 420mm 297mm; margin: 0; }');
    expect(html).not.toMatch(/<script/i);
    const portrait = layoutPlotHtml('x', asFileLayout({ name: 'P', paper: [594, 841], viewports: [] }, 1), model());
    expect(portrait.html).toContain('@page { size: 594mm 841mm; margin: 0; }');
  });

  it('knows the papers a printer takes: A4 and A3 either way up, A2 and A1 landscape', () => {
    expect(printerPaper(420, 297)).toEqual({ pageSize: 'A3', landscape: true });
    expect(printerPaper(297, 420)).toEqual({ pageSize: 'A3 portrait', landscape: false });
    expect(printerPaper(210, 297.4)).toEqual({ pageSize: 'A4', landscape: false });
    expect(printerPaper(297, 210)).toEqual({ pageSize: 'A4', landscape: true });
    expect(printerPaper(594, 420)).toEqual({ pageSize: 'A2', landscape: true });
    expect(printerPaper(841, 594)).toEqual({ pageSize: 'A1', landscape: true });
    expect([printerPaper(594, 841), printerPaper(1189, 841), printerPaper(500, 300)]).toEqual([undefined, undefined, undefined]);
  });
});

const gf = { building: 'V', level: 'GF' };
/** A villa ground floor whose plan is GF.dwg, drawn in millimetres: the DB at 1, 1 m, three lights 4 m apart at y 6 m
 * (a lighting circuit, wired) and a socket at 19, 1 m (a power circuit). */
function villa(items: SketchItem[] = []): Project {
  let p: Project = {
    ...sampleProject, lvPoints: undefined, cadWiring: undefined, cadSketch: undefined, cadLength: undefined, elvDevices: undefined, drawingSet: undefined, cadLayouts: undefined,
    building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }, { id: 'FF', name: 'First floor', kind: 'typical', heightM: 4 }] }], rooms: [] },
    cadPlans: [{ building: 'V', level: 'GF', file: 'GF.dwg', units: 4 }], ...(items.length ? { cadSketch: [{ file: 'gf.DWG', items }] } : {})
  };
  p = placeBoard(p, 'DB-GF1', gf, 1, 1);
  for (const x of [6, 10, 14]) p = placeLvPoint(p, gf, 'ltg', 'DB-GF1-Y1', x, 6).project;
  p = placeLvPoint(p, gf, 's13', 'DB-GF1-B6', 19, 1).project;
  return wireLevel(p, gf).project;
}
/** A3 with a viewport 200 × 120 mm at 100, 50 showing 20 × 12 m at 1:100, centred on 10, 6 m (drawing units: mm). A model
 * point x, y (m) is on the page at 100 + 10 x mm from the left and 297 − 50 − 10 y mm from the top. */
const plan = (more: DrawingLayout['viewports'] = []): FileLayout =>
  asFileLayout({ name: 'Layout2', paper: [420, 297], viewports: [{ x: 100, y: 50, w: 200, h: 120, cx: 10000, cy: 6000, vh: 12000 }, ...more] }, 1);
const circles = (svg: string) => [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="1.8"/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('the design made in the app, through the viewports of a layout of the drawing', () => {
  it('draws the level\'s devices of every layout, its DBs and wiring at their places on the page, at their paper sizes', () => {
    const [d] = layoutDesign(villa(), 'GF.dwg', 4, plan());
    // The three lights (circles 1.8 mm in radius) at 6, 10 and 14 m across, 6 m up.
    expect(circles(d)).toEqual([[160, 187], [200, 187], [240, 187]]);
    // The socket of the power circuit is there with them (its bar 4.8 mm wide at 19, 1 m, the stem below), and the DB with its name.
    expect(d).toContain('<path d="M287.6 237L292.4 237" fill="none"/>');
    expect(d).toContain('<path d="M290 238.75L290 240.25" fill="none"/>');
    expect(d).toContain('<rect x="107.5" y="235.75" width="5" height="2.5" fill="#fff"/>');
    expect(d).toMatch(/<text [^>]*font-weight="700" fill="#000">DB-GF1<\/text>/);
    // The lighting circuit's wiring and its home run to the DB.
    expect(d.match(/<path class="ln" /g)!.length).toBeGreaterThanOrEqual(2);
    // No room outlines: the architect's plan is the drawing itself.
    expect(d).not.toContain('#8c8c8c');
  });

  it('draws the work drawn on the file — lines, text, tray runs — cut at the window', () => {
    const items: SketchItem[] = [
      { id: 'a', kind: 'line', layer: '0', pts: [[2000, 2000], [8000, 2000]] },
      { id: 'b', kind: 'text', layer: '0', pts: [[4000, 9000]], text: 'PLANT ROOM', h: 300 },
      { id: 'c', kind: 'pline', layer: 'E-TRAY', pts: [[0, 11000], [20000, 11000]], tray: { widthMm: 300, service: 'Power', route: 'A' } },
      { id: 'far', kind: 'line', layer: '0', pts: [[500000, 500000], [510000, 500000]] }
    ];
    const [d] = layoutDesign(villa(items), 'GF.dwg', 4, plan());
    expect(d).toContain('<path d="M120 227L180 227" fill="none" stroke="#000"');
    // The text 300 mm high is 3 mm on the paper at 1:100: its font 3 / 0.716.
    expect(d).toMatch(/<text x="140" y="157" font-size="4.19" fill="#000">PLANT ROOM<\/text>/);
    expect(d).toMatch(/stroke-width="0.5"\/>/); // the tray, at the trays pen
    expect(d).toContain('CT 300 POWER');
    // The drawn work is cut at the viewport's window on the page (the far line lies outside it).
    expect(d).toContain('<clipPath id="ld0"><rect x="100" y="127" width="200" height="120"/></clipPath>');
    expect(d).toContain('<g class="drawn" clip-path="url(#ld0)">');
  });

  it('gives a piece per viewport: none for one that is off, and no tags or DB names in a key plan', () => {
    const key = { x: 310, y: 200, w: 100, h: 60, cx: 10000, cy: 6000, vh: 30000 }; // 1:500
    const l = plan([key, { ...key, x: 10 }]);
    const off = { ...l, viewports: l.viewports.map((v, i) => (i === 2 ? { ...v, on: false } : v)) };
    const d = layoutDesign(villa(), 'GF.dwg', 4, off);
    expect(d).toHaveLength(3);
    expect(d[2]).toBe('');
    expect(circles(d[1])).toHaveLength(3);
    expect(d[0]).toContain('>DB-GF1<');
    expect(d[1]).not.toContain('>DB-GF1<');
    // Each piece keeps its own clip paths apart.
    expect(d[0]).not.toContain('ld1');
  });

  it('is empty for a drawing with no design; a drawing that is no level\'s plan shows the level it is given, with its own drawn work', () => {
    expect(layoutDesign({ ...villa(), lvPoints: undefined, cadWiring: undefined, boards: sampleProject.boards.map(({ planPoint: _p, ...b }) => b) }, 'GF.dwg', 4, plan())).toEqual([]);
    expect(layoutDesign(villa(), 'other.dwg', 4, plan())).toEqual([]);
    const tray: SketchItem = { id: 'c', kind: 'pline', layer: 'E-TRAY', pts: [[0, 11000], [20000, 11000]], tray: { widthMm: 300, service: 'Power', route: 'A' } };
    const p = villa([tray]);
    const [d] = layoutDesign({ ...p, cadSketch: [...p.cadSketch!, { file: 'other.dwg', items: [{ id: 'z', kind: 'line', layer: '0', pts: [[2000, 2000], [8000, 2000]] }] }] }, 'other.dwg', 4, plan(), gf);
    expect(circles(d)).toHaveLength(3);
    expect(d).toContain('<path d="M120 227L180 227"');
    expect(d).not.toContain('CT 300 POWER'); // the tray is drawn on the other file
  });

  it('draws the level\'s ELV devices with the rest, and a reference under the plan in grey', () => {
    const p: Project = {
      ...villa(), elvDevices: [{ id: 'E1', type: 'smoke-detector', buildingId: 'V', levelId: 'GF', x: 5, y: 5 }],
      cadRefs: { 'gf.dwg': [{ name: 'STR-GF', file: 'STR-GF.dxf', type: 'overlay', at: [1000, 0], scale: 1000, rot: 0, fade: 50, print: true }] }
    };
    const plain = layoutDesign(villa(), 'GF.dwg', 4, plan())[0];
    // The detector is one more symbol, after the level's lights and socket.
    const withElv = layoutDesign({ ...p, cadRefs: undefined }, 'GF.dwg', 4, plan())[0];
    expect(withElv.length).toBeGreaterThan(plain.length);
    expect(withElv.startsWith(plain)).toBe(true);
    // The structure in metres, a grid line along y = 6 m, placed 1 m to the right: 18 m is 180 mm at 1:100, cut at the window.
    keepRefGeometry({ file: 'STR-GF.dxf', units: 6, segs: Float64Array.from([0, 6, 18, 6]), segLayers: Uint16Array.from([0]), layers: [{ name: 'S-GRID', rgb: 1 }] });
    try {
      expect(layoutDesign(p, 'GF.dwg', 4, plan())[0]).toMatch(/^<path class="ref" d="M110 187L290 187" fill="none" stroke="#b3b3b3" stroke-width="0.13"\/>/);
    } finally { dropRefGeometry('STR-GF.dxf'); }
  });

  it('plots inside its viewport, over the model', () => {
    const design = layoutDesign(villa(), 'GF.dwg', 4, plan());
    const { svg } = layoutPlotSvg(plan(), model(), { design });
    const group = /<g clip-path="url\(#vp0\)">(.*)<\/g>$/.exec(svg.replace(/<\/svg>$/, ''))![1];
    expect(circles(group)).toHaveLength(3);
    expect(layoutPlotSvg(plan(), model()).svg).not.toContain('r="1.8"');
  });
});

