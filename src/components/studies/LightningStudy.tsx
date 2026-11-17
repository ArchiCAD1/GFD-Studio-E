import { useMemo, useState } from 'react';
import { SPD_TYPES, type Project } from '../../types';
import { AIR_METHODS, airResultText as resultText, lightningProtection, lpsLayout, type AirMethod, type AirResult, type LpsClass, type LpsInputs } from '../../calc/lightningProtection';
import { lightningRisk, RISK_LEVELS, RISK_NOTE, riskLevelLabel, riskStarted, riskText, studyRiskInputs, type RiskInputs, type RiskLevel } from '../../calc/lightningRisk';
import { buildLightningReportHtml, LPS_SECTIONS, type LpsSectionKey } from '../../docs/lightningReport';
import { lightningPlanFiles, LP_BLOCK, roofOutlines, withLightningBlock, withRoofOutline } from '../../model/lightningCad';
import { safeFileName, saveBinary, savePdf } from '../../util/files';
import { boardsInSupplyOrder } from '../../calc/summary';
import { NumField, Page, ResultCard, ResultCards, StatusCell, StatusCounts } from '../ui';

const EMPTY: LpsInputs = { lengthM: 0, widthM: 0, heightM: 0, method: 'mesh' };
const CLASSES: LpsClass[] = ['I', 'II', 'III', 'IV'];
const n2 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const methodLabel = (m: AirMethod) => AIR_METHODS.find((x) => x.id === m)!.label;
const rowStatus = (a: AirResult) => (a.status === 'data' ? 'bad' : a.status);

type Format = 'pdf' | 'docx' | 'xlsx';

/** Lightning protection at concept stage: the engineer's own class values in, four air termination methods
 * side by side, then down conductors and earth pits for the chosen one. Saved with the project. */
