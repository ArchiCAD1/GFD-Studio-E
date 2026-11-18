import { AIR_METHODS, airResultText, lightningProtection, lpsLayout, type LpsInputs, type LpsResult } from '../calc/lightningProtection';
import { lightningRisk, RISK_COMPONENTS, RISK_DAMAGE_LABEL, RISK_LEVELS, RISK_NOTE, riskLevelLabel, riskOutlineSketch, riskScope, riskStarted, riskText, studyRiskInputs, type RiskInputs, type RiskResult } from '../calc/lightningRisk';
import { CALC_DISCLAIMER, REPORT_STATUS_TEXT } from '../calc/statusText';
import { boardsInSupplyOrder } from '../calc/summary';
import { areaOf } from '../model/cadMeasure';
import { SPD_TYPES, type Project } from '../types';
import { esc } from './report';
import { SHEET_CSS, sheetHead } from './upsSolarReport';

/** Lightning protection calculation report: the same content for the PDF sheet, the Word file and the page's
 * section list. Black-and-white; every class value is shown as entered by the engineer. */

export type LpsSectionKey = 'risk' | 'inputs' | 'methods' | 'layout' | 'down' | 'surge' | 'quantities' | 'checks' | 'notes';
export const LPS_SECTIONS: { key: LpsSectionKey; label: string }[] = [
  { key: 'risk', label: 'Risk assessment (preliminary)' },
  { key: 'inputs', label: 'Inputs as entered, with references' },
  { key: 'methods', label: 'All four methods with formulas and working' },
  { key: 'layout', label: 'Roof layout drawing' },
  { key: 'down', label: 'Down conductors and earth pits' },
  { key: 'surge', label: 'Surge protection schedule' },
  { key: 'quantities', label: 'Quantities' },
  { key: 'checks', label: 'Checks and warnings' },
  { key: 'notes', label: 'Assumptions and disclaimer' }
];
const ALL = LPS_SECTIONS.map((s) => s.key);

export interface LpsBlock {
  key: LpsSectionKey;
  title: string;
  pairs?: [string, string][];
  table?: { headers: string[]; rows: string[][] };
  notes?: string[];
  /** The roof layout drawing goes here (PDF); Word gets the sentence in `notes`. */
  layout?: boolean;
  /** The collection area sketch goes here (PDF). */
  riskSketch?: boolean;
}

const NOT = 'Not entered';
const n2 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const val = (v: number | undefined, unit: string) => (v !== undefined && Number.isFinite(v) ? `${n2(v)} ${unit}`.trim() : NOT);
const methodOf = (id: LpsInputs['method']) => AIR_METHODS.find((m) => m.id === id)!;
export const LPS_NOTES = [
  'Method references: IEC 62305-3 for the mesh, protection angle and rolling sphere methods; NFC 17-102 for early streamer emission (ESE) terminals. The ESE method is not an IEC 62305 method: confirm that the authority accepts it.',
  'The protection class, mesh size, rolling sphere radius, protection angle and down conductor spacing are the engineer\'s own entries, from the risk assessment and the current edition of the standard. The ESE advance time is from the manufacturer\'s test certificate. No value of a standard is built into the calculation.',
  'Concept stage, for a flat rectangular roof. Not covered: the risk assessment, separation distance, natural components, bonding details and installation detailing.',
  CALC_DISCLAIMER
];

const RISK_CONCEPT = 'Concept stage, for a flat rectangular roof. The risk assessment is preliminary. Not covered: separation distance, natural components, bonding details and installation detailing.';

/** The risk assessment as report sections: inputs as entered, the working with its figures, and the risk for
 * each protection class. No source of a factor is shown. */
