import ExcelJS from 'exceljs';
import { AIR_METHODS, lightningProtection, type LpsInputs } from '../calc/lightningProtection';
import { revisionStamp } from '../model/revisions';
import type { Project } from '../types';
import { lightningRisk, RISK_LEVELS, RISK_NOTE, riskLevelLabel, riskScope, riskStarted, studyRiskInputs } from '../calc/lightningRisk';
import { LPS_NOTES } from './lightningReport';

// Kept apart from lightningReport.ts so ExcelJS loads only when the workbook is exported.
/** The lightning protection calculation as an Excel workbook with live formulas: change a value on the Inputs
 * sheet and the Calculation sheet follows. A blank input shows DATA REQUIRED, as in the app. */

/** Rows of the Inputs sheet (column B holds the value). */
const IN = { length: 5, width: 6, height: 7, cls: 8, risk: 9, method: 10, mesh: 11, sphere: 12, spacing: 13, rod: 14, angle: 15, eseH: 16, eseDt: 17, eseDown: 18, pit: 19 } as const;
const b = (k: keyof typeof IN) => `Inputs!$B$${IN[k]}`;
const r2 = (v: number) => Math.round(v * 100) / 100;
const guard = (f: string) => `IFERROR(${f},"DATA REQUIRED")`;
/** A blank input counts as missing (Excel would read it as 0). */
const need = (keys: (keyof typeof IN)[], f: string) => `IF(OR(${keys.map((k) => `${b(k)}=""`).join(',')}),"DATA REQUIRED",${guard(f)})`;

