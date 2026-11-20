import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { network } from '../../tests/fixtures/networks';
import { main } from './cli';
import { compactRows } from './compact';
import { createMcp } from './mcp';
import { callTool, toolByName, type ToolContext } from './tools';

/** Back to records: what an AI program does in its head, and proof that nothing is lost but absent → null. */
function expand(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(expand);
  if (v && typeof v === 'object') {
    const o = v as { columns?: unknown; rows?: unknown };
    if (Array.isArray(o.columns) && Array.isArray(o.rows) && Object.keys(o).length === 2) return (o.rows as unknown[][]).map((r) => Object.fromEntries((o.columns as string[]).map((c, i) => [c, expand(r[i])])));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expand(x)]));
  }
  return v;
}
/** A record list with every record given every column (absent → null), as compact rows state it. */
function withNulls(v: unknown): unknown {
  if (Array.isArray(v)) {
    const items = v.map(withNulls);
    if (items.length < 3 || !items.every((x) => x && typeof x === 'object' && !Array.isArray(x))) return items;
    const cols = [...new Set((items as Record<string, unknown>[]).flatMap((x) => Object.keys(x)))];
    return (items as Record<string, unknown>[]).map((x) => Object.fromEntries(cols.map((c) => [c, c in x ? x[c] : null])));
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withNulls(x)]));
  return v;
}

describe('lists of records as columns and rows', () => {
  it('a list of three or more records; shorter lists, plain lists and single records stay', () => {
    expect(compactRows({ n: 2, circuits: [{ id: 'L1', kw: 1 }, { id: 'L2', kw: 2, note: 'x' }, { id: 'L3', kw: 3 }] }))
      .toEqual({ n: 2, circuits: { columns: ['id', 'kw', 'note'], rows: [['L1', 1, null], ['L2', 2, 'x'], ['L3', 3, null]] } });
    const kept = { two: [{ a: 1 }, { a: 2 }], words: ['a', 'b', 'c', 'd'], mixed: [{ a: 1 }, 2, { a: 3 }], one: { a: 1 }, none: [] };
    expect(compactRows(kept)).toEqual(kept);
  });

  it('lists inside records, and a list that already has a column called rows is left alone', () => {
    const inner = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(compactRows([{ p: 'P1', circuits: inner }, { p: 'P2', circuits: [] }, { p: 'P3', circuits: inner }]))
      .toEqual({ columns: ['p', 'circuits'], rows: [['P1', { columns: ['id'], rows: [['a'], ['b'], ['c']] }], ['P2', []], ['P3', { columns: ['id'], rows: [['a'], ['b'], ['c']] }]] });
    const table = [{ rows: 1 }, { rows: 2 }, { rows: 3 }];
    expect(compactRows(table)).toEqual(table);
  });
});

describe('MCP server', () => {
  let folder: string;
  const ctx = (): ToolContext => ({ folder, anywhere: false });
  beforeAll(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gfde-compact-'));
    fs.writeFileSync(path.join(folder, 'Job.json'), JSON.stringify(network(30, 'deep')));
  });
  afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

  async function connect(c: ToolContext) {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0' });
    await Promise.all([createMcp(c, '1.0').connect(a), client.connect(b)]);
    return { client, call: async (name: string, args: Record<string, unknown> = {}) => ((await client.callTool({ name, arguments: args })).content as { text: string }[])[0].text };
  }

  it('the same content in fewer characters, and the instructions say how to read it', async () => {
    const { client, call } = await connect({ ...ctx(), compactRows: true });
    expect(client.getInstructions()).toMatch(/"columns".*"rows"/);
    const saved: Record<string, number> = {};
    for (const [name, args] of [['list_panels', { project: 'Job' }], ['circuit_results', { project: 'Job' }], ['run_checks', { project: 'Job', status: 'all' }], ['project_summary', { project: 'Job' }]] as [string, Record<string, unknown>][]) {
      const records = await callTool(toolByName(name)!, args, ctx());
      const text = await call(name, args);
      expect(expand(JSON.parse(text)), name).toEqual(withNulls(JSON.parse(JSON.stringify(records))));
      saved[name] = 1 - text.length / JSON.stringify(records).length;
    }
    expect(saved.list_panels).toBeGreaterThan(0.35);
    expect(saved.circuit_results).toBeGreaterThan(0.3);
    await client.close();
  });

  it('records as before without it (--full-rows, the command line, the local API)', async () => {
    const { client, call } = await connect(ctx());
    expect(client.getInstructions()).not.toMatch(/"columns"/);
    expect(JSON.parse(await call('list_panels', { project: 'Job' }))).toEqual(JSON.parse(JSON.stringify(await callTool(toolByName('list_panels')!, { project: 'Job' }, ctx()))));
    await client.close();
  });

  it('mcp-config carries --full-rows', async () => {
    const out: string[] = [];
    await main(['mcp-config', '--full-rows'], '1.0', { out: (s) => out.push(s), err: () => undefined }, { execPath: '/usr/local/bin/node', script: '/x/gfde.mjs', electron: false });
    expect(JSON.parse(out.join('')).mcpServers['gfd-studio-e'].args).toEqual(['/x/gfde.mjs', 'mcp', '--full-rows']);
  });
});
