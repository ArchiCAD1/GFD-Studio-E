/** Guessing which output a folder is for from its name ("VD" → voltage drop reports, "DEWA" → DEWA
 * submissions). Used by Auto-assign on the template editor's Roles tab; the later "Learn from a folder"
 * step uses the same table. Pure. */

import { ROLE_CATALOGUE } from './folderRoles';
import { nodeRoles, walkNodes, type FolderNode } from './folderTemplates';

/** Words (lower case, as whole words of the folder name) that point to a role. Longer phrases score higher. */
export const ROLE_WORDS: Readonly<Record<string, readonly string[]>> = {
  programme: ['programme', 'program', 'schedule of works'],
  minutes: ['minutes', 'mom', 'meetings'],
  timesheets: ['timesheets', 'timesheet', 'invoices'],
  receivedArch: ['architectural', 'architect', 'arch'],
  datasheets: ['datasheets', 'data sheets', 'manufacturer data', 'catalogues'],
  projectFile: ['design model', 'model', 'project file'],
  backups: ['backups', 'backup'],
  cadWorking: ['cad working', 'cad'],
  xrefs: ['xrefs', 'xref', 'backgrounds'],
  titleBlocks: ['title blocks', 'title block'],
  calcLoad: ['load assessment', 'load calculation', 'load calc'],
  calcVd: ['voltage drop', 'volt drop', 'vd'],
  calcFault: ['short circuit', 'fault', 'sc', 'protection'],
  calcCable: ['cable sizing', 'cable size'],
  calcEarthing: ['earthing', 'grounding'],
  calcLighting: ['lighting', 'lux'],
  calcPv: ['solar', 'pv'],
  calcStandby: ['generator', 'standby', 'ups'],
  studyReports: ['study reports', 'studies', 'calculations', 'calcs', 'calc'],
  drawingsWip: ['wip', 'work in progress', 'working drawings'],
  drawingsIssued: ['issued', 'ifc', 'published'],
  drawingsSuperseded: ['superseded', 'old revisions'],
  loadSchedules: ['load schedules', 'load schedule', 'db schedules'],
  cableSchedule: ['cable schedule'],
  equipmentSchedule: ['equipment schedule', 'equipment'],
  luminaireSchedule: ['luminaire schedule', 'luminaires', 'light fittings'],
  specs: ['specifications', 'specification', 'specs', 'spec'],
  boq: ['boq', 'bill of quantities', 'bill'],
  costEstimates: ['cost estimates', 'cost estimate', 'estimates', 'budget'],
  quotes: ['quotations', 'quotes', 'price lists'],
  authDewa: ['dewa'],
  authDm: ['dm', 'municipality'],
  authCd: ['civil defence', 'civil defense', 'dcd'],
  transmittals: ['transmittals', 'transmittal', 'outgoing'],
  submissionResponses: ['responses', 'authority comments'],
  internalReview: ['internal qa', 'internal review', 'qa'],
  crs: ['comment response', 'crs', 'comments'],
  shopDrawings: ['shop drawings', 'shop drawing'],
  materialSubmittals: ['material submittals', 'material submittal', 'materials'],
  rfis: ['rfis', 'rfi'],
  siteInspections: ['site inspections', 'inspections', 'site photos', 'site visits'],
  snags: ['snags', 'snag', 'punch list'],
  variations: ['variations', 'variation', 'vo'],
  valuations: ['valuations', 'valuation', 'payment'],
  testRecords: ['test certificates', 'test records', 'testing', 'tests'],
  asBuilt: ['as built', 'asbuilt'],
  tenderIssued: ['tender documents', 'issued documents', 'tender issue'],
  bids: ['bids', 'bid', 'offers'],
  tenderEvaluation: ['evaluation', 'tender evaluation'],
  archive: ['archive', 'archived']
};

/** The name as lower-case words: numbering, separators and camelCase taken apart ("03_Fault-Protection" → "fault protection"). */
export const nameWords = (name: string): string =>
  name.replace(/^\s*(?:\d{1,3}[_.\- ]|[A-Z]{1,2}-)\s*/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9]+/g, ' ').trim().toLowerCase();

/** How well a folder name fits a role, 0 to 1. The whole name being a known phrase is 1; a phrase inside a
 * longer name scores by how much of the name it covers, never below 0.6. */
export function matchScore(name: string, role: string): number {
  const words = nameWords(name);
  if (!words) return 0;
  let best = 0;
  for (const phrase of ROLE_WORDS[role] ?? []) {
    if (words === phrase) return 1;
    if (new RegExp(`(?:^| )${phrase.replace(/ /g, ' ')}(?: |$)`).test(words)) best = Math.max(best, 0.6 + 0.35 * (phrase.length / words.length));
  }
  return Math.round(best * 100) / 100;
}

export interface RoleSuggestion { role: string; nodeId: string; score: number }

/** A folder for each role that has none: the best-scoring folder at 0.6 or more. A folder's parents help
 * ("Calculations/VD"), a role is suggested once, and roles already on a folder are left alone. */
export function suggestRoles(nodes: readonly FolderNode[], minScore = 0.6): RoleSuggestion[] {
  const taken = new Set<string>();
  walkNodes(nodes, (n) => nodeRoles(n).forEach((r) => taken.add(r)));
  const out: RoleSuggestion[] = [];
  for (const { id: role } of ROLE_CATALOGUE) {
    if (taken.has(role)) continue;
    let best: RoleSuggestion | undefined;
    walkNodes(nodes, (n) => {
      const score = matchScore(n.name, role);
      if (score >= minScore && (!best || score > best.score)) best = { role, nodeId: n.id, score };
    });
    if (best) out.push(best);
  }
  return out;
}
