// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import { addSpareWay, isDbBoard } from '../model/spareWays';
import SystemDiagram from './SystemDiagram';

const noop = () => {};

describe('spare / space actions on the SLD', () => {
  it('offers conversion on each panel spare and space symbol', () => {
    const panel = sampleProject.boards.find((b) => !isDbBoard(b) && b.upstreamId)!;
    let project = addSpareWay(sampleProject, panel.id, 'spare').project;
    project = addSpareWay(project, panel.id, 'space', 'R').project;
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <SystemDiagram project={project} calcProject={project} results={evaluateProject(project)} hideLegend
        selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} onConvertSpare={noop} />
    );
    const ways = [...host.querySelectorAll<SVGGElement>('g.spare-way')];
    expect(ways).toHaveLength(2);
    expect(ways.every((g) => g.getAttribute('role') === 'button' && g.getAttribute('tabindex') === '0')).toBe(true);
    expect(ways.map((g) => g.querySelector('title')!.textContent)).toEqual([
      expect.stringContaining('click to convert it to a circuit'),
      expect.stringContaining('click to convert it to a circuit')
    ]);
  });
});
