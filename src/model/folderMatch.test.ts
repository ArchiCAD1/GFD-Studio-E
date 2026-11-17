import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES } from './folderTemplateBuiltins';
import { ROLE_CATALOGUE } from './folderRoles';
import type { FolderNode } from './folderTemplates';
import { matchScore, nameWords, ROLE_WORDS, suggestRoles } from './folderMatch';

describe('nameWords', () => {
  it('takes off numbering and separators', () => {
    expect(nameWords('03_Fault-Protection')).toBe('fault protection');
    expect(nameWords('C-Calc')).toBe('calc');
    expect(nameWords('2. VoltageDrop')).toBe('voltage drop');
  });
});

describe('matchScore', () => {
  it('scores a whole-name match 1 and a phrase inside a longer name lower, but at least 0.6', () => {
    expect(matchScore('02_Voltage-Drop', 'calcVd')).toBe(1);
    expect(matchScore('VD', 'calcVd')).toBe(1);
    const part = matchScore('DEWA submissions 2026', 'authDewa');
    expect(part).toBeGreaterThanOrEqual(0.6);
    expect(part).toBeLessThan(1);
  });
  it('matches whole words only', () => {
    expect(matchScore('Advdance', 'calcVd')).toBe(0);
    expect(matchScore('Model', 'authDm')).toBe(0);
    expect(matchScore('Photos', 'calcVd')).toBe(0);
  });
  it('has words for every role in the catalogue', () => {
    expect(Object.keys(ROLE_WORDS).sort()).toEqual(ROLE_CATALOGUE.map((r) => r.id).sort());
    for (const r of ROLE_CATALOGUE) expect(matchScore(ROLE_WORDS[r.id][0], r.id)).toBe(1);
  });
});

describe('suggestRoles', () => {
  const office: FolderNode[] = [
    { id: 'a', name: 'A-Admin' },
    { id: 'b', name: 'B-Received', children: [{ id: 'b1', name: 'Arch' }] },
    { id: 'c', name: 'C-Calc', children: [{ id: 'c1', name: 'VD' }, { id: 'c2', name: 'SC' }] },
    { id: 'd', name: 'D-Dwg', children: [{ id: 'd1', name: 'Issued' }] },
    { id: 'e', name: 'E-DEWA' }
  ];
  const at = (list: ReturnType<typeof suggestRoles>, role: string) => list.find((s) => s.role === role)?.nodeId;
  it('finds the folders of a typical office tree', () => {
    const s = suggestRoles(office);
    expect(at(s, 'calcVd')).toBe('c1');
    expect(at(s, 'calcFault')).toBe('c2');
    expect(at(s, 'receivedArch')).toBe('b1');
    expect(at(s, 'drawingsIssued')).toBe('d1');
    expect(at(s, 'authDewa')).toBe('e');
    expect(at(s, 'studyReports')).toBe('c');
    expect(at(s, 'snags')).toBeUndefined();
  });
  it('leaves a role that already has a folder alone, and suggests each role once', () => {
    const withRole: FolderNode[] = [{ id: 'x', name: 'Reports', role: 'calcVd' }, { id: 'y', name: 'VD' }];
    const s = suggestRoles(withRole);
    expect(at(s, 'calcVd')).toBeUndefined();
    expect(new Set(s.map((x) => x.role)).size).toBe(s.length);
  });
  it('recovers most roles of the consultant template from its folder names alone', () => {
    const strip = (ns: readonly FolderNode[]): FolderNode[] => ns.map((n) => ({ id: n.id, name: n.name, ...(n.children ? { children: strip(n.children) } : {}) }));
    const t = BUILT_IN_TEMPLATES[0];
    const roleOf = new Map<string, string>();
    const walk = (ns: readonly FolderNode[]) => ns.forEach((n) => { [...(n.roles ?? []), ...(n.role ? [n.role] : [])].forEach((r) => roleOf.set(r, n.id)); if (n.children) walk(n.children); });
    walk(t.folders);
    const s = suggestRoles(strip(t.folders));
    const right = s.filter((x) => roleOf.get(x.role) === x.nodeId).length;
    expect(right).toBeGreaterThanOrEqual(30);
  });
});