export function buildLightningWorkbook(project: Project): ExcelJS.Workbook {
  const i: LpsInputs = project.lightning ?? { lengthM: 0, widthM: 0, heightM: 0, method: 'mesh' };
  const r = lightningProtection(i);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GFD Studio E';

  const inp = wb.addWorksheet('Inputs');
  inp.columns = [{ width: 44 }, { width: 28 }, { width: 10 }];
  inp.addRow(['Lightning protection — concept calculation']).font = { bold: true, size: 14 };
  inp.addRow([project.name, revisionStamp(project)]);
  inp.addRow([]);
  inp.addRow(['Input (entered by the engineer)', 'Value', 'Unit']).font = { bold: true };
  const num = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : null);
  const rows: [string, string | number | null, string][] = [
    ['Building length', num(i.lengthM), 'm'], ['Building width', num(i.widthM), 'm'], ['Building height', num(i.heightM), 'm'],
    ['Protection class', i.lpsClass ?? null, ''], ['Risk assessment reference', i.riskRef?.trim() || null, ''],
    ['Air termination method', AIR_METHODS.find((m) => m.id === i.method)!.label, ''],
    ['Mesh size', num(i.meshM), 'm'], ['Rolling sphere radius', num(i.sphereRadiusM), 'm'], ['Down conductor spacing', num(i.downSpacingM), 'm'],
    ['Rod height above the roof', num(i.rodHeightM), 'm'], ['Protection angle', num(i.angleDeg), '°'],
    ['ESE terminal height above the roof', num(i.eseMastM), 'm'], ['ESE advance time ΔT', num(i.eseDeltaTUs), 'µs'],
    ['Down conductors for each ESE terminal', num(i.eseDownPerTerminal), ''], ['Earth pit at each down conductor', i.earthPitPerDown ? 'Yes' : 'No', '']
  ];
  for (const row of rows) inp.addRow(row);
  inp.addRow([]);
  for (const t of LPS_NOTES) inp.addRow([t]).getCell(1).alignment = { wrapText: true, vertical: 'top' };

  const calc = wb.addWorksheet('Calculation');
  calc.columns = [{ width: 44 }, { width: 18 }, { width: 8 }, { width: 70 }];
  calc.addRow(['Lightning protection — calculation']).font = { bold: true, size: 14 };
  calc.addRow([]);
  calc.addRow(['Result', 'Value', 'Unit', 'Formula']).font = { bold: true };
  const m = (id: LpsInputs['method']) => r.methods.find((x) => x.method === id);
  const ok = (id: LpsInputs['method']) => !r.invalid && m(id)?.status !== 'data';
  const dr = 'DATA REQUIRED';
  let at = 3;
  /** Adds a formula row and returns its cell reference, for later formulas. */
  const line = (label: string, formula: string, result: number | string, unit: string, basis: string) => {
    calc.addRow([label, { formula, result }, unit, basis]);
    return `$B$${++at}`;
  };
  const head = (t: string) => { calc.addRow([]); calc.addRow([t]).font = { bold: true }; at += 2; };

  head('Building');
  const per = line('Perimeter', need(['length', 'width'], `2*(${b('length')}+${b('width')})`), r.invalid ? dr : r.perimeterM, 'm', '2 × (length + width)');
  line('Roof area', need(['length', 'width'], `${b('length')}*${b('width')}`), r.invalid ? dr : r.roofAreaM2, 'm²', 'length × width');
  const half = line('Roof centre to far corner', need(['length', 'width'], `SQRT(${b('length')}^2+${b('width')}^2)/2`), r.invalid ? dr : r.halfDiagonalM, 'm', '√(length² + width²) ÷ 2');

  head('Mesh on flat roof');
  const mesh = m('mesh');
  const runsL = line('Runs across the length', need(['length', 'mesh'], `ROUNDUP(${b('length')}/${b('mesh')},0)-1`), ok('mesh') ? mesh!.bays![0] - 1 : dr, 'no.', 'length ÷ mesh size, rounded up, less one');
  const runsW = line('Runs across the width', need(['width', 'mesh'], `ROUNDUP(${b('width')}/${b('mesh')},0)-1`), ok('mesh') ? mesh!.bays![1] - 1 : dr, 'no.', 'width ÷ mesh size, rounded up, less one');
  line('Roof conductor', guard(`${per}+${runsL}*${b('width')}+${runsW}*${b('length')}`), ok('mesh') ? mesh!.roofConductorM : dr, 'm', 'roof edge + runs');

  head('Vertical rods — protection angle');
  const ang = m('angle');
  const ra = line('Radius protected at roof level', need(['rod', 'angle'], `${b('rod')}*TAN(RADIANS(${b('angle')}))`), ok('angle') ? ang!.radiusM! : dr, 'm', 'rod height × tan(protection angle)');
  line('Rods', need(['length', 'width'], `ROUNDUP(${b('length')}/(${ra}*SQRT(2)),0)*ROUNDUP(${b('width')}/(${ra}*SQRT(2)),0)`), ok('angle') ? ang!.terminals : dr, 'no.', 'one rod per bay no larger than radius × √2');

  head('Vertical rods — rolling sphere');
  const sph = m('sphere');
  const dia = line('Largest bay diagonal', need(['sphere', 'rod'], `2*SQRT(2*${b('sphere')}*${b('rod')}-${b('rod')}^2)`), ok('sphere') ? r2(2 * Math.sqrt(2 * i.sphereRadiusM! * i.rodHeightM! - i.rodHeightM! ** 2)) : dr, 'm', '2 × √(2 × sphere radius × rod height − rod height²)');
  line('Rods', need(['length', 'width'], `(ROUNDUP(${b('length')}/(${dia}/SQRT(2)),0)+1)*(ROUNDUP(${b('width')}/(${dia}/SQRT(2)),0)+1)`), ok('sphere') ? sph!.terminals : dr, 'no.', 'a rod at every node of a grid no larger than diagonal ÷ √2');

  head('ESE air terminal (NFC 17-102 method)');
  const es = m('ese');
  const at5 = `SQRT(2*${b('sphere')}*5-25+${b('eseDt')}*(2*${b('sphere')}+${b('eseDt')}))`;
  const rp = line('Protection radius Rp', need(['sphere', 'eseH', 'eseDt'], `IF(${b('eseH')}<2,NA(),IF(${b('eseH')}>=5,SQRT(2*${b('sphere')}*${b('eseH')}-${b('eseH')}^2+${b('eseDt')}*(2*${b('sphere')}+${b('eseDt')})),${b('eseH')}*${at5}/5))`),
    ok('ese') ? es!.radiusM! : dr, 'm', '√(2rh − h² + ΔL(2r + ΔL)), ΔL = ΔT × 1 m/µs; in proportion to h below 5 m; not below 2 m');
  const eseN = line('Terminals', guard(`IF(${rp}>=${half},1,ROUNDUP(${b('length')}/(${rp}*SQRT(2)),0)*ROUNDUP(${b('width')}/(${rp}*SQRT(2)),0))`), ok('ese') ? es!.terminals : dr, 'no.', 'one if Rp reaches the far corner, else one per bay no larger than Rp × √2');

  head('Down conductors and earth pits (selected method)');
  const isEse = `${b('method')}="${AIR_METHODS.find((x) => x.id === 'ese')!.label}"`;
  const downs = line('Down conductors', `IF(${isEse},${need(['eseDown'], `${eseN}*ROUNDUP(${b('eseDown')},0)`)},${need(['spacing'], `MAX(2,ROUNDUP(${per}/${b('spacing')},0))`)})`, r.downConductors || dr, 'no.',
    'perimeter ÷ spacing, rounded up, at least 2; ESE: terminals × down conductors for each');
  line('Down conductor length', need(['height'], `${downs}*${b('height')}`), r.downConductors ? r.downConductorM : dr, 'm', 'down conductors × building height');
  line('Test joints', guard(`${downs}+0`), r.downConductors || dr, 'no.', 'one in each down conductor');
  line('Earth pits', guard(`IF(${b('pit')}="Yes",${downs}+0,0)`), r.downConductors ? r.earthPits : dr, 'no.', 'one at each down conductor when chosen');
  line('Ring earth conductor', guard(`IF(ISNUMBER(${downs}),${per}+0,NA())`), r.downConductors ? r.ringConductorM : dr, 'm', 'building perimeter');
  if (riskStarted(i.risk)) addRiskSheet(wb, project, i);
  return wb;
}

