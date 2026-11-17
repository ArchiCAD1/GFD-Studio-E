// Every PDF document the app prints (drawings aside), built from the sample project:
// the print-style guard test checks them for colour, and the same set renders the
// before / after PDF samples.
import { sampleProject } from '../../src/data/sampleProject';
import { runCalculations } from '../../src/calc/runs';
import { buildDashboard } from '../../src/calc/dashboard';
import { calcPfc, PFC_CALC_DEFAULT } from '../../src/calc/pfcCalc';
import { calcContainment, CONTAINMENT_DEFAULT } from '../../src/calc/containment';
import { UPS_DEFAULTS } from '../../src/calc/ups';
import { PV_DEFAULTS, sizePv } from '../../src/calc/solar';
import { emptyTrayPlan, sizeAll } from '../../src/calc/cableTray';
import type { TrayPlan } from '../../src/types';
import { buildReportHtml } from '../../src/docs/calcReport';
import { buildSection, buildStudyReportHtml, scopeOf, STUDIES, type CalcData } from '../../src/docs/studyReport';
import { buildReviewDoc, defaultSetup, reviewHtml } from '../../src/docs/reviewReport';
import { buildClarificationDoc } from '../../src/docs/clarificationReport';
import { buildDashboardHtml } from '../../src/docs/dashboardPdf';
import { pfcReportHtml } from '../../src/docs/pfcReport';
import { containmentReportHtml } from '../../src/docs/containmentReport';
import { buildPvReportHtml, buildUpsReportHtml } from '../../src/docs/upsSolarReport';
import { buildTrayReportHtml } from '../../src/docs/trayReport';
import { buildLoadScheduleHtml } from '../../src/docs/loadScheduleDoc';
import { scheduleHtml, workbookHtml } from '../../src/docs/sheetPdf';
import { buildFormWorkbook } from '../../src/docs/formWorkbook';
import { cableSchedule } from '../../src/docs/schedules';
import { buildDmFormHtml } from '../../src/docs/dmForm';
import { packageCoverHtml, snapshotId } from '../../src/docs/issuePackage';
import { registerHtml } from '../../src/docs/drawingRegister';
import { buildTransmittalHtml } from '../../src/docs/submissionReport';
import { issueAsSubmission } from '../../src/model/submissions';
import { addCircuit } from '../../src/model/schedule';
import { area, mergeArea, newSheet, withCells, withStyle, type Sheet } from '../../src/model/sheets';
import { fillLinked, linkToBoard } from '../../src/docs/sheetLink';
import { sheetsHtml } from '../../src/docs/sheetPrint';
import type { Project } from '../../src/types';

/** A DB schedule in an office's own format (Load schedule → Export → PDF: my format), with enough circuits to run over a page:
 * a title, the panel's values, two heading rows with merged cells, one row per circuit and a total. */
function myFormatHtml(project: Project, boardId: string): string {
  let p = project;
  for (let i = 0; i < 36; i++) p = addCircuit(p, boardId).project;
  const at = (r: number, c: number) => ({ r, c });
  let s: Sheet = withCells(newSheet(), {
    A1: 'ACME ELECTRICAL CONSULTANTS', A2: 'LOAD DISTRIBUTION SCHEDULE', A3: 'PANEL: ', E3: 'FED FROM: ',
    A4: 'CCT', B4: 'DESCRIPTION', C4: 'MCB A', D4: 'WIRE mm²', E4: 'LOAD (W)', H4: 'REMARKS', E5: 'R', F5: 'Y', G5: 'B',
    D7: 'TOTAL', E7: '=SUM(E6:E6)', F7: '=SUM(F6:F6)', G7: '=SUM(G6:G6)'
  });
  for (const [a, b] of [[at(1, 1), at(1, 8)], [at(2, 1), at(2, 8)], [at(3, 1), at(3, 4)], [at(3, 5), at(3, 8)], [at(4, 1), at(5, 1)], [at(4, 2), at(5, 2)], [at(4, 3), at(5, 3)], [at(4, 4), at(5, 4)], [at(4, 5), at(4, 7)], [at(4, 8), at(5, 8)]]) s = mergeArea(s, area(a, b));
  s = withStyle(s, area(at(1, 1), at(2, 8)), { bold: true, align: 'center', border: 'TRBL' });
  s = withStyle(s, area(at(3, 1), at(3, 8)), { border: 'trbl' });
  s = withStyle(s, area(at(4, 1), at(5, 8)), { bold: true, align: 'center', fill: true, border: 'trbl' });
  s = withStyle(s, area(at(6, 1), at(7, 8)), { border: 'trbl' });
  s = { ...s, widths: { A: 56, B: 260, C: 64, D: 72, E: 72, F: 72, G: 72, H: 200 }, link: { category: 'db', firstRow: 6, rows: [], cells: { A3: { field: 'board.id', before: 'PANEL: ' }, E3: { field: 'board.fedFrom', before: 'FED FROM: ' } }, columns: { A: 'row.ref', B: 'row.room', C: 'row.mcb', D: 'row.wire', E: 'row.R', F: 'row.Y', G: 'row.B', H: 'row.remarks' } } };
  return sheetsHtml([fillLinked(p, linkToBoard(s, boardId), new Date('2026-10-15T10:00:00Z'))], 'Schedule in my format');
}

