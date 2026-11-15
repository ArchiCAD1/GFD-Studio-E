#!/usr/bin/env node
// The lvds command a built desktop package carries, run with the package's own runtime (the app as Node, so no
// window opens): its version, the settings `lvds mcp-config` prints, and an MCP server started from those settings
// the way an AI program starts it. scripts/check-package.mjs checks that the files are there; this shows they run.
// The projects folder is an empty temporary one: no project of the user is read.
//   node scripts/check-packaged-lvds.mjs "release/mac-arm64/LV Design Studio.app"
//   node scripts/check-packaged-lvds.mjs release/linux-unpacked
//   node scripts/check-packaged-lvds.mjs release/win-unpacked

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The version as the app shows it (src/model/appVersion.ts): "2.11.0" → "2.011". */
export function shownVersion(semver) {
  const [major, minor = '0'] = semver.split('.');
  return `${major}.${minor.padStart(3, '0')}`;
}

/** The launcher of a package, for the system this runs on. */
export function launcherOf(target, platform = process.platform) {
  return join(target, target.endsWith('.app') ? 'Contents/Resources' : 'resources', 'lvds', platform === 'win32' ? 'lvds.cmd' : 'lvds');
}

/** One MCP session over the server's stdin and stdout: initialize, the tool list, and list_projects. */
export async function mcpSession({ command, args, env }, timeoutMs = 30_000) {
  const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const waiting = new Map();
  let buffer = '', stderr = '', id = 0;
  child.stderr.on('data', (d) => { stderr = (stderr + String(d)).slice(-2000); });
  child.stdout.on('data', (d) => {
    buffer += String(d);
    for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    }
  });
  const stopped = new Promise((_, reject) => {
    child.on('error', (e) => reject(new Error(`could not start ${command}: ${e.message}`)));
    child.on('close', (code) => reject(new Error(`the MCP server stopped (exit ${code}) ${stderr.trim()}`)));
    setTimeout(() => reject(new Error(`no answer from the MCP server in ${timeoutMs / 1000} s ${stderr.trim()}`)), timeoutMs).unref();
  });
  const send = (method, params) => Promise.race([stopped, new Promise((done) => {
    waiting.set(++id, done);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  })]);
  try {
    const init = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'package-check', version: '1' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const list = await send('tools/list', {});
    const projects = await send('tools/call', { name: 'list_projects', arguments: {} });
    return { server: init.result?.serverInfo, tools: list.result?.tools ?? [], projects: projects.result };
  } finally {
    stopped.catch(() => {});
    child.kill();
  }
}

/** What is wrong with what the packaged lvds answered. */
export function lvdsProblems({ version, expected, config, session }) {
  const problems = [];
  if (version !== expected) problems.push(`lvds version says "${version}", package.json means ${expected}`);
  const entry = config?.mcpServers?.['lv-design-studio'];
  if (!entry || entry.args?.[1] !== 'mcp') problems.push(`lvds mcp-config did not print the settings of the MCP server: ${JSON.stringify(config).slice(0, 200)}`);
  if (!session) return problems;
  if (session.server?.name !== 'lv-design-studio' || session.server?.version !== expected) problems.push(`The MCP server calls itself ${JSON.stringify(session.server)}, not lv-design-studio ${expected}`);
  if (session.tools.length < 15) problems.push(`The MCP server lists ${session.tools.length} tools; at least 15 read-only ones are expected`);
  const changing = session.tools.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name);
  if (changing.length) problems.push(`Without --write the MCP server offers tools that change a project: ${changing.join(', ')}`);
  if (session.projects?.isError || !session.projects?.content?.[0]?.text) problems.push(`list_projects failed: ${JSON.stringify(session.projects).slice(0, 200)}`);
  return problems;
}

async function main() {
  const target = process.argv[2];
  if (!target) { console.log('Usage: node scripts/check-packaged-lvds.mjs <built .app or unpacked folder>'); process.exit(2); }
  const expected = shownVersion(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  const launcher = launcherOf(target);
  const temp = mkdtempSync(join(tmpdir(), 'lvds-packaged-'));
  const env = { ...process.env, LVDS_PROJECTS: join(temp, 'projects'), LVDS_APP_DATA: join(temp, 'app') };
  // A .cmd file runs through the Windows command shell.
  const lvds = (...args) => (process.platform === 'win32'
    ? execFileSync(`"${launcher}"`, args, { env, encoding: 'utf8', shell: true })
    : execFileSync(launcher, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
  let problems;
  try {
    const version = lvds('version');
    const config = JSON.parse(lvds('mcp-config'));
    const entry = config?.mcpServers?.['lv-design-studio'];
    const session = entry ? await mcpSession({ command: entry.command, args: entry.args, env: { ...env, ...entry.env } }) : undefined;
    problems = lvdsProblems({ version, expected, config, session });
    if (!problems.length) console.log(`Packaged lvds in ${target}: version ${version}, MCP server with ${session.tools.length} read-only tools.`);
  } catch (e) {
    problems = [`The packaged lvds did not run: ${e.message}`];
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  for (const p of problems) console.log(`error: ${p}`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
