import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { main } from './cli';
import { createMcp } from './mcp';
import { fileOfAlias, hideWords, projectAlias, projectSwaps } from './privacy';
import { resolveProject } from './project';
import type { ToolContext } from './tools';

const secret: Project = {
  ...sampleProject, name: 'Al Noor Tower for Zenith Holdings', createdBy: 'Ravi Kumar', updatedBy: 'Ravi Kumar',
  info: { ...sampleProject.info, owner: 'Zenith Holdings LLC', consultant: 'Northline Consultants', contractor: 'Bluepeak Contracting', plotNo: '6741234', area: 'Marina District', tel: '04-5550199', mdDemandFactor: 0.8 }
};
const FILE = 'Zenith Al Noor Tower.lvds';
const WORDS = ['Zenith', 'Al Noor', 'Northline', 'Bluepeak', '6741234', 'Marina District', 'Ravi Kumar', '5550199'];

let folder: string;
beforeAll(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lvds-privacy-'));
  fs.writeFileSync(path.join(folder, FILE), JSON.stringify(secret));
  fs.writeFileSync(path.join(folder, 'Villa.json'), JSON.stringify(sampleProject));
});
afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

async function connect(ctx: ToolContext) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0' });
  const server = createMcp(ctx, '1.0');
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    return { error: res.isError === true, text: (res.content as { text: string }[])[0].text };
  };
  return { client, call };
}

describe('a project\'s id in place of its name', () => {
  it('is the same every time, differs per file, and opens the file', () => {
    const id = projectAlias(FILE);
    expect(id).toMatch(/^project-[0-9a-f]{8}$/);
    expect(projectAlias(FILE.toUpperCase())).toBe(id);
    expect(projectAlias('Villa.json')).not.toBe(id);
    expect(fileOfAlias(id, folder)).toBe(FILE);
    expect(fileOfAlias('project-00000000', folder)).toBeUndefined();
    expect(fileOfAlias('Villa', folder)).toBeUndefined();
    expect(path.basename(resolveProject({ ref: id, folder, anywhere: false }))).toBe(FILE);
    expect(path.basename(resolveProject({ ref: 'Villa', folder, anywhere: false }))).toBe('Villa.json'); // names still work
  });
});

describe('words taken out', () => {
  it('the name, parties, addresses and people of a project; not its engineering values or short codes', () => {
    const words = projectSwaps(secret, FILE).map(([w]) => w);
    expect(words).toEqual(expect.arrayContaining(['Al Noor Tower for Zenith Holdings', 'Zenith Holdings LLC', 'Northline Consultants', 'Bluepeak Contracting', '6741234', 'Marina District', 'Ravi Kumar']));
    expect(projectSwaps({ ...secret, info: { owner: 'ABC', plotNo: '1250', mdDemandFactor: 0.8 } }, FILE).map(([w]) => w)).not.toEqual(expect.arrayContaining(['ABC', '1250']));
  });

  it('whatever the case, the longest first', () => {
    expect(hideWords('Report for ZENITH HOLDINGS LLC (Zenith)', [['Zenith', 'x'], ['Zenith Holdings LLC', '[hidden]']])).toBe('Report for [hidden] (x)');
    expect(hideWords('a.b (c)', [['a.b (c)', 'ok']])).toBe('ok'); // marks in a name are not patterns
    // A file name alone or in a path goes; the same word inside a panel name stays.
    const villa: [string, string, boolean] = ['Villa', 'project-1', true];
    expect(hideWords('Villa', [villa])).toBe('project-1');
    expect(hideWords('Exports/Villa/2026-11-16/report.pdf', [villa])).toBe('Exports/project-1/2026-11-16/report.pdf');
    expect(hideWords('Villa ground floor DB', [villa])).toBe('Villa ground floor DB');
  });
});

describe('MCP server with names hidden', () => {
  it('lists projects by id, answers by id, and sends none of the client\'s words', async () => {
    const { client, call } = await connect({ folder, anywhere: false, write: true, hideNames: true });
    const id = projectAlias(FILE);
    const list = await call('list_projects');
    const listed = JSON.parse(list.text) as { folder: string; projects: Record<string, unknown>[] };
    expect(listed.folder).toBe('<projects folder>');
    expect(listed.projects.map((p) => p.file).sort()).toEqual([id, projectAlias('Villa.json')].sort());
    expect(listed.projects.every((p) => !('name' in p) && typeof p.panels === 'number')).toBe(true);
    const texts = [list.text];
    for (const [name, args] of [
      ['project_summary', { project: id }], ['list_panels', { project: id }], ['run_checks', { project: id, status: 'all' }], ['circuit_results', { project: id }],
      ['get_panel', { project: id, panel: 'NOPE' }], ['list_changes', { project: id }],
      ['get_panel', { project: FILE, panel: 'NOPE' }], ['project_summary', { project: 'Missing' }], ['list_changes', {}]
    ] as [string, Record<string, unknown>][]) texts.push((await call(name, args)).text);
    const all = texts.join('\n');
    for (const w of WORDS) expect(all.toLowerCase()).not.toContain(w.toLowerCase());
    expect(all).not.toContain(folder);
    // Still a working answer: the summary has the figures, under the id.
    const summary = JSON.parse(texts[1]) as { name: string; panels: number };
    expect(summary).toMatchObject({ name: id, panels: secret.boards.length });
    // Panel and circuit names are sent: the tools need them.
    expect(texts[2]).toContain(secret.boards[0].id);
    await client.close();
  });

  it('a change made by id is written to the right file, and its result is clean', async () => {
    const { client, call } = await connect({ folder, anywhere: false, write: true, hideNames: true });
    const id = projectAlias(FILE), board = secret.boards[0].id;
    const res = await call('rename_panels', { project: id, renames: [{ from: board, to: `${board}-X` }], mode: 'apply' });
    for (const w of WORDS) expect(res.text.toLowerCase()).not.toContain(w.toLowerCase());
    expect(res.error).toBe(false);
    expect((JSON.parse(fs.readFileSync(path.join(folder, FILE), 'utf-8')) as Project).boards.some((b) => b.id === `${board}-X`)).toBe(true);
    await client.close();
  });

  it('without hiding (--show-names, or the other ways in) results are as before', async () => {
    const { client, call } = await connect({ folder, anywhere: false });
    expect((await call('list_projects')).text).toContain('Al Noor Tower for Zenith Holdings');
    await client.close();
  });
});

describe('command line', () => {
  const run = async (argv: string[]) => {
    const out: string[] = [], err: string[] = [];
    const code = await main(argv, '1.0', { out: (s) => out.push(s), err: (s) => err.push(s) }, { execPath: '/usr/local/bin/node', script: '/x/lvds.mjs', electron: false });
    return { code, out: out.join('\n'), err: err.join('\n') };
  };
  it('mcp-config: names hidden unless --show-names', async () => {
    const hidden = await run(['mcp-config']);
    expect(JSON.parse(hidden.out).mcpServers['lv-design-studio'].args).toEqual(['/x/lvds.mjs', 'mcp']);
    expect(hidden.err).toMatch(/hidden from the AI program/);
    const shown = await run(['mcp-config', '--write', '--show-names']);
    expect(JSON.parse(shown.out).mcpServers['lv-design-studio'].args).toEqual(['/x/lvds.mjs', 'mcp', '--write', '--show-names']);
    expect(shown.err).toMatch(/are sent to the AI program/);
  });
});
