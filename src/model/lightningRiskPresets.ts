import type { RiskInputs } from '../calc/lightningRisk';
import { pushLibrary } from '../database/librarySync';

/** The engineer's own factor sets for the lightning risk assessment, kept on this computer and reused in any
 * project. A preset holds the factors only: the strike point ratio, the location and loss factors, the tolerable
 * risk, the damage probability of each class and the sensitivity multiplier. The site and the building (the
 * thunderstorm days or strike density, the shape and the roof outline) stay with the project. No preset is built
 * in: the app has no values of a standard. */

export const RISK_PRESETS_KEY = 'lvds.lightningRiskPresets';
const FACTORS = ['strikeRatio', 'locationFactor', 'fireRisk', 'fireProvisions', 'specialHazard', 'typicalLoss', 'tolerableRisk', 'damageProbability', 'sensitivity'] as const;
export type RiskFactors = Pick<RiskInputs, (typeof FACTORS)[number]>;
export interface RiskPreset { id: string; name: string; savedAt: string; factors: RiskFactors }

const newId = () => `rp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isPreset = (x: unknown): x is RiskPreset => !!x && typeof (x as RiskPreset).id === 'string' && typeof (x as RiskPreset).name === 'string' && typeof (x as RiskPreset).factors === 'object' && !!(x as RiskPreset).factors;

/** Your risk factor presets on this computer (synced through Library.json). */
export function loadRiskPresets(): RiskPreset[] {
  try {
    const v = JSON.parse(localStorage.getItem(RISK_PRESETS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(isPreset) : [];
  } catch { return []; }
}
export function saveRiskPresets(list: RiskPreset[]): boolean {
  try { localStorage.setItem(RISK_PRESETS_KEY, JSON.stringify(list)); void pushLibrary(); return true; } catch { return false; }
}

/** The factors of a risk assessment, without what belongs to the site and the building. */
export function riskFactorsOf(k: RiskInputs): RiskFactors {
  const out: RiskFactors = {};
  for (const key of FACTORS) if (k[key] !== undefined) Object.assign(out, { [key]: key === 'damageProbability' ? { ...k.damageProbability } : k[key] });
  return out;
}

/** The list with the factors saved under that name: a preset of the same name is replaced, keeping its place. */
export function withRiskPreset(list: RiskPreset[], name: string, k: RiskInputs, now = new Date()): RiskPreset[] {
  const same = list.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const next: RiskPreset = { id: same?.id ?? newId(), name: name.trim(), savedAt: now.toISOString(), factors: riskFactorsOf(k) };
  return same ? list.map((p) => (p === same ? next : p)) : [...list, next];
}

/** The risk assessment with a preset's factors: every factor is replaced (one the preset leaves out is cleared),
 * the site and the building are kept. */
export function applyRiskPreset(k: RiskInputs, preset: RiskPreset): RiskInputs {
  const rest: RiskInputs = { ...k };
  for (const key of FACTORS) delete rest[key];
  return { ...rest, ...riskFactorsOf({ shape: k.shape, ...preset.factors }) };
}