function riskBlocks(k: RiskInputs, risk: RiskResult): LpsBlock[] {
  const fac = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? riskText(v) : NOT);
  const least = !risk.minimum ? `DATA REQUIRED: ${risk.missing.join(', ')}.`
    : risk.minimum === 'insufficient' ? 'No protection class brings the risk within the tolerable risk: further measures are needed.'
      : risk.minimum === 'none' ? 'No protection is needed by this assessment.' : `Minimum protection from this assessment: ${riskLevelLabel(risk.minimum)}.`;
  const sens = risk.sensitivityMinimum ? [`Sensitivity: with the strike density × ${n2(k.sensitivity!)} the minimum is ${risk.sensitivityMinimum === 'insufficient' ? 'more than Class I' : (risk.sensitivityMinimum === 'none' ? 'no protection' : riskLevelLabel(risk.sensitivityMinimum))}${risk.sensitivityRisk !== undefined ? ` (${riskText(risk.sensitivityRisk)} per year)` : ''}.`] : [];
  const on = RISK_COMPONENTS.filter((c) => k.components?.[c.id]?.on), needs = (...e: string[]) => on.some((c) => e.includes(c.events));
  const inputBlocks: LpsBlock[] = [
    ...(on.length ? [{ key: 'risk' as const, title: 'Risk assessment — other risk components as entered', table: { headers: ['Risk component', 'Loss', 'Probability'], rows: on.map((c) => {
      const e = k.components![c.id]!;
      const shown = (q: { probability?: number; classProbability?: Partial<Record<(typeof RISK_LEVELS)[number], number>> } | undefined) => (e.byClass ? RISK_LEVELS.map((l) => `${riskLevelLabel(l)}: ${fac(q?.classProbability?.[l])}`).join('; ') : fac(q?.probability));
      const lineBased = e.byLine && (c.events === 'line' || c.events === 'nearLine');
      return [c.label, fac(e.loss), lineBased ? (k.lines ?? []).map((line, n) => `${line.name?.trim() || `Line ${n + 1}`} — ${shown(line.probabilities?.[c.id])}`).join(' | ') || NOT : shown(e)];
    }) } }] : []),
    ...(needs('line', 'nearLine') ? [{ key: 'risk' as const, title: 'Risk assessment — incoming lines as entered', table: {
      headers: ['Line', 'Length (m)', 'Width, strikes on it (m)', 'Width, strikes near it (m)', 'Installation factor', 'Environment factor', 'Line type factor', 'Far-end structure area (m²)', 'Far-end location factor'],
      rows: (k.lines ?? []).map((line, n) => [line.name?.trim() || `Line ${n + 1}`, ...[line.lengthM, line.strikeWidthM, line.nearWidthM, line.installationFactor, line.environmentFactor, line.typeFactor, line.farEndAreaM2, line.farEndLocationFactor].map((v) => (v !== undefined && Number.isFinite(v) ? n2(v) : '—'))])
    } }] : [])
  ];
  return [
    { key: 'risk', title: 'Risk assessment — preliminary: inputs as entered', riskSketch: k.shape !== 'area', pairs: [
      ['Thunderstorm days', val(k.thunderDays, 'days/yr')],
      ['Strike point ratio', fac(k.strikeRatio)],
      ...(k.strikeDensity !== undefined ? [['Measured strike density', val(k.strikeDensity, '/km²/yr')] as [string, string]] : []),
      ['Collection area', k.shape === 'area' ? `Entered: ${val(k.collectionAreaM2, 'm²')}` : k.shape === 'outline' ? (k.parts?.length ? 'Roof outline and its parts, each pushed out by 3 × its own height' : 'Roof outline pushed out by 3 × height') : 'Building rectangle pushed out by 3 × height'],
      ...(k.shape === 'outline' && k.parts?.length ? [['Parts with their own height', k.parts.map((part, n) => `${n + 1}: ${n2(areaOf(part.outline).area)} m² roof, ${val(part.heightM, 'm')} high`).join('; ')] as [string, string]] : []),
      ['Location factor', fac(k.locationFactor)],
      ['Fire risk factor', fac(k.fireRisk)],
      ['Fire provisions factor', fac(k.fireProvisions)],
      ['Special hazard factor', fac(k.specialHazard)],
      ['Typical loss', fac(k.typicalLoss)],
      ['Tolerable risk', k.tolerableRisk !== undefined ? `${riskText(k.tolerableRisk)} per year` : NOT],
      ...(needs('near') ? [k.shape === 'area' ? ['Area for strikes near the building', val(k.nearAreaM2, 'm²')] as [string, string] : ['Distance for strikes near the building', val(k.nearReachM, 'm')] as [string, string]] : []),
      ...(needs('near', 'line', 'nearLine') ? [['Density for near and line strikes', k.nearDensity !== undefined ? val(k.nearDensity, '/km²/yr') : 'As for the building'] as [string, string]] : [])
    ], notes: [RISK_NOTE] },
    ...inputBlocks,
    { key: 'risk', title: 'Risk assessment — working', table: { headers: ['Step', 'Formula with values', 'Result'], rows: risk.working.map((w) => [w.step, w.formula, w.result]) } },
    { key: 'risk', title: 'Risk assessment — risk for each protection class', table: {
      headers: ['Protection', 'Damage probability (entered)', 'Risk per year', 'Against the tolerable risk'],
      rows: RISK_LEVELS.map((level, n) => {
        const row = risk.rows[n];
        return [`${riskLevelLabel(level)}${risk.minimum === level ? ' (minimum)' : ''}`, fac(row.damageProbability), row.risk !== undefined ? riskText(row.risk) : '—', row.risk === undefined ? REPORT_STATUS_TEXT.data : row.ok ? 'OK' : 'Exceeds'];
      })
    }, notes: [...sens, least, riskScope(k)] },
    ...(on.length ? [{ key: 'risk' as const, title: 'Risk assessment — risk per year by component', table: {
      headers: ['Risk component', ...RISK_LEVELS.map(riskLevelLabel)],
      rows: [...[{ id: 'damage' as const, label: RISK_DAMAGE_LABEL }, ...on].map((c) => [c.label, ...risk.rows.map((row) => (row.parts?.[c.id] !== undefined ? riskText(row.parts[c.id]!) : '—'))]),
        ['Total', ...risk.rows.map((row) => (row.risk !== undefined ? riskText(row.risk) : '—'))]]
    } }] : [])
  ];
}

