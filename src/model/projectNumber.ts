import type { Project } from '../types';

/** The project's number: the one typed for the project, else the one typed in Study reports, else blank. */
export const projectNumber = (project: Pick<Project, 'info' | 'studyReport'>): string =>
  project.info?.projectNo?.trim() || project.studyReport?.projectNo?.trim() || '';
