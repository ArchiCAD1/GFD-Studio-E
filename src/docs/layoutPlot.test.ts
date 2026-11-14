import { describe, expect, it } from 'vitest';
import type { CadText, CadView, FileLayout } from '../engines/cad/cadEngine';
import { asFileLayout, type DrawingLayout } from '../model/drawingLayouts';
import { layoutPlotHtml, layoutPlotSvg, printerPaper } from './layoutPlot';

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