/** Rows of the Risk assessment sheet (column B holds the value). */
const RK = { days: 5, ratio: 6, density: 7, length: 8, width: 9, height: 10, area: 11, location: 12, fire: 13, provisions: 14, hazard: 15, loss: 16, tolerable: 17, sens: 18, p0: 19 } as const;

/** The risk assessment as its own sheet with live formulas: inputs at the top, then the working, the risk for
 * each protection class and the minimum. The building size follows the Inputs sheet. */
function addRiskSheet(wb: ExcelJS.Workbook, project: Project, i: LpsInputs) {
  const k = studyRiskInputs(i), risk = lightningRisk(k), dr = 'DATA REQUIRED';
  const ws = wb.addWorksheet('Risk assessment');
  ws.columns = [{ width: 44 }, { width: 18 }, { width: 24 }, { width: 70 }];
  ws.addRow(['Lightning risk assessment — preliminary']).font = { bold: true, size: 14 };
  ws.addRow([project.name, revisionStamp(project)]);
  ws.addRow([]);
  ws.addRow(['Input (entered by the engineer)', 'Value', 'Unit']).font = { bold: true };
  const v = (x: number | undefined) => (x !== undefined && Number.isFinite(x) ? x : null);
  const c = (key: keyof typeof RK) => `$B$${RK[key]}`;
  const blank = (...keys: (keyof typeof RK)[]) => `OR(${keys.map((x) => `${c(x)}=""`).join(',')})`;
  const size = (key: 'length' | 'width' | 'height', x: number) => (k.shape === 'rectangle' ? { formula: `IF(${b(key)}="","",${b(key)})`, result: x > 0 ? x : '' } : null);
  const inputs: [string, ExcelJS.CellValue, string][] = [
    ['Thunderstorm days', v(k.thunderDays), 'days/yr'], ['Strike point ratio', v(k.strikeRatio), ''], ['Measured strike density (optional)', v(k.strikeDensity), '/km²/yr'],
    ['Building length', size('length', i.lengthM), 'm'], ['Building width', size('width', i.widthM), 'm'], ['Building height', size('height', i.heightM), 'm'],
    ['Collection area, entered (optional)', k.shape === 'rectangle' ? null : v(risk.collectionAreaM2), 'm²'],
    ['Location factor', v(k.locationFactor), ''], ['Fire risk factor', v(k.fireRisk), ''], ['Fire provisions factor', v(k.fireProvisions), ''],
    ['Special hazard factor', v(k.specialHazard), ''], ['Typical loss', v(k.typicalLoss), ''], ['Tolerable risk', v(k.tolerableRisk), '/yr'],
    ['Sensitivity: strike density multiplier', v(k.sensitivity), ''],
    ...RISK_LEVELS.map((l): [string, ExcelJS.CellValue, string] => [`Damage probability — ${l === 'none' ? 'no protection' : riskLevelLabel(l)}`, v(k.damageProbability?.[l]), ''])
  ];
  for (const row of inputs) ws.addRow(row);
  ws.addRow([]);
  ws.addRow(['Result', 'Value', 'Unit', 'Formula']).font = { bold: true };
  let at = RK.p0 + RISK_LEVELS.length + 1;
  const line = (label: string, formula: string, result: number | string | undefined, unit: string, basis: string) => {
    ws.addRow([label, { formula, result: result ?? dr }, unit, basis]);
    return `$B$${++at}`;
  };
  const density = line('Strike point density', `IF(${c('density')}<>"",${c('density')},IF(${blank('days', 'ratio')},"${dr}",0.1*${c('days')}*${c('ratio')}))`, risk.strikeDensity, '/km²/yr', 'measured value, or 0.1 × thunderstorm days × ratio');
  const area = line('Collection area', `IF(${c('area')}<>"",${c('area')},IF(${blank('length', 'width', 'height')},"${dr}",${c('length')}*${c('width')}+6*${c('height')}*(${c('length')}+${c('width')})+9*PI()*${c('height')}^2))`, risk.collectionAreaM2, 'm²', 'entered value, or L × W + 6 × H × (L + W) + 9 × π × H²');
  const strikes = line('Direct strikes on building', guard(`IF(${c('location')}="",NA(),${density}*${area}*${c('location')}*0.000001)`), risk.strikesPerYear, '/yr', 'density × area × location factor × 10⁻⁶');
  line('Years between strikes', guard(`1/${strikes}`), risk.yearsBetweenStrikes, 'years', '1 ÷ strikes a year');
  const loss = line('Loss from physical damage', `IF(${blank('fire', 'provisions', 'hazard', 'loss')},"${dr}",${c('fire')}*${c('provisions')}*${c('hazard')}*${c('loss')})`, risk.loss, '', 'fire risk × fire provisions × special hazard × typical loss');
  line('Largest damage probability allowed', guard(`IF(${c('tolerable')}="",NA(),${c('tolerable')}/(${strikes}*${loss}))`), risk.maxDamageProbability, '', 'tolerable risk ÷ (strikes × loss)');
  ws.addRow([]);
  // With other risk components counted, their figure for each level comes from the app (not a live formula) and
  // the verdict is on the total.
  const others = risk.included.length > 0;
  ws.addRow(others ? ['Protection', 'Physical damage, strike on the building', 'Other components (from the app)', 'Total risk per year', 'Against the tolerable risk'] : ['Protection', 'Risk per year', 'Against the tolerable risk']).font = { bold: true };
  at += 2;
  const verdicts = RISK_LEVELS.map((l, n) => {
    const p = `$B$${RK.p0 + n}`, row = risk.rows[n], r = at + 1, verdict = row.risk === undefined ? dr : row.ok ? 'OK' : 'Exceeds';
    const damage = { formula: guard(`IF(OR(${p}="",${c('tolerable')}=""),NA(),${strikes}*${p}*${loss})`), result: (others ? row.parts?.damage : row.risk) ?? dr };
    const check = (cell: string) => ({ formula: `IF(ISNUMBER(${cell}),IF(${cell}<=${c('tolerable')},"OK","Exceeds"),"${dr}")`, result: verdict });
    at += 1;
    if (!others) {
      ws.addRow([riskLevelLabel(l), damage, check(`$B$${r}`)]);
      return `$C$${r}`;
    }
    const rest = risk.included.map((id) => row.parts?.[id]), sum = rest.every((v) => v !== undefined) ? rest.reduce((a, b) => a! + b!, 0)! : dr;
    ws.addRow([riskLevelLabel(l), damage, sum, { formula: `IF(AND(ISNUMBER($B$${r}),ISNUMBER($C$${r})),$B$${r}+$C$${r},"${dr}")`, result: row.risk ?? dr }, check(`$D$${r}`)]);
    return `$E$${r}`;
  });
  // The first level that passes; a level before it with no figure leaves the minimum unknown.
  const least = verdicts.reduceRight((rest, cell, n) => `IF(${cell}="OK","${riskLevelLabel(RISK_LEVELS[n])}",IF(${cell}="${dr}","${dr}",${rest}))`, '"More than Class I"');
  ws.addRow([]);
  ws.addRow(['Minimum protection', { formula: least, result: !risk.minimum ? dr : risk.minimum === 'insufficient' ? 'More than Class I' : riskLevelLabel(risk.minimum) }]).font = { bold: true };
  ws.addRow([]);
  for (const t of [RISK_NOTE, riskScope(k)]) ws.addRow([t]).getCell(1).alignment = { wrapText: true, vertical: 'top' };
}
