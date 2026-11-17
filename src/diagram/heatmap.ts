import type { FeederResult } from '../calc/electrical';
import type { BoardSummary } from '../calc/summary';
import type { EarthingResult } from '../calc/earthing';
import type { Board, BoardKind, Feeder, Project } from '../types';

/** Colouring the SLD by a result, as a share of its limit: 0.5 and below
 * green, amber around the 85 % warning level, red at the limit and above. */
export type ColorBy = 'none' | 'vd' | 'loading' | 'utilisation' | 'fault' | 'earth' | 'supply';

export const COLOR_BY: { value: ColorBy; label: string; legend: string }[] = [
  { value: 'none', label: 'None', legend: '' },
  { value: 'vd', label: 'Voltage drop', legend: 'Total voltage drop ÷ limit' },
  { value: 'loading', label: 'Breaker loading', legend: 'Design current ÷ breaker rating' },
  { value: 'utilisation', label: 'Cable utilisation', legend: 'Design current ÷ cable rating (Iz)' },
  { value: 'fault', label: 'Fault duty', legend: 'Fault at the breaker ÷ its breaking capacity' },
  { value: 'earth', label: 'Earth fault loop', legend: 'Zs ÷ largest Zs that still disconnects in time' },
  { value: 'supply', label: 'Supply', legend: 'Emergency: on or below an emergency board or a board with a standby generator. UPS: on or below a UPS board. Screen only; prints black' }
];

/** Earth fault loop as a share of its limit, coloured by the check's own
 * result: disconnection in time stays green–amber, a 5 s circuit relying on
 * the thermal region is amber, too slow is red. */
export function earthRatio(e: EarthingResult): number {
  const r = e.maxZsOhm > 0 ? e.zsOhm / e.maxZsOhm : 2;
  if (e.status === 'bad') return Math.max(1, r);
  if (e.status === 'warn') return Math.min(Math.max(r, 0.86), 0.99);
  return Math.min(r, 0.84);
}

/** A feeder's value for the chosen colouring, as a fraction of its limit. */
export function feederRatio(r: FeederResult, by: ColorBy, vdLimitPct: number): number | undefined {
  switch (by) {
    case 'vd': return r.vdTotalPct / vdLimitPct;
    case 'loading': return r.ib / r.feeder.breakerRatingA;
    case 'utilisation': return r.ampacity > 0 ? r.ib / r.ampacity : undefined;
    case 'fault': return r.feeder.breakerIcuKa > 0 ? r.breakerFaultKA / r.feeder.breakerIcuKa : undefined;
    default: return undefined;
  }
}

/** A board's value: its busbar voltage drop, or its loading. */
export function boardRatio(s: BoardSummary, upstreamVdPct: number, by: ColorBy, vdLimitPct: number): number | undefined {
  if (by === 'vd') return upstreamVdPct / vdLimitPct;
  if (by === 'loading' || by === 'utilisation') return s.loadingPct !== undefined ? s.loadingPct / 100 : undefined;
  return undefined;
}

/** Colour for a ratio: hue 130 (green) at ≤ 0.5, 45 (amber) at 0.85, 0
 * (red) at ≥ 1. */
export function heatColor(ratio: number): string {
  const r = Math.max(0, ratio);
  const hue = r <= 0.5 ? 130 : r <= 0.85 ? 130 - ((r - 0.5) / 0.35) * 85 : r < 1 ? 45 - ((r - 0.85) / 0.15) * 45 : 0;
  return `hsl(${hue.toFixed(0)} 80% ${r >= 1 ? 58 : 52}%)`;
}

/** Colour by → Supply (screen only: the print shows the drawing as drawn): what the network feeds a board or
 * circuit with. Emergency: on or below an emergency board or a board with a standby generator (as
 * onEssentialSide, calc/elvPlacement.ts); UPS: on or below a UPS board; the nearest one up the network decides.
 * Existing: an existing board or circuit on normal supply (its dashed outline shows existing in every view). */
export type Supply = 'normal' | 'emergency' | 'ups' | 'existing';
const EMERGENCY_KINDS = new Set<BoardKind>(['EMDB', 'LV-EMDB', 'EDB', 'ESMDB', 'EMCC']);
export const SUPPLY_COLOR: Record<Supply, string> = {
  normal: 'var(--mut)', emergency: 'var(--bad)', ups: 'var(--ph-b)', existing: 'color-mix(in srgb, var(--mut) 70%, var(--bg))'
};
export const SUPPLY_LEGEND: { supply: Supply; label: string }[] = [
  { supply: 'normal', label: 'Normal' }, { supply: 'emergency', label: 'Emergency' }, { supply: 'ups', label: 'UPS' }, { supply: 'existing', label: 'Existing' }
];
/** A symbol's colour: none on normal supply, so it keeps its usual look. */
export const supplyTint = (s: Supply): string | undefined => (s === 'normal' ? undefined : SUPPLY_COLOR[s]);

/** The supply of each board and feeder of a project, worked out once (each board's walk stops at a board already known). */
export function supplyOf(project: Project): { board: (b: Board) => Supply; feeder: (f: Feeder) => Supply } {
  const byId = new Map(project.boards.map((b) => [b.id, b]));
  const source = new Map<string, Supply>();
  const marker = (b: Board): Supply | undefined => (b.kind === 'UPS' ? 'ups' : b.standby || (b.kind && EMERGENCY_KINDS.has(b.kind)) ? 'emergency' : undefined);
  for (const start of project.boards) {
    if (source.has(start.id)) continue;
    const chain: string[] = [];
    const seen = new Set<string>();
    let result: Supply = 'normal';
    let cur: Board | undefined = start;
    while (cur) {
      const known = source.get(cur.id);
      if (known) { result = known; break; }
      if (seen.has(cur.id)) { result = 'normal'; break; }
      seen.add(cur.id);
      chain.push(cur.id);
      const m = marker(cur);
      if (m) { result = m; break; }
      cur = cur.upstreamId ? byId.get(cur.upstreamId) : undefined;
    }
    for (const id of chain) source.set(id, result);
  }
  return {
    board: (b) => { const s = source.get(b.id) ?? 'normal'; return s === 'normal' && b.existing ? 'existing' : s; },
    feeder: (f) => {
      const child = f.feedsBoardId ? byId.get(f.feedsBoardId) : undefined;
      const s = source.get(child?.id ?? f.boardId) ?? 'normal';
      return s === 'normal' && (f.existing || child?.existing) ? 'existing' : s;
    }
  };
}
