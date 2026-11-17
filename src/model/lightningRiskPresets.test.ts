// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { RiskInputs } from '../calc/lightningRisk';
import { LIBRARY_KEYS } from '../database/librarySync';
import { applyRiskPreset, loadRiskPresets, RISK_PRESETS_KEY, riskFactorsOf, saveRiskPresets, withRiskPreset } from './lightningRiskPresets';

const villa: RiskInputs = { shape: 'outline', outline: [[0, 0], [10, 0], [10, 10]], thunderDays: 40, strikeRatio: 1, strikeDensity: 6, locationFactor: 1, fireRisk: 0.02, fireProvisions: 0.5,
  specialHazard: 1, typicalLoss: 0.5, tolerableRisk: 1e-5, damageProbability: { none: 1, II: 0.05 }, sensitivity: 1.5 };

describe('lightning risk factor presets', () => {
  beforeEach(() => localStorage.clear());

  it('a preset holds the factors, not the site or the building', () => {
    expect(riskFactorsOf(villa)).toEqual({ strikeRatio: 1, locationFactor: 1, fireRisk: 0.02, fireProvisions: 0.5, specialHazard: 1, typicalLoss: 0.5, tolerableRisk: 1e-5, damageProbability: { none: 1, II: 0.05 }, sensitivity: 1.5 });
    expect(riskFactorsOf({ shape: 'rectangle', thunderDays: 40 })).toEqual({});
  });

  it('saving under a name adds a preset; the same name again replaces it in place', () => {
    const one = withRiskPreset([], ' Villas ', villa, new Date('2026-11-17T08:00:00Z'));
    expect(one).toMatchObject([{ name: 'Villas', savedAt: '2026-11-17T08:00:00.000Z', factors: { fireRisk: 0.02 } }]);
    const two = withRiskPreset(withRiskPreset(one, 'Towers', { ...villa, specialHazard: 5 }), 'villas', { ...villa, fireRisk: 0.1 });
    expect(two.map((p) => [p.name, p.factors.fireRisk, p.factors.specialHazard])).toEqual([['villas', 0.1, 1], ['Towers', 0.02, 5]]);
    expect(two[0].id).toBe(one[0].id);
  });

  it('loading a preset replaces every factor and keeps the site and the building', () => {
    const preset = withRiskPreset([], 'Villas', { shape: 'rectangle', locationFactor: 0.5, fireRisk: 0.1, damageProbability: { I: 0.02 } })[0];
    const next = applyRiskPreset(villa, preset);
    expect(next).toEqual({ shape: 'outline', outline: villa.outline, thunderDays: 40, strikeDensity: 6, locationFactor: 0.5, fireRisk: 0.1, damageProbability: { I: 0.02 } });
    next.damageProbability!.I = 9;
    expect(preset.factors.damageProbability).toEqual({ I: 0.02 });
  });

  it('kept on this computer, in the library that syncs; a damaged store reads as empty', () => {
    expect(LIBRARY_KEYS).toContain(RISK_PRESETS_KEY);
    expect(loadRiskPresets()).toEqual([]);
    const list = withRiskPreset([], 'Villas', villa);
    expect(saveRiskPresets(list)).toBe(true);
    expect(loadRiskPresets()).toEqual(list);
    localStorage.setItem(RISK_PRESETS_KEY, '{not json');
    expect(loadRiskPresets()).toEqual([]);
    localStorage.setItem(RISK_PRESETS_KEY, JSON.stringify([{ id: 'x' }, list[0]]));
    expect(loadRiskPresets()).toEqual(list);
  });
});