export default function LightningStudy({ project, onChange, onStatus }: { project: Project; onChange: (p: Project, step?: boolean) => void; onStatus?: (m: string) => void }) {
  const i = project.lightning ?? EMPTY;
  const set = (p: Partial<LpsInputs>) => onChange({ ...project, lightning: { ...i, ...p } }, true);
  const r = useMemo(() => lightningProtection(i), [i]);
  const plan = useMemo(() => lpsLayout(i, r), [i, r]);
  const boards = useMemo(() => boardsInSupplyOrder(project), [project]);
  const spdLabel = (t?: string) => SPD_TYPES.find((x) => x.value === t)?.label;
  const noSpd = boards.length > 0 && !boards.some((b) => b.spd);
  const risk = useMemo(() => lightningRisk(studyRiskInputs(i)), [i]);
  const k0: RiskInputs = i.risk ?? { shape: 'rectangle' };
  const started = riskStarted(i.risk);
  const setRisk = (p: Partial<RiskInputs>) => set({ risk: { ...k0, ...p } });
  const setProbability = (level: RiskLevel, v: number | undefined) => setRisk({ damageProbability: { ...k0.damageProbability, [level]: v } });
  const minClass = risk.minimum && risk.minimum !== 'none' && risk.minimum !== 'insufficient' ? risk.minimum : undefined;
  const minText = (m: typeof risk.minimum) => (!m ? 'Data required' : m === 'insufficient' ? 'More than Class I' : riskLevelLabel(m));
  const checks = [...r.checks, ...(started ? risk.checks : []), ...(noSpd ? [{ status: 'warn' as const, text: 'No board has surge protection set on the SLD' }] : [])];

  const [sections, setSections] = useState<LpsSectionKey[]>(LPS_SECTIONS.map((x) => x.key));
  const [format, setFormat] = useState<Format>('pdf');
  const [busy, setBusy] = useState(false);
  const planFiles = useMemo(() => lightningPlanFiles(project), [project]);
  const [planFile, setPlanFile] = useState('');
  const toFile = planFiles.some((x) => x.file === planFile) ? planFile : planFiles[0]?.file;
  function placeOnPlan() {
    const done = toFile ? withLightningBlock({ ...project, lightning: i }, toFile) : undefined;
    if (!done) return;
    onChange(done.project, true);
    onStatus?.(`Block ${LP_BLOCK} is in ${toFile} (${done.unit}${done.assumed ? ', units assumed' : ''}). In Design CAD: Insert → ${LP_BLOCK}, at a roof corner.`);
  }
  // Roof outline for the risk assessment: closed outlines drawn over the chosen drawing, the largest first.
  const outlines = useMemo(() => (toFile ? roofOutlines(project, toFile) : []), [project, toFile]);
  const [outlineId, setOutlineId] = useState('');
  const outline = outlines.find((x) => x.id === outlineId) ?? outlines[0];
  function takeOutline() {
    const done = toFile && outline ? withRoofOutline({ ...project, lightning: i }, toFile, outline.id) : undefined;
    if (!done) return;
    onChange(done, true);
    onStatus?.(`Roof outline taken from ${toFile}: ${outline!.pts.length} points, ${n2(outline!.areaM2)} m²${outline!.arcs ? ', arc segments taken as straight' : ''}.`);
  }
  const picked = LPS_SECTIONS.map((x) => x.key).filter((x) => sections.includes(x));
  async function exportReport() {
    setBusy(true);
    try {
      const name = `${safeFileName(project.name)} - Lightning protection`, p = { ...project, lightning: i };
      let m: string | null;
      if (format === 'pdf') m = await savePdf(`${name}.pdf`, buildLightningReportHtml(p, picked), { pageSize: 'A4', landscape: false });
      else if (format === 'docx') m = await saveBinary(`${name}.docx`, await (await import('../../docs/lightningWord')).lightningDocxBytes(p, picked), 'Word document', 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      else m = await saveBinary(`${name}.xlsx`, new Uint8Array(await (await import('../../docs/lightningWorkbook')).buildLightningWorkbook(p).xlsx.writeBuffer()), 'Excel workbook', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (m) onStatus?.(m);
    } finally {
      setBusy(false);
    }
  }

  // Roof plan: the roof drawn to fit a 400 × 250 box, 35 px in from the corner.
  const k = r.invalid ? 0 : Math.min(400 / i.lengthM, 250 / i.widthM);
  const X = (m: number) => 35 + m * k, Y = (m: number) => 30 + m * k;
  // Collection area sketch: the building and its 3 × height reach drawn to fit a 300 × 190 box.
  const reach = 3 * i.heightM, ks = r.invalid ? 0 : Math.min(300 / (i.lengthM + 2 * reach), 190 / (i.widthM + 2 * reach));
  // The same for a roof outline: its path (y upwards in the drawing) and the scale, for the band 3 × height wide.
  const ol = useMemo(() => {
    const o = k0.outline ?? [];
    if (o.length < 3 || !(reach > 0)) return undefined;
    const xs = o.map((q) => q[0]), ys = o.map((q) => q[1]), x0 = Math.min(...xs) - reach, y1 = Math.max(...ys) + reach;
    const s = Math.min(300 / (Math.max(...xs) + reach - x0), 190 / (y1 - Math.min(...ys) + reach));
    return { s, path: `M${o.map(([x, y]) => `${(20 + (x - x0) * s).toFixed(1)} ${(10 + (y1 - y) * s).toFixed(1)}`).join('L')}Z` };
  }, [k0.outline, reach]);

  return (
    <Page
      title="Lightning protection — concept"
      intro={
        <>
          External protection for one building with a flat, rectangular roof. Enter the protection class and its design values from your own risk assessment and your copy of the standard, and the ESE advance
          time from the manufacturer's test certificate — the app has no values of a standard built in. It compares four air termination methods, then works out the down conductors and earth pits of the one
          you choose. Method references: IEC 62305-3; NFC 17-102 for early streamer emission (ESE) terminals. A preliminary risk assessment gives the minimum protection class. Not covered: separation distance and detailing.
        </>
      }
    >
      <ResultCards>
        {started && (
          <>
            <ResultCard label="Risk without protection" value={risk.rows[0].risk !== undefined ? riskText(risk.rows[0].risk) : 'Data required'} status={risk.rows[0].risk !== undefined ? undefined : 'bad'}
              sub={risk.rows[0].risk === undefined ? 'per year' : risk.rows[0].ok ? 'per year · within the tolerable risk' : `per year · exceeds tolerable ${riskText(k0.tolerableRisk!)}`} />
            <ResultCard label="Minimum protection class" value={minText(risk.minimum)} status={risk.minimum && risk.minimum !== 'insufficient' ? undefined : 'bad'} sub="from the risk assessment · physical damage only" />
            <ResultCard label="Direct strikes on building" value={risk.yearsBetweenStrikes ? `1 in ${n2(Math.round(risk.yearsBetweenStrikes))} years` : '—'}
              sub={risk.strikesPerYear !== undefined ? `${riskText(risk.strikesPerYear)} a year` : 'Not worked out yet'} />
          </>
        )}
        <ResultCard label="Protection class" value={i.lpsClass ? `Class ${i.lpsClass}` : 'Not entered'} status={i.lpsClass ? undefined : 'bad'} sub={i.riskRef?.trim() ? `entered by you · ${i.riskRef.trim()}` : 'entered by you'} />
        <ResultCard label="Air termination" value={r.invalid || r.selected.status === 'data' ? 'Data required' : methodLabel(i.method)} status={r.invalid || r.selected.status === 'data' ? 'bad' : undefined}
          sub={r.invalid ? 'Building size not set' : r.selected.status === 'data' ? r.selected.missing.join(', ') : resultText(r.selected)} />
        <ResultCard label="Down conductors" value={r.downConductors ? String(r.downConductors) : '—'}
          sub={r.downConductors ? `${n2(r.perimeterM)} m perimeter · ${n2(r.downSpacingM!)} m apart · ${r.earthPits} earth pit${r.earthPits === 1 ? '' : 's'}` : 'Not worked out yet'} />
        <ResultCard label="Checks" value={`${checks.length}`} sub={<StatusCounts statuses={checks.map((c) => c.status)} />} />
      </ResultCards>

      <section className="dm-card">
        <h4>Building</h4>
        <div className="dm-head">
          <NumField label="Length" unit="m" value={i.lengthM || undefined} min={0} onSet={(v) => set({ lengthM: v ?? 0 })} optional />
          <NumField label="Width" unit="m" value={i.widthM || undefined} min={0} onSet={(v) => set({ widthM: v ?? 0 })} optional />
          <NumField label="Height" unit="m" value={i.heightM || undefined} min={0} onSet={(v) => set({ heightM: v ?? 0 })} optional />
        </div>
      </section>

      <section className="dm-card">
        <h4>Risk assessment — preliminary</h4>
        <div className="dm-head">
          <NumField label="Thunderstorm days" unit="days/yr" value={k0.thunderDays} min={0} onSet={(v) => setRisk({ thunderDays: v })} optional />
          <NumField label="Strike point ratio" value={k0.strikeRatio} min={0} onSet={(v) => setRisk({ strikeRatio: v })} optional />
          <NumField label="Measured strike density (optional)" unit="/km²/yr" value={k0.strikeDensity} min={0} onSet={(v) => setRisk({ strikeDensity: v })} optional />
        </div>
        <div className="dm-head">
          <label className="nf"><span>Collection area</span>
            <select value={k0.shape} onChange={(e) => setRisk({ shape: e.target.value as RiskInputs['shape'] })}>
              <option value="outline">Roof outline — from a Design CAD drawing</option>
              <option value="rectangle">Rectangle — the building above</option>
              <option value="area">Entered area</option>
            </select>
          </label>
          {k0.shape === 'outline' && (
            <>
              <label className="nf"><span>Drawing with the roof outline</span>
                <select value={toFile ?? ''} disabled={!planFiles.length} onChange={(e) => setPlanFile(e.target.value)}>
                  {planFiles.length ? planFiles.map((x) => <option key={x.file} value={x.file}>{x.label}</option>) : <option value="">No level plan in Design CAD yet</option>}
                </select>
              </label>
              <label className="nf"><span>Closed outline</span>
                <select value={outline?.id ?? ''} disabled={!outlines.length} onChange={(e) => setOutlineId(e.target.value)}>
                  {outlines.length ? outlines.map((x) => <option key={x.id} value={x.id}>{n2(x.areaM2)} m² · {x.pts.length} points · layer {x.layer}</option>) : <option value="">No closed outline drawn on it</option>}
                </select>
              </label>
              <button className="chip" disabled={!outline} onClick={takeOutline}>Take roof outline</button>
            </>
          )}
          {k0.shape === 'area' && <NumField label="Collection area (entered)" unit="m²" value={k0.collectionAreaM2} min={0} onSet={(v) => setRisk({ collectionAreaM2: v })} optional />}
        </div>
        <div className="dm-head">
          <NumField label="Location factor" value={k0.locationFactor} min={0} onSet={(v) => setRisk({ locationFactor: v })} optional />
          <NumField label="Fire risk factor" value={k0.fireRisk} min={0} onSet={(v) => setRisk({ fireRisk: v })} optional />
          <NumField label="Fire provisions factor" value={k0.fireProvisions} min={0} onSet={(v) => setRisk({ fireProvisions: v })} optional />
          <NumField label="Special hazard factor" value={k0.specialHazard} min={0} onSet={(v) => setRisk({ specialHazard: v })} optional />
          <NumField label="Typical loss" value={k0.typicalLoss} min={0} onSet={(v) => setRisk({ typicalLoss: v })} optional />
          <NumField label="Tolerable risk" unit="/yr" value={k0.tolerableRisk} min={0} onSet={(v) => setRisk({ tolerableRisk: v })} optional />
        </div>
        <p className="m">{RISK_NOTE} A missing value shows DATA REQUIRED; nothing is assumed. One risk component only — physical damage from a direct strike — so the class is a minimum.</p>
        {k0.shape === 'outline' && (
          <p className="m">{k0.outline?.length ? `Outline taken: ${k0.outline.length} points. ` : 'No outline taken yet. '}In Design CAD, draw one closed polyline round the roof, then take it here; take it again after changing the drawing. The height is the building height above.</p>
        )}
        {k0.shape === 'outline' && ol && (
          <svg viewBox="0 0 340 230" role="img" aria-label={`Collection area: the roof outline and everything within ${n2(reach)} m of it`} style={{ width: '100%', maxWidth: 420, height: 'auto' }}>
            <path d={ol.path} fill="var(--mut)" fillOpacity={0.25} stroke="var(--mut)" strokeOpacity={0.25} strokeWidth={2 * reach * ol.s} strokeLinejoin="round" />
            <path d={ol.path} fill="none" stroke="var(--tx)" strokeWidth={2} />
            <g fontSize={11} fill="var(--tx)">
              <text x={20} y={222}>Roof outline · reach 3 × height = {n2(reach)} m (shaded){risk.collectionAreaM2 ? ` · ${n2(risk.collectionAreaM2)} m²` : ''}</text>
            </g>
          </svg>
        )}
        {k0.shape === 'rectangle' && !r.invalid && (
          <svg viewBox="0 0 340 230" role="img" aria-label={`Collection area: the building and everything within ${n2(reach)} m of it`} style={{ width: '100%', maxWidth: 420, height: 'auto' }}>
            <rect x={20} y={10} width={(i.lengthM + 2 * reach) * ks} height={(i.widthM + 2 * reach) * ks} rx={reach * ks} fill="none" stroke="var(--mut)" strokeWidth={1.2} strokeDasharray="6 4" />
            <rect x={20 + reach * ks} y={10 + reach * ks} width={i.lengthM * ks} height={i.widthM * ks} fill="none" stroke="var(--tx)" strokeWidth={2} />
            <line x1={20 + (reach + i.lengthM) * ks} y1={10 + (reach + i.widthM / 2) * ks} x2={20 + (2 * reach + i.lengthM) * ks} y2={10 + (reach + i.widthM / 2) * ks} stroke="var(--acc)" strokeWidth={1.5} />
            <g fontSize={11} fill="var(--tx)">
              <text x={20} y={222}>Building {n2(i.lengthM)} × {n2(i.widthM)} m · reach 3 × height = {n2(reach)} m{risk.collectionAreaM2 ? ` · ${n2(risk.collectionAreaM2)} m²` : ''}</text>
            </g>
          </svg>
        )}
        {risk.working.length > 0 && (
          <table>
            <thead><tr><th>Step</th><th>Formula</th><th className="num">Result</th></tr></thead>
            <tbody>
              {risk.working.map((w) => <tr key={w.step}><td>{w.step}</td><td style={{ whiteSpace: 'normal' }}>{w.formula}</td><td className="num">{w.result}</td></tr>)}
            </tbody>
          </table>
        )}
        <table>
          <thead><tr><th>Protection</th><th>Damage probability (entered by you)</th><th className="num">Risk per year</th><th>Against the tolerable risk</th></tr></thead>
          <tbody>
            {RISK_LEVELS.map((level, n) => {
              const row = risk.rows[n], p = k0.damageProbability?.[level];
              return (
                <tr key={level}>
                  <td>{riskLevelLabel(level)}{risk.minimum === level ? ' (minimum)' : ''}</td>
                  <td>
                    <input key={`${p ?? ''}`} aria-label={`Damage probability — ${riskLevelLabel(level)}`} inputMode="decimal" style={{ width: 80 }} defaultValue={p ?? ''}
                      onBlur={(e) => { const t = e.target.value.trim().replace(',', '.'), v = t === '' ? undefined : Number(t); if (v === undefined || (Number.isFinite(v) && v >= 0)) { if (v !== p) setProbability(level, v); } else e.target.value = p === undefined ? '' : String(p); }} />
                  </td>
                  <td className="num">{row.risk !== undefined ? riskText(row.risk) : '—'}</td>
                  {row.risk === undefined ? <StatusCell status="bad">{started ? 'DATA REQUIRED' : '—'}</StatusCell> : <StatusCell status={row.ok ? 'ok' : 'bad'}>{row.ok ? 'OK' : 'Exceeds'}</StatusCell>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="dm-head">
          <NumField label="Sensitivity: strike density multiplier" value={k0.sensitivity} min={0} onSet={(v) => setRisk({ sensitivity: v })} optional />
          {risk.sensitivityMinimum && <span>With the strike density × {n2(k0.sensitivity!)}: {minText(risk.sensitivityMinimum)}{risk.sensitivityRisk !== undefined ? ` (${riskText(risk.sensitivityRisk)})` : ''}</span>}
          <button className="chip primary" disabled={!minClass} onClick={() => minClass && set({ lpsClass: minClass, riskRef: i.riskRef?.trim() ? i.riskRef : 'Preliminary risk assessment in this study' })}>
            {minClass ? `Use Class ${minClass} in this study` : risk.minimum === 'none' ? 'No protection is needed by this assessment' : 'Use the minimum class in this study'}
          </button>
        </div>
      </section>

      <section className="dm-card">
        <h4>Design values — entered by you</h4>
        <div className="dm-head">
          <label className="nf"><span>Protection class</span>
            <select value={i.lpsClass ?? ''} onChange={(e) => set({ lpsClass: (e.target.value || undefined) as LpsClass | undefined })}>
              <option value="">—</option>
              {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="nf"><span>Risk assessment reference</span>
            <input key={i.riskRef ?? ''} defaultValue={i.riskRef ?? ''} onBlur={(e) => e.target.value.trim() !== (i.riskRef ?? '') && set({ riskRef: e.target.value.trim() || undefined })} />
          </label>
          <label className="nf"><span>Air termination method</span>
            <select value={i.method} onChange={(e) => set({ method: e.target.value as AirMethod })}>
              {AIR_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        </div>
        <div className="dm-head">
          <NumField label="Mesh size" unit="m" value={i.meshM} min={0} onSet={(v) => set({ meshM: v })} optional />
          <NumField label="Rolling sphere radius" unit="m" value={i.sphereRadiusM} min={0} onSet={(v) => set({ sphereRadiusM: v })} optional />
          <NumField label="Down conductor spacing" unit="m" value={i.downSpacingM} min={0} onSet={(v) => set({ downSpacingM: v })} optional />
          <NumField label="Rod height" unit="m" value={i.rodHeightM} min={0} onSet={(v) => set({ rodHeightM: v })} optional />
          <NumField label="Protection angle" unit="°" value={i.angleDeg} min={0} max={89} onSet={(v) => set({ angleDeg: v })} optional />
        </div>
        <div className="dm-head">
          <NumField label="ESE terminal height" unit="m" value={i.eseMastM} min={0} onSet={(v) => set({ eseMastM: v })} optional />
          <NumField label="ESE advance time ΔT" unit="µs" value={i.eseDeltaTUs} min={0} onSet={(v) => set({ eseDeltaTUs: v })} optional />
          <NumField label="Down conductors per ESE terminal" value={i.eseDownPerTerminal} min={0} onSet={(v) => set({ eseDownPerTerminal: v })} optional />
          <label><span>Earth pit at each down conductor</span>
            <input type="checkbox" checked={!!i.earthPitPerDown} onChange={(e) => set({ earthPitPerDown: e.target.checked })} />
          </label>
          <NumField label="Earth resistance limit" unit="Ω" value={i.earthLimitOhm} min={0} onSet={(v) => set({ earthLimitOhm: v })} optional />
          <label><span>Bonded to the main earth bar (MET)</span>
            <input type="checkbox" checked={!!i.bondedToMet} onChange={(e) => set({ bondedToMet: e.target.checked })} />
          </label>
        </div>
        <p className="m">The app does not ship values from the standards. Enter them from your licensed copy, and ΔT from the manufacturer's test certificate; they are saved with the project.</p>
      </section>

      {r.invalid ? <p className="m">{r.invalid}.</p> : (
        <>
          <section className="dm-card">
            <h4>Roof plan — concept layout ({n2(i.lengthM)} × {n2(i.widthM)} m)</h4>
            <svg viewBox="0 0 470 330" role="img" aria-label={`Roof plan: ${methodLabel(i.method)}, ${plan.terminals.length} air terminals, ${plan.downs.length} down conductors`} style={{ width: '100%', maxWidth: 620, height: 'auto' }}>
              <rect x={X(0)} y={Y(0)} width={i.lengthM * k} height={i.widthM * k} fill="none" stroke="var(--tx)" strokeWidth={2} />
              <g stroke="var(--mut)" strokeWidth={1.2} strokeDasharray="6 4">
                {plan.meshX.map((x) => <line key={`x${x}`} x1={X(x)} y1={Y(0)} x2={X(x)} y2={Y(i.widthM)} />)}
                {plan.meshY.map((y) => <line key={`y${y}`} x1={X(0)} y1={Y(y)} x2={X(i.lengthM)} y2={Y(y)} />)}
              </g>
              {plan.terminals.map(([x, y]) => <rect key={`t${x}:${y}`} x={X(x) - 4} y={Y(y) - 4} width={8} height={8} fill="var(--tx)" />)}
              {plan.downs.map(([x, y]) => <circle key={`d${x}:${y}`} cx={X(x)} cy={Y(y)} r={5} fill="var(--acc)" stroke="var(--bg)" strokeWidth={1.5} />)}
              <g fontSize={11} fill="var(--tx)">
                <line x1={35} y1={312} x2={60} y2={312} stroke="var(--mut)" strokeWidth={1.2} strokeDasharray="6 4" /><text x={66} y={316}>Roof conductor</text>
                <rect x={176} y={308} width={8} height={8} /><text x={190} y={316}>Rod / terminal</text>
                <circle cx={300} cy={312} r={5} fill="var(--acc)" /><text x={311} y={316}>Down conductor</text>
              </g>
            </svg>
            <div className="dm-head">
              <label className="nf"><span>Roof plan drawing</span>
                <select value={toFile ?? ''} disabled={!planFiles.length} onChange={(e) => setPlanFile(e.target.value)}>
                  {planFiles.length ? planFiles.map((x) => <option key={x.file} value={x.file}>{x.label}</option>) : <option value="">No level plan in Design CAD yet</option>}
                </select>
              </label>
              <button className="chip" disabled={!toFile || r.selected.status === 'data'} onClick={placeOnPlan}>Place on roof plan</button>
            </div>
            <p className="m">Adds this layout to the drawing's blocks as {LP_BLOCK}, in the drawing's units. In Design CAD, make the layer you want current, insert the block at a roof corner and turn it to suit. Press again after changing the study and the inserted layout follows.</p>
          </section>

          <section className="dm-card">
            <h4>Air termination methods compared</h4>
            <table>
              <thead><tr><th>Method</th><th>Reference</th><th>Result</th><th>Working</th><th>Status</th></tr></thead>
              <tbody>
                {r.methods.map((a) => (
                  <tr key={a.method} onClick={() => set({ method: a.method })}>
                    <td>{methodLabel(a.method)}{a.method === i.method ? ' (selected)' : ''}</td>
                    <td>{AIR_METHODS.find((x) => x.id === a.method)!.reference}</td>
                    <td>{resultText(a)}</td>
                    <td style={{ whiteSpace: 'normal' }}>{a.working}{a.note ? ` — ${a.note}` : ''}</td>
                    <StatusCell status={rowStatus(a)}>{a.status === 'data' ? 'DATA REQUIRED' : undefined}</StatusCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="dm-card">
            <h4>Quantities — {methodLabel(i.method)}</h4>
            <table>
              <thead><tr><th>Item</th><th className="num">Quantity</th><th>Unit</th></tr></thead>
              <tbody>
                <tr><td>Roof conductor</td><td className="num">{n2(r.selected.roofConductorM)}</td><td>m</td></tr>
                <tr><td>Air terminals (rods or ESE terminals)</td><td className="num">{r.selected.terminals}</td><td>no.</td></tr>
                <tr><td>Down conductors</td><td className="num">{r.downConductors}</td><td>no.</td></tr>
                <tr><td>Down conductor length (building height each)</td><td className="num">{n2(r.downConductorM)}</td><td>m</td></tr>
                <tr><td>Test joints</td><td className="num">{r.testJoints}</td><td>no.</td></tr>
                <tr><td>Earth pits</td><td className="num">{r.earthPits}</td><td>no.</td></tr>
                <tr><td>Ring earth conductor (building perimeter)</td><td className="num">{n2(r.ringConductorM)}</td><td>m</td></tr>
              </tbody>
            </table>
            <label><span>Include these quantities in the project BOQ (with the earthing items)</span>
              <input type="checkbox" checked={!!i.inBoq} onChange={(e) => set({ inBoq: e.target.checked })} />
            </label>
          </section>
        </>
      )}

      <section className="dm-card">
        <h4>Surge protection at the boards</h4>
        {boards.length ? (
          <table>
            <thead><tr><th>Board</th><th>Kind</th><th>Surge protection (set on the SLD)</th></tr></thead>
            <tbody>
              {boards.map((b) => <tr key={b.id}><td>{b.id}</td><td>{b.kind}</td><td className={b.spd ? '' : 'warn'}>{spdLabel(b.spd) ?? 'Not set'}</td></tr>)}
            </tbody>
          </table>
        ) : <p className="m">No boards on the SLD yet.</p>}
      </section>

      <section className="dm-card">
        <h4>Checks</h4>
        <table>
          <tbody>
            {checks.map((c) => <tr key={c.text}><StatusCell status={c.status} /><td style={{ whiteSpace: 'normal' }}>{c.text}</td></tr>)}
          </tbody>
        </table>
      </section>

      <section className="dm-card">
        <h4>Export full report</h4>
        <div className="dm-head">
          {LPS_SECTIONS.map((x) => (
            <label key={x.key}><span>{x.label}</span>
              <input type="checkbox" checked={sections.includes(x.key)} disabled={format === 'xlsx'} onChange={(e) => setSections(e.target.checked ? [...sections, x.key] : sections.filter((k) => k !== x.key))} />
            </label>
          ))}
        </div>
        <div className="dm-head">
          <label className="nf"><span>Format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
              <option value="pdf">PDF</option>
              <option value="docx">Word (.docx)</option>
              <option value="xlsx">Excel (.xlsx) with live formulas</option>
            </select>
          </label>
          <button className="chip primary" disabled={busy || !!r.invalid || (format !== 'xlsx' && !picked.length)} onClick={exportReport}>{busy ? 'Exporting…' : 'Export full report'}</button>
        </div>
        <p className="m">{format === 'xlsx' ? 'The workbook always holds every input and formula, so the section choice does not apply.' : 'Black-and-white. The report is also in the Export centre, for the issue package.'}</p>
      </section>
    </Page>
  );
}
