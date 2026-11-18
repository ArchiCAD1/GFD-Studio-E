import { describe, expect, it } from 'vitest';
import { projectNumber } from './projectNumber';
import type { Project } from '../types';

const p = (o: object) => o as Pick<Project, 'info' | 'studyReport'>;

describe('projectNumber', () => {
  it('prefers the project number, then the study report number, then blank', () => {
    expect(projectNumber(p({ info: { projectNo: ' P1 ' }, studyReport: { projectNo: 'P2' } }))).toBe('P1');
    expect(projectNumber(p({ info: { projectNo: '  ' }, studyReport: { projectNo: ' P2 ' } }))).toBe('P2');
    expect(projectNumber(p({ studyReport: { projectNo: 'P2' } }))).toBe('P2');
    expect(projectNumber(p({}))).toBe('');
  });
});
