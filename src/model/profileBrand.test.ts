import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newProject } from '../types';
import { COMPANY_NAME } from './companyBrand';
import { applyProfile, loadPrefs, savePrefs, type Preferences } from './profile';

describe('locked company profile branding', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear()
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the company name and strips stored or supplied logo overrides', () => {
    localStorage.setItem('gfde.preferences', JSON.stringify({ profile: { company: 'Other Company', logo: 'data:image/png;base64,AAAA' } }));
    const prefs = loadPrefs();
    expect(prefs.profile.company).toBe(COMPANY_NAME);
    expect(prefs.profile.logo).toBeUndefined();
    expect(savePrefs({ ...prefs, profile: { company: 'Other Company', logo: 'data:image/png;base64,AAAA' } } as Preferences)).toBe(true);
    expect(JSON.parse(localStorage.getItem('gfde.preferences')!).profile).toMatchObject({ company: COMPANY_NAME });
    expect(JSON.parse(localStorage.getItem('gfde.preferences')!).profile.logo).toBeUndefined();

    const project = applyProfile(newProject('Pilot'), { company: 'Other Company', logo: 'data:image/png;base64,AAAA' }, true);
    expect(project.drawing?.company).toBe(COMPANY_NAME);
    expect(project.drawing?.logo).toBeUndefined();
  });
});
