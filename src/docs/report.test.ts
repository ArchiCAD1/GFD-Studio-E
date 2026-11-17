import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { forgetNetworks } from '../calc/network/index';
import { buildReportHtml, calcReportData, calcReportSections, CALC_REPORT_STUDIES } from './calcReport';
import { esc } from './report';
import { runCalculations } from '../calc/runs';
import { buildSection, scopeOf, tableHtml } from './studyReport';

describe('calculation report page 1', () => {
  it('is black and white: no coloured text or fills', () => {
    const html = buildReportHtml(sampleProject);
    const colours = [...new Set(html.match(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/gi) ?? [])];
    const grey = (h: string) => { const x = h.length === 4 ? h.slice(1).split('').map((c) => c + c) : [h.slice(1, 3), h.slice(3, 5), h.slice(5, 7)]; return x.every((c) => c.toLowerCase() === x[0].toLowerCase()); };
    expect(colours.filter((c) => !grey(c))).toEqual([]);
  });

  it('leaves unset document fields blank for signing and fills set ones', () => {
    const blank = buildReportHtml({ ...sampleProject, params: undefined, calcReportDocNo: undefined });
    expect(blank.match(/class="sig"/g)?.length).toBeGreaterThanOrEqual(4);
    const set = buildReportHtml({ ...sampleProject, calcReportDocNo: 'CR-001', params: { designedBy: 'A. Engineer', checkedBy: 'B. Checker', approvedBy: 'C. Approver' } });
    for (const v of ['CR-001', 'A. Engineer', 'B. Checker', 'C. Approver']) expect(set).toContain(v);
  });

  it('shows 10 items needing attention on page 1 and lists every one after the summary', () => {
    const p = { ...sampleProject, vdLimitPct: 0.01 };
    const html = buildReportHtml(p);
    const n = Number(html.match(/Needs attention \((\d+)\)/)?.[1]);
    expect(n).toBeGreaterThan(10);
    expect(html).toContain(`…and ${n - 10} more`);
    // Nothing left out: the full list has one row per unresolved check, each with its status.
    const all = html.match(/<h2[^>]*>(?:<a class="dest"[^>]*><\/a>)?Items needing attention \(all (\d+)\)<\/h2>\s*<table[\s\S]*?<\/table>/);
    expect(Number(all?.[1])).toBe(n);
    expect(all![0].match(/<tr><td class="(bad|warn)">/g)).toHaveLength(n);
    expect(all![0].match(/<tbody>[\s\S]*<\/tbody>/)![0]).not.toMatch(/>PASS</);
  });

  it('has a page-numbered running header and footer', () => {
    const html = buildReportHtml(sampleProject);
    expect(html).toContain('counter(pages)');
    expect(html).toContain('Calculation report');
  });
});

describe('calculation report and study report: one source', () => {
  // Phase 2 exit criterion: the same inputs give the same figures in every report route.
  const p = { ...sampleProject, vdLimitPct: 1 }; // some fails, so statuses are compared too
  const run = runCalculations(p);
  const data = { project: run.project, results: run.results, earthing: run.earthing, selectivity: run.selectivity };
  const scope = scopeOf(run.project, { boards: [], downstream: true });

  it('builds each section exactly as the study report does', () => {
    expect(calcReportSections(p)).toEqual(CALC_REPORT_STUDIES.map((k) => buildSection(k, data, scope)));
  });

  it('prints every study-report table unchanged', () => {
    const html = buildReportHtml(p);
    for (const k of CALC_REPORT_STUDIES) for (const t of buildSection(k, data, scope).tables) expect(html).toContain(tableHtml(t));
  });

  it('a report for the same calculation with another document number is the same as one built whole', () => {
    const typed = buildReportHtml({ ...sampleProject, calcReportDocNo: 'CR-00' }, sampleProject);
    const next = buildReportHtml({ ...sampleProject, calcReportDocNo: 'CR-001' }, sampleProject);
    expect(next).toBe(buildReportHtml({ ...sampleProject, calcReportDocNo: 'CR-001' }));
    expect(typed).toBe(buildReportHtml({ ...sampleProject, calcReportDocNo: 'CR-00' }));
    expect(next).not.toBe(typed);
    // The calculation is worked out once for a project object…
    expect(calcReportData(sampleProject)).toBe(calcReportData(sampleProject));
    // …and again for an edited project, and when the data behind the results changes.
    const edited = { ...sampleProject, feeders: sampleProject.feeders.map((f) => (f.id === 'GF-SKT' ? { ...f, loadKw: f.loadKw + 5 } : f)) };
    expect(buildReportHtml(edited)).not.toBe(buildReportHtml(sampleProject));
    const before = calcReportData(sampleProject);
    forgetNetworks();
    expect(calcReportData(sampleProject)).not.toBe(before);
    expect(calcReportData(sampleProject)).toEqual(before);
  });

  it('text is escaped, plain values are left as they are', () => {
    expect(esc('MDB-1 <A&B> "x" \'y\'')).toBe('MDB-1 &lt;A&amp;B&gt; &quot;x&quot; &#39;y&#39;');
    expect(esc('Ground floor DB')).toBe('Ground floor DB');
    expect(esc(12.5)).toBe('12.5');
    expect(esc(undefined)).toBe('');
    expect(esc(null)).toBe('');
    expect(esc(0)).toBe('0');
  });
});
