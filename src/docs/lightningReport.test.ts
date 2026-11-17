import ExcelJS from 'exceljs';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { LpsInputs } from '../calc/lightningProtection';
import type { Project } from '../types';
import { buildLightningReportHtml, lightningLayoutSvg, lightningReportBlocks, LPS_SECTIONS } from './lightningReport';
import { buildLightningDocx } from './lightningWord';
import { buildLightningWorkbook } from './lightningWorkbook';
import { lightningProtection } from '../calc/lightningProtection';
import { RISK_NOTE, type RiskInputs } from '../calc/lightningRisk';

const lightning: LpsInputs = {
  lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', lpsClass: 'II', riskRef: 'RA-01', meshM: 10, sphereRadiusM: 30, downSpacingM: 10,
  rodHeightM: 3, angleDeg: 45, eseMastM: 5, eseDeltaTUs: 60, eseDownPerTerminal: 2, earthPitPerDown: true
};
const project: Project = { ...sampleProject, lightning };

describe('lightning protection report', () => {
  it('has the eight sections, in order, and only the ones asked for', () => {
    expect(lightningReportBlocks(project, lightning).map((b) => b.key)).toEqual(LPS_SECTIONS.map((s) => s.key).filter((x) => x !== 'risk'));
    expect(lightningReportBlocks(project, lightning, ['checks', 'inputs']).map((b) => b.key)).toEqual(['inputs', 'checks']);
  });

  it('shows entries as entered and a missing one as Not entered — never a default', () => {
    const pairs = new Map(lightningReportBlocks(project, { ...lightning, sphereRadiusM: undefined }, ['inputs'])[0].pairs);
    expect(pairs.get('Mesh size')).toBe('10 m');
    expect(pairs.get('Rolling sphere radius')).toBe('Not entered');
    expect(pairs.get('Protection class')).toBe('Class II');
  });

  it('the methods table carries the working and DATA REQUIRED', () => {
    const rows = lightningReportBlocks(project, { ...lightning, eseDeltaTUs: undefined }, ['methods'])[0].table!.rows;
    expect(rows[0][0]).toBe('Mesh on flat roof (selected)');
    expect(rows[2][3]).toContain('2 · √(2rh − h²)');
    expect(rows[3][4]).toBe('DATA REQUIRED');
  });

  it('PDF sheet: black-and-white, escaped, with the roof layout drawing', () => {
    const html = buildLightningReportHtml({ ...project, name: 'Tower <A>' });
    expect(html).toContain('Tower &lt;A&gt;');
    expect(html).toContain('<svg');
    expect(html).toContain('not an IEC 62305 method');
    expect(html.match(/#[0-9a-f]{3,6}/gi)!.every((c) => /^#(000|fff|444|f2f2f2)$/i.test(c))).toBe(true);
    expect(buildLightningReportHtml(project, ['inputs'])).not.toContain('<svg');
  });

  it('roof layout drawing: 13 down conductors, 5 runs inside the edge', () => {
    const svg = lightningLayoutSvg(lightning, lightningProtection(lightning));
    expect(svg.match(/<circle /g)!.length).toBe(13 + 1); // + legend
    expect(svg.match(/<line /g)!.length).toBe(5 + 1);
    expect(lightningLayoutSvg({ ...lightning, widthM: 0 }, lightningProtection({ ...lightning, widthM: 0 }))).toBe('');
  });

  it('a project with no study still gives a sheet that says what is missing', () => {
    const html = buildLightningReportHtml(sampleProject);
    expect(html).toContain('Not entered');
    expect(html).toContain('Building size not set');
  });
});

describe('lightning protection workbook', () => {
  const cell = (ws: ExcelJS.Worksheet, label: string) => {
    let out: ExcelJS.Cell | undefined;
    ws.eachRow((row) => { if (row.getCell(1).value === label && !out) out = row.getCell(2); });
    return out!;
  };

  it('keeps live formulas with the app\'s results, and reads back', async () => {
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await buildLightningWorkbook(project).xlsx.writeBuffer());
    const inp = back.getWorksheet('Inputs')!, calc = back.getWorksheet('Calculation')!;
    expect(inp.getCell('B5').value).toBe(40);
    expect(inp.getCell('B11').value).toBe(10);
    expect(inp.getCell('B19').value).toBe('Yes');
    expect(cell(calc, 'Perimeter').value).toMatchObject({ formula: expect.stringContaining('2*(Inputs!$B$5+Inputs!$B$6)'), result: 130 });
    expect(cell(calc, 'Roof conductor').value).toMatchObject({ result: 285 });
    expect(cell(calc, 'Largest bay diagonal').value).toMatchObject({ result: 26.15 });
    expect(cell(calc, 'Protection radius Rp').value).toMatchObject({ result: 86.46 });
    expect(cell(calc, 'Down conductors').value).toMatchObject({ result: 13 });
    expect(cell(calc, 'Earth pits').value).toMatchObject({ result: 13 });
  });

  it('later formulas point at the right cells', () => {
    const calc = buildLightningWorkbook(project).getWorksheet('Calculation')!;
    const per = cell(calc, 'Perimeter').address, runs = cell(calc, 'Runs across the length').address;
    const f = (cell(calc, 'Roof conductor').value as ExcelJS.CellFormulaValue).formula;
    expect(f).toContain(per.replace(/([A-Z]+)(\d+)/, '$$$1$$$2'));
    expect(f).toContain(runs.replace(/([A-Z]+)(\d+)/, '$$$1$$$2'));
  });

  it('a blank input is left blank and its results say DATA REQUIRED', () => {
    const wb = buildLightningWorkbook({ ...sampleProject, lightning: { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh' } });
    expect(wb.getWorksheet('Inputs')!.getCell('B11').value).toBeNull();
    expect(cell(wb.getWorksheet('Calculation')!, 'Roof conductor').value).toMatchObject({ result: 'DATA REQUIRED' });
    expect(cell(wb.getWorksheet('Calculation')!, 'Down conductors').value).toMatchObject({ result: 'DATA REQUIRED' });
  });
});

describe('lightning protection Word file', () => {
  it('packs to a .docx with the chosen sections', async () => {
    const buf = await Packer.toBuffer(buildLightningDocx(project, ['inputs', 'notes']));
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(2000);
  });
});

describe('lightning risk assessment in the report', () => {
  // The 35 × 26 × 8.5 m villa of the engine's tests; every factor is the engineer's own entry.
  const risk: RiskInputs = { shape: 'rectangle', thunderDays: 40, strikeRatio: 1, locationFactor: 1, fireRisk: 0.02, fireProvisions: 0.5, specialHazard: 1, typicalLoss: 0.5,
    tolerableRisk: 1e-5, damageProbability: { none: 1, IV: 0.2, III: 0.1, II: 0.05, I: 0.02 }, sensitivity: 1.5 };
  const villa: LpsInputs = { ...lightning, lengthM: 35, widthM: 26, heightM: 8.5, risk };
  const p: Project = { ...sampleProject, lightning: villa };

  it('comes first, as three sections: inputs, working and the risk for each class', () => {
    const blocks = lightningReportBlocks(p, villa);
    expect(blocks.slice(0, 4).map((b) => b.key)).toEqual(['risk', 'risk', 'risk', 'inputs']);
    expect(new Map(blocks[0].pairs).get('Tolerable risk')).toBe('1 × 10⁻⁵ per year');
    expect(blocks[1].table!.rows[1]).toEqual(['Collection area', expect.stringContaining('35 × 26 + 6 × 8.5'), '6063.82 m²']);
    expect(blocks[2].table!.rows[3]).toEqual(['Class II (minimum)', '0.05', '6.06 × 10⁻⁶', 'OK']);
    expect(blocks[2].notes).toEqual([expect.stringContaining('× 1.5 the minimum is Class II (9.1 × 10⁻⁶ per year)'), 'Minimum protection from this assessment: Class II.', expect.stringContaining('One risk component only')]);
    expect(lightningReportBlocks(p, villa, ['inputs']).map((b) => b.key)).toEqual(['inputs']);
  });

  it('carries the verification line and shows no source or standard number for the factors', () => {
    const blocks = lightningReportBlocks(p, villa, ['risk']);
    expect(blocks[0].notes).toEqual([RISK_NOTE]);
    expect(JSON.stringify(blocks)).not.toMatch(/IEC|NFC|62305/);
    expect(lightningReportBlocks(p, villa, ['notes'])[0].notes).toContain(RISK_NOTE);
  });

  it('a missing factor is Not entered and the result says DATA REQUIRED', () => {
    const blocks = lightningReportBlocks(p, { ...villa, risk: { ...risk, typicalLoss: undefined } }, ['risk', 'checks']);
    expect(new Map(blocks[0].pairs).get('Typical loss')).toBe('Not entered');
    expect(blocks[2].notes![0]).toBe('DATA REQUIRED: typical loss.');
    expect(blocks[3].table!.rows.some((r) => r[1].startsWith('Risk assessment: DATA REQUIRED'))).toBe(true);
  });

  it('PDF sheet: the collection area sketch, black-and-white', () => {
    const html = buildLightningReportHtml(p, ['risk']);
    expect(html.match(/<svg/g)!.length).toBe(1);
    expect(html).toContain('collection area 6,063.82 m²');
    expect(html.match(/#[0-9a-f]{3,6}/gi)!.every((c) => /^#(000|fff|444|f2f2f2)$/i.test(c))).toBe(true);
    expect(buildLightningReportHtml({ ...sampleProject, lightning: { ...villa, risk: { ...risk, shape: 'area', collectionAreaM2: 5000 } } }, ['risk'])).not.toContain('<svg');
  });

  it('workbook: a Risk assessment sheet with live formulas and the app\'s results; none without a risk assessment', async () => {
    expect(buildLightningWorkbook(project).getWorksheet('Risk assessment')).toBeUndefined();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await buildLightningWorkbook(p).xlsx.writeBuffer());
    const ws = back.getWorksheet('Risk assessment')!;
    const cell = (label: string, col = 2) => { let out: ExcelJS.Cell | undefined; ws.eachRow((row) => { if (row.getCell(1).value === label && !out) out = row.getCell(col); }); return out!; };
    expect(cell('Thunderstorm days').value).toBe(40);
    expect(cell('Building length').value).toMatchObject({ formula: 'IF(Inputs!$B$5="","",Inputs!$B$5)', result: 35 });
    expect((cell('Collection area').value as ExcelJS.CellFormulaValue).formula).toContain('$B$8*$B$9+6*$B$10*($B$8+$B$9)+9*PI()*$B$10^2');
    expect((cell('Collection area').value as ExcelJS.CellFormulaValue).result).toBeCloseTo(6063.82, 2);
    expect((cell('Direct strikes on building').value as ExcelJS.CellFormulaValue).result).toBeCloseTo(0.024255, 6);
    expect(cell('Class II', 3).value).toMatchObject({ result: 'OK' });
    expect(cell('Class III', 3).value).toMatchObject({ result: 'Exceeds' });
    expect(cell('Minimum protection').value).toMatchObject({ result: 'Class II', formula: expect.stringContaining('"More than Class I"') });
    expect((cell('No protection').value as ExcelJS.CellFormulaValue).formula).toContain(cell('Direct strikes on building').address.replace(/([A-Z]+)(\d+)/, '$$$1$$$2'));
  });

  it('Word file: packs with the risk sections', async () => {
    const buf = await Packer.toBuffer(buildLightningDocx(p, ['risk']));
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });
});

describe('lightning risk assessment report — roof outline', () => {
  const outline: [number, number][] = [[0, 0], [40, 0], [40, 15], [20, 15], [20, 30], [0, 30]];
  const study: LpsInputs = { ...lightning, heightM: 8, risk: { shape: 'outline', outline, thunderDays: 40, strikeRatio: 1, locationFactor: 1 } };
  const p: Project = { ...sampleProject, lightning: study };

  it('the PDF draws the outline on its 3 × height band, black-and-white, and the working carries the cross-check', () => {
    const html = buildLightningReportHtml(p, ['risk']);
    expect(html.match(/<path /g)!.length).toBe(2);
    expect(html).toContain('stroke-linejoin="round"');
    expect(html).toContain('Roof outline 900 m²');
    expect(html.match(/#[0-9a-f]{3,6}/gi)!.every((c) => /^#(000|fff|444|f2f2f2)$/i.test(c))).toBe(true);
    const blocks = lightningReportBlocks(p, study, ['risk']);
    expect(new Map(blocks[0].pairs).get('Collection area')).toBe('Roof outline pushed out by 3 × height');
    expect(blocks[1].table!.rows.map((r) => r[0])).toContain('Collection area — cross-check');
  });

  it('workbook: the outline\'s collection area goes in as the entered area', () => {
    const ws = buildLightningWorkbook(p).getWorksheet('Risk assessment')!;
    expect(ws.getCell('B11').value as number).toBeGreaterThan(5000);
    expect(ws.getCell('B8').value).toBeNull();
  });
});

describe('lightning risk assessment report — parts with their own height', () => {
  const study: LpsInputs = { ...lightning, heightM: 8, risk: { shape: 'outline', outline: [[0, 0], [40, 0], [40, 30], [0, 30]], thunderDays: 40, strikeRatio: 1, locationFactor: 1,
    parts: [{ outline: [[10, 10], [14, 10], [14, 14], [10, 14]], heightM: 20 }] } };
  const p: Project = { ...sampleProject, lightning: study };

  it('names the parts in the inputs and draws each on its own band', () => {
    const blocks = lightningReportBlocks(p, study, ['risk']);
    expect(new Map(blocks[0].pairs).get('Collection area')).toBe('Roof outline and its parts, each pushed out by 3 × its own height');
    expect(new Map(blocks[0].pairs).get('Parts with their own height')).toBe('1: 16 m² roof, 20 m high');
    const html = buildLightningReportHtml(p, ['risk']);
    expect(html.match(/<path /g)!.length).toBe(4);
    expect(html).toContain('and 1 part · each reaches 3 × its own height (shaded)');
    expect(html.match(/#[0-9a-f]{3,6}/gi)!.every((c) => /^#(000|fff|444|f2f2f2)$/i.test(c))).toBe(true);
  });
});