/** The collection area in black and white: the building and the line 3 × height out from it; for a roof outline,
 * the outline on the band 3 × height wide round it. */
export function riskAreaSvg(i: LpsInputs, risk: RiskResult): string {
  if (i.risk?.shape === 'outline') {
    const o = i.risk.outline ?? [], sk = riskOutlineSketch(studyRiskInputs(i));
    if (!sk || !risk.collectionAreaM2) return '';
    const parts = sk.length - 1;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 230" width="340" height="230" font-family="Arial, sans-serif" font-size="10">
${sk.map((g) => `<path d="${g.path}" fill="#f2f2f2" stroke="#f2f2f2" stroke-width="${g.band.toFixed(1)}" stroke-linejoin="round"/>`).join('\n')}
${sk.map((g) => `<path d="${g.path}" fill="#fff" stroke="#000" stroke-width="1.6"/>`).join('\n')}
<text x="20" y="222">Roof outline ${n2(areaOf(o).area)} m²${parts ? ` and ${parts} part${parts > 1 ? 's' : ''} · each reaches 3 × its own height` : ` · reach 3 × height = ${n2(3 * i.heightM)} m`} (shaded) · collection area ${n2(risk.collectionAreaM2)} m²</text></svg>`;
  }
  if (![i.lengthM, i.widthM, i.heightM].every((v) => Number.isFinite(v) && v > 0)) return '';
  const reach = 3 * i.heightM, k = Math.min(300 / (i.lengthM + 2 * reach), 190 / (i.widthM + 2 * reach)), f = (v: number) => v.toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 230" width="340" height="230" font-family="Arial, sans-serif" font-size="10">
<rect x="20" y="10" width="${f((i.lengthM + 2 * reach) * k)}" height="${f((i.widthM + 2 * reach) * k)}" rx="${f(reach * k)}" fill="none" stroke="#000" stroke-width="0.8" stroke-dasharray="5 3"/>
<rect x="${f(20 + reach * k)}" y="${f(10 + reach * k)}" width="${f(i.lengthM * k)}" height="${f(i.widthM * k)}" fill="none" stroke="#000" stroke-width="1.6"/>
<line x1="${f(20 + (reach + i.lengthM) * k)}" y1="${f(10 + (reach + i.widthM / 2) * k)}" x2="${f(20 + (2 * reach + i.lengthM) * k)}" y2="${f(10 + (reach + i.widthM / 2) * k)}" stroke="#000" stroke-width="0.8"/>
<text x="20" y="222">Building ${n2(i.lengthM)} × ${n2(i.widthM)} m · reach 3 × height = ${n2(reach)} m${risk.collectionAreaM2 ? ` · collection area ${n2(risk.collectionAreaM2)} m²` : ''}</text></svg>`;
}

export function lightningReportBlocks(project: Project, i: LpsInputs, keys: LpsSectionKey[] = ALL, r: LpsResult = lightningProtection(i)): LpsBlock[] {
  const sel = methodOf(i.method);
  const plan = lpsLayout(i, r);
  const boards = boardsInSupplyOrder(project);
  // The risk sections, its checks and its note are in the report only when a risk assessment has been entered.
  const started = riskStarted(i.risk), k = studyRiskInputs(i), risk = started ? lightningRisk(k) : undefined;
  const all: LpsBlock[] = [
    ...(risk ? riskBlocks(k, risk) : []),
    { key: 'inputs', title: 'Inputs as entered', pairs: [
      ['Building (length × width × height)', r.invalid ? NOT : `${n2(i.lengthM)} × ${n2(i.widthM)} × ${n2(i.heightM)} m`],
      ['Protection class', i.lpsClass ? `Class ${i.lpsClass}` : NOT],
      ['Risk assessment reference', i.riskRef?.trim() || NOT],
      ['Air termination method', `${sel.label} (${sel.reference})`],
      ['Mesh size', val(i.meshM, 'm')],
      ['Rolling sphere radius', val(i.sphereRadiusM, 'm')],
      ['Down conductor spacing', val(i.downSpacingM, 'm')],
      ['Rod height above the roof', val(i.rodHeightM, 'm')],
      ['Protection angle', val(i.angleDeg, '°')],
      ['ESE terminal height above the roof', val(i.eseMastM, 'm')],
      ['ESE advance time ΔT', val(i.eseDeltaTUs, 'µs')],
      ['Down conductors for each ESE terminal', val(i.eseDownPerTerminal, '')],
      ['Earth pit at each down conductor', i.earthPitPerDown ? 'Yes' : 'No'],
      ['Earth resistance limit', val(i.earthLimitOhm, 'Ω')],
      ['Bonded to the main earth bar (MET)', i.bondedToMet ? 'Yes' : 'No']
    ] },
    { key: 'methods', title: 'Air termination methods compared', table: {
      headers: ['Method', 'Reference', 'Result', 'Working', 'Status'],
      rows: r.methods.map((a) => [`${methodOf(a.method).label}${a.method === i.method ? ' (selected)' : ''}`, methodOf(a.method).reference, airResultText(a),
        `${a.working}${a.note ? ` — ${a.note}` : ''}`, a.status === 'data' ? REPORT_STATUS_TEXT.data : REPORT_STATUS_TEXT[a.status]])
    } },
    { key: 'layout', title: 'Roof layout — concept', layout: true,
      notes: [r.invalid ? 'Building size not set.' : `${sel.label}: ${plan.terminals.length} air terminal${plan.terminals.length === 1 ? '' : 's'}, ${plan.meshX.length + plan.meshY.length} conductor runs inside the roof edge, ${plan.downs.length} down conductors at equal steps round the perimeter. Not to scale.`] },
    { key: 'down', title: 'Down conductors and earth pits', pairs: [
      ['Building perimeter', `${n2(r.perimeterM)} m`],
      ['Down conductors', r.downConductors ? `${r.downConductors}, ${n2(r.downSpacingM!)} m apart round the perimeter` : REPORT_STATUS_TEXT.data],
      ['Down conductor length', `${n2(r.downConductorM)} m (building height each)`],
      ['Test joints', `${r.testJoints} (one in each down conductor)`],
      ['Earth pits', `${r.earthPits}`],
      ['Ring earth conductor', `${n2(r.ringConductorM)} m (building perimeter)`]
    ] },
    { key: 'surge', title: 'Surge protection at the boards', table: {
      headers: ['Board', 'Kind', 'Surge protection (set on the SLD)'],
      rows: boards.map((b) => [b.id, b.kind ?? '—', SPD_TYPES.find((x) => x.value === b.spd)?.label ?? 'Not set'])
    } },
    { key: 'quantities', title: `Quantities — ${sel.label}`, table: {
      headers: ['Item', 'Quantity', 'Unit'],
      rows: [
        ['Roof conductor', n2(r.selected.roofConductorM), 'm'], ['Air terminals (rods or ESE terminals)', `${r.selected.terminals}`, 'no.'],
        ['Down conductors', `${r.downConductors}`, 'no.'], ['Down conductor length', n2(r.downConductorM), 'm'], ['Test joints', `${r.testJoints}`, 'no.'],
        ['Earth pits', `${r.earthPits}`, 'no.'], ['Ring earth conductor', n2(r.ringConductorM), 'm']
      ]
    } },
    { key: 'checks', title: 'Checks', table: { headers: ['Status', 'Check'], rows: [...r.checks, ...(risk?.checks ?? [])].map((c) => [REPORT_STATUS_TEXT[c.status], c.text]) } },
    { key: 'notes', title: 'Assumptions and disclaimer', notes: risk ? [...LPS_NOTES.slice(0, 2), RISK_CONCEPT, riskScope(k), RISK_NOTE, ...LPS_NOTES.slice(3)] : LPS_NOTES }
  ];
  return all.filter((b) => keys.includes(b.key));
}

/** The roof layout in black and white: roof edge, conductor runs, air terminals (squares), down conductors (rings). */
export function lightningLayoutSvg(i: LpsInputs, r: LpsResult): string {
  if (r.invalid) return '';
  const k = Math.min(400 / i.lengthM, 250 / i.widthM), plan = lpsLayout(i, r);
  const X = (m: number) => (35 + m * k).toFixed(1), Y = (m: number) => (30 + m * k).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 470 330" width="470" height="330" font-family="Arial, sans-serif" font-size="10">
<rect x="${X(0)}" y="${Y(0)}" width="${(i.lengthM * k).toFixed(1)}" height="${(i.widthM * k).toFixed(1)}" fill="none" stroke="#000" stroke-width="1.6"/>
<g stroke="#000" stroke-width="0.8" stroke-dasharray="5 3">${plan.meshX.map((x) => `<line x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="${Y(i.widthM)}"/>`).join('')}${plan.meshY.map((y) => `<line x1="${X(0)}" y1="${Y(y)}" x2="${X(i.lengthM)}" y2="${Y(y)}"/>`).join('')}</g>
${plan.terminals.map(([x, y]) => `<rect x="${(35 + x * k - 3).toFixed(1)}" y="${(30 + y * k - 3).toFixed(1)}" width="6" height="6" fill="#000"/>`).join('')}
${plan.downs.map(([x, y]) => `<circle cx="${X(x)}" cy="${Y(y)}" r="4" fill="#fff" stroke="#000" stroke-width="1.4"/>`).join('')}
<text x="${X(i.lengthM / 2)}" y="20" text-anchor="middle">${n2(i.lengthM)} m</text><text x="${(40 + i.lengthM * k).toFixed(1)}" y="${Y(i.widthM / 2)}">${n2(i.widthM)} m</text>
<line x1="35" y1="312" x2="60" y2="312" stroke="#000" stroke-width="0.8" stroke-dasharray="5 3"/><text x="66" y="315">Roof conductor</text>
<rect x="166" y="309" width="6" height="6" fill="#000"/><text x="178" y="315">Rod / terminal</text>
<circle cx="280" cy="312" r="4" fill="#fff" stroke="#000" stroke-width="1.4"/><text x="290" y="315">Down conductor</text></svg>`;
}

/** The report as one printable A4 sheet set. */
export function buildLightningReportHtml(project: Project, keys: LpsSectionKey[] = ALL): string {
  const i = project.lightning ?? { lengthM: 0, widthM: 0, heightM: 0, method: 'mesh' as const };
  const r = lightningProtection(i);
  const body = lightningReportBlocks(project, i, keys, r).map((b) => {
    const pairs = b.pairs ? `<table>${b.pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : '';
    const table = b.table ? (b.table.rows.length
      ? `<table><tr>${b.table.headers.map((h) => `<th style="width:auto">${esc(h)}</th>`).join('')}</tr>${b.table.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
      : '<p class="note">None.</p>') : '';
    const drawing = b.layout ? lightningLayoutSvg(i, r) : b.riskSketch ? riskAreaSvg(i, lightningRisk(studyRiskInputs(i))) : '';
    const notes = (b.notes ?? []).map((t) => `<p class="note">${esc(t)}</p>`).join('');
    return `<h2>${esc(b.title)}</h2>${pairs}${table}${drawing}${notes}`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(project.name)} — Lightning protection</title><style>${SHEET_CSS}</style></head><body><section class="page">${sheetHead(project, 'Lightning protection — concept calculation')}${body}</section></body></html>`;
}