export function printDocs(project = sampleProject): Record<string, string> {
  const run = runCalculations(project);
  const p = run.project;
  const data: CalcData = { project: p, results: run.results, earthing: run.earthing, selectivity: run.selectivity };
  const scope = scopeOf(p, { boards: [], downstream: true });
  const sections = STUDIES.map((s) => buildSection(s.key, data, scope));
  const now = new Date('2026-10-15T10:00:00Z');
  const plan: TrayPlan = { ...emptyTrayPlan(), routes: [{ id: 'r', name: 'A', lengthM: 20, fittings: { bends: 2 }, cables: [{ id: 'c', cores: 4, csaMm2: 95, qty: 2 }, { id: 'e', cores: 1, csaMm2: 50, qty: 1 }] }] };
  const pfcIn = { ...PFC_CALC_DEFAULT, title: 'MDB-1' };
  const ups = { ...UPS_DEFAULTS, id: 'u', name: 'UPS-1', loads: [{ id: 'a', name: 'Servers', qty: 10, w: 1000, pf: 0.9 }] };
  const issue = { id: 'T-001', date: '2026-10-15', purpose: 'FOR APPROVAL', description: 'First issue', to: 'DEWA', sheets: [{ id: 'a', number: 'E-SLD-001', title: 'SLD — MDB-1', rev: 'A' }] };
  const board = p.boards.find((b) => b.id === 'DB-GF1') ?? p.boards[p.boards.length - 1];
  return {
    'calculation-report': buildReportHtml(p),
    'study-report': buildStudyReportHtml(p, scope, sections, { title: 'Electrical design report', docNo: 'E-RPT-001', preparedBy: 'QA' }, {}, { designBasis: true, results: true, data }),
    'technical-review': reviewHtml(buildReviewDoc(p, defaultSetup(), { ran: true, stale: ['Short circuit'], findings: ['F-02 voltage drop FAIL'] }, now)),
    'clarification': reviewHtml(buildClarificationDoc(p, { title: 'Technical clarification' }, now)),
    'project-summary': buildDashboardHtml(p, buildDashboard(p, run)),
    'pfc-calculation': pfcReportHtml(p, pfcIn, calcPfc(pfcIn)),
    'containment': containmentReportHtml(p, CONTAINMENT_DEFAULT, calcContainment(CONTAINMENT_DEFAULT)),
    'ups': buildUpsReportHtml(p, [ups]),
    'solar-pv': buildPvReportHtml(p, PV_DEFAULTS, sizePv(PV_DEFAULTS)),
    'cable-tray': buildTrayReportHtml(p, plan, sizeAll(p, plan)),
    'db-load-schedule': buildLoadScheduleHtml(p, board.id),
    'schedule-my-format': myFormatHtml(p, board.id),
    'md-workbook': workbookHtml(p, buildFormWorkbook(p), 'MD'),
    'cable-schedule': scheduleHtml(p, cableSchedule(p), 'Cable schedule'),
    'dm-d-013': buildDmFormHtml(p, [{ id: 'a', name: 'SS-1', type: 'conventional', transformers: 2 }]),
    'issue-package-cover': packageCoverHtml(p, { title: 'Electrical studies', docNo: 'E-001', calculatedAt: Date.UTC(2026, 9, 15), snapshot: snapshotId(p) }, [{ title: 'Electrical studies', pages: 10 }], 2, sections),
    'drawing-register': registerHtml(p, [{ number: 'E-SLD-001', title: 'SLD — MDB-1', size: 'A3' }], 'A', '2026-10-15', [issue]),
    'drawing-transmittal': buildTransmittalHtml(p, issueAsSubmission(issue))
  };
}
